#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from dataclasses import asdict, dataclass, field
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

MISSING_PYTHON_PACKAGES: list[str] = []

try:
    import requests
except ImportError:
    requests = None  # type: ignore[assignment]
    MISSING_PYTHON_PACKAGES.append("requests")

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps, ImageStat
except ImportError:
    Image = ImageDraw = ImageFilter = ImageFont = ImageOps = ImageStat = None  # type: ignore[assignment]
    MISSING_PYTHON_PACKAGES.append("Pillow")


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "public" / "screenshots"
DEFAULT_REPORT_DIR = REPO_ROOT / "output" / "covers"
PYTHON_REQUIREMENTS_FILE = REPO_ROOT / "requirements-cover.txt"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/135.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 20
MAX_PAGE_BYTES = 3_000_000
MAX_IMAGE_BYTES = 15_000_000
MIN_IMAGE_WIDTH = 600
MIN_IMAGE_HEIGHT = 320
MAX_PAGES = 12
MAX_CANDIDATES_TO_DOWNLOAD = 36
CONTACT_SHEET_COLUMNS = 3
CONTACT_SHEET_ROWS = 4

JOB_BOARD_HOST_MARKERS = (
    "greenhouse.io",
    "ashbyhq.com",
    "lever.co",
    "workable.com",
    "job-boards.",
)
IMAGE_URL_RE = re.compile(
    r"https?://[^\"'()\s<>]+?\.(?:png|jpe?g|webp|gif|svg)(?:\?[^\"'()\s<>]*)?",
    re.IGNORECASE,
)
LOC_RE = re.compile(r"<loc>([^<]+)</loc>", re.IGNORECASE)
FUNDING_PAGE_MARKERS = (
    "series",
    "seed",
    "funding",
    "raises",
    "raised",
    "announcement",
    "announce",
    "press",
    "launch",
    "news",
)
SOURCE_KIND_SCORES = {
    "gallery_og": 85.0,
    "og:image": 60.0,
    "twitter:image": 54.0,
    "preload:image": 34.0,
    "img:hero": 30.0,
    "img": 20.0,
    "raw:image": 12.0,
}
PAGE_ROLE_SCORES = {
    "gallery": 65.0,
    "funding": 56.0,
    "news": 42.0,
    "homepage": 28.0,
    "other": 10.0,
}


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_title = False
        self.title_parts: list[str] = []
        self.metas: list[dict[str, str]] = []
        self.images: list[dict[str, str]] = []
        self.links: list[dict[str, str]] = []
        self.current_anchor: dict[str, str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {key.lower(): (value or "") for key, value in attrs}
        tag = tag.lower()

        if tag == "title":
            self.in_title = True
            return

        if tag == "meta":
            record = {
                "property": attr_map.get("property", "").strip().lower(),
                "name": attr_map.get("name", "").strip().lower(),
                "content": attr_map.get("content", "").strip(),
            }
            if record["content"]:
                self.metas.append(record)
            return

        if tag == "img":
            self.images.append(
                {
                    "src": attr_map.get("src", "").strip(),
                    "srcset": attr_map.get("srcset", "").strip(),
                    "alt": attr_map.get("alt", "").strip(),
                    "width": attr_map.get("width", "").strip(),
                    "height": attr_map.get("height", "").strip(),
                }
            )
            return

        if tag == "link":
            rel = attr_map.get("rel", "").lower()
            href = attr_map.get("href", "").strip()
            as_kind = attr_map.get("as", "").lower()
            image_srcset = attr_map.get("imagesrcset", "").strip()
            if href or image_srcset:
                self.links.append(
                    {
                        "href": href,
                        "rel": rel,
                        "as": as_kind,
                        "imagesrcset": image_srcset,
                        "text": "",
                    }
                )
            return

        if tag == "a":
            href = attr_map.get("href", "").strip()
            self.current_anchor = {"href": href, "text": ""}

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)
        if self.current_anchor is not None:
            self.current_anchor["text"] += data

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title":
            self.in_title = False
            return
        if tag == "a" and self.current_anchor is not None:
            self.current_anchor["text"] = " ".join(self.current_anchor["text"].split())
            self.links.append(self.current_anchor)
            self.current_anchor = None

    @property
    def title(self) -> str:
        return " ".join("".join(self.title_parts).split())


@dataclass
class CandidateSeed:
    image_url: str
    source_page: str
    source_kind: str
    page_role: str
    page_title: str
    page_score: float
    notes: list[str] = field(default_factory=list)


@dataclass
class CandidateResult:
    rank: int
    score: float
    image_url: str
    source_page: str
    source_kind: str
    page_role: str
    width: int
    height: int
    aspect_ratio: float
    sha1: str
    notes: list[str]
    metrics: dict[str, float]


class CoverGeneratorError(RuntimeError):
    pass


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Discover, score, and export a startups.gallery-style company cover from "
            "official website assets."
        )
    )
    parser.add_argument("input_url", nargs="?", help="Company site URL or startups.gallery company page.")
    parser.add_argument("--site-url", help="Official company site URL.")
    parser.add_argument("--gallery-url", help="Optional startups.gallery company page.")
    parser.add_argument("--slug", help="Startup slug. Defaults to the site domain.")
    parser.add_argument("--output", help="Output cover path. Defaults to public/screenshots/{slug}.webp.")
    parser.add_argument("--manifest", help="Candidate report path. Defaults to output/covers/{slug}.json.")
    parser.add_argument(
        "--contact-sheet",
        help="Preview sheet path. Defaults to output/covers/{slug}-contact-sheet.webp.",
    )
    parser.add_argument(
        "--pick",
        type=int,
        default=1,
        help="Pick a ranked candidate instead of the top result. Defaults to 1.",
    )
    parser.add_argument("--width", type=int, default=1440, help="Output width. Defaults to 1440.")
    parser.add_argument("--height", type=int, default=900, help="Output height. Defaults to 900.")
    parser.add_argument(
        "--max-pages",
        type=int,
        default=MAX_PAGES,
        help=f"Max related pages to inspect. Defaults to {MAX_PAGES}.",
    )
    parser.add_argument(
        "--max-candidates",
        type=int,
        default=MAX_CANDIDATES_TO_DOWNLOAD,
        help=f"Max image candidates to download. Defaults to {MAX_CANDIDATES_TO_DOWNLOAD}.",
    )
    return parser


def ensure_dependencies() -> None:
    if not MISSING_PYTHON_PACKAGES:
        return

    install_hint = f"python3 -m pip install -r {PYTHON_REQUIREMENTS_FILE.name}"
    packages = ", ".join(MISSING_PYTHON_PACKAGES)
    raise CoverGeneratorError(
        f"Missing Python packages: {packages}. Install them with `{install_hint}`."
    )


def make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": (
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,"
                "image/apng,*/*;q=0.8"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    return session


def canonicalize_url(raw_url: str) -> str:
    raw_url = raw_url.strip()
    if not raw_url:
        return raw_url

    parsed = urlparse(raw_url)
    scheme = parsed.scheme or "https"
    netloc = parsed.netloc.lower()
    path = parsed.path or "/"

    if netloc.endswith(":80") and scheme == "http":
        netloc = netloc[:-3]
    if netloc.endswith(":443") and scheme == "https":
        netloc = netloc[:-4]

    query = parse_qs(parsed.query, keep_blank_values=True)
    if parsed.path.endswith(".svg"):
        query.pop("width", None)
        query.pop("height", None)
        query.pop("scale-down-to", None)

    normalized_query = urlencode(
        [(key, value) for key in sorted(query) for value in query[key]], doseq=True
    )

    return urlunparse((scheme, netloc, path, "", normalized_query, ""))


def root_domain(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host


def is_same_company_host(candidate_url: str, base_url: str) -> bool:
    candidate_host = root_domain(candidate_url)
    base_host = root_domain(base_url)

    if not candidate_host or not base_host:
        return False

    return (
        candidate_host == base_host
        or candidate_host.endswith(f".{base_host}")
        or base_host.endswith(f".{candidate_host}")
    )


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "cover"


def image_file_suffix(image_url: str) -> str:
    path = urlparse(image_url).path.lower()
    if "." not in path:
        return ""
    return path.rsplit(".", 1)[-1]


def parse_srcset(srcset: str) -> list[str]:
    urls: list[str] = []
    for chunk in srcset.split(","):
        piece = chunk.strip()
        if not piece:
            continue
        urls.append(piece.split()[0])
    return urls


def fetch_text(session: requests.Session, url: str) -> str:
    response = session.get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    text = response.text
    if len(text.encode("utf-8")) > MAX_PAGE_BYTES:
        return text[: MAX_PAGE_BYTES // 2]
    return text


def parse_page(url: str, html: str) -> PageParser:
    parser = PageParser()
    parser.feed(html)
    return parser


def choose_page_role(url: str, title: str) -> tuple[str, float, list[str]]:
    host = root_domain(url)
    path = urlparse(url).path.lower()
    title_lc = title.lower()
    notes: list[str] = []

    if host == "startups.gallery":
        return "gallery", PAGE_ROLE_SCORES["gallery"], ["startups.gallery company page"]

    if path in ("", "/"):
        return "homepage", PAGE_ROLE_SCORES["homepage"], ["homepage"]

    combined = f"{path} {title_lc}"
    if any(marker in combined for marker in FUNDING_PAGE_MARKERS):
        return "funding", PAGE_ROLE_SCORES["funding"], ["funding/news marker"]

    if any(marker in combined for marker in ("blog", "resource", "resources", "news", "press", "story")):
        return "news", PAGE_ROLE_SCORES["news"], ["content page"]

    return "other", PAGE_ROLE_SCORES["other"], notes


def extract_primary_website(parser: PageParser, gallery_url: str) -> str | None:
    gallery_host = urlparse(gallery_url).netloc.lower()
    preferred: list[str] = []

    for link in parser.links:
        href = link.get("href", "").strip()
        if not href or href.startswith("#"):
            continue
        absolute = canonicalize_url(urljoin(gallery_url, href))
        host = urlparse(absolute).netloc.lower()
        if not host or host == gallery_host:
            continue

        text = link.get("text", "").strip().lower()
        if "visit website" in text:
            return absolute
        if any(marker in host for marker in JOB_BOARD_HOST_MARKERS):
            continue
        preferred.append(absolute)

    return preferred[0] if preferred else None


def collect_internal_links(site_url: str, parser: PageParser) -> list[str]:
    links: list[str] = []

    for link in parser.links:
        href = link.get("href", "").strip()
        if not href or href.startswith(("mailto:", "tel:", "#")):
            continue
        absolute = canonicalize_url(urljoin(site_url, href))
        if not is_same_company_host(absolute, site_url):
            continue
        links.append(absolute)

    return links


def fetch_sitemap_candidates(session: requests.Session, site_url: str) -> list[str]:
    sitemap_url = canonicalize_url(urljoin(site_url, "/sitemap.xml"))
    try:
        xml = fetch_text(session, sitemap_url)
    except requests.RequestException:
        return []

    matches = [canonicalize_url(match) for match in LOC_RE.findall(xml)]
    return [url for url in matches if is_same_company_host(url, site_url)]


def rank_related_pages(urls: list[str]) -> list[str]:
    ranked: list[tuple[float, str]] = []
    seen: set[str] = set()

    for url in urls:
        if url in seen:
            continue
        seen.add(url)
        role, score, _ = choose_page_role(url, "")
        if role == "other":
            continue
        ranked.append((score, url))

    return [url for _, url in sorted(ranked, key=lambda item: (-item[0], item[1]))]


def discover_pages(
    session: requests.Session,
    site_url: str | None,
    gallery_url: str | None,
    max_pages: int,
) -> tuple[list[tuple[str, str]], str | None]:
    queue: list[tuple[str, str]] = []
    resolved_site_url = site_url

    if gallery_url:
        gallery_url = canonicalize_url(gallery_url)
        gallery_html = fetch_text(session, gallery_url)
        gallery_parser = parse_page(gallery_url, gallery_html)
        queue.append(("gallery", gallery_url))
        if not resolved_site_url:
            resolved_site_url = extract_primary_website(gallery_parser, gallery_url)

    if not resolved_site_url:
        raise CoverGeneratorError("Unable to resolve a company site URL from the provided input.")

    resolved_site_url = canonicalize_url(resolved_site_url)
    homepage_html = fetch_text(session, resolved_site_url)
    homepage_parser = parse_page(resolved_site_url, homepage_html)
    queue.append(("homepage", resolved_site_url))

    internal_links = rank_related_pages(collect_internal_links(resolved_site_url, homepage_parser))
    sitemap_links = rank_related_pages(fetch_sitemap_candidates(session, resolved_site_url))

    seen = {url for _, url in queue}
    for label, links in (("related", internal_links), ("sitemap", sitemap_links)):
        for url in links:
            if url in seen:
                continue
            seen.add(url)
            queue.append((label, url))
            if len(queue) >= max_pages:
                return queue[:max_pages], resolved_site_url

    return queue[:max_pages], resolved_site_url


def looks_like_hero_image(candidate: str, page_title: str) -> bool:
    lowered = candidate.lower()
    title_lc = page_title.lower()
    return any(
        marker in lowered or marker in title_lc
        for marker in ("hero", "banner", "cover", "open graph", "og", "launch", "funding")
    )


def extract_candidate_seeds(page_url: str, html: str) -> list[CandidateSeed]:
    parser = parse_page(page_url, html)
    page_role, page_score, page_notes = choose_page_role(page_url, parser.title)
    seeds: list[CandidateSeed] = []
    seen: set[tuple[str, str]] = set()

    def push(raw_url: str, source_kind: str, extra_notes: list[str] | None = None) -> None:
        absolute = canonicalize_url(urljoin(page_url, raw_url))
        if not absolute.startswith(("http://", "https://")) or absolute.startswith("data:"):
            return
        key = (absolute, source_kind)
        if key in seen:
            return
        seen.add(key)
        notes = list(page_notes)
        if extra_notes:
            notes.extend(extra_notes)
        seeds.append(
            CandidateSeed(
                image_url=absolute,
                source_page=page_url,
                source_kind=source_kind,
                page_role=page_role,
                page_title=parser.title,
                page_score=page_score,
                notes=notes,
            )
        )

    for meta in parser.metas:
        key = meta["property"] or meta["name"]
        content = meta["content"]
        if key == "og:image":
            kind = "gallery_og" if page_role == "gallery" else "og:image"
            push(content, kind, ["meta image"])
        elif key == "twitter:image":
            push(content, "twitter:image", ["meta image"])

    for item in parser.links:
        href = item.get("href", "")
        image_srcset = item.get("imagesrcset", "")
        rel = item.get("rel", "")
        as_kind = item.get("as", "")
        if "preload" in rel and as_kind == "image" and href:
            push(href, "preload:image", ["preloaded image"])
        if image_srcset:
            for candidate in parse_srcset(image_srcset):
                push(candidate, "preload:image", ["preloaded image"])

    for image in parser.images:
        src = image.get("src", "")
        srcset = image.get("srcset", "")
        alt = image.get("alt", "")
        width = image.get("width", "")
        height = image.get("height", "")
        notes: list[str] = []
        if alt:
            notes.append(f"alt={alt[:80]}")
        if width and height:
            notes.append(f"declared={width}x{height}")
        source_kind = "img:hero" if looks_like_hero_image(f"{src} {alt}", parser.title) else "img"
        if src:
            push(src, source_kind, notes)
        for candidate in parse_srcset(srcset):
            push(candidate, source_kind, notes)

    for image_url in IMAGE_URL_RE.findall(html):
        push(image_url, "raw:image", ["raw HTML match"])

    return seeds


def download_bytes(session: requests.Session, url: str) -> bytes:
    response = session.get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    content = response.content
    if len(content) > MAX_IMAGE_BYTES:
        raise CoverGeneratorError(f"Image too large: {url}")
    return content


def analyze_image(image: Image.Image) -> dict[str, float]:
    rgb = image.convert("RGB")
    thumb = rgb.resize((64, 64), Image.Resampling.LANCZOS)
    stat = ImageStat.Stat(thumb)
    variance = float(sum(stat.var) / len(stat.var))

    quantized = thumb.quantize(colors=16, method=Image.Quantize.MEDIANCUT)
    histogram = quantized.histogram()
    dominant_share = max(histogram) / max(1, sum(histogram))

    edges = thumb.filter(ImageFilter.FIND_EDGES).convert("L")
    edge_pixels = edges.tobytes()
    edge_density = sum(1 for pixel in edge_pixels if pixel > 24) / len(edge_pixels)

    grayscale = thumb.convert("L")
    contrast = float(ImageStat.Stat(grayscale).stddev[0])

    return {
        "variance": variance,
        "dominant_share": dominant_share,
        "edge_density": edge_density,
        "contrast": contrast,
    }


def score_candidate(
    seed: CandidateSeed,
    image_width: int,
    image_height: int,
    target_width: int,
    target_height: int,
    metrics: dict[str, float],
) -> tuple[float, list[str]]:
    reasons = list(seed.notes)
    target_ratio = target_width / target_height
    aspect_ratio = image_width / image_height
    ratio_penalty = abs(math.log(max(aspect_ratio, 0.01) / target_ratio))
    aspect_score = max(0.0, 34.0 - ratio_penalty * 58.0)
    reasons.append(f"aspect score {aspect_score:.1f}")

    area = image_width * image_height
    resolution_score = min(22.0, math.log2((area / 240_000) + 1) * 6.0)
    reasons.append(f"resolution score {resolution_score:.1f}")

    variance_score = min(14.0, metrics["variance"] / 28.0)
    edge_score = min(11.0, metrics["edge_density"] * 75.0)
    contrast_score = min(8.0, metrics["contrast"] / 5.0)
    visual_score = variance_score + edge_score + contrast_score
    reasons.append(f"visual score {visual_score:.1f}")

    flat_penalty = 0.0
    if metrics["dominant_share"] > 0.55:
        flat_penalty += (metrics["dominant_share"] - 0.55) * 65.0
    if metrics["dominant_share"] > 0.62 and metrics["edge_density"] < 0.10:
        flat_penalty += 18.0
        reasons.append("flat background penalty")

    tiny_penalty = 0.0
    if image_width < 1000 or image_height < 500:
        tiny_penalty += 12.0
        reasons.append("small image penalty")

    source_score = SOURCE_KIND_SCORES.get(seed.source_kind, 0.0)
    page_score = PAGE_ROLE_SCORES.get(seed.page_role, 0.0)

    total = source_score + page_score + aspect_score + resolution_score + visual_score
    total -= flat_penalty + tiny_penalty

    if seed.page_role == "funding" and seed.source_kind in {"og:image", "twitter:image", "img:hero"}:
        total += 12.0
        reasons.append("funding page bonus")

    if seed.page_role == "gallery" and seed.source_kind == "gallery_og":
        total += 20.0
        reasons.append("gallery hero bonus")

    return total, reasons


def crop_image(image: Image.Image, target_width: int, target_height: int) -> Image.Image:
    source = ImageOps.exif_transpose(image).convert("RGB")
    source_ratio = source.width / source.height
    target_ratio = target_width / target_height

    if source_ratio > target_ratio:
        crop_width = int(source.height * target_ratio)
        x0 = max(0, (source.width - crop_width) // 2)
        y0 = 0
        x1 = x0 + crop_width
        y1 = source.height
    else:
        crop_height = int(source.width / target_ratio)
        y0 = max(0, int((source.height - crop_height) * 0.18))
        y1 = y0 + crop_height
        x0 = 0
        x1 = source.width

    cropped = source.crop((x0, y0, x1, y1))
    return cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)


def build_contact_sheet(
    ranked_images: list[tuple[CandidateSeed, CandidateResult, Image.Image]],
    output_path: Path,
) -> None:
    font = ImageFont.load_default()
    cell_width = 420
    cell_height = 280
    rows = CONTACT_SHEET_ROWS
    cols = CONTACT_SHEET_COLUMNS
    sheet = Image.new("RGBA", (cols * cell_width, rows * cell_height), "#111111")

    for index, (_, result, image) in enumerate(ranked_images[: rows * cols]):
        row = index // cols
        col = index % cols
        crop = crop_image(image, cell_width, cell_height).convert("RGBA")
        x = col * cell_width
        y = row * cell_height
        sheet.paste(crop, (x, y))

        overlay = Image.new("RGBA", (cell_width, 52), (0, 0, 0, 160))
        overlay_draw = ImageDraw.Draw(overlay)
        overlay_draw.text((10, 8), f"#{result.rank}  {result.score:.1f}", fill="white", font=font)
        overlay_draw.text(
            (10, 26),
            f"{result.source_kind} · {result.page_role}",
            fill="#dddddd",
            font=font,
        )
        sheet.alpha_composite(overlay, (x, y))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(output_path, format="WEBP", quality=92, method=6)


def render_cover(image: Image.Image, output_path: Path, width: int, height: int) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    crop_image(image, width, height).save(output_path, format="WEBP", quality=92, method=6)


def prepare_paths(
    slug: str,
    output_arg: str | None,
    manifest_arg: str | None,
    contact_sheet_arg: str | None,
) -> tuple[Path, Path, Path]:
    output = Path(output_arg) if output_arg else DEFAULT_OUTPUT_DIR / f"{slug}.webp"
    manifest = Path(manifest_arg) if manifest_arg else DEFAULT_REPORT_DIR / f"{slug}.json"
    contact_sheet = (
        Path(contact_sheet_arg)
        if contact_sheet_arg
        else DEFAULT_REPORT_DIR / f"{slug}-contact-sheet.webp"
    )
    return output, manifest, contact_sheet


def resolve_inputs(args: argparse.Namespace) -> tuple[str | None, str | None]:
    site_url = canonicalize_url(args.site_url) if args.site_url else None
    gallery_url = canonicalize_url(args.gallery_url) if args.gallery_url else None

    if args.input_url:
        candidate = canonicalize_url(args.input_url)
        if root_domain(candidate) == "startups.gallery":
            gallery_url = candidate
        else:
            site_url = candidate

    if not site_url and not gallery_url:
        raise CoverGeneratorError("Provide a company site URL or a startups.gallery company URL.")

    return site_url, gallery_url


def select_slug(args: argparse.Namespace, site_url: str | None, gallery_url: str | None) -> str:
    if args.slug:
        return slugify(args.slug)
    if site_url:
        return slugify(root_domain(site_url).replace(".", "-"))
    if gallery_url:
        parts = [part for part in urlparse(gallery_url).path.split("/") if part]
        if parts:
            return slugify(parts[-1])
    return "cover"


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        ensure_dependencies()
        session = make_session()
        site_url, gallery_url = resolve_inputs(args)
        slug = select_slug(args, site_url, gallery_url)
        output_path, manifest_path, contact_sheet_path = prepare_paths(
            slug, args.output, args.manifest, args.contact_sheet
        )

        discovered_pages, resolved_site_url = discover_pages(
            session=session,
            site_url=site_url,
            gallery_url=gallery_url,
            max_pages=max(2, args.max_pages),
        )

        seeds: list[CandidateSeed] = []
        for _, page_url in discovered_pages:
            html = fetch_text(session, page_url)
            seeds.extend(extract_candidate_seeds(page_url, html))

        deduped: dict[str, CandidateSeed] = {}
        for seed in seeds:
            existing = deduped.get(seed.image_url)
            if existing is None or (
                existing.page_score + SOURCE_KIND_SCORES.get(existing.source_kind, 0.0)
                < seed.page_score + SOURCE_KIND_SCORES.get(seed.source_kind, 0.0)
            ):
                deduped[seed.image_url] = seed

        ranked_images: list[tuple[CandidateSeed, CandidateResult, Image.Image]] = []
        seen_sha1: set[str] = set()
        sorted_seeds = sorted(
            deduped.values(),
            key=lambda seed: (
                -(seed.page_score + SOURCE_KIND_SCORES.get(seed.source_kind, 0.0)),
                seed.image_url,
            ),
        )

        for seed in sorted_seeds[: max(4, args.max_candidates)]:
            if image_file_suffix(seed.image_url) == "svg":
                continue
            try:
                raw_bytes = download_bytes(session, seed.image_url)
                image = Image.open(BytesIO(raw_bytes))
                image.load()
                if image.mode in {"P", "PA"}:
                    image = image.convert("RGBA")
            except Exception:
                continue

            image_width = int(image.width)
            image_height = int(image.height)
            if image_width < MIN_IMAGE_WIDTH or image_height < MIN_IMAGE_HEIGHT:
                continue

            sha1 = hashlib.sha1(raw_bytes).hexdigest()
            if sha1 in seen_sha1:
                continue
            seen_sha1.add(sha1)

            metrics = analyze_image(image)
            score, reasons = score_candidate(
                seed=seed,
                image_width=image_width,
                image_height=image_height,
                target_width=args.width,
                target_height=args.height,
                metrics=metrics,
            )
            ranked_images.append(
                (
                    seed,
                    CandidateResult(
                        rank=0,
                        score=score,
                        image_url=seed.image_url,
                        source_page=seed.source_page,
                        source_kind=seed.source_kind,
                        page_role=seed.page_role,
                        width=image_width,
                        height=image_height,
                        aspect_ratio=round(image_width / image_height, 4),
                        sha1=sha1,
                        notes=reasons,
                        metrics={key: round(value, 4) for key, value in metrics.items()},
                    ),
                    image.copy(),
                )
            )

        if not ranked_images:
            raise CoverGeneratorError("No usable image candidates were found.")

        ranked_images.sort(key=lambda item: (-item[1].score, item[1].image_url))
        for index, (_, result, _) in enumerate(ranked_images, start=1):
            result.rank = index

        pick_index = args.pick - 1
        if pick_index < 0 or pick_index >= len(ranked_images):
            raise CoverGeneratorError(
                f"--pick {args.pick} is out of range. Only {len(ranked_images)} candidates are available."
            )

        selected_seed, selected_result, selected_image = ranked_images[pick_index]
        render_cover(selected_image, output_path, args.width, args.height)
        build_contact_sheet(ranked_images, contact_sheet_path)

        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest = {
            "slug": slug,
            "resolved_site_url": resolved_site_url,
            "gallery_url": gallery_url,
            "output_path": str(output_path),
            "contact_sheet": str(contact_sheet_path),
            "selected": asdict(selected_result),
            "selected_source_notes": selected_seed.notes,
            "pages": [{"label": label, "url": url} for label, url in discovered_pages],
            "candidates": [asdict(result) for _, result, _ in ranked_images],
        }
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")

        print(f"slug:           {slug}")
        print(f"site:           {resolved_site_url}")
        if gallery_url:
            print(f"gallery:        {gallery_url}")
        print(f"selected rank:  #{selected_result.rank}")
        print(f"selected score: {selected_result.score:.1f}")
        print(f"source image:   {selected_result.image_url}")
        print(f"source page:    {selected_result.source_page}")
        print(f"source kind:    {selected_result.source_kind}")
        print(f"page role:      {selected_result.page_role}")
        print(f"output:         {output_path}")
        print(f"manifest:       {manifest_path}")
        print(f"contact sheet:  {contact_sheet_path}")
        return 0

    except CoverGeneratorError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except requests.RequestException as exc:
        print(f"ERROR: request failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
