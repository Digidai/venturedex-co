#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[1]
STARTUPS_DIR = REPO_ROOT / "content" / "startups"
WEEKLY_DIR = REPO_ROOT / "content" / "weekly"
DATE_FORMAT = "%Y-%m-%d"


@dataclass(frozen=True)
class StartupCandidate:
    slug: str
    product_name: str
    url: str
    rating: int
    is_featured: bool
    latest_funding_date: str
    latest_funding_source_name: str
    latest_funding_source_url: str
    path: Path


def parse_date(value: str) -> date:
    try:
        return datetime.strptime(value, DATE_FORMAT).date()
    except ValueError as exc:
        raise SystemExit(f"Invalid date '{value}'. Expected YYYY-MM-DD.") from exc


def default_week_bounds(today: date | None = None) -> tuple[date, date]:
    today = today or date.today()
    last_sunday = today - timedelta(days=today.weekday() + 1)
    return last_sunday - timedelta(days=6), last_sunday


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise SystemExit(f"{path.relative_to(REPO_ROOT)} invalid JSON: {exc}") from exc


def latest_funding_round(data: dict) -> dict:
    rounds = [round_data for round_data in data.get("funding", []) if isinstance(round_data, dict)]
    if not rounds:
        return {}
    return sorted(rounds, key=lambda round_data: round_data.get("date", ""), reverse=True)[0]


def load_startups() -> list[StartupCandidate]:
    candidates: list[StartupCandidate] = []
    for path in sorted(STARTUPS_DIR.glob("*.json")):
        data = load_json(path)
        latest = latest_funding_round(data)
        rating = data.get("editor_rating")
        if not isinstance(rating, int):
            rating = 0
        candidates.append(
            StartupCandidate(
                slug=data.get("slug", path.stem),
                product_name=data.get("product_name", path.stem),
                url=data.get("url", ""),
                rating=rating,
                is_featured=bool(data.get("is_featured")),
                latest_funding_date=latest.get("date", ""),
                latest_funding_source_name=latest.get("source_name", ""),
                latest_funding_source_url=latest.get("source_url", ""),
                path=path,
            )
        )
    return candidates


def load_weekly_files() -> list[tuple[Path, dict]]:
    return [(path, load_json(path)) for path in sorted(WEEKLY_DIR.glob("*.json"))]


def pick_slug(pick: object) -> str:
    if isinstance(pick, str):
        return pick
    if isinstance(pick, dict):
        value = pick.get("slug")
        return value if isinstance(value, str) else ""
    return ""


def used_weekly_slugs() -> set[str]:
    used: set[str] = set()
    for _, issue in load_weekly_files():
        if issue.get("status", "published") != "published":
            continue
        for pick in issue.get("picks", []):
            slug = pick_slug(pick)
            if slug:
                used.add(slug)
    return used


def next_issue_number() -> int:
    numbers = [
        issue.get("issue_number")
        for _, issue in load_weekly_files()
        if isinstance(issue.get("issue_number"), int)
    ]
    return (max(numbers) + 1) if numbers else 1


def issue_exists_for_week(week_start: str, week_end: str) -> bool:
    for _, issue in load_weekly_files():
        if issue.get("week_start") == week_start and issue.get("week_end") == week_end:
            return True
    return False


def git_changed_startup_slugs(week_start: str, week_end: str) -> set[str]:
    cmd = [
        "git",
        "log",
        "--name-only",
        "--diff-filter=AM",
        f"--since={week_start} 00:00:00",
        f"--until={week_end} 23:59:59",
        "--format=",
        "--",
        "content/startups/*.json",
    ]
    try:
        output = subprocess.check_output(cmd, cwd=REPO_ROOT, text=True, stderr=subprocess.DEVNULL)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return set()

    slugs: set[str] = set()
    for line in output.splitlines():
        path = Path(line.strip())
        if len(path.parts) == 3 and path.parts[0] == "content" and path.parts[1] == "startups":
            slugs.add(path.stem)
    return slugs


def funding_in_week(candidate: StartupCandidate, week_start: date, week_end: date) -> bool:
    if not candidate.latest_funding_date:
        return False
    try:
        funding_date = parse_date(candidate.latest_funding_date)
    except SystemExit:
        return False
    return week_start <= funding_date <= week_end


def candidate_sort_key(
    candidate: StartupCandidate,
    changed_slugs: set[str],
    week_start: date,
    week_end: date,
) -> tuple[int, int, str, int, int, str]:
    changed = 1 if candidate.slug in changed_slugs else 0
    funded_this_week = 1 if funding_in_week(candidate, week_start, week_end) else 0
    featured = 1 if candidate.is_featured else 0
    return (
        changed,
        funded_this_week,
        candidate.latest_funding_date,
        candidate.rating,
        featured,
        candidate.product_name.lower(),
    )


def select_candidates(
    *,
    week_start: date,
    week_end: date,
    min_picks: int,
    max_picks: int,
    explicit_slugs: list[str],
) -> list[StartupCandidate]:
    startups = {candidate.slug: candidate for candidate in load_startups()}
    if explicit_slugs:
        missing = [slug for slug in explicit_slugs if slug not in startups]
        if missing:
            raise SystemExit(f"Unknown startup slug(s): {', '.join(missing)}")
        return [startups[slug] for slug in explicit_slugs]

    changed_slugs = git_changed_startup_slugs(week_start.isoformat(), week_end.isoformat())
    used_slugs = used_weekly_slugs()
    eligible = [candidate for candidate in startups.values() if candidate.rating >= 3]

    fresh = [candidate for candidate in eligible if candidate.slug not in used_slugs]
    fallback = [candidate for candidate in eligible if candidate.slug in used_slugs]
    sort_args = (changed_slugs, week_start, week_end)

    ordered = sorted(
        fresh,
        key=lambda candidate: candidate_sort_key(candidate, *sort_args),
        reverse=True,
    )
    if len(ordered) < min_picks:
        ordered.extend(
            sorted(
                fallback,
                key=lambda candidate: candidate_sort_key(candidate, *sort_args),
                reverse=True,
            )
        )

    selected = ordered[:max_picks]
    if len(selected) < min_picks:
        raise SystemExit(
            f"Only {len(selected)} eligible startups found; weekly issues require at least {min_picks}."
        )
    return selected


def draft_pick(candidate: StartupCandidate) -> dict:
    evidence = [
        {
            "label": "VentureDex product record",
            "source": f"{candidate.path.relative_to(REPO_ROOT)} summary, editor_note, and funding fields",
        }
    ]
    if candidate.url:
        evidence.append(
            {
                "label": "Official product site",
                "source": f"{candidate.product_name} homepage",
                "url": candidate.url,
            }
        )
    if candidate.latest_funding_source_url:
        evidence.append(
            {
                "label": "Funding source",
                "source": candidate.latest_funding_source_name or "Linked funding source",
                "url": candidate.latest_funding_source_url,
            }
        )

    return {
        "slug": candidate.slug,
        "why_this_week": "TODO: Explain why this company belongs in this week's theme using only verified evidence below.",
        "product_evaluation": "TODO: Write an objective product assessment. Separate observed product facts from editorial judgment, and do not add private metrics.",
        "evidence": evidence,
        "risks": [
            "TODO: State the most important evidence gap or product risk without guessing."
        ],
        "verdict": "TODO: One source-bound conclusion that a reader can evaluate from the evidence above."
    }


def build_draft_issue(args: argparse.Namespace) -> dict:
    week_start = parse_date(args.week_start)
    week_end = parse_date(args.week_end)
    if week_start > week_end:
        raise SystemExit("week_start must be before week_end.")

    selected = select_candidates(
        week_start=week_start,
        week_end=week_end,
        min_picks=args.min_picks,
        max_picks=args.max_picks,
        explicit_slugs=args.pick,
    )

    return {
        "issue_number": args.issue_number or next_issue_number(),
        "title": args.title or f"TODO: Weekly research for {week_start.isoformat()} to {week_end.isoformat()}",
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "published_at": None,
        "status": "draft",
        "editorial_intro": "TODO: Write 2-3 sentences that explain the issue's theme and why these companies belong together.",
        "research_summary": "TODO: Summarize the source boundary. State which records, official pages, and primary links were reviewed.",
        "evaluation_method": [
            "Use only published VentureDex records, official product surfaces, and linked source URLs.",
            "Separate observed product evidence from editorial judgment.",
            "State missing evidence explicitly instead of filling gaps with market assumptions."
        ],
        "themes": [
            {
                "title": "TODO: Theme title",
                "summary": "TODO: Explain the shared product or market pattern without inventing unsupported claims."
            }
        ],
        "picks": [draft_pick(candidate) for candidate in selected],
    }


def write_issue(payload: dict, *, force: bool) -> Path:
    WEEKLY_DIR.mkdir(parents=True, exist_ok=True)
    path = WEEKLY_DIR / f"{payload['issue_number']}.json"
    if path.exists() and not force:
        raise SystemExit(f"{path.relative_to(REPO_ROOT)} already exists. Use --force to overwrite.")
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    return path


def validate_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def validate_weekly() -> int:
    startup_slugs = {candidate.slug for candidate in load_startups()}
    errors: list[str] = []

    for path, issue in load_weekly_files():
        label = str(path.relative_to(REPO_ROOT))
        status = issue.get("status", "published")
        picks = issue.get("picks")

        if status not in {"draft", "published", "archived"}:
            errors.append(f"{label}: status must be draft, published, or archived")

        if not isinstance(issue.get("issue_number"), int):
            errors.append(f"{label}: issue_number must be an integer")

        if not issue.get("title"):
            errors.append(f"{label}: missing title")

        if status == "published":
            parsed_dates: dict[str, date] = {}
            for field_name in ["week_start", "week_end", "published_at"]:
                value = issue.get(field_name)
                if not isinstance(value, str):
                    errors.append(f"{label}: {field_name} must be YYYY-MM-DD for published issues")
                    continue
                try:
                    parsed_dates[field_name] = parse_date(value)
                except SystemExit:
                    errors.append(f"{label}: {field_name} must be YYYY-MM-DD for published issues")

            week_start = parsed_dates.get("week_start")
            week_end = parsed_dates.get("week_end")
            published_at = parsed_dates.get("published_at")
            if week_start and week_end and week_start > week_end:
                errors.append(f"{label}: week_start must be before week_end")
            if published_at and week_end and published_at < week_end:
                errors.append(f"{label}: published_at must be on or after week_end")

        if not isinstance(picks, list) or not 5 <= len(picks) <= 7:
            errors.append(f"{label}: picks must contain 5-7 items")
            continue

        seen_slugs: set[str] = set()
        for index, pick in enumerate(picks):
            prefix = f"{label}: picks[{index}]"
            if isinstance(pick, str):
                slug = pick
                if status == "published":
                    errors.append(f"{prefix}: published weekly picks must use research objects")
            elif isinstance(pick, dict):
                slug = pick.get("slug", "")
            else:
                errors.append(f"{prefix}: pick must be a string or object")
                continue

            if not slug or slug not in startup_slugs:
                errors.append(f"{prefix}: unknown startup slug '{slug}'")
            if slug in seen_slugs:
                errors.append(f"{prefix}: duplicate startup slug '{slug}'")
            seen_slugs.add(slug)

            if status != "published" or not isinstance(pick, dict):
                continue

            for field_name in ["why_this_week", "product_evaluation", "verdict"]:
                value = pick.get(field_name)
                if not isinstance(value, str) or len(value.strip()) < 40:
                    errors.append(f"{prefix}.{field_name}: must be at least 40 chars")
                elif "TODO" in value.upper():
                    errors.append(f"{prefix}.{field_name}: still contains TODO")

            evidence = pick.get("evidence")
            if not isinstance(evidence, list) or not evidence:
                errors.append(f"{prefix}.evidence: must contain at least one item")
            else:
                for evidence_index, item in enumerate(evidence):
                    if not isinstance(item, dict):
                        errors.append(f"{prefix}.evidence[{evidence_index}]: must be an object")
                        continue
                    if not item.get("label") or not item.get("source"):
                        errors.append(f"{prefix}.evidence[{evidence_index}]: requires label and source")
                    url = item.get("url")
                    if isinstance(url, str) and url and not validate_url(url):
                        errors.append(f"{prefix}.evidence[{evidence_index}].url: invalid URL")

            risks = pick.get("risks")
            if not isinstance(risks, list) or not risks:
                errors.append(f"{prefix}.risks: must contain at least one item")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print("weekly: OK")
    return 0


def cmd_draft(args: argparse.Namespace) -> int:
    if issue_exists_for_week(args.week_start, args.week_end) and not args.force:
        print(f"weekly: issue already exists for {args.week_start} to {args.week_end}")
        return 0

    payload = build_draft_issue(args)
    if args.write:
        path = write_issue(payload, force=args.force)
        print(f"weekly: wrote {path.relative_to(REPO_ROOT)}")
    else:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Draft and validate VentureDex weekly issues.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    start, end = default_week_bounds()

    draft = subparsers.add_parser("draft", help="Create a source-bound weekly draft scaffold.")
    draft.add_argument("--week-start", default=start.isoformat(), help="Issue week start, YYYY-MM-DD.")
    draft.add_argument("--week-end", default=end.isoformat(), help="Issue week end, YYYY-MM-DD.")
    draft.add_argument("--issue-number", type=int, help="Override the next issue number.")
    draft.add_argument("--title", help="Draft title. Defaults to a TODO title.")
    draft.add_argument("--pick", action="append", default=[], help="Explicit startup slug. Repeat for multiple picks.")
    draft.add_argument("--min-picks", type=int, default=5)
    draft.add_argument("--max-picks", type=int, default=7)
    draft.add_argument("--write", action="store_true", help="Write content/weekly/{N}.json instead of printing JSON.")
    draft.add_argument("--force", action="store_true", help="Overwrite an existing issue file.")
    draft.set_defaults(func=cmd_draft)

    validate = subparsers.add_parser("validate", help="Validate weekly issue schema and published evidence fields.")
    validate.set_defaults(func=lambda _args: validate_weekly())

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
