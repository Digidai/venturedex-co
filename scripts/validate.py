#!/usr/bin/env python3

from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

from investor_utils import (
    build_investor_lookup,
    dedupe_investor_names,
    normalize_brand_text,
    resolve_investor_slug,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
STARTUPS_DIR = REPO_ROOT / "content" / "startups"
INVESTORS_FILE = REPO_ROOT / "content" / "investors.json"
BRAND_ASSETS_FILE = REPO_ROOT / "content" / "brand-assets.json"
REJECTED_FILE = REPO_ROOT / "content" / "rejected.jsonl"
WEEKLY_DIR = REPO_ROOT / "content" / "weekly"
SCREENSHOTS_DIR = REPO_ROOT / "public" / "screenshots"
PUBLIC_DIR = REPO_ROOT / "public"

ALLOWED_PRODUCT_TYPES = {
    "AI / ML",
    "SaaS",
    "DevTools",
    "Fintech",
    "HealthTech",
    "EdTech",
    "E-commerce",
    "Marketplace",
    "Creator Tools",
    "Climate / Sustainability",
    "Other",
}

ALLOWED_REGIONS = {
    "US",
    "Europe",
    "China / Asia",
    "Latin America",
    "Africa",
    "Global / Remote",
}

ALLOWED_STAGES = {
    "Seed",
    "Series A",
    "Series B",
    "Series C",
}

REJECTED_STAGES = {
    "F1",
    "F2",
    "F3",
    "F4",
    "taste",
}

BANNED_TERMS = [
    "革命",
    "颠覆",
    "赋能",
    "一站式",
    "全方位",
    "下一代",
    "生态",
    "矩阵",
    "抓手",
    "触达",
    "revolutionary",
    "comprehensive",
    "robust",
    "cutting-edge",
    "game-changing",
    "best-in-class",
    "innovative",
    "powerful",
    "seamless",
    "empower",
    "leverage",
    "synergy",
    "next-generation",
]

COMPARISON_MARKERS = (
    " than ",
    " rather than ",
    " instead of ",
    " compared to ",
    " unlike ",
    " closer to ",
    " not ",
    " vs ",
    " versus ",
    " should have ",
)

FACT_MARKER_RE = re.compile(
    r"(\d|api|cli|postgres|github|source|keyboard|shortcut|url|deploy|"
    r"voice|audio|react email|vscode|vs code|realtime|edge function)",
    re.IGNORECASE,
)

AMOUNT_RE = re.compile(r"^\$[0-9]+(?:\.[0-9]+)?(?:[MBK])?\+?$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

HTTP_OK = {"200", "301", "302", "307", "308", "403"}
# 000 = unreachable from the runner (DNS/TLS/timeout/IP block), 405/415 = method rejected.
# These are connection-level/ambiguous results, not dead links, so they must not block CI.
HTTP_FALLBACK = {"000", "405", "415"}
HTTP_NON_BLOCKING = HTTP_OK | HTTP_FALLBACK
ALLOWED_BRAND_SHAPES = {"icon", "wordmark"}
ALLOWED_RESEARCH_SOURCE_TYPES = {
    "official",
    "funding",
    "product",
    "repository",
    "social",
    "editorial",
}


@dataclass
class FileResult:
    path: Path
    name: str
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def main() -> int:
    startup_files = sorted(STARTUPS_DIR.glob("*.json"))
    if not startup_files:
        print("=== VentureDex Content Validator ===\n")
        print("No startup files found.")
        return 0

    print("=== VentureDex Content Validator ===\n")

    url_cache: dict[str, str] = {}
    results: list[FileResult] = []
    startup_slugs: set[str] = set()
    startup_domains: dict[str, Path] = {}
    startup_index: dict[str, dict[str, object]] = {}

    for path in startup_files:
        result = validate_startup(path, url_cache)
        results.append(result)

        if not result.errors:
            try:
                data = json.loads(path.read_text())
            except json.JSONDecodeError:
                continue

            slug = data.get("slug", "")
            domain = data.get("domain", "")
            if slug:
                if slug in startup_slugs:
                    result.errors.append(f"duplicate slug across startup files: {slug}")
                startup_slugs.add(slug)
                startup_index[slug] = data
            if domain:
                prev = startup_domains.get(domain)
                if prev and prev != path:
                    result.errors.append(
                        f"duplicate domain across startup files: {domain} (also in {prev.name})"
                    )
                startup_domains[domain] = path

    weekly_errors, weekly_warnings = validate_weekly_files(startup_slugs)
    rejected_entries, rejected_errors, rejected_warnings = validate_rejected_file(startup_slugs)
    brand_errors, brand_warnings = validate_brand_assets(startup_index, url_cache)

    passed = 0
    total_errors = 0
    total_warnings = 0

    for result in results:
        if result.errors:
            total_errors += len(result.errors)
        else:
            passed += 1
        total_warnings += len(result.warnings)

        print(f"  {result.path.name} ({result.name}) ... ", end="")
        if result.errors:
            print()
            for err in result.errors:
                print(f"    FAIL: {err}")
        else:
            print("OK")

        for warning in result.warnings:
            print(f"    WARN: {warning}")

    print("\n  Checking weekly issues...")
    if weekly_errors:
        for err in weekly_errors:
            print(f"    FAIL: {err}")
        total_errors += len(weekly_errors)
    else:
        print("    OK")

    for warning in weekly_warnings:
        print(f"    WARN: {warning}")
        total_warnings += 1

    print("\n  Checking rejected.jsonl...")
    if rejected_errors:
        for err in rejected_errors:
            print(f"    FAIL: {err}")
        total_errors += len(rejected_errors)
    else:
        print("    OK")

    for warning in rejected_warnings:
        print(f"    WARN: {warning}")
        total_warnings += 1

    print("\n  Checking brand assets...")
    if brand_errors:
        for err in brand_errors:
            print(f"    FAIL: {err}")
        total_errors += len(brand_errors)
    else:
        print("    OK")

    for warning in brand_warnings:
        print(f"    WARN: {warning}")
        total_warnings += 1

    if rejected_entries < len(startup_files) * 3:
        total_warnings += 1
        print(
            "    WARN: rejected.jsonl is below the target rejection bar "
            f"({rejected_entries} rejected vs {len(startup_files)} published; target is 3:1)."
        )

    print(
        f"\n=== {passed}/{len(startup_files)} passed, {total_errors} errors, "
        f"{total_warnings} warnings ==="
    )

    if total_errors:
        print("\nBUILD BLOCKED. Fix all errors before deploying.")
        return 1

    print("All content validated.")
    return 0


def validate_startup(path: Path, url_cache: dict[str, str]) -> FileResult:
    result = FileResult(path=path, name="???")

    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        result.errors.append(f"invalid JSON: {exc}")
        return result

    result.name = data.get("product_name", "???")

    slug = data.get("slug")
    if slug and path.name != f"{slug}.json":
        result.errors.append(f"filename must match slug: expected {slug}.json")

    required_fields = [
        "slug",
        "domain",
        "url",
        "product_name",
        "summary",
        "editor_note",
        "editor_rating",
        "why_featured",
        "product_type",
        "region",
        "investors",
        "funding",
    ]
    for field_name in required_fields:
        if not data.get(field_name):
            result.errors.append(f"missing required field: {field_name}")

    summary = data.get("summary", "")
    if summary and len(summary) > 100:
        result.errors.append(f"summary too long ({len(summary)} chars, max 100)")

    why_featured = data.get("why_featured", "")
    if why_featured and len(why_featured) > 40:
        result.errors.append(f"why_featured too long ({len(why_featured)} chars, max 40)")

    product_type = data.get("product_type")
    if product_type and product_type not in ALLOWED_PRODUCT_TYPES:
        result.errors.append(f"product_type '{product_type}' is not allowed")

    region = data.get("region")
    if region and region not in ALLOWED_REGIONS:
        result.errors.append(f"region '{region}' is not allowed")

    tags = [tag.strip() for tag in (data.get("tags") or "").split(",") if tag.strip()]
    if tags and not 3 <= len(tags) <= 6:
        result.errors.append(f"tags must contain 3-6 items (found {len(tags)})")

    note = data.get("editor_note", "")
    product_name = data.get("product_name", "")
    if note:
        if not 150 <= len(note) <= 500:
            result.errors.append(
                f"editor_note length must be 150-500 chars (found {len(note)})"
            )
        if product_name and note.startswith(product_name):
            result.errors.append("editor_note must not start with the product name")
        for term in BANNED_TERMS:
            if term.lower() in note.lower():
                result.errors.append(f"editor_note contains banned term: '{term}'")
        if not any(marker in note.lower() for marker in COMPARISON_MARKERS):
            result.warnings.append(
                "editor_note may be missing an explicit comparison or contrast (manual N4 check)."
            )
        if not FACT_MARKER_RE.search(note):
            result.warnings.append(
                "editor_note may be missing a concrete fact or product detail (manual N3 check)."
            )

    rating = data.get("editor_rating")
    if rating is not None and not isinstance(rating, int):
        result.errors.append("editor_rating must be an integer")
    if isinstance(rating, int) and not 1 <= rating <= 5:
        result.errors.append(f"editor_rating must be between 1 and 5 (found {rating})")

    is_featured = data.get("is_featured", False)
    if is_featured and isinstance(rating, int) and rating < 4:
        result.errors.append("is_featured=true requires editor_rating >= 4")

    domain = data.get("domain", "")
    url = data.get("url", "")
    if domain and url:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            result.errors.append(f"url '{url}' is not a valid absolute URL")
        elif parsed.netloc != domain:
            result.errors.append(f"domain '{domain}' does not match url host '{parsed.netloc}'")

    funding = data.get("funding") or []
    if not funding:
        result.errors.append("funding must contain at least one verified round")

    for index, round_data in enumerate(funding):
        prefix = f"funding[{index}]"
        for field_name in ["amount", "stage", "lead_investor", "date", "source_url", "source_name"]:
            if not round_data.get(field_name):
                result.errors.append(f"{prefix}: missing {field_name}")

        amount = round_data.get("amount", "")
        if amount and amount != "undisclosed" and not AMOUNT_RE.match(amount):
            result.errors.append(f"{prefix}: amount '{amount}' has invalid format")

        stage = round_data.get("stage", "")
        if stage and stage not in ALLOWED_STAGES:
            result.errors.append(
                f"{prefix}: stage '{stage}' is outside the Seed-Series C window"
            )

        date = round_data.get("date", "")
        if date and not DATE_RE.match(date):
            result.errors.append(f"{prefix}: date '{date}' is not YYYY-MM-DD")

        source_url = round_data.get("source_url", "")
        if source_url:
            source_status = check_url(source_url, cache=url_cache)
            if source_status not in HTTP_NON_BLOCKING:
                result.errors.append(
                    f"{prefix}: source url check failed with HTTP {source_status} -> {source_url}"
                )

    result.errors.extend(validate_research(data, url_cache=url_cache))

    if url:
        company_status = check_url(url, cache=url_cache)
        if company_status not in HTTP_OK:
            result.warnings.append(f"company url check failed with HTTP {company_status} -> {url}")

    if "funding_stage" in data or "funding_display" in data:
        result.warnings.append("legacy fields funding_stage/funding_display should stay derived")

    screenshot_path = SCREENSHOTS_DIR / f"{data.get('slug', path.stem)}.webp"
    if not screenshot_path.exists():
        result.errors.append(f"missing screenshot asset: {screenshot_path.relative_to(REPO_ROOT)}")

    return result


def validate_research(data: dict[str, object], *, url_cache: dict[str, str]) -> list[str]:
    errors: list[str] = []
    research = data.get("research")
    product_name = str(data.get("product_name", "startup"))

    if not isinstance(research, dict):
        return [f"research missing for {product_name}"]

    verified_at = research.get("verified_at")
    if not isinstance(verified_at, str) or not DATE_RE.match(verified_at):
        errors.append("research.verified_at must be YYYY-MM-DD")

    sources = research.get("sources")
    if not isinstance(sources, list) or len(sources) < 2:
        errors.append("research.sources must contain at least official and funding sources")
        sources = []

    source_ids: set[str] = set()
    source_types: set[str] = set()
    for index, source in enumerate(sources):
        prefix = f"research.sources[{index}]"
        if not isinstance(source, dict):
            errors.append(f"{prefix} must be an object")
            continue

        source_id = str(source.get("id", "")).strip()
        label = str(source.get("label", "")).strip()
        source_type = str(source.get("type", "")).strip()
        source_url = str(source.get("url", "")).strip()

        if not source_id:
            errors.append(f"{prefix} missing id")
        elif source_id in source_ids:
            errors.append(f"{prefix} duplicate id '{source_id}'")
        else:
            source_ids.add(source_id)

        if not label:
            errors.append(f"{prefix} missing label")

        if source_type not in ALLOWED_RESEARCH_SOURCE_TYPES:
            errors.append(f"{prefix} type '{source_type}' is not allowed")
        else:
            source_types.add(source_type)

        if source_type != "editorial":
            if not source_url:
                errors.append(f"{prefix} missing url")
            elif check_url(source_url, cache=url_cache) not in HTTP_NON_BLOCKING:
                errors.append(f"{prefix} url is not reachable: {source_url}")

    if "official" not in source_types:
        errors.append("research.sources must include an official source")
    if "funding" not in source_types:
        errors.append("research.sources must include a funding source")

    evidence = research.get("product_evidence")
    if not isinstance(evidence, list) or len(evidence) < 2:
        errors.append("research.product_evidence must contain at least two source-backed claims")
        evidence = []

    for index, item in enumerate(evidence):
        prefix = f"research.product_evidence[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix} must be an object")
            continue

        claim = str(item.get("claim", "")).strip()
        if not 30 <= len(claim) <= 260:
            errors.append(f"{prefix}.claim must be 30-260 chars")

        refs = item.get("source_ids")
        if not isinstance(refs, list) or not refs:
            errors.append(f"{prefix}.source_ids must reference at least one source")
            continue
        for ref in refs:
            if ref not in source_ids:
                errors.append(f"{prefix}.source_ids references unknown source '{ref}'")

    context = research.get("market_context")
    if not isinstance(context, dict):
        errors.append("research.market_context must be an object")
    else:
        if not str(context.get("category", "")).strip():
            errors.append("research.market_context.category is required")
        if not str(context.get("primary_user", "")).strip():
            errors.append("research.market_context.primary_user is required")
        if not str(context.get("differentiation", "")).strip():
            errors.append("research.market_context.differentiation is required")

    risks = research.get("risks")
    if not isinstance(risks, list) or not risks:
        errors.append("research.risks must contain at least one explicit risk or open question")
        risks = []

    for index, risk in enumerate(risks):
        prefix = f"research.risks[{index}]"
        if not isinstance(risk, dict):
            errors.append(f"{prefix} must be an object")
            continue
        claim = str(risk.get("claim", "")).strip()
        basis = str(risk.get("basis", "")).strip()
        if not 30 <= len(claim) <= 240:
            errors.append(f"{prefix}.claim must be 30-240 chars")
        if not 20 <= len(basis) <= 180:
            errors.append(f"{prefix}.basis must be 20-180 chars")

    return errors


def validate_weekly_files(startup_slugs: set[str]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    weekly_files = sorted(WEEKLY_DIR.glob("*.json"))
    seen_numbers: set[int] = set()

    for path in weekly_files:
        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            errors.append(f"{path.relative_to(REPO_ROOT)} invalid JSON: {exc}")
            continue

        issue_number = data.get("issue_number")
        title = data.get("title")
        intro = data.get("editorial_intro")
        status = data.get("status", "published")
        week_start = data.get("week_start")
        week_end = data.get("week_end")
        published_at = data.get("published_at")
        research_summary = data.get("research_summary")
        evaluation_method = data.get("evaluation_method")
        themes = data.get("themes")
        picks = data.get("picks")
        is_published = status == "published"

        if not isinstance(issue_number, int):
            errors.append(f"{path.relative_to(REPO_ROOT)} issue_number must be an integer")
        elif issue_number in seen_numbers:
            errors.append(f"{path.relative_to(REPO_ROOT)} duplicates issue_number {issue_number}")
        else:
            seen_numbers.add(issue_number)

        if path.stem.isdigit() and isinstance(issue_number, int) and path.stem != str(issue_number):
            errors.append(
                f"{path.relative_to(REPO_ROOT)} filename should match issue_number ({issue_number}.json)"
            )

        if not title:
            errors.append(f"{path.relative_to(REPO_ROOT)} missing title")

        if status not in {"draft", "published", "archived"}:
            errors.append(f"{path.relative_to(REPO_ROOT)} status must be draft, published, or archived")

        if not intro:
            errors.append(f"{path.relative_to(REPO_ROOT)} missing editorial_intro")

        if is_published:
            for field_name, value in [
                ("week_start", week_start),
                ("week_end", week_end),
                ("published_at", published_at),
            ]:
                if not isinstance(value, str) or not DATE_RE.match(value):
                    errors.append(
                        f"{path.relative_to(REPO_ROOT)} {field_name} must be YYYY-MM-DD for published issues"
                    )

            valid_issue_dates = all(
                isinstance(value, str) and DATE_RE.match(value)
                for value in [week_start, week_end, published_at]
            )
            if valid_issue_dates:
                if week_start > week_end:
                    errors.append(f"{path.relative_to(REPO_ROOT)} week_start must be before week_end")
                if published_at < week_end:
                    errors.append(
                        f"{path.relative_to(REPO_ROOT)} published_at must be on or after week_end"
                    )

            if not research_summary:
                errors.append(f"{path.relative_to(REPO_ROOT)} missing research_summary")

            if not isinstance(evaluation_method, list) or len(evaluation_method) < 2:
                errors.append(
                    f"{path.relative_to(REPO_ROOT)} evaluation_method must contain at least 2 items"
                )
            elif not all(isinstance(item, str) and item.strip() for item in evaluation_method):
                errors.append(f"{path.relative_to(REPO_ROOT)} evaluation_method items must be non-empty strings")

            if not isinstance(themes, list) or len(themes) < 1:
                errors.append(f"{path.relative_to(REPO_ROOT)} themes must contain at least 1 item")
            else:
                for theme_index, theme in enumerate(themes):
                    if not isinstance(theme, dict):
                        errors.append(
                            f"{path.relative_to(REPO_ROOT)} themes[{theme_index}] must be an object"
                        )
                        continue
                    if not theme.get("title") or not theme.get("summary"):
                        errors.append(
                            f"{path.relative_to(REPO_ROOT)} themes[{theme_index}] requires title and summary"
                        )

        if not isinstance(picks, list):
            errors.append(f"{path.relative_to(REPO_ROOT)} picks must be an array")
            continue

        if not 5 <= len(picks) <= 7:
            errors.append(
                f"{path.relative_to(REPO_ROOT)} picks must contain 5-7 startups (found {len(picks)})"
            )

        pick_slugs: list[str] = []

        for pick_index, pick in enumerate(picks):
            pick_prefix = f"{path.relative_to(REPO_ROOT)} picks[{pick_index}]"
            if isinstance(pick, str):
                slug = pick
                if is_published:
                    errors.append(
                        f"{pick_prefix} must be an object with research fields for published issues"
                    )
            elif isinstance(pick, dict):
                slug = pick.get("slug", "")
            else:
                errors.append(f"{pick_prefix} must be a slug string or research object")
                continue

            if not isinstance(slug, str) or not slug:
                errors.append(f"{pick_prefix} missing slug")
                continue

            pick_slugs.append(slug)
            if slug not in startup_slugs:
                errors.append(
                    f"{path.relative_to(REPO_ROOT)} references missing startup slug '{slug}'"
                )

            if not isinstance(pick, dict) or not is_published:
                continue

            text_fields = [
                "why_this_week",
                "product_evaluation",
                "verdict",
            ]
            for field_name in text_fields:
                value = pick.get(field_name)
                if not isinstance(value, str) or len(value.strip()) < 40:
                    errors.append(f"{pick_prefix}.{field_name} must be at least 40 chars")
                elif "TODO" in value.upper():
                    errors.append(f"{pick_prefix}.{field_name} still contains TODO")

            evidence = pick.get("evidence")
            if not isinstance(evidence, list) or not evidence:
                errors.append(f"{pick_prefix}.evidence must contain at least 1 item")
            else:
                for evidence_index, item in enumerate(evidence):
                    evidence_prefix = f"{pick_prefix}.evidence[{evidence_index}]"
                    if not isinstance(item, dict):
                        errors.append(f"{evidence_prefix} must be an object")
                        continue
                    if not item.get("label") or not item.get("source"):
                        errors.append(f"{evidence_prefix} requires label and source")
                    url = item.get("url")
                    if url:
                        parsed = urlparse(str(url))
                        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                            errors.append(f"{evidence_prefix}.url is not a valid absolute URL")

            risks = pick.get("risks")
            if not isinstance(risks, list) or not risks:
                errors.append(f"{pick_prefix}.risks must contain at least 1 item")
            elif not all(isinstance(risk, str) and risk.strip() for risk in risks):
                errors.append(f"{pick_prefix}.risks items must be non-empty strings")

        if len(pick_slugs) != len(set(pick_slugs)):
            errors.append(f"{path.relative_to(REPO_ROOT)} contains duplicate picks")

    if not weekly_files:
        warnings.append("content/weekly/ has no issues yet.")

    return errors, warnings


def validate_rejected_file(startup_slugs: set[str]) -> tuple[int, list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not REJECTED_FILE.exists():
        warnings.append("content/rejected.jsonl is missing.")
        return 0, errors, warnings

    lines = REJECTED_FILE.read_text().splitlines()
    if not lines:
        warnings.append("content/rejected.jsonl is empty.")
        return 0, errors, warnings

    seen: set[str] = set()
    valid_entries = 0

    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(f"rejected.jsonl:{line_number} invalid JSON: {exc}")
            continue

        valid_entries += 1

        for field_name in ["slug", "url", "date", "stage", "reason"]:
            if not entry.get(field_name):
                errors.append(f"rejected.jsonl:{line_number} missing field: {field_name}")

        slug = entry.get("slug", "")
        if slug in seen:
            errors.append(f"rejected.jsonl:{line_number} duplicate slug: {slug}")
        seen.add(slug)

        if slug in startup_slugs:
            errors.append(f"rejected.jsonl:{line_number} slug also exists in content/startups: {slug}")

        date = entry.get("date", "")
        if date and not DATE_RE.match(date):
            errors.append(f"rejected.jsonl:{line_number} invalid date: {date}")

        stage = entry.get("stage", "")
        if stage and stage not in REJECTED_STAGES:
            errors.append(
                f"rejected.jsonl:{line_number} invalid rejection stage '{stage}'"
            )

        url = entry.get("url", "")
        if url:
            parsed = urlparse(url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                errors.append(f"rejected.jsonl:{line_number} invalid url: {url}")

    return valid_entries, errors, warnings


def validate_brand_assets(
    startup_index: dict[str, dict[str, object]],
    url_cache: dict[str, str],
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    try:
        investors = json.loads(INVESTORS_FILE.read_text())
    except FileNotFoundError:
        return [f"missing file: {INVESTORS_FILE.relative_to(REPO_ROOT)}"], warnings
    except json.JSONDecodeError as exc:
        return [f"{INVESTORS_FILE.relative_to(REPO_ROOT)} invalid JSON: {exc}"], warnings

    try:
        manifest = json.loads(BRAND_ASSETS_FILE.read_text())
    except FileNotFoundError:
        return [f"missing file: {BRAND_ASSETS_FILE.relative_to(REPO_ROOT)}"], warnings
    except json.JSONDecodeError as exc:
        return [f"{BRAND_ASSETS_FILE.relative_to(REPO_ROOT)} invalid JSON: {exc}"], warnings

    if not manifest.get("verified_at"):
        errors.append("content/brand-assets.json missing verified_at")

    company_assets = manifest.get("companies")
    investor_assets = manifest.get("investors")
    if not isinstance(company_assets, dict):
        return ["content/brand-assets.json companies must be an object"], warnings
    if not isinstance(investor_assets, dict):
        return ["content/brand-assets.json investors must be an object"], warnings

    for slug, startup in startup_index.items():
        asset = company_assets.get(slug)
        prefix = f"brand-assets companies.{slug}"
        if not isinstance(asset, dict):
            errors.append(f"{prefix} missing for published startup")
            continue

        errors.extend(
            validate_brand_asset_record(
                prefix=prefix,
                asset=asset,
                expected_name=str(startup.get("product_name", "")),
                expected_page=str(startup.get("url", "")),
                expected_prefix="/logos/companies/",
                url_cache=url_cache,
            )
        )

    for slug in sorted(set(company_assets) - set(startup_index)):
        warnings.append(f"brand-assets companies.{slug} exists but no published startup uses it")

    if not isinstance(investors, dict):
        return ["content/investors.json must be an object"], warnings

    investor_lookup = build_investor_lookup(investors)

    for startup_slug, startup in startup_index.items():
        for investor_name in referenced_lead_investor_names(startup):
            investor_slug = resolve_investor_slug(investor_name, investor_lookup)
            if not investor_slug:
                errors.append(
                    f"startup {startup_slug} lead investor '{investor_name}' missing from content/investors.json"
                )
                continue

            investor = investors.get(investor_slug)
            if not isinstance(investor, dict):
                errors.append(
                    f"startup {startup_slug} lead investor '{investor_name}' resolves to invalid directory entry '{investor_slug}'"
                )
                continue

            asset = investor_assets.get(investor_slug)
            prefix = f"brand-assets investors.{investor_slug}"
            if not isinstance(asset, dict):
                errors.append(
                    f"{prefix} missing for startup {startup_slug} lead investor '{investor_name}'"
                )
                continue

            errors.extend(
                validate_brand_asset_record(
                    prefix=prefix,
                    asset=asset,
                    expected_name=str(investor.get("name", "")),
                    expected_page=str(investor.get("website", "")),
                    expected_prefix="/logos/investors/",
                    url_cache=url_cache,
                )
            )

        for investor_name in referenced_listed_investor_names(startup):
            investor_slug = resolve_investor_slug(investor_name, investor_lookup)
            if not investor_slug:
                warnings.append(
                    f"startup {startup_slug} investor '{investor_name}' has no directory entry; text fallback will be used"
                )
                continue

            investor = investors.get(investor_slug)
            if not isinstance(investor, dict):
                errors.append(
                    f"startup {startup_slug} investor '{investor_name}' resolves to invalid directory entry '{investor_slug}'"
                )
                continue

            asset = investor_assets.get(investor_slug)
            prefix = f"brand-assets investors.{investor_slug}"
            if not isinstance(asset, dict):
                errors.append(
                    f"{prefix} missing for startup {startup_slug} investor '{investor_name}'"
                )
                continue

            errors.extend(
                validate_brand_asset_record(
                    prefix=prefix,
                    asset=asset,
                    expected_name=str(investor.get("name", "")),
                    expected_page=str(investor.get("website", "")),
                    expected_prefix="/logos/investors/",
                    url_cache=url_cache,
                )
            )

    for slug, investor in investors.items():
        asset = investor_assets.get(slug)
        prefix = f"brand-assets investors.{slug}"
        if not isinstance(asset, dict):
            errors.append(f"{prefix} missing for investor directory entry")
            continue

        errors.extend(
            validate_brand_asset_record(
                prefix=prefix,
                asset=asset,
                expected_name=investor.get("name", ""),
                expected_page=investor.get("website", ""),
                expected_prefix="/logos/investors/",
                url_cache=url_cache,
            )
        )

    for slug in sorted(set(investor_assets) - set(investors)):
        warnings.append(f"brand-assets investors.{slug} exists but no investor directory entry uses it")

    return errors, warnings

def referenced_listed_investor_names(startup: dict[str, object]) -> list[str]:
    return dedupe_investor_names(str(startup.get("investors", "")).split(","))


def referenced_lead_investor_names(startup: dict[str, object]) -> list[str]:
    values: list[str] = []
    for round_data in startup.get("funding") or []:
        if isinstance(round_data, dict):
            values.append(str(round_data.get("lead_investor", "")))

    return dedupe_investor_names(values)


def validate_brand_asset_record(
    *,
    prefix: str,
    asset: dict[str, object],
    expected_name: str,
    expected_page: str,
    expected_prefix: str,
    url_cache: dict[str, str],
) -> list[str]:
    errors: list[str] = []

    name = str(asset.get("name", "")).strip()
    shape = str(asset.get("shape", "")).strip()
    local_path = str(asset.get("local_path", "")).strip()
    source_page = str(asset.get("source_page", "")).strip()
    source_url = str(asset.get("source_url", "")).strip()

    if not name:
        errors.append(f"{prefix} missing name")
    elif expected_name and name != expected_name:
        errors.append(f"{prefix} name mismatch: expected '{expected_name}', got '{name}'")

    if shape not in ALLOWED_BRAND_SHAPES:
        errors.append(f"{prefix} shape '{shape}' must be one of {sorted(ALLOWED_BRAND_SHAPES)}")

    if not local_path.startswith(expected_prefix):
        errors.append(f"{prefix} local_path must start with '{expected_prefix}'")
    else:
        asset_file = PUBLIC_DIR / local_path.removeprefix("/")
        if not asset_file.exists():
            errors.append(f"{prefix} missing local file: {asset_file.relative_to(REPO_ROOT)}")

    if not source_page:
        errors.append(f"{prefix} missing source_page")
    elif expected_page and normalize_host(source_page) != normalize_host(expected_page):
        errors.append(
            f"{prefix} source_page host '{normalize_host(source_page)}' "
            f"does not match expected host '{normalize_host(expected_page)}'"
        )
    elif check_url(source_page, cache=url_cache) not in HTTP_NON_BLOCKING:
        errors.append(f"{prefix} source_page is not reachable: {source_page}")

    if not source_url:
        errors.append(f"{prefix} missing source_url")
    elif check_url(source_url, cache=url_cache) not in HTTP_NON_BLOCKING:
        errors.append(f"{prefix} source_url is not reachable: {source_url}")

    return errors


def normalize_host(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    return host[4:] if host.startswith("www.") else host


def check_url(url: str, *, cache: dict[str, str]) -> str:
    cache_key = url
    if cache_key in cache:
        return cache[cache_key]

    attempts = (
        ["-I"],
        [],
    )

    status = "000"
    for extra_args in attempts:
        cmd = [
            "/usr/bin/curl",
            "-sS",
            "-L",
            "--max-time",
            "20",
            "--connect-timeout",
            "10",
            "--retry",
            "2",
            "--retry-delay",
            "1",
            "--retry-all-errors",
            "-A",
            "Mozilla/5.0",
            *extra_args,
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            url,
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        except OSError:
            break
        status = proc.stdout.strip() or "000"
        if status in HTTP_OK:
            break
        if status not in HTTP_FALLBACK:
            break

    cache[cache_key] = status
    return status


if __name__ == "__main__":
    sys.exit(main())
