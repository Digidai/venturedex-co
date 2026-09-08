#!/usr/bin/env python3

from __future__ import annotations

import argparse
import http.client
import html
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import quote, urljoin, urlsplit


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.text_parts: list[str] = []
        self.startup_card_links = 0
        self.startup_card_paths: list[str] = []
        self.news_company_cells = 0
        self.links: list[str] = []
        self.next_links: list[str] = []
        self.canonicals: list[str] = []
        self.news_rows: list[tuple[str, str, str, str]] = []
        self._row: dict[str, str] | None = None
        self._cell = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {name: value or "" for name, value in attrs}
        classes = set(attr.get("class", "").split())

        if tag == "a" and "card-link" in classes and attr.get("href", "").startswith("/startups/"):
            self.startup_card_links += 1
            self.startup_card_paths.append(attr["href"])
        if tag == "td" and "cell-company" in classes:
            self.news_company_cells += 1
        if tag == "a":
            self.links.append(attr.get("href", ""))
            if "next" in attr.get("rel", "").split():
                self.next_links.append(attr.get("href", ""))
        if tag == "link" and "canonical" in attr.get("rel", "").split():
            self.canonicals.append(attr.get("href", ""))
        if tag == "tr":
            self._row = {"company": "", "round": "", "date": "", "source": ""}
        if tag == "td":
            self._cell = next((name for name in classes if name.startswith("cell-")), "")
        if self._row is not None:
            if tag == "a" and self._cell == "cell-company":
                self._row["company"] = attr.get("href", "")
            if tag == "a" and self._cell == "cell-source":
                self._row["source"] = attr.get("href", "")
            if tag == "time" and self._cell == "cell-date":
                self._row["date"] = attr.get("datetime", "")

    def handle_endtag(self, tag: str) -> None:
        if tag == "td":
            self._cell = ""
        if tag == "tr" and self._row is not None:
            if self._row["company"]:
                self.news_rows.append(tuple(self._row[key].strip() for key in ("company", "round", "date", "source")))
            self._row = None

    def handle_data(self, data: str) -> None:
        text = data.strip()
        if text:
            self.text_parts.append(text)
            if self._row is not None and self._cell == "cell-round":
                self._row["round"] += f" {text}"

    @property
    def text(self) -> str:
        return " ".join(self.text_parts)


@dataclass
class Page:
    url: str
    html: str
    parser: PageParser

    @property
    def text(self) -> str:
        return self.parser.text


def fetch(url: str, retries: int = 3) -> str:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "VentureDexSmoke/1.0",
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
            with urllib.request.urlopen(req, timeout=20) as response:
                return response.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError, http.client.IncompleteRead) as error:
            last_error = error
            if attempt < retries:
                time.sleep(attempt)
                continue
            raise RuntimeError(f"failed to fetch {url}: {error}") from error

    raise RuntimeError(f"failed to fetch {url}: {last_error}")


def load_page(base_url: str, path: str) -> Page:
    url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    content = fetch(url)
    parser = PageParser()
    parser.feed(content)
    return Page(url=url, html=content, parser=parser)


def fail(errors: list[str], message: str) -> None:
    errors.append(f"ERROR: {message}")


def assert_text_count_matches_cards(page: Page, errors: list[str]) -> None:
    for match in re.finditer(r"A thoughtful gallery of\s+(\d+)", page.text):
        expected = int(match.group(1))
        if page.parser.startup_card_links != expected:
            fail(
                errors,
                f"{page.url} says gallery count {expected} but renders "
                f"{page.parser.startup_card_links} startup cards",
            )

    for match in re.finditer(r"Showing\s+(\d+)\s+of\s+(\d+)", page.text):
        expected = int(match.group(1))
        total = int(match.group(2))
        if expected > total:
            fail(errors, f"{page.url} says Showing {expected} of {total}")
        if page.parser.startup_card_links != expected:
            fail(
                errors,
                f"{page.url} says filtered count {expected} but renders "
                f"{page.parser.startup_card_links} startup cards",
            )

    for match in re.finditer(r"Showing first\s+(\d+)\s+of\s+(\d+)", page.text):
        expected = int(match.group(1))
        total = int(match.group(2))
        if expected > total:
            fail(errors, f"{page.url} says Showing first {expected} of {total}")
        if page.parser.startup_card_links != expected:
            fail(
                errors,
                f"{page.url} says first-page count {expected} but renders "
                f"{page.parser.startup_card_links} startup cards",
            )

    for match in re.finditer(r"\b(\d+)\s+results?\b", page.text):
        expected = int(match.group(1))
        if page.parser.startup_card_links != expected:
            fail(
                errors,
                f"{page.url} says {expected} search results but renders "
                f"{page.parser.startup_card_links} startup cards",
            )


FILTER_QUERIES = [
        "/?sort=newest",
        "/?sort=name-az",
        f"/?type={quote('DevTools')}",
        f"/?type={quote('AI / ML')}",
        f"/?stage={quote('Series B')}",
        f"/?region={quote('Europe')}",
]


def assert_home(base_url: str, expected_startups: int, errors: list[str]) -> None:
    expected_cards = min(18, expected_startups)
    for path in ["/", *FILTER_QUERIES]:
        page = load_page(base_url, path)
        if "VentureDex" not in page.text:
            fail(errors, f"{page.url} does not look like a VentureDex page")
        assert_text_count_matches_cards(page, errors)
        if page.parser.startup_card_links != expected_cards:
            fail(errors, f"{page.url} renders {page.parser.startup_card_links} homepage cards, expected {expected_cards}")
        if len(set(page.parser.startup_card_paths)) != expected_cards:
            fail(errors, f"{page.url} has duplicate or missing homepage startup links")
        if "/directory" not in page.parser.links:
            fail(errors, f"{page.url} has no full-directory entrance")
        totals = re.findall(r"browse all\s+(\d+)\s+company profiles", page.text, flags=re.IGNORECASE)
        if not totals or any(int(total) != expected_startups for total in totals):
            fail(errors, f"{page.url} does not state the expected {expected_startups} total company profiles")


def assert_directory(base_url: str, expected_startups: int, errors: list[str]) -> None:
    for path in ["/directory", *(f"/directory{query[1:]}" for query in FILTER_QUERIES)]:
        page = load_page(base_url, path)
        # Filters are progressive enhancement: raw HTML must retain the complete
        # catalog, including when a previously shared filter URL is requested.
        if page.parser.startup_card_links != expected_startups:
            fail(errors, f"{page.url} renders {page.parser.startup_card_links} directory cards, expected {expected_startups}")
        if len(set(page.parser.startup_card_paths)) != expected_startups:
            fail(errors, f"{page.url} has duplicate or missing directory startup links")
        counts = re.findall(r"Browse\s+(\d+)\s+company profiles", page.text)
        if not counts or any(int(count) != expected_startups for count in counts):
            fail(errors, f"{page.url} has an incorrect or missing directory coverage count")
        if not re.search(rf"\b{expected_startups}\s+compan(?:y|ies)\b", page.text):
            fail(errors, f"{page.url} is missing its {expected_startups}-company results count")
        assert_text_count_matches_cards(page, errors)


def assert_news(base_url: str, expected_startups: int, errors: list[str], expected_funding_rounds: int | None = None) -> None:
    # Backwards-compatible with manage.sh's historical one-round-per-company
    # assumption. Callers with multiple rounds can supply an independent total.
    expected_rounds = expected_startups if expected_funding_rounds is None else expected_funding_rounds
    origin = urlsplit(base_url)
    path = "/news"
    visited: set[str] = set()
    all_rows: set[tuple[str, str, str]] = set()
    all_companies: set[str] = set()
    total_rows = 0
    # A valid page contributes at least one row; this bounds even a malicious
    # next-link chain without hardcoding today's seven-page inventory.
    max_pages = max(1, expected_rounds)
    while True:
        if path in visited or len(visited) >= max_pages:
            fail(errors, f"funding pagination loops or exceeds {max_pages} pages at {path}")
            break
        visited.add(path)
        page = load_page(base_url, path)
        canonical_paths = [urlsplit(value) for value in page.parser.canonicals]
        if len(canonical_paths) != 1 or canonical_paths[0].path != path or canonical_paths[0].query or canonical_paths[0].fragment or canonical_paths[0].scheme not in {"http", "https"} or canonical_paths[0].netloc not in {origin.netloc, "venturedex.co"}:
            fail(errors, f"{page.url} must have one absolute canonical for {path}")
        rows = page.parser.news_rows
        if len(rows) != page.parser.news_company_cells:
            fail(errors, f"{page.url} contains funding rows without company profile links")
        if expected_rounds > 0 and not rows:
            fail(errors, f"{page.url} has no funding rows")
        for row in rows:
            if not re.fullmatch(r"/startups/[a-z0-9-]+", row[0]) or not all(row[1:]):
                fail(errors, f"{page.url} has an incomplete funding row for {row[0]}")
            round_key = row[:3]
            if round_key in all_rows:
                fail(errors, f"{page.url} repeats funding row for {row[0]} ({row[2]})")
            all_rows.add(round_key)
            all_companies.add(row[0])
        total_rows += len(rows)
        if not page.parser.next_links:
            break
        if len(page.parser.next_links) != 1:
            fail(errors, f"{page.url} has multiple funding next links")
            break
        target = urlsplit(urljoin(page.url, page.parser.next_links[0]))
        if (target.scheme, target.netloc) != (origin.scheme, origin.netloc) or target.query or target.fragment or not re.fullmatch(r"/news/page/[1-9][0-9]*", target.path):
            fail(errors, f"{page.url} has an unsafe or invalid funding next link")
            break
        expected_page = len(visited) + 1
        if target.path != f"/news/page/{expected_page}":
            fail(errors, f"{page.url} has a skipped or looping funding next page: {target.path}")
            break
        path = target.path
    if total_rows != expected_rounds or len(all_rows) != expected_rounds:
        fail(errors, f"funding pages render {total_rows} rows / {len(all_rows)} unique rounds, expected {expected_rounds}")
    if len(all_companies) != expected_startups:
        fail(errors, f"funding pages cover {len(all_companies)} unique companies, expected {expected_startups}")


def collection_links(page: Page) -> list[tuple[str, int]]:
    links: list[tuple[str, int]] = []
    pattern = re.compile(
        r'<a\s+href="(/collections/[^"]+)"\s+class="collection-card"[^>]*>'
        r"(?P<body>.*?)</a>",
        re.DOTALL,
    )
    for match in pattern.finditer(page.html):
        body = html.unescape(re.sub(r"<[^>]+>", " ", match.group("body")))
        count_match = re.search(r"\b(\d+)\s+startups?\b", body)
        if count_match:
            links.append((match.group(1), int(count_match.group(1))))
    return links


def assert_collections(base_url: str, errors: list[str]) -> None:
    index = load_page(base_url, "/collections")
    links = collection_links(index)
    if not links:
        fail(errors, f"{index.url} has no parseable collection counts")
        return

    for href, expected in links:
        detail = load_page(base_url, href)
        actual = detail.parser.startup_card_links
        if actual != expected:
            fail(errors, f"{detail.url} renders {actual} cards but collection index says {expected}")


def assert_search(base_url: str, errors: list[str]) -> None:
    for query in ["ai", "devtools", "   "]:
        page = load_page(base_url, f"/search?q={quote(query)}")
        assert_text_count_matches_cards(page, errors)


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke-check live VentureDex pages.")
    parser.add_argument("url", help="Base deployment URL")
    parser.add_argument("--expected-startups", type=int, required=True)
    parser.add_argument("--expected-funding-rounds", type=int, help="Independent news round count; defaults to the historical one-round-per-startup expectation")
    args = parser.parse_args()

    errors: list[str] = []
    base_url = args.url.rstrip("/")

    assert_home(base_url, args.expected_startups, errors)
    assert_directory(base_url, args.expected_startups, errors)
    assert_news(base_url, args.expected_startups, errors, args.expected_funding_rounds)
    assert_collections(base_url, errors)
    assert_search(base_url, errors)

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    print(f"Live smoke passed for {base_url} (published startups: {args.expected_startups}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
