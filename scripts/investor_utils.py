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
    # Maps normalized name/short_name/alias -> slug. `aliases` carries the extra
    # lead/investor strings as they literally appear in the data (e.g. multi-firm
    # "A and B" leads aliased to the lead firm, scout variants to the parent
    # firm). Mirrors entryCandidates() in src/lib/brand-assets.ts so Python
    # validation resolves the same slug as the TS runtime.
    lookup: dict[str, str] = {}
    for slug, investor in investors.items():
        candidates = [slug, investor.get("slug"), investor.get("name"), investor.get("short_name")]
        aliases = investor.get("aliases")
        if isinstance(aliases, list):
            candidates.extend(aliases)
        for candidate in candidates:
            if not candidate:
                continue
            lookup.setdefault(normalize_brand_text(str(candidate)), slug)
    return lookup


def resolve_investor_slug(name: str, investor_lookup: dict[str, str]) -> str | None:
    # Mirrors the TS canonical resolver (src/lib/brand-assets.ts): exact
    # normalized match only. The unsafe substring fallback has been removed so
    # Python validation matches the runtime exactly. (Alias entries are folded
    # into the lookup by build_investor_lookup.)
    normalized = normalize_brand_text(name)
    if not normalized:
        return None

    return investor_lookup.get(normalized)


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
