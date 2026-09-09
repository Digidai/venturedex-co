#!/usr/bin/env python3
"""Read-only, evidence-bound decision validation and bounded review planning.

This tool never searches, changes a decision, publishes content or writes state.
The original rejection ledger remains an audit source, not a rejection quota.
"""
from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import re
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
STATES = {"evidence_pending", "access_blocked", "schema_deferred", "qualified_pending", "publication_blocked", "quality_rejected", "policy_excluded", "accepted"}
PENDING = STATES - {"quality_rejected", "policy_excluded", "accepted"}
SOURCE_TYPES = {"company", "investor", "original_media", "regional_media", "industry_media", "research", "discovery"}
REASONS = {
    "evidence_pending": {"governance_revisit", "funding_evidence_gap", "product_evidence_gap", "source_identity_gap", "identity_ambiguous"},
    "access_blocked": {"page_access"},
    "schema_deferred": {"unrepresentable_source_terms"},
    "qualified_pending": {"publication_capacity"},
    "publication_blocked": {"screenshot_review", "release_gate", "investor_research"},
    "quality_rejected": {"taste_failed", "no_product_evidence"},
    "policy_excluded": {"not_independent", "excluded_category", "outside_discovery_window", "late_stage_exception_failed"},
    "accepted": {"all_gates_passed"},
}
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
HASH = re.compile(r"^[a-f0-9]{64}$")
REVIEW_FIELDS = {"slug", "company_url", "state", "reason_code", "reason", "reviewed_at", "next_review_at", "priority", "sources", "original", "attempts", "evaluation"}


def calendar(value):
    try:
        parsed = date.fromisoformat(value)
        return parsed if parsed.isoformat() == value else None
    except (TypeError, ValueError):
        return None


def public_url(value):
    if not isinstance(value, str) or value != value.strip():
        return False
    try:
        parsed = urlparse(value)
        host = parsed.hostname or ""
        if parsed.scheme not in {"https", "http"} or parsed.username or parsed.password or parsed.port or "." not in host:
            return False
        if host.endswith((".local", ".localhost", ".internal")):
            return False
        try:
            ipaddress.ip_address(host)
            return False
        except ValueError:
            return True
    except ValueError:
        return False


def nonempty(value, minimum=1, maximum=1500):
    return isinstance(value, str) and minimum <= len(value.strip()) <= maximum and not any(c in value for c in "\x00\r")


def member(value, choices):
    return isinstance(value, str) and value in choices


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def rejection_index(root=ROOT):
    return {row["slug"]: (row, digest(line.strip()))
            for line in (root / "content/rejected.jsonl").read_text().splitlines()
            if line.strip() for row in [json.loads(line)]}


def validate_evaluation(value):
    if not isinstance(value, dict) or set(value) != {"rubric", "independent", "funding_verified", "product_evidence", "taste"}:
        return ["evaluation requires rubric, independent, funding_verified, product_evidence and taste"]
    errors = []
    if not member(value["rubric"], {"software", "enterprise", "developer", "hardware", "biotech", "other"}):
        errors.append("unknown industry rubric")
    if value["independent"] is not True or value["funding_verified"] is not True:
        errors.append("qualification requires verified independence and funding")
    evidence = value["product_evidence"]
    if not isinstance(evidence, list) or len(evidence) < 2:
        errors.append("qualification requires at least two source-bound product observations")
    else:
        for item in evidence:
            if not isinstance(item, dict) or set(item) != {"url", "note"} or not public_url(item["url"]) or not nonempty(item["note"], 20):
                errors.append("invalid product observation")
    taste = value["taste"]
    if not isinstance(taste, dict) or set(taste) != {"bet", "craft", "specificity"}:
        errors.append("taste requires bet, craft and specificity")
    else:
        passed = 0
        for item in taste.values():
            if not isinstance(item, dict) or set(item) != {"pass", "note"} or type(item["pass"]) is not bool or not nonempty(item["note"], 20):
                errors.append("each taste judgment requires an explicit boolean and evidence note")
            else:
                passed += int(item["pass"])
        if passed < 2:
            errors.append("qualification requires at least two taste dimensions")
    return errors


def validate_review(row, originals, startup_slugs, today):
    if not isinstance(row, dict):
        return ["review must be an object"]
    errors = []
    required = REVIEW_FIELDS - {"original", "evaluation"}
    if set(row) - REVIEW_FIELDS or required - set(row):
        errors.append("review has unknown or missing fields")
    slug = row.get("slug")
    if not isinstance(slug, str) or not SLUG.fullmatch(slug):
        errors.append("invalid review slug")
    if not public_url(row.get("company_url")):
        errors.append("review needs a verified public company URL")
    state = row.get("state")
    if not member(state, STATES) or not member(row.get("reason_code"), REASONS.get(state, set())):
        errors.append("state/reason_code mismatch; missing lead/currency is never a rejection reason")
    if not isinstance(slug, str) or not isinstance(state, str):
        return errors
    if not nonempty(row.get("reason"), 30):
        errors.append("review needs a specific reason")
    reviewed = calendar(row.get("reviewed_at"))
    if not reviewed or reviewed > today:
        errors.append("reviewed_at must be a real non-future date")
    next_review = calendar(row.get("next_review_at"))
    if state in PENDING:
        maximum = 7 if state == "access_blocked" else 30
        if not reviewed or not next_review or not reviewed < next_review <= reviewed + timedelta(days=maximum):
            errors.append(f"pending state requires next_review_at within {maximum} days")
    elif row.get("next_review_at") is not None:
        errors.append("terminal state cannot have next_review_at")
    if type(row.get("priority")) is not int or row["priority"] not in {1, 2, 3}:
        errors.append("priority must be 1, 2 or 3")
    sources = row.get("sources")
    if not isinstance(sources, list) or not sources or any(not public_url(url) for url in sources):
        errors.append("review needs exact public evidence URLs")
    elif len(sources) != len(set(sources)):
        errors.append("duplicate review sources")
    original = row.get("original")
    if original is not None:
        if not isinstance(original, dict) or set(original) != {"ledger", "sha256"} or original.get("ledger") != "rejected.jsonl" or not HASH.fullmatch(str(original.get("sha256", ""))):
            errors.append("invalid original rejection reference")
        elif slug not in originals or original["sha256"] != originals[slug][1]:
            errors.append("original rejection hash mismatch or missing slug")
        elif row.get("company_url") != originals[slug][0].get("company_url", row.get("company_url")):
            errors.append("original company identity differs; resolve identity before overriding")
    elif slug in originals:
        errors.append("a prior rejection requires its exact original hash")
    attempts = row.get("attempts")
    if not isinstance(attempts, list) or len(attempts) > 30:
        errors.append("attempts must be a bounded history")
    else:
        previous = None
        for attempt in attempts:
            if not isinstance(attempt, dict) or set(attempt) != {"date", "outcome", "note"}:
                errors.append("invalid attempt fields")
                continue
            checked = calendar(attempt.get("date"))
            if not checked or not reviewed or checked > reviewed or (previous and checked < previous):
                errors.append("attempt dates must be ordered and no later than reviewed_at")
            if not member(attempt.get("outcome"), STATES) or not nonempty(attempt.get("note"), 20):
                errors.append("attempt needs observed outcome and reason")
            previous = checked
    if state in {"accepted", "qualified_pending", "publication_blocked"}:
        errors.extend(validate_evaluation(row.get("evaluation")))
    if state == "accepted" and slug not in startup_slugs:
        errors.append("accepted review requires an existing validated startup")
    if state != "accepted" and slug in startup_slugs:
        errors.append("published startup cannot retain an unresolved or rejected review")
    return errors


def validate_manifest(data, startup_slugs, today=None, review_slugs=None):
    errors = []
    if not isinstance(data, dict) or set(data) != {"schema_version", "run_id", "locked_at", "pool_sha256", "source_coverage", "candidates"} or data.get("schema_version") != 1:
        return ["invalid fixed-pool manifest fields/version"]
    if not re.fullmatch(r"venturedex-daily-\d{8}T\d{6}Z", str(data.get("run_id", ""))):
        errors.append("invalid run_id")
    today = today or date.today()
    locked = calendar(data.get("locked_at"))
    if not locked or locked > today:
        errors.append("invalid locked_at")
    candidates = data.get("candidates")
    if not isinstance(candidates, list) or not 10 <= len(candidates) <= 20:
        return errors + ["fixed pool must contain 10-20 unique candidates including carry-over reviews"]
    identities, slugs, accepted = [], set(), 0
    for candidate in candidates:
        required = {"slug", "company_url", "source_url", "source_type", "announced_at", "region", "industry", "state", "reason", "discovery_mode"}
        if not isinstance(candidate, dict) or required - set(candidate) or set(candidate) - required - {"evaluation"}:
            errors.append("invalid candidate fields")
            continue
        slug = candidate["slug"]
        if not isinstance(slug, str) or not SLUG.fullmatch(slug) or slug in slugs:
            errors.append("invalid or duplicate candidate slug")
            continue
        slugs.add(slug)
        if not public_url(candidate["company_url"]) or not public_url(candidate["source_url"]) or not member(candidate["source_type"], SOURCE_TYPES):
            errors.append(f"{slug}: invalid identity/discovery source")
        announced = calendar(candidate["announced_at"])
        if candidate["announced_at"] is not None and (not announced or announced > today):
            errors.append(f"{slug}: invalid announcement date")
        if not member(candidate["state"], STATES) or not nonempty(candidate["reason"], 20):
            errors.append(f"{slug}: every candidate needs an explicit outcome and reason")
        ready = member(candidate["state"], {"accepted", "qualified_pending", "publication_blocked"})
        if not member(candidate["discovery_mode"], {"fresh", "revisit"}):
            errors.append(f"{slug}: invalid discovery_mode")
        elif candidate["discovery_mode"] == "fresh" and ready and (not locked or not announced or not locked - timedelta(days=30) <= announced <= locked):
            errors.append(f"{slug}: fresh qualified candidate requires a source date within the locked 30-day window")
        elif candidate["discovery_mode"] == "revisit" and review_slugs is not None and slug not in review_slugs:
            errors.append(f"{slug}: revisit needs a durable review record and trigger")
        if member(candidate["state"], PENDING) and review_slugs is not None and slug not in review_slugs:
            errors.append(f"{slug}: pending candidate needs a durable review record")
        if ready:
            errors.extend(f"{slug}: {error}" for error in validate_evaluation(candidate.get("evaluation")))
        if not nonempty(candidate["region"]) or not nonempty(candidate["industry"]):
            errors.append(f"{slug}: record source coverage; use undisclosed rather than guessing")
        if candidate["state"] == "accepted":
            accepted += 1
            if slug not in startup_slugs:
                errors.append(f"{slug}: accepted candidate has no startup record")
        identities.append({key: candidate[key] for key in ["slug", "company_url", "source_url"]})
    expected = digest(json.dumps(identities, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
    if data.get("pool_sha256") != expected:
        errors.append("fixed-pool identity hash mismatch")
    if accepted > 5:
        errors.append("at most five accepted additions per fixed pool; preserve qualified overflow")
    coverage = data.get("source_coverage")
    if not isinstance(coverage, list) or len(coverage) < 3:
        errors.append("record at least three complementary source-family search attempts, including no-results")
    else:
        types = set()
        for item in coverage:
            if not isinstance(item, dict) or set(item) != {"type", "query", "outcome"} or not member(item["type"], SOURCE_TYPES) or not nonempty(item["query"], 5) or not nonempty(item["outcome"], 10):
                errors.append("invalid source coverage attempt")
            else:
                types.add(item["type"])
        if len(types - {"discovery"}) < 3:
            errors.append("aggregator-only discovery is not complementary source coverage")
    return errors


def load_reviews(root=ROOT, today=None):
    today = today or date.today()
    data = json.loads((root / "content/curation-reviews.json").read_text())
    if not isinstance(data, dict) or set(data) != {"schema_version", "reviews"} or data.get("schema_version") != 1 or not isinstance(data.get("reviews"), list):
        raise ValueError("invalid curation review file/version")
    originals = rejection_index(root)
    startup_slugs = {path.stem for path in (root / "content/startups").glob("*.json")}
    errors, seen = [], set()
    for row in data["reviews"]:
        slug = row.get("slug") if isinstance(row, dict) else None
        if isinstance(slug, str):
            if slug in seen:
                errors.append(f"duplicate review slug: {slug}")
            seen.add(slug)
        errors.extend(f"{slug}: {error}" for error in validate_review(row, originals, startup_slugs, today))
    for path in sorted((root / "content/curation-runs").glob("*.json")):
        errors.extend(f"{path.name}: {error}" for error in validate_manifest(json.loads(path.read_text()), startup_slugs, today, seen))
    if errors:
        raise ValueError("\n".join(errors))
    return data["reviews"]


def review_plan(reviews, today, limit=3):
    if type(limit) is not int or not 1 <= limit <= 5:
        raise ValueError("review limit must be 1-5; reviews share the fixed pool and five-addition ceiling")
    due = [row for row in reviews if row["state"] in PENDING and calendar(row["next_review_at"]) <= today]
    due.sort(key=lambda row: (row["priority"], row["next_review_at"], row["slug"]))
    return {"as_of": today.isoformat(), "due_count": len(due), "selected": due[:limit], "remaining_due": max(0, len(due) - limit), "authorization": "Re-review only inside the next fixed pool; not automatic acceptance, discovery or publishing."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["validate", "plan", "lookup"])
    parser.add_argument("--today", default=date.today().isoformat())
    parser.add_argument("--limit", type=int, default=3)
    parser.add_argument("--slug")
    args = parser.parse_args()
    today = calendar(args.today)
    if not today:
        parser.error("--today must be a real YYYY-MM-DD date")
    reviews = load_reviews(today=today)
    if args.command == "validate":
        result = {"valid": True, "reviews": len(reviews), "pending": sum(row["state"] in PENDING for row in reviews), "rejection_quota": None}
    elif args.command == "plan":
        result = review_plan(reviews, today, args.limit)
    else:
        if not args.slug or not SLUG.fullmatch(args.slug):
            parser.error("lookup requires a canonical --slug")
        found = next((row for row in reviews if row["slug"] == args.slug), None)
        published = (ROOT / "content/startups" / f"{args.slug}.json").exists()
        original = rejection_index().get(args.slug)
        result = {"slug": args.slug, "state": "accepted" if published else found["state"] if found else "historical_rejection" if original else "unseen", "review": found, "original_rejection": original[0] if original else None}
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError) as exc:
        raise SystemExit(f"Curation validation blocked: {exc}")
