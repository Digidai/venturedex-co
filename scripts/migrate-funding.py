#!/usr/bin/env python3
"""Add source-term columns to the local development database only.

Production uses the guarded manage.sh release path, never this helper.
"""
import argparse
import json
from pathlib import Path
import subprocess


def missing_columns(payload):
    if not isinstance(payload, list) or len(payload) != 1 or not isinstance(payload[0], dict) or payload[0].get("success") is not True:
        raise ValueError("funding schema probe did not report success")
    rows = payload[0].get("results")
    if not isinstance(rows, list) or any(not isinstance(row, dict) or not isinstance(row.get("name"), str) for row in rows):
        raise ValueError("invalid funding schema columns")
    columns = {row["name"] for row in rows}
    if not {"id", "amount", "stage", "source_url"}.issubset(columns):
        raise ValueError("incomplete funding schema probe; initialize the local schema first")
    return [column for column in ("currency", "stage_raw", "instrument") if column not in columns]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local", action="store_true", required=True)
    parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    command = ["npx", "wrangler", "d1", "execute", "venturedex-db", "--local", "--json", "--command"]
    probe = subprocess.run(command + ["PRAGMA table_info(funding_rounds);"], cwd=root, text=True, capture_output=True, check=True)
    missing = missing_columns(json.loads(probe.stdout))
    for column in missing:
        # Names originate only in the closed allowlist above, never external SQL.
        subprocess.run(command + [f"ALTER TABLE funding_rounds ADD COLUMN {column} TEXT;"], cwd=root, check=True)
    print(f"Local funding schema current ({len(missing)} additive columns applied).")


if __name__ == "__main__":
    main()
