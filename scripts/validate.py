#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import date as calendar_date, datetime
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
TIMESTAMPS_FILE = Path(
    os.environ.get("VENTUREDEX_TIMESTAMPS_FILE", REPO_ROOT / "content" / "timestamps.json")
)
INVESTORS_FILE = REPO_ROOT / "content" / "investors.json"
BRAND_ASSETS_FILE = REPO_ROOT / "content" / "brand-assets.json"
REJECTED_FILE = REPO_ROOT / "content" / "rejected.jsonl"
WEEKLY_DIR = Path(
    os.environ.get("VENTUREDEX_WEEKLY_DIR", REPO_ROOT / "content" / "weekly")
)
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
SERIES_STAGE_RE = re.compile(r"^Series ([A-Z])$")
BREAKOUT_EXCEPTION_FIELDS = {"reason", "source_ids"}

REJECTED_STAGES = {
    "F1",
    "F2",
    "F3",
    "F4",
    "taste",
}

REJECTED_V2_SOURCE_TYPES = {
    "official",
    "funding",
    "discovery",
}

REJECTED_V2_REVISIT_TRIGGERS = {
    "later_funding_round",
    "new_product_evidence",
    "company_status_change",
    "governance_change",
}

REJECTED_V2_FIELDS = {
    "schema_version",
    "slug",
    "company_url",
    "decision_source_url",
    "decision_source_type",
    "rejected_at",
    "stage",
    "reason",
    "lifecycle",
}

REJECTED_V2_LIFECYCLE_FIELDS = {
    "status",
    "revisit_triggers",
}

REJECTED_V2_RESOLUTION_FIELDS = {
    "resolved_at",
    "trigger",
    "outcome",
    "note",
}

# v2 was adopted with 872 schema-less v1 rows already in the append-only
# registry. Those rows remain valid in place and may be upgraded in place after
# evidence-backed review; schema-less rows appended after this boundary are not
# legacy and must fail closed.
REJECTED_LEGACY_V1_LINE_LIMIT = 872
REJECTED_LEGACY_V1_ORDERED_SLUG_SHA256 = (
    "4e9af209d2fa9845ad2c23e600991ec5641494b0b22babaca56253f407f7c8e0"
)
REJECTED_LEGACY_V1_BLOCK_SHA256 = (
    "afe118addb4bfbbab604a02d06df91ed719c4b5d7f0b36a2d52f922ab502155e"
)

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
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
UTC_TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")

HTTP_OK = {"200", "301", "302", "307", "308", "403"}
# 000 = unreachable from the runner (DNS/TLS/timeout/IP block), 405/415 = method rejected.
# These are connection-level/ambiguous results, not dead links, so they must not block CI.
HTTP_FALLBACK = {"000", "405", "415"}
HTTP_NON_BLOCKING = HTTP_OK | HTTP_FALLBACK
HTTP_GET_RETRY_AFTER_HEAD = HTTP_FALLBACK | {"404", "406"}
CURL_HEAD_HEADERS = [
    "-A",
    "Mozilla/5.0",
]
CURL_BROWSER_HEADERS = [
    "--http1.1",
    "-A",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "-H",
    "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,"
    "image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8",
    "-H",
    "Accept-Language: en-US,en;q=0.9",
]
CURL_MAX_TIME_SECONDS = "8"
CURL_CONNECT_TIMEOUT_SECONDS = "4"
CURL_RETRY_COUNT = "1"
CURL_RETRY_DELAY_SECONDS = "1"
CURL_PROCESS_TIMEOUT_SECONDS = 24
ALLOWED_BRAND_SHAPES = {"icon", "wordmark"}
ALLOWED_RESEARCH_SOURCE_TYPES = {
    "official",
    "funding",
    "product",
    "repository",
    "social",
    "editorial",
}
ALLOWED_LINK_FIELDS = {
    "api",
    "cancer_centers",
    "careers",
    "docs",
    "github",
    "linkedin",
    "mcp",
    "press",
    "pricing",
    "product",
    "producthunt",
    "resources",
    "scout",
    "security",
    "twitter",
}
URL_CHECK_WORKERS = 16
GET_ONLY_SERIAL_HOSTS = {"globenewswire.com"}
SERIAL_HOST_DELAY_SECONDS = 2.0
RETRYABLE_HTTP_STATUSES = {"408", "429", "500", "502", "503", "504"}
GET_ONLY_RETRY_DELAYS_SECONDS = (2.0, 5.0)


@dataclass
class FileResult:
    path: Path
    name: str
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def is_allowed_funding_stage(stage: str) -> bool:
    if stage in ALLOWED_STAGES:
        return True
    match = SERIES_STAGE_RE.fullmatch(stage)
    return bool(match and match.group(1) >= "D")


def is_breakout_funding_stage(stage: str) -> bool:
    match = SERIES_STAGE_RE.fullmatch(stage)
    return bool(match and match.group(1) >= "D")


def validate_breakout_exception(
    data: dict[str, object],
    *,
    required: bool,
) -> list[str]:
    errors: list[str] = []
    research = data.get("research")
    exception = research.get("breakout_exception") if isinstance(research, dict) else None
    if exception is None:
        if required:
            errors.append(
                "research.breakout_exception is required for Series D+ funding stages"
            )
        return errors
    if not isinstance(exception, dict):
        return ["research.breakout_exception must be an object"]

    unknown_fields = sorted(set(exception) - BREAKOUT_EXCEPTION_FIELDS)
    if unknown_fields:
        errors.append(
            "research.breakout_exception contains unsupported fields: "
            + ", ".join(unknown_fields)
        )

    raw_reason = exception.get("reason")
    if not isinstance(raw_reason, str):
        errors.append("research.breakout_exception.reason must be a string")
    elif raw_reason != raw_reason.strip():
        errors.append(
            "research.breakout_exception.reason must not contain outer whitespace"
        )
    elif not 80 <= len(raw_reason) <= 500:
        errors.append("research.breakout_exception.reason must be 80-500 chars")

    raw_refs = exception.get("source_ids")
    if (
        not isinstance(raw_refs, list)
        or len(raw_refs) < 3
        or not all(
            isinstance(ref, str) and ref and ref == ref.strip()
            for ref in raw_refs
        )
    ):
        errors.append(
            "research.breakout_exception.source_ids must contain at least three exact source ids"
        )
        refs: list[str] = []
    else:
        refs = list(raw_refs)
        if len(set(refs)) != len(refs):
            errors.append("research.breakout_exception.source_ids must be unique")

    if not isinstance(research, dict):
        return errors
    sources = research.get("sources")
    source_types: dict[str, str] = {}
    if isinstance(sources, list):
        for source in sources:
            if not isinstance(source, dict):
                continue
            source_id = str(source.get("id", "")).strip()
            source_type = str(source.get("type", "")).strip()
            if source_id:
                source_types[source_id] = source_type

    unknown_refs = sorted(set(refs) - set(source_types))
    if unknown_refs:
        errors.append(
            "research.breakout_exception.source_ids references unknown research sources: "
            + ", ".join(unknown_refs)
        )
    referenced_types = {source_types.get(ref) for ref in refs}
    if "official" not in referenced_types:
        errors.append("research.breakout_exception.source_ids must include an official source")
    if "funding" not in referenced_types:
        errors.append("research.breakout_exception.source_ids must include a funding source")

    evidence = research.get("product_evidence")
    linked_claims = 0
    if isinstance(evidence, list):
        selected_refs = set(refs)
        for item in evidence:
            if not isinstance(item, dict):
                continue
            evidence_refs = item.get("source_ids")
            if isinstance(evidence_refs, list) and selected_refs.intersection(
                ref for ref in evidence_refs if isinstance(ref, str)
            ):
                linked_claims += 1
    if linked_claims < 2:
        errors.append(
            "research.breakout_exception.source_ids must bind at least two product_evidence claims"
        )
    return errors


def main() -> int:
    startup_files = sorted(STARTUPS_DIR.glob("*.json"))
    if not startup_files:
        print("=== VentureDex Content Validator ===\n")
        print("FAIL: No startup files found; refusing to validate an empty catalog.")
        print("\nBUILD BLOCKED. Restore content/startups/*.json before deploying.")
        return 1

    print("=== VentureDex Content Validator ===\n")

    timestamp_errors = validate_timestamps({path.stem for path in startup_files})
    if timestamp_errors:
        print("  Checking deterministic startup timestamps...")
        for err in timestamp_errors:
            print(f"    FAIL: {err}")
        print("\nBUILD BLOCKED. Fix all timestamp errors before validating external sources.")
        return 1

    url_cache: dict[str, str] = {}
    prime_url_cache(startup_files, url_cache)
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


def validate_timestamps(startup_slugs: set[str]) -> list[str]:
    """Require deterministic UTC timestamps for every startup in the JSON catalog."""
    try:
        timestamp_label = str(TIMESTAMPS_FILE.relative_to(REPO_ROOT))
    except ValueError:
        timestamp_label = str(TIMESTAMPS_FILE)

    try:
        raw = json.loads(TIMESTAMPS_FILE.read_text())
    except FileNotFoundError:
        return [f"missing file: {timestamp_label}"]
    except json.JSONDecodeError as exc:
        return [f"{timestamp_label} invalid JSON: {exc}"]

    if not isinstance(raw, dict):
        return ["content/timestamps.json must be an object keyed by startup slug"]

    timestamps = {key: value for key, value in raw.items() if not key.startswith("__")}
    errors: list[str] = []
    for slug in sorted(startup_slugs):
        entry = timestamps.get(slug)
        if not isinstance(entry, dict):
            errors.append(f"content/timestamps.json missing timestamp entry for startup '{slug}'")
            continue
        for field_name in ("published_at", "first_seen_at"):
            value = entry.get(field_name)
            valid = isinstance(value, str) and bool(UTC_TIMESTAMP_RE.fullmatch(value))
            if valid:
                try:
                    datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    valid = False
            if not valid:
                errors.append(
                    f"content/timestamps.json {slug}.{field_name} must be UTC "
                    "YYYY-MM-DD HH:MM:SS"
                )

    return errors


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

    has_breakout_stage = False
    for index, round_data in enumerate(funding):
        prefix = f"funding[{index}]"
        for field_name in ["amount", "stage", "lead_investor", "date", "source_url", "source_name"]:
            if not round_data.get(field_name):
                result.errors.append(f"{prefix}: missing {field_name}")

        amount = round_data.get("amount", "")
        if amount and amount != "undisclosed" and not AMOUNT_RE.match(amount):
            result.errors.append(f"{prefix}: amount '{amount}' has invalid format")

        stage = round_data.get("stage", "")
        if stage and not isinstance(stage, str):
            result.errors.append(f"{prefix}: stage must be a string")
        elif stage and not is_allowed_funding_stage(stage):
            result.errors.append(
                f"{prefix}: stage '{stage}' must be Seed or a named Series A-Z round"
            )
        elif stage and is_breakout_funding_stage(stage):
            has_breakout_stage = True

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

    result.errors.extend(
        validate_breakout_exception(data, required=has_breakout_stage)
    )

    link_errors, link_warnings = validate_links(data)
    result.errors.extend(link_errors)
    result.warnings.extend(link_warnings)

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


def validate_links(data: dict[str, object]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    links = data.get("links")

    if links is None:
        return errors, warnings
    if not isinstance(links, dict):
        return ["links must be an object"], warnings

    for key, value in links.items():
        prefix = f"links.{key}"
        if key not in ALLOWED_LINK_FIELDS:
            warnings.append(f"{prefix} is not a recognized link field")

        if not isinstance(value, str) or not value.strip():
            errors.append(f"{prefix} must be a non-empty string URL")
            continue

        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            errors.append(f"{prefix} '{value}' is not a valid absolute URL")
            continue

    return errors, warnings


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
    published_issue_count = 0

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
        if is_published:
            published_issue_count += 1

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

    if published_issue_count == 0:
        message = (
            "content/weekly/ has no published Weekly issues; refusing a release "
            "that could erase the remote published issue set"
        )
        weekly_removal_override = os.environ.get(
            "VENTUREDEX_ALLOW_WEEKLY_ISSUE_REMOVALS", ""
        )
        if re.fullmatch(
            r"[1-9][0-9]*(?:,[1-9][0-9]*)*", weekly_removal_override
        ):
            warnings.append(
                f"{message}; human removal override is present and the exact "
                "remote issue-number set must still pass the D1 sync guard"
            )
        else:
            errors.append(message)

    return errors, warnings


def _rejected_error(line_number: int, message: str) -> str:
    return f"rejected.jsonl:{line_number} {message}"


def _is_absolute_http_url(value: object) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _is_valid_calendar_date(value: object) -> bool:
    if not isinstance(value, str) or not DATE_RE.fullmatch(value):
        return False
    try:
        calendar_date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _validate_rejected_legacy_block(lines: list[str]) -> list[str]:
    if len(lines) < REJECTED_LEGACY_V1_LINE_LIMIT:
        return [
            "content/rejected.jsonl legacy v1 block was shortened: "
            f"expected at least {REJECTED_LEGACY_V1_LINE_LIMIT} lines, found {len(lines)}"
        ]

    legacy_lines = lines[:REJECTED_LEGACY_V1_LINE_LIMIT]
    ordered_slugs: list[str] = []
    for line in legacy_lines:
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            entry = None
        slug = entry.get("slug") if isinstance(entry, dict) else None
        ordered_slugs.append(slug if isinstance(slug, str) else "")

    digest = hashlib.sha256("\n".join(ordered_slugs).encode("utf-8")).hexdigest()
    if digest != REJECTED_LEGACY_V1_ORDERED_SLUG_SHA256:
        return [
            "content/rejected.jsonl legacy v1 ordered slug digest mismatch; "
            "do not insert, delete, reorder, or rename the first 872 records"
        ]

    block_digest = hashlib.sha256(
        ("\n".join(legacy_lines) + "\n").encode("utf-8")
    ).hexdigest()
    if block_digest != REJECTED_LEGACY_V1_BLOCK_SHA256:
        return [
            "content/rejected.jsonl frozen legacy v1 block digest mismatch; "
            "do not edit historical fields or upgrade a row without an "
            "evidence-reviewed governance change that updates the validator digest"
        ]
    return []


def _validate_legacy_rejected_entry(
    entry: dict[str, object],
    line_number: int,
) -> tuple[list[str], str]:
    """Validate a schema-less v1 row without changing its historical semantics."""
    errors: list[str] = []

    v2_only_fields = sorted(
        (REJECTED_V2_FIELDS - {"schema_version", "slug", "stage", "reason"})
        & set(entry)
    )
    if v2_only_fields:
        errors.append(
            _rejected_error(
                line_number,
                "schema-less legacy entry contains v2 fields "
                f"({', '.join(v2_only_fields)}); add schema_version: 2 and "
                "complete the v2 contract",
            )
        )

    for field_name in ["slug", "url", "date", "stage", "reason"]:
        if not entry.get(field_name):
            errors.append(_rejected_error(line_number, f"missing field: {field_name}"))

    slug = entry.get("slug")
    if slug is not None and not isinstance(slug, str):
        errors.append(_rejected_error(line_number, "legacy field slug must be a string"))

    date = entry.get("date")
    if date and (not isinstance(date, str) or not DATE_RE.fullmatch(date)):
        errors.append(_rejected_error(line_number, f"invalid date: {date}"))

    stage = entry.get("stage")
    if stage and (not isinstance(stage, str) or stage not in REJECTED_STAGES):
        errors.append(
            _rejected_error(line_number, f"invalid rejection stage '{stage}'")
        )

    url = entry.get("url")
    if url and not _is_absolute_http_url(url):
        errors.append(_rejected_error(line_number, f"invalid url: {url}"))

    return errors, "active"


def _validate_v2_rejected_entry(
    entry: dict[str, object],
    line_number: int,
) -> tuple[list[str], str | None]:
    errors: list[str] = []

    unknown_fields = sorted(set(entry) - REJECTED_V2_FIELDS)
    if unknown_fields:
        errors.append(
            _rejected_error(
                line_number,
                f"v2 contains unsupported fields: {', '.join(unknown_fields)}",
            )
        )

    missing_fields = sorted(REJECTED_V2_FIELDS - set(entry))
    for field_name in missing_fields:
        errors.append(_rejected_error(line_number, f"v2 missing field: {field_name}"))

    slug = entry.get("slug")
    if not isinstance(slug, str) or not SLUG_RE.fullmatch(slug):
        errors.append(_rejected_error(line_number, f"v2 invalid slug: {slug}"))

    for field_name in ["company_url", "decision_source_url"]:
        value = entry.get(field_name)
        if not _is_absolute_http_url(value):
            errors.append(_rejected_error(line_number, f"v2 invalid {field_name}: {value}"))

    source_type = entry.get("decision_source_type")
    if (
        not isinstance(source_type, str)
        or source_type not in REJECTED_V2_SOURCE_TYPES
    ):
        errors.append(
            _rejected_error(
                line_number,
                f"v2 invalid decision_source_type '{source_type}'",
            )
        )

    rejected_at = entry.get("rejected_at")
    if not _is_valid_calendar_date(rejected_at):
        errors.append(
            _rejected_error(line_number, f"v2 invalid rejected_at: {rejected_at}")
        )

    stage = entry.get("stage")
    if not isinstance(stage, str) or stage not in REJECTED_STAGES:
        errors.append(
            _rejected_error(line_number, f"invalid rejection stage '{stage}'")
        )

    reason = entry.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        errors.append(_rejected_error(line_number, "v2 reason must be a non-empty string"))

    lifecycle = entry.get("lifecycle")
    if not isinstance(lifecycle, dict):
        errors.append(_rejected_error(line_number, "v2 lifecycle must be an object"))
        return errors, None

    status = lifecycle.get("status")
    if not isinstance(status, str) or status not in {"active", "superseded"}:
        errors.append(
            _rejected_error(line_number, f"v2 invalid lifecycle status '{status}'")
        )

    lifecycle_fields = set(lifecycle)
    required_lifecycle_fields = set(REJECTED_V2_LIFECYCLE_FIELDS)
    if status == "superseded":
        required_lifecycle_fields.add("resolution")
    unknown_lifecycle_fields = sorted(lifecycle_fields - required_lifecycle_fields)
    if unknown_lifecycle_fields:
        errors.append(
            _rejected_error(
                line_number,
                "v2 lifecycle contains unsupported fields: "
                + ", ".join(unknown_lifecycle_fields),
            )
        )
    for field_name in sorted(required_lifecycle_fields - lifecycle_fields):
        errors.append(
            _rejected_error(line_number, f"v2 lifecycle missing field: {field_name}")
        )

    triggers = lifecycle.get("revisit_triggers")
    trigger_values: list[str] = []
    if not isinstance(triggers, list) or not triggers:
        errors.append(
            _rejected_error(
                line_number,
                "v2 lifecycle.revisit_triggers must be a non-empty array",
            )
        )
    elif not all(isinstance(trigger, str) and trigger.strip() for trigger in triggers):
        errors.append(
            _rejected_error(
                line_number,
                "v2 lifecycle.revisit_triggers items must be non-empty strings",
            )
        )
    else:
        trigger_values = triggers
        invalid_triggers = sorted(
            set(trigger_values) - REJECTED_V2_REVISIT_TRIGGERS
        )
        if invalid_triggers:
            errors.append(
                _rejected_error(
                    line_number,
                    "v2 lifecycle.revisit_triggers contains unsupported values: "
                    + ", ".join(invalid_triggers),
                )
            )
        if len(trigger_values) != len(set(trigger_values)):
            errors.append(
                _rejected_error(
                    line_number,
                    "v2 lifecycle.revisit_triggers must not contain duplicates",
                )
            )

    resolution = lifecycle.get("resolution")
    if status == "active" and resolution is not None:
        errors.append(
            _rejected_error(
                line_number,
                "v2 active lifecycle must not contain resolution",
            )
        )
    elif status == "superseded" and isinstance(resolution, dict):
        unknown_resolution_fields = sorted(
            set(resolution) - REJECTED_V2_RESOLUTION_FIELDS
        )
        if unknown_resolution_fields:
            errors.append(
                _rejected_error(
                    line_number,
                    "v2 lifecycle.resolution contains unsupported fields: "
                    + ", ".join(unknown_resolution_fields),
                )
            )
        for field_name in sorted(REJECTED_V2_RESOLUTION_FIELDS - set(resolution)):
            errors.append(
                _rejected_error(
                    line_number,
                    f"v2 lifecycle.resolution missing field: {field_name}",
                )
            )

        resolved_at = resolution.get("resolved_at")
        if not _is_valid_calendar_date(resolved_at):
            errors.append(
                _rejected_error(
                    line_number,
                    f"v2 lifecycle.resolution invalid resolved_at: {resolved_at}",
                )
            )
        elif isinstance(rejected_at, str) and resolved_at < rejected_at:
            errors.append(
                _rejected_error(
                    line_number,
                    "v2 lifecycle.resolution.resolved_at must be on or after rejected_at",
                )
            )

        resolution_trigger = resolution.get("trigger")
        if (
            not isinstance(resolution_trigger, str)
            or resolution_trigger not in REJECTED_V2_REVISIT_TRIGGERS
        ):
            errors.append(
                _rejected_error(
                    line_number,
                    f"v2 lifecycle.resolution invalid trigger '{resolution_trigger}'",
                )
            )
        elif trigger_values and resolution_trigger not in trigger_values:
            errors.append(
                _rejected_error(
                    line_number,
                    "v2 lifecycle.resolution.trigger must be listed in revisit_triggers",
                )
            )

        if resolution.get("outcome") != "accepted":
            errors.append(
                _rejected_error(
                    line_number,
                    "v2 lifecycle.resolution.outcome must be 'accepted'",
                )
            )

        note = resolution.get("note")
        if not isinstance(note, str) or not note.strip():
            errors.append(
                _rejected_error(
                    line_number,
                    "v2 lifecycle.resolution.note must be a non-empty string",
                )
            )
    elif status == "superseded":
        errors.append(
            _rejected_error(
                line_number,
                "v2 superseded lifecycle resolution must be an object",
            )
        )

    return errors, status if isinstance(status, str) else None


def validate_rejected_file(
    startup_slugs: set[str],
    rejected_file: Path = REJECTED_FILE,
) -> tuple[int, list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not rejected_file.exists():
        errors.append("content/rejected.jsonl is missing.")
        return 0, errors, warnings

    lines = rejected_file.read_text().splitlines()
    if not lines:
        errors.append("content/rejected.jsonl is empty.")
        return 0, errors, warnings

    errors.extend(_validate_rejected_legacy_block(lines))
    seen: set[str] = set()
    active_entries = 0

    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(_rejected_error(line_number, f"invalid JSON: {exc}"))
            continue

        if not isinstance(entry, dict):
            errors.append(_rejected_error(line_number, "entry must be a JSON object"))
            continue

        if "schema_version" not in entry:
            entry_errors, lifecycle_status = _validate_legacy_rejected_entry(
                entry, line_number
            )
            if line_number > REJECTED_LEGACY_V1_LINE_LIMIT:
                entry_errors.append(
                    _rejected_error(
                        line_number,
                        "new rejected entries must use schema_version: 2; "
                        f"legacy v1 is limited to lines 1-{REJECTED_LEGACY_V1_LINE_LIMIT}",
                    )
                )
        elif (
            type(entry.get("schema_version")) is int
            and entry.get("schema_version") == 2
        ):
            entry_errors, lifecycle_status = _validate_v2_rejected_entry(
                entry, line_number
            )
        else:
            entry_errors = [
                _rejected_error(
                    line_number,
                    f"unsupported schema_version: {entry.get('schema_version')}",
                )
            ]
            lifecycle_status = None

        errors.extend(entry_errors)
        if lifecycle_status == "active":
            active_entries += 1

        slug = entry.get("slug")
        if isinstance(slug, str) and slug:
            if slug in seen:
                errors.append(_rejected_error(line_number, f"duplicate slug: {slug}"))
            seen.add(slug)

            if slug in startup_slugs:
                if lifecycle_status != "superseded":
                    errors.append(
                        _rejected_error(
                            line_number,
                            f"slug also exists in content/startups: {slug}",
                        )
                    )
            elif lifecycle_status == "superseded":
                errors.append(
                    _rejected_error(
                        line_number,
                        "v2 superseded rejection must resolve to an existing "
                        f"content/startups entry: {slug}",
                    )
                )

    return active_entries, errors, warnings


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

        asset_errors, asset_warnings = validate_brand_asset_record(
            prefix=prefix,
            asset=asset,
            expected_name=str(startup.get("product_name", "")),
            expected_page=str(startup.get("url", "")),
            expected_prefix="/logos/companies/",
            url_cache=url_cache,
        )
        errors.extend(asset_errors)
        warnings.extend(asset_warnings)

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

            asset_errors, asset_warnings = validate_brand_asset_record(
                prefix=prefix,
                asset=asset,
                expected_name=str(investor.get("name", "")),
                expected_page=str(investor.get("website", "")),
                expected_prefix="/logos/investors/",
                url_cache=url_cache,
            )
            errors.extend(asset_errors)
            warnings.extend(asset_warnings)

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

            asset_errors, asset_warnings = validate_brand_asset_record(
                prefix=prefix,
                asset=asset,
                expected_name=str(investor.get("name", "")),
                expected_page=str(investor.get("website", "")),
                expected_prefix="/logos/investors/",
                url_cache=url_cache,
            )
            errors.extend(asset_errors)
            warnings.extend(asset_warnings)

    for slug, investor in investors.items():
        asset = investor_assets.get(slug)
        prefix = f"brand-assets investors.{slug}"
        if not isinstance(asset, dict):
            errors.append(f"{prefix} missing for investor directory entry")
            continue

        asset_errors, asset_warnings = validate_brand_asset_record(
            prefix=prefix,
            asset=asset,
            expected_name=investor.get("name", ""),
            expected_page=investor.get("website", ""),
            expected_prefix="/logos/investors/",
            url_cache=url_cache,
        )
        errors.extend(asset_errors)
        warnings.extend(asset_warnings)

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
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    name = str(asset.get("name", "")).strip()
    shape = str(asset.get("shape", "")).strip()
    local_path = str(asset.get("local_path", "")).strip()
    source_page = str(asset.get("source_page", "")).strip()
    source_url = str(asset.get("source_url", "")).strip()
    allow_unreachable_source = asset.get("allow_unreachable_source") is True
    note = str(asset.get("note", "")).strip()
    local_asset_exists = False

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
        local_asset_exists = asset_file.exists()
        if not local_asset_exists:
            errors.append(f"{prefix} missing local file: {asset_file.relative_to(REPO_ROOT)}")

    source_page_host_matches = not expected_page or normalize_host(source_page) == normalize_host(expected_page)
    allow_source_warning = allow_unreachable_source and local_asset_exists and source_page_host_matches
    if allow_unreachable_source and not note:
        warnings.append(f"{prefix} allow_unreachable_source should include a note")

    if not source_page:
        errors.append(f"{prefix} missing source_page")
    elif expected_page and normalize_host(source_page) != normalize_host(expected_page):
        errors.append(
            f"{prefix} source_page host '{normalize_host(source_page)}' "
            f"does not match expected host '{normalize_host(expected_page)}'"
        )
    else:
        source_page_status = check_url(source_page, cache=url_cache)
        if source_page_status not in HTTP_NON_BLOCKING:
            if allow_source_warning:
                warnings.append(
                    f"{prefix} source_page returned HTTP {source_page_status}; "
                    "allow_unreachable_source keeps the local official logo non-blocking"
                )
            else:
                errors.append(
                    f"{prefix} source_page check failed with HTTP {source_page_status}: {source_page}"
                )

    if not source_url:
        errors.append(f"{prefix} missing source_url")
    else:
        source_url_status = check_url(source_url, cache=url_cache)
        if source_url_status not in HTTP_NON_BLOCKING:
            if allow_source_warning:
                warnings.append(
                    f"{prefix} source_url returned HTTP {source_url_status}; "
                    "allow_unreachable_source keeps the local official logo non-blocking"
                )
            else:
                errors.append(
                    f"{prefix} source_url check failed with HTTP {source_url_status}: {source_url}"
                )

    return errors, warnings


def normalize_host(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    return host[4:] if host.startswith("www.") else host


def prime_url_cache(startup_files: list[Path], url_cache: dict[str, str]) -> None:
    urls = sorted(collect_validation_urls(startup_files))
    if not urls:
        return

    print(f"Checking {len(urls)} external URLs...", flush=True)
    parallel_urls = [url for url in urls if normalize_host(url) not in GET_ONLY_SERIAL_HOSTS]
    serial_urls = [url for url in urls if normalize_host(url) in GET_ONLY_SERIAL_HOSTS]
    completed = 0

    with ThreadPoolExecutor(max_workers=URL_CHECK_WORKERS) as executor:
        future_to_url = {executor.submit(fetch_url_status, url): url for url in parallel_urls}
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                url_cache[url] = future.result()
            except Exception:
                url_cache[url] = "000"
            completed += 1
            if completed == len(urls) or completed % 100 == 0:
                print(f"  URL checks: {completed}/{len(urls)}", flush=True)

    # GlobeNewswire intermittently returns 503 when many HEAD requests arrive
    # together. A serialized browser-style GET still enforces reachability while
    # avoiding a validator-created burst against the same official source host.
    for index, url in enumerate(serial_urls):
        if index:
            time.sleep(SERIAL_HOST_DELAY_SECONDS)
        try:
            url_cache[url] = fetch_url_status(url)
        except Exception:
            url_cache[url] = "000"
        completed += 1
        if completed == len(urls) or completed % 100 == 0:
            print(f"  URL checks: {completed}/{len(urls)}", flush=True)


def collect_validation_urls(startup_files: list[Path]) -> set[str]:
    urls: set[str] = set()

    for path in startup_files:
        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue

        add_url(urls, data.get("url"))
        for round_data in data.get("funding") or []:
            if isinstance(round_data, dict):
                add_url(urls, round_data.get("source_url"))

        research = data.get("research")
        if isinstance(research, dict):
            for source in research.get("sources") or []:
                if isinstance(source, dict) and source.get("type") != "editorial":
                    add_url(urls, source.get("url"))

    try:
        brand_assets = json.loads(BRAND_ASSETS_FILE.read_text())
    except json.JSONDecodeError:
        brand_assets = {}

    if isinstance(brand_assets, dict):
        for section in ("companies", "investors"):
            assets = brand_assets.get(section)
            if not isinstance(assets, dict):
                continue
            for asset in assets.values():
                if not isinstance(asset, dict):
                    continue
                add_url(urls, asset.get("source_page"))
                add_url(urls, asset.get("source_url"))

    return urls


def add_url(urls: set[str], value: object) -> None:
    if not isinstance(value, str):
        return
    url = value.strip()
    if url:
        urls.add(url)


def check_url(url: str, *, cache: dict[str, str]) -> str:
    cache_key = url
    if cache_key in cache:
        return cache[cache_key]

    resolved_status = fetch_url_status(url)
    cache[cache_key] = resolved_status
    return resolved_status


def fetch_url_status(url: str) -> str:
    get_only = normalize_host(url) in GET_ONLY_SERIAL_HOSTS
    attempts = (
        tuple([] for _ in range(len(GET_ONLY_RETRY_DELAYS_SECONDS) + 1))
        if get_only
        else (["-I"], [])
    )

    status = "000"
    definitive_status: str | None = None
    for attempt_index, extra_args in enumerate(attempts):
        headers = CURL_BROWSER_HEADERS if get_only or attempt_index > 0 else CURL_HEAD_HEADERS
        cmd = [
            "/usr/bin/curl",
            "-sS",
            "-L",
            "--max-time",
            CURL_MAX_TIME_SECONDS,
            "--connect-timeout",
            CURL_CONNECT_TIMEOUT_SECONDS,
            "--retry",
            CURL_RETRY_COUNT,
            "--retry-delay",
            CURL_RETRY_DELAY_SECONDS,
            "--retry-all-errors",
            *headers,
            *extra_args,
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            url,
        ]
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=False,
                timeout=CURL_PROCESS_TIMEOUT_SECONDS,
            )
        except OSError:
            break
        except subprocess.TimeoutExpired:
            status = "000"
            break
        status = proc.stdout.strip() or "000"
        if status in HTTP_OK:
            definitive_status = status
            break
        if get_only:
            if status in RETRYABLE_HTTP_STATUSES and attempt_index < len(attempts) - 1:
                definitive_status = status
                time.sleep(GET_ONLY_RETRY_DELAYS_SECONDS[attempt_index])
                continue
            if status not in HTTP_FALLBACK:
                definitive_status = status
            break
        if attempt_index == 0 and status in HTTP_GET_RETRY_AFTER_HEAD:
            if status not in HTTP_FALLBACK:
                definitive_status = status
            continue
        if status not in HTTP_FALLBACK:
            definitive_status = status
        break

    resolved_status = definitive_status or status
    return resolved_status


if __name__ == "__main__":
    sys.exit(main())
