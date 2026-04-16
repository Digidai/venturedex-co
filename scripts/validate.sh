#!/bin/bash
# VentureDex Unified Validator
# Validates ALL content before build. Invalid data blocks deployment.
#
# One company = one file. Funding data is inside the startup JSON.
# No separate funding directory needed.
#
# Validation chain:
#   Phase 1: JSON schema (required fields)
#   Phase 2: URL accessibility (company + all funding sources)
#   Phase 3: Data format (dates, amounts, stages)
#   Phase 4: Funding integrity (every round has a source)
#   Phase 5: Duplicates
#   Phase 6: Cross-reference (funding stage matches latest round)

set -euo pipefail

STARTUPS_DIR="content/startups"
errors=0
warnings=0
checked=0
passed=0

echo "=== VentureDex Content Validator ==="
echo ""

startup_files=("$STARTUPS_DIR"/*.json)
if [ ! -f "${startup_files[0]}" ]; then
  echo "No startup files found."
  exit 0
fi

for f in "$STARTUPS_DIR"/*.json; do
  [ -f "$f" ] || continue
  checked=$((checked + 1))
  fname=$(basename "$f")
  file_errors=0

  # Parse JSON
  if ! python3 -c "import json; json.load(open('$f'))" 2>/dev/null; then
    echo "  FAIL $fname: invalid JSON"
    errors=$((errors + 1))
    continue
  fi

  result=$(python3 << PYEOF
import json, sys

with open('$f') as fh:
    d = json.load(fh)

errs = []
warns = []
name = d.get('product_name', '???')

# === PHASE 1: Required fields ===
required = ['slug', 'domain', 'url', 'product_name', 'summary', 'editor_note', 'editor_rating', 'why_featured', 'product_type', 'region']
for field in required:
    if not d.get(field):
        errs.append(f"missing required field: {field}")

# === PHASE 2: Funding array ===
funding = d.get('funding', [])
if not funding:
    errs.append("missing funding array (every startup must have at least one verified funding round)")

for i, rnd in enumerate(funding):
    prefix = f"funding[{i}]"
    # Required funding fields
    for ff in ['amount', 'stage', 'lead_investor', 'date', 'source_url', 'source_name']:
        if not rnd.get(ff):
            errs.append(f"{prefix}: missing {ff}")

    # Date format
    date = rnd.get('date', '')
    if date and not (len(date) == 10 and date[4] == '-' and date[7] == '-'):
        errs.append(f"{prefix}: date '{date}' not YYYY-MM-DD")

    # Amount format
    amount = rnd.get('amount', '')
    if amount:
        import re
        if not re.match(r'^\$[\d.]+[MBK]?\+?$', amount):
            errs.append(f"{prefix}: amount '{amount}' invalid format")

    # Stage validation
    valid_stages = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series C+', 'Series D', 'Venture', 'Growth']
    stage = rnd.get('stage', '')
    if stage and stage not in valid_stages:
        errs.append(f"{prefix}: stage '{stage}' not recognized")

# === PHASE 3: Editor note quality ===
note = d.get('editor_note', '')
if note:
    if len(note) < 100:
        errs.append(f"editor_note too short ({len(note)} chars, min 100)")
    if len(note) > 600:
        warns.append(f"editor_note long ({len(note)} chars)")

    banned = ['革命', '颠覆', '赋能', '一站式', 'revolutionary', 'comprehensive', 'robust', 'cutting-edge', 'game-changing']
    for word in banned:
        if word.lower() in note.lower():
            errs.append(f"editor_note contains banned word: '{word}'")

# === PHASE 4: Rating matches funding ===
rating = d.get('editor_rating', 0)
is_featured = d.get('is_featured', False)
if is_featured and rating < 4:
    errs.append(f"is_featured=true but rating={rating} (must be >= 4)")

# === PHASE 5: Cross-reference funding_stage removed ===
if 'funding_stage' in d or 'funding_display' in d:
    warns.append("legacy fields funding_stage/funding_display found (use funding array instead)")

# Output
for e in errs:
    print(f"ERR:{e}")
for w in warns:
    print(f"WARN:{w}")
if not errs:
    print("OK")

print(f"NAME:{name}")
PYEOF
  )

  name=$(echo "$result" | grep "^NAME:" | sed 's/^NAME://')
  ok=$(echo "$result" | grep -c "^OK$" || true)
  err_count=$(echo "$result" | grep -c "^ERR:" || true)
  warn_count=$(echo "$result" | grep -c "^WARN:" || true)

  echo -n "  $fname ($name) ... "

  if [ "$err_count" -gt 0 ]; then
    echo ""
    echo "$result" | grep "^ERR:" | sed 's/^ERR:/    FAIL: /'
    file_errors=$err_count
  fi

  if [ "$warn_count" -gt 0 ]; then
    echo "$result" | grep "^WARN:" | sed 's/^WARN:/    WARN: /'
    warnings=$((warnings + warn_count))
  fi

  # === PHASE 6: URL checks (only if no structural errors) ===
  if [ "$file_errors" -eq 0 ]; then
    # Check company URL
    comp_url=$(python3 -c "import json; print(json.load(open('$f')).get('url',''))")
    if [ -n "$comp_url" ]; then
      comp_code=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 10 "$comp_url" 2>/dev/null) || comp_code="000"
      if [ "$comp_code" != "200" ] && [ "$comp_code" != "301" ] && [ "$comp_code" != "302" ]; then
        echo "    FAIL: company url HTTP $comp_code → $comp_url"
        file_errors=$((file_errors + 1))
      fi
    fi

    # Check each funding source URL
    src_urls=$(python3 -c "
import json
d = json.load(open('$f'))
for r in d.get('funding', []):
    u = r.get('source_url','')
    if u: print(u)
")
    while IFS= read -r src_url; do
      [ -z "$src_url" ] && continue
      src_code=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 10 "$src_url" 2>/dev/null) || src_code="000"
      if [ "$src_code" != "200" ] && [ "$src_code" != "301" ] && [ "$src_code" != "302" ]; then
        echo "    FAIL: source url HTTP $src_code → $src_url"
        file_errors=$((file_errors + 1))
      fi
    done <<< "$src_urls"

    [ "$file_errors" -eq 0 ] && echo "OK"
  fi

  if [ "$file_errors" -eq 0 ]; then
    passed=$((passed + 1))
  else
    errors=$((errors + file_errors))
  fi
done

# === Duplicate detection ===
echo ""
echo "  Checking duplicates..."
dupes=$(python3 -c "
import json, os
seen_slugs = {}
seen_domains = {}
for f in sorted(os.listdir('$STARTUPS_DIR')):
    if not f.endswith('.json'): continue
    with open(os.path.join('$STARTUPS_DIR', f)) as fh:
        d = json.load(fh)
    slug = d.get('slug','')
    domain = d.get('domain','')
    if slug in seen_slugs:
        print(f'  DUPLICATE slug: {f} and {seen_slugs[slug]}')
    if domain in seen_domains:
        print(f'  DUPLICATE domain: {f} and {seen_domains[domain]}')
    seen_slugs[slug] = f
    seen_domains[domain] = f
" 2>/dev/null)

if [ -n "$dupes" ]; then
  echo "$dupes"
  errors=$((errors + $(echo "$dupes" | wc -l)))
else
  echo "    No duplicates."
fi

echo ""
echo "=== $passed/$checked passed, $errors errors, $warnings warnings ==="

if [ "$errors" -gt 0 ]; then
  echo ""
  echo "BUILD BLOCKED. Fix all errors before deploying."
  exit 1
fi

echo "All content validated."
