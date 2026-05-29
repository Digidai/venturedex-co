#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

REPO_ROOT="$REPO_ROOT" python3 - <<'PY'
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path


REPO_ROOT = Path(os.environ["REPO_ROOT"])
CONTENT_DIR = REPO_ROOT / "content" / "startups"
WEEKLY_DIR = REPO_ROOT / "content" / "weekly"
INVESTORS_FILE = REPO_ROOT / "content" / "investors.json"
OUTPUT = REPO_ROOT / "d1" / "generated-seed.sql"


def sql(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sql_list(values: list[str]) -> str:
    return ", ".join(sql(value) for value in values)


def collection_tags(data) -> set[str]:
    return {t.strip().lower() for t in (data.get("tags") or "").split(",") if t.strip()}


def tag_match(tags: set[str], *needles: str) -> bool:
    return any(needle in tag for tag in tags for needle in needles)


# Auto-derived collections, computed from each startup's product_type and tags.
# Each entry: (id, slug, title, description, predicate(product_type, tags)).
# Designed so every collection holds a meaningful set (no 1-item or near-total buckets).
COLLECTIONS = [
    ("c-ai-agents", "ai-agents", "AI Agents",
     "Autonomous, agentic systems that take real action — not just chat.",
     lambda pt, tags: tag_match(tags, "ai agent", "agentic")),
    ("c-ai-ml", "ai-ml", "AI / ML",
     "Companies pushing the frontier of machine intelligence.",
     lambda pt, tags: pt == "AI / ML"),
    ("c-ai-infra", "ai-infrastructure", "AI Infrastructure",
     "The compute, inference, and serving layer beneath modern AI.",
     lambda pt, tags: tag_match(tags, "ai infrastructure", "inference", "edge ai")),
    ("c-devtools", "developer-tools", "Developer Tools",
     "Tools that make builders faster — SDKs, APIs, and workflow.",
     lambda pt, tags: pt == "DevTools" or tag_match(tags, "developer tools")),
    ("c-saas", "saas", "SaaS & Productivity",
     "Software that runs the modern business.",
     lambda pt, tags: pt == "SaaS"),
    ("c-fintech", "fintech", "Fintech",
     "Payments, lending, and the rebuilding of financial plumbing.",
     lambda pt, tags: pt == "Fintech" or tag_match(tags, "fintech")),
    ("c-physical-ai", "physical-ai", "Physical AI & Robotics",
     "AI that moves — robotics, autonomy, and embodied systems.",
     lambda pt, tags: tag_match(tags, "physical ai", "robotics", "autonomy")),
    ("c-healthtech", "healthtech", "HealthTech",
     "Technology reshaping care, diagnostics, and biology.",
     lambda pt, tags: pt == "HealthTech" or tag_match(tags, "healthcare")),
    ("c-open-source", "open-source", "Open Source",
     "Companies building in the open.",
     lambda pt, tags: tag_match(tags, "open source")),
    ("c-climate", "climate", "Climate & Sustainability",
     "Startups decarbonizing industry, energy, and the grid.",
     lambda pt, tags: pt == "Climate / Sustainability" or tag_match(tags, "climate")),
]


startup_files = sorted(CONTENT_DIR.glob("*.json"))
weekly_files = sorted(WEEKLY_DIR.glob("*.json"))
investors = json.loads(INVESTORS_FILE.read_text()) if INVESTORS_FILE.exists() else {}

# Version-controlled per-slug publish/first-seen timestamps (content/timestamps.json).
# Keeps seeded dates deterministic and lets detail pages prerender with real dates.
# Slugs missing here fall back to seed-time now() (then can be exported back to lock them).
TIMESTAMPS_FILE = REPO_ROOT / "content" / "timestamps.json"
_timestamps_raw = json.loads(TIMESTAMPS_FILE.read_text()) if TIMESTAMPS_FILE.exists() else {}
timestamps = {k: v for k, v in _timestamps_raw.items() if not k.startswith("__")}


def timestamp_sql(slug: str, field: str) -> str:
    entry = timestamps.get(slug) or {}
    value = entry.get(field)
    return sql(value) if value else "datetime('now')"

startup_rows = []
funding_rows = []
search_rows = []
collection_rows = []
weekly_rows = []
weekly_pick_rows = []
investor_rows = []

startup_slugs: list[str] = []
issue_numbers: list[int] = []

for path in startup_files:
    data = json.loads(path.read_text())
    slug = data["slug"]
    startup_slugs.append(slug)

    startup_id = f"startup-{slug}"
    domain = data["domain"]
    url = data.get("url", f"https://{domain}")
    funding = data.get("funding", [])
    latest_round = (
        sorted(funding, key=lambda round_data: round_data.get("date", ""), reverse=True)[0]
        if funding
        else {}
    )

    # When the slug has a version-controlled timestamp, the repo is authoritative
    # (sidecar value wins on re-seed). Otherwise preserve the first seed-time now().
    in_timestamps = slug in timestamps
    published_conflict = (
        "published_at = excluded.published_at, "
        if in_timestamps
        else "published_at = COALESCE(startups.published_at, excluded.published_at), "
    )
    first_seen_conflict = (
        "first_seen_at = excluded.first_seen_at, "
        if in_timestamps
        else "first_seen_at = COALESCE(startups.first_seen_at, excluded.first_seen_at), "
    )

    startup_rows.append(
        "INSERT INTO startups ("
        "id, slug, domain, canonical_url, product_name, summary, editor_note, research_json, editor_rating, "
        "why_featured, product_type, funding_stage, funding_display, founded_year, team_size, "
        "hq_location, region, tags, investors, links_json, is_featured, screenshot_r2_key, "
        "screenshot_status, workflow_status, codex_stage, first_seen_at, published_at"
        ") VALUES ("
        f"{sql(startup_id)}, {sql(slug)}, {sql(domain)}, {sql(url)}, {sql(data['product_name'])}, "
        f"{sql(data.get('summary'))}, {sql(data.get('editor_note'))}, "
        f"{sql(json.dumps(data.get('research'), ensure_ascii=False) if data.get('research') else None)}, "
        f"{data.get('editor_rating') if data.get('editor_rating') is not None else 'NULL'}, {sql(data.get('why_featured'))}, "
        f"{sql(data.get('product_type'))}, {sql(latest_round.get('stage', ''))}, "
        f"{sql(latest_round.get('amount', ''))}, {data.get('founded_year') if data.get('founded_year') is not None else 'NULL'}, "
        f"{sql(data.get('team_size'))}, {sql(data.get('hq_location'))}, {sql(data.get('region'))}, "
        f"{sql(data.get('tags'))}, {sql(data.get('investors'))}, "
        f"{sql(json.dumps(data.get('links', {})) if data.get('links') else None)}, "
        f"{1 if data.get('is_featured') else 0}, {sql(f'{slug}.webp')}, 'ready', 'published', "
        f"'manual', {timestamp_sql(slug, 'first_seen_at')}, {timestamp_sql(slug, 'published_at')}"
        ") ON CONFLICT(slug) DO UPDATE SET "
        "id = excluded.id, "
        "domain = excluded.domain, "
        "canonical_url = excluded.canonical_url, "
        "product_name = excluded.product_name, "
        "summary = excluded.summary, "
        "editor_note = excluded.editor_note, "
        "research_json = excluded.research_json, "
        "editor_rating = excluded.editor_rating, "
        "why_featured = excluded.why_featured, "
        "product_type = excluded.product_type, "
        "funding_stage = excluded.funding_stage, "
        "funding_display = excluded.funding_display, "
        "founded_year = excluded.founded_year, "
        "team_size = excluded.team_size, "
        "hq_location = excluded.hq_location, "
        "region = excluded.region, "
        "tags = excluded.tags, "
        "investors = excluded.investors, "
        "links_json = excluded.links_json, "
        "is_featured = excluded.is_featured, "
        "screenshot_r2_key = excluded.screenshot_r2_key, "
        "screenshot_status = excluded.screenshot_status, "
        "workflow_status = excluded.workflow_status, "
        "codex_stage = excluded.codex_stage, "
        + first_seen_conflict
        + published_conflict
        + "created_at = COALESCE(startups.created_at, datetime('now')), "
        "updated_at = COALESCE(startups.updated_at, datetime('now'));"
    )

    for round_data in funding:
        round_id = "f-" + hashlib.md5(
            f"{slug}{round_data.get('date', '')}{round_data.get('stage', '')}".encode()
        ).hexdigest()[:10]
        funding_rows.append(
            "INSERT INTO funding_rounds ("
            "id, company_name, company_slug, company_url, amount, stage, lead_investor, "
            "date, source_url, source_name"
            ") VALUES ("
            f"{sql(round_id)}, {sql(data['product_name'])}, {sql(slug)}, {sql(url)}, "
            f"{sql(round_data.get('amount'))}, {sql(round_data.get('stage'))}, "
            f"{sql(round_data.get('lead_investor'))}, {sql(round_data.get('date'))}, "
            f"{sql(round_data.get('source_url'))}, {sql(round_data.get('source_name'))}"
            ") ON CONFLICT(id) DO UPDATE SET "
            "company_name = excluded.company_name, "
            "company_slug = excluded.company_slug, "
            "company_url = excluded.company_url, "
            "amount = excluded.amount, "
            "stage = excluded.stage, "
            "lead_investor = excluded.lead_investor, "
            "date = excluded.date, "
            "source_url = excluded.source_url, "
            "source_name = excluded.source_name;"
        )

    terms = [
        (data["product_name"].lower(), "name", 100),
        (data["domain"].lower(), "domain", 80),
    ]
    if data.get("product_type"):
        terms.append((data["product_type"].lower(), "type", 30))
    for tag in (data.get("tags") or "").split(","):
        normalized = tag.strip().lower()
        if normalized:
            terms.append((normalized, "tag", 50))

    seen_terms: set[tuple[str, str]] = set()
    for term, term_type, weight in terms:
        term_key = (term, term_type)
        if term_key in seen_terms:
            continue
        seen_terms.add(term_key)
        search_rows.append(
            "INSERT INTO search_index_terms (startup_id, normalized_term, term_type, weight) VALUES ("
            f"{sql(startup_id)}, {sql(term)}, {sql(term_type)}, {weight}"
            ");"
        )

    product_type = data.get("product_type", "")
    coll_tags = collection_tags(data)
    is_featured = bool(data.get("is_featured"))
    rating = data.get("editor_rating")
    # Lower rank sorts first (ORDER BY pinned DESC, rank ASC): better-rated lead each collection.
    coll_rank = (5 - rating) if isinstance(rating, int) else 5
    for collection_id, _c_slug, _c_title, _c_desc, predicate in COLLECTIONS:
        if predicate(product_type, coll_tags):
            collection_rows.append(
                "INSERT OR IGNORE INTO collection_startups (collection_id, startup_id, rank, pinned) VALUES ("
                f"{sql(collection_id)}, {sql(startup_id)}, {coll_rank}, {1 if is_featured else 0}"
                ");"
            )

for _, investor in sorted(investors.items()):
    slug = investor["slug"]
    investor_rows.append(
        "INSERT INTO investors (id, slug, name, short_name, website, description) VALUES ("
        f"{sql(f'inv-{slug}')}, {sql(slug)}, {sql(investor['name'])}, "
        f"{sql(investor.get('short_name'))}, {sql(investor.get('website'))}, "
        f"{sql(investor.get('description'))}"
        ") ON CONFLICT(slug) DO UPDATE SET "
        "id = excluded.id, "
        "name = excluded.name, "
        "short_name = excluded.short_name, "
        "website = excluded.website, "
        "description = excluded.description;"
    )

for path in weekly_files:
    data = json.loads(path.read_text())
    status = data.get("status", "published")
    if status != "published":
        continue

    issue_number = data["issue_number"]
    issue_numbers.append(issue_number)
    issue_id = f"w-{issue_number}"
    published_at = data.get("published_at")
    published_at_sql = sql(published_at) if published_at else "datetime('now')"
    weekly_rows.append(
        "INSERT INTO weekly_issues (id, issue_number, title, editorial_intro, published_at, status) VALUES ("
        f"{sql(issue_id)}, {issue_number}, {sql(data['title'])}, {sql(data.get('editorial_intro'))}, "
        f"{published_at_sql}, 'published'"
        ") ON CONFLICT(issue_number) DO UPDATE SET "
        "id = excluded.id, "
        "title = excluded.title, "
        "editorial_intro = excluded.editorial_intro, "
        "status = excluded.status, "
        "published_at = excluded.published_at;"
    )
    for index, pick_data in enumerate(data.get("picks", []), start=1):
        if isinstance(pick_data, str):
            slug = pick_data
            issue_note = None
        else:
            slug = pick_data.get("slug")
            issue_note = pick_data.get("verdict") or pick_data.get("why_this_week")

        if not slug:
            continue

        weekly_pick_rows.append(
            "INSERT INTO weekly_issue_startups (issue_id, startup_id, display_order, issue_note) VALUES ("
            f"{sql(issue_id)}, {sql(f'startup-{slug}')}, {index}, {sql(issue_note)}"
            ");"
        )


lines = [
    "-- AUTO-GENERATED from content/startups/*.json",
    "-- Do not edit manually. Modify the JSON files instead.",
    "",
    "-- Reset fully derived tables before rebuilding them.",
    "DELETE FROM funding_rounds;",
    "DELETE FROM investors;",
    "DELETE FROM search_index_terms;",
    "DELETE FROM collection_startups;",
    "DELETE FROM collections;",
    "DELETE FROM weekly_issue_startups;",
]

if issue_numbers:
    lines.append(
        "DELETE FROM weekly_issues WHERE issue_number NOT IN ("
        + ", ".join(str(number) for number in sorted(issue_numbers))
        + ");"
    )
else:
    lines.append("DELETE FROM weekly_issues;")

if startup_slugs:
    lines.append(
        "DELETE FROM startups "
        "WHERE workflow_status = 'published' "
        "AND codex_stage = 'manual' "
        "AND slug NOT IN ("
        + sql_list(startup_slugs)
        + ");"
    )
else:
    lines.append(
        "DELETE FROM startups WHERE workflow_status = 'published' AND codex_stage = 'manual';"
    )

lines.extend([
    "",
    "-- Startups",
    *startup_rows,
    "",
    "-- Funding rounds",
    *funding_rows,
    "",
    "-- Investors",
    *investor_rows,
    "",
    "-- Search index",
    *search_rows,
    "",
    "-- Collections",
    "INSERT OR IGNORE INTO collections (id, slug, title, description, type, published) VALUES",
    ",\n".join(
        f"({sql(cid)}, {sql(c_slug)}, {sql(c_title)}, {sql(c_desc)}, 'editorial', 1)"
        for cid, c_slug, c_title, c_desc, _pred in COLLECTIONS
    ) + ";",
    *collection_rows,
    "",
    "-- Weekly issues",
    *weekly_rows,
    *weekly_pick_rows,
    "",
])

OUTPUT.write_text("\n".join(lines))

print("")
print(
    f"Generated {OUTPUT.relative_to(REPO_ROOT)} with "
    f"{len(startup_rows)} startups, {len(funding_rows)} funding rounds"
)
PY
