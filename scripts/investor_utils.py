#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
from pathlib import Path


def normalize_brand_text(value: str) -> str:
    return " ".join(
        "".join(ch if ch.isalnum() else " " for ch in value.lower().replace("&", " and ")).split()
    )


def build_investor_lookup(investors: dict[str, dict[str, object]]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for slug, investor in investors.items():
        candidates = [slug, investor.get("slug"), investor.get("name"), investor.get("short_name")]
        for candidate in candidates:
            if not candidate:
                continue
            lookup.setdefault(normalize_brand_text(str(candidate)), slug)
    return lookup


def resolve_investor_slug(name: str, investor_lookup: dict[str, str]) -> str | None:
    normalized = normalize_brand_text(name)
    if not normalized:
        return None

    if normalized in investor_lookup:
        return investor_lookup[normalized]

    for candidate, slug in investor_lookup.items():
        if normalized in candidate or candidate in normalized:
            return slug
    return None


def dedupe_investor_names(values: list[str]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()

    for value in values:
        if not value:
            continue
        normalized = value.strip()
        if not normalized or normalized.lower() == "undisclosed":
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        names.append(normalized)

    return names


def collect_referenced_investors(investors_csv: str, lead_investor: str) -> list[str]:
    values = investors_csv.split(",")
    values.append(lead_investor)
    return dedupe_investor_names(values)


def load_investors(path: str | Path) -> dict[str, dict[str, object]]:
    investors_path = Path(path)
    return json.loads(investors_path.read_text())


def _cmd_resolve(argv: list[str]) -> int:
    if len(argv) != 2:
        raise SystemExit("usage: investor_utils.py resolve <investors_path> <query>")
    investors_path, query = argv
    lookup = build_investor_lookup(load_investors(investors_path))
    print(resolve_investor_slug(query, lookup) or "")
    return 0


def _cmd_collect(argv: list[str]) -> int:
    if len(argv) != 2:
        raise SystemExit("usage: investor_utils.py collect <investors_csv> <lead_investor>")
    investors_csv, lead_investor = argv
    print("\n".join(collect_referenced_investors(investors_csv, lead_investor)))
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv:
        raise SystemExit("usage: investor_utils.py <resolve|collect> ...")

    command = argv.pop(0)
    if command == "resolve":
        return _cmd_resolve(argv)
    if command == "collect":
        return _cmd_collect(argv)

    raise SystemExit(f"unknown command: {command}")


if __name__ == "__main__":
    raise SystemExit(main())
