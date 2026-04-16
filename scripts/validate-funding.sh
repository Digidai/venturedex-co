#!/bin/bash
# VentureDex Funding Data Validator
# Runs BEFORE build-db.sh. Invalid entries block the build.
#
# Validation chain:
#   1. JSON schema check (required fields)
#   2. Source URL accessibility (HTTP 200)
#   3. Company URL accessibility (HTTP 200)
#   4. Data format validation (date, amount, stage)
#   5. Duplicate detection
#
# Exit code 0 = all valid, 1 = errors found (blocks build)

set -euo pipefail

FUNDING_DIR="content/funding"
errors=0
checked=0
passed=0

echo "=== VentureDex Funding Validator ==="
echo ""

# Check if any funding files exist
funding_files=("$FUNDING_DIR"/*.json)
if [ ! -f "${funding_files[0]}" ]; then
  echo "No funding files found. Skipping validation."
  exit 0
fi

for f in "$FUNDING_DIR"/*.json; do
  [ -f "$f" ] || continue
  checked=$((checked + 1))
  fname=$(basename "$f")
  file_errors=0

  # Parse JSON
  data=$(python3 -c "
import json, sys
try:
    with open('$f') as fh:
        d = json.load(fh)
    print(json.dumps(d))
except Exception as e:
    print(f'PARSE_ERROR: {e}', file=sys.stderr)
    sys.exit(1)
" 2>&1) || {
    echo "  FAIL $fname: invalid JSON"
    errors=$((errors + 1))
    continue
  }

  # Extract fields
  company=$(echo "$data" | python3 -c "import json,sys; print(json.load(sys.stdin).get('company_name',''))")
  company_url=$(echo "$data" | python3 -c "import json,sys; print(json.load(sys.stdin).get('company_url',''))")
  source_url=$(echo "$data" | python3 -c "import json,sys; print(json.load(sys.stdin).get('source_url',''))")
  amount=$(echo "$data" | python3 -c "import json,sys; print(json.load(sys.stdin).get('amount',''))")
  stage=$(echo "$data" | python3 -c "import json,sys; print(json.load(sys.stdin).get('stage',''))")
  date_val=$(echo "$data" | python3 -c "import json,sys; print(json.load(sys.stdin).get('date',''))")
  lead=$(echo "$data" | python3 -c "import json,sys; print(json.load(sys.stdin).get('lead_investor',''))")

  echo -n "  $fname ($company) ... "

  # === CHECK 1: Required fields ===
  if [ -z "$company" ]; then
    echo ""; echo "    FAIL: missing company_name"
    file_errors=$((file_errors + 1))
  fi
  if [ -z "$source_url" ]; then
    echo ""; echo "    FAIL: missing source_url (required — no source = no entry)"
    file_errors=$((file_errors + 1))
  fi
  if [ -z "$stage" ]; then
    echo ""; echo "    FAIL: missing stage"
    file_errors=$((file_errors + 1))
  fi
  if [ -z "$date_val" ]; then
    echo ""; echo "    FAIL: missing date"
    file_errors=$((file_errors + 1))
  fi
  if [ -z "$lead" ]; then
    echo ""; echo "    FAIL: missing lead_investor"
    file_errors=$((file_errors + 1))
  fi

  # === CHECK 2: Date format (YYYY-MM-DD) ===
  if [ -n "$date_val" ]; then
    if ! echo "$date_val" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
      echo ""; echo "    FAIL: date '$date_val' not in YYYY-MM-DD format"
      file_errors=$((file_errors + 1))
    fi
  fi

  # === CHECK 3: Amount format ($NM or $N.NM or $NB) ===
  if [ -n "$amount" ]; then
    if ! echo "$amount" | grep -qE '^\$[0-9]+\.?[0-9]*[MBK]$'; then
      echo ""; echo "    FAIL: amount '$amount' not in \$NM/\$NB format"
      file_errors=$((file_errors + 1))
    fi
  fi

  # === CHECK 4: Stage must be valid ===
  if [ -n "$stage" ]; then
    case "$stage" in
      "Pre-seed"|"Seed"|"Series A"|"Series B"|"Series C"|"Venture"|"Growth") ;;
      *) echo ""; echo "    FAIL: stage '$stage' is not a recognized stage"
         file_errors=$((file_errors + 1)) ;;
    esac
  fi

  # === CHECK 5: Source URL must be accessible ===
  if [ -n "$source_url" ] && [ "$file_errors" -eq 0 ]; then
    src_code=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 15 "$source_url" 2>/dev/null) || src_code="000"
    if [ "$src_code" != "200" ] && [ "$src_code" != "301" ] && [ "$src_code" != "302" ]; then
      echo ""; echo "    FAIL: source_url returns HTTP $src_code → $source_url"
      file_errors=$((file_errors + 1))
    fi
  fi

  # === CHECK 6: Company URL must be accessible ===
  if [ -n "$company_url" ] && [ "$file_errors" -eq 0 ]; then
    comp_code=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 15 "$company_url" 2>/dev/null) || comp_code="000"
    if [ "$comp_code" != "200" ] && [ "$comp_code" != "301" ] && [ "$comp_code" != "302" ]; then
      echo ""; echo "    FAIL: company_url returns HTTP $comp_code → $company_url"
      file_errors=$((file_errors + 1))
    fi
  fi

  # === CHECK 7: Filename matches date ===
  if [ -n "$date_val" ]; then
    if ! echo "$fname" | grep -q "^$date_val"; then
      echo ""; echo "    WARN: filename '$fname' doesn't start with date '$date_val'"
    fi
  fi

  if [ "$file_errors" -eq 0 ]; then
    echo "OK"
    passed=$((passed + 1))
  else
    errors=$((errors + file_errors))
  fi
done

# === CHECK 8: Duplicate detection ===
echo ""
echo "  Checking duplicates..."
dupes=$(python3 -c "
import json, os, sys
seen = {}
for f in sorted(os.listdir('$FUNDING_DIR')):
    if not f.endswith('.json'): continue
    path = os.path.join('$FUNDING_DIR', f)
    with open(path) as fh:
        d = json.load(fh)
    key = f\"{d.get('company_name','').lower()}|{d.get('date','')}|{d.get('stage','')}\"
    if key in seen:
        print(f'  DUPLICATE: {f} duplicates {seen[key]}')
    seen[key] = f
" 2>/dev/null)

if [ -n "$dupes" ]; then
  echo "$dupes"
  errors=$((errors + $(echo "$dupes" | wc -l)))
else
  echo "    No duplicates found."
fi

echo ""
echo "=== Results: $passed/$checked passed, $errors errors ==="

if [ "$errors" -gt 0 ]; then
  echo ""
  echo "BUILD BLOCKED. Fix all errors before deploying."
  exit 1
fi

echo "All funding data validated."
exit 0
