#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

legacy_sql_re="\\b(CREATE[[:space:]]+TABLE|DROP[[:space:]]+TABLE|INSERT[[:space:]]+INTO|UPDATE|DELETE[[:space:]]+FROM|ALTER[[:space:]]+TABLE|REFERENCES|JOIN)[[:space:]]+(sites|collection_sites|weekly_issue_sites)\\b|\\bsite_id\\b"

if command -v rg >/dev/null 2>&1; then
  legacy_matches="$(rg -n "$legacy_sql_re" "$REPO_ROOT/d1" --glob "*.sql" || true)"
else
  legacy_matches="$(grep -R -n -E "$legacy_sql_re" "$REPO_ROOT/d1" --include "*.sql" || true)"
fi

if [ -n "$legacy_matches" ]; then
  echo "ERROR: legacy site-model SQL detected under d1/." >&2
  printf '%s\n' "$legacy_matches" >&2
  exit 1
fi

python3 "$SCRIPT_DIR/validate.py"
