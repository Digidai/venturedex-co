#!/bin/bash
# Apply and verify the generated VentureDex D1 database locally.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_NAME="${VENTUREDEX_DB_NAME:-venturedex-db}"
MODE="${1:-seed}"

cd "$REPO_ROOT"

if [[ "$MODE" != "seed" && "$MODE" != "verify" ]]; then
  echo "Usage: scripts/d1-local.sh [seed|verify]"
  exit 1
fi

count_json() {
  local sql="$1"
  local key="${2:-count}"
  npx wrangler d1 execute "$DB_NAME" --local --command "$sql" --json \
    | python3 -c '
import json
import sys

key = sys.argv[1]
data = json.load(sys.stdin)
try:
    print(data[0]["results"][0][key])
except (IndexError, KeyError, TypeError) as exc:
    raise SystemExit(f"Could not read '{key}' from wrangler JSON output: {exc}")
' "$key"
}

expected_count() {
  local kind="$1"
  python3 - "$kind" <<'PY'
from pathlib import Path
import sys

kind = sys.argv[1]
if kind == "startups":
    print(len(list(Path("content/startups").glob("*.json"))))
elif kind == "weekly":
    print(len(list(Path("content/weekly").glob("*.json"))))
else:
    raise SystemExit(f"unknown expected count kind: {kind}")
PY
}

echo "Generating d1/generated-seed.sql..."
"$SCRIPT_DIR/build-db.sh"

echo "Applying d1/schema.sql to local D1..."
npx wrangler d1 execute "$DB_NAME" --local --file=d1/schema.sql >/dev/null

echo "Applying d1/generated-seed.sql to local D1..."
npx wrangler d1 execute "$DB_NAME" --local --file=d1/generated-seed.sql >/dev/null

if [ "$MODE" = "verify" ]; then
  expected_startups="$(expected_count startups)"
  actual_startups="$(count_json "SELECT COUNT(*) AS count FROM startups WHERE workflow_status = 'published';")"

  if [ "$actual_startups" != "$expected_startups" ]; then
    echo "Startup count mismatch: expected $expected_startups, got $actual_startups"
    exit 1
  fi

  expected_weekly="$(expected_count weekly)"
  actual_weekly="$(count_json "SELECT COUNT(*) AS count FROM weekly_issues WHERE status = 'published';")"

  if [ "$actual_weekly" != "$expected_weekly" ]; then
    echo "Weekly issue count mismatch: expected $expected_weekly, got $actual_weekly"
    exit 1
  fi

  search_terms="$(count_json "SELECT COUNT(*) AS count FROM search_index_terms;")"
  if [ "$search_terms" -lt "$actual_startups" ]; then
    echo "Search index looks incomplete: $search_terms terms for $actual_startups startups"
    exit 1
  fi

  echo "Local D1 verified: $actual_startups startups, $actual_weekly weekly issue(s), $search_terms search terms."
else
  echo "Local D1 seeded from content JSON."
fi
