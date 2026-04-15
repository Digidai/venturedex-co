#!/bin/bash
# VentureDex content management CLI
# Usage:
#   ./scripts/manage.sh add       — Add a new startup
#   ./scripts/manage.sh screenshot <slug> — Take screenshot for a startup
#   ./scripts/manage.sh publish <slug>    — Publish a draft startup
#   ./scripts/manage.sh weekly            — Create a new weekly issue
#   ./scripts/manage.sh list              — List all startups
#   ./scripts/manage.sh sync              — Push local DB changes to remote

set -euo pipefail

CF_TOKEN="${CLOUDFLARE_API_TOKEN:-cfut_JzzH8Ps7lDl6Yl8dhkpzEQWMzK1VUE73CPla4tf07f1a102f}"
ACCOUNT_ID="48d9ccaf5ee7914c803b5d0656462848"
SCREENSHOT_API="https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/browser-rendering/screenshot"
DB_NAME="venturedex-db"

run_sql() {
  local target="${2:---local}"
  npx wrangler d1 execute "$DB_NAME" "$target" --command "$1" --json 2>/dev/null
}

run_sql_file() {
  local target="${2:---local}"
  npx wrangler d1 execute "$DB_NAME" "$target" --file "$1" 2>/dev/null
}

cmd_add() {
  echo "=== Add New Startup ==="
  read -p "URL (e.g. https://example.com): " url
  read -p "Product name: " name
  read -p "Slug (lowercase, hyphens): " slug
  read -p "One-line summary: " summary
  read -p "Editor note (why it matters): " note
  read -p "Editor rating (1-5): " rating
  read -p "Why featured (short tag, e.g. 'YC S26'): " why
  read -p "Product type (AI / ML, SaaS, DevTools, Fintech, etc): " ptype
  read -p "Funding stage (Pre-seed, Seed, Series A, etc): " fstage
  read -p "Funding display (e.g. '\$5M'): " fdisplay
  read -p "Region (US, Europe, China / Asia, etc): " region
  read -p "Founded year: " fyear
  read -p "Team size (e.g. '10-30'): " tsize
  read -p "HQ location: " hq
  read -p "Tags (comma-separated): " tags
  read -p "Investors (comma-separated): " investors
  read -p "Links JSON (e.g. {\"github\":\"...\",\"twitter\":\"...\"}): " links

  domain=$(echo "$url" | sed -E 's|https?://([^/]+).*|\1|')
  id="s-$(date +%s)"

  local sql="INSERT INTO sites (id, slug, domain, canonical_url, product_name, summary, editor_note, editor_rating, why_featured, product_type, funding_stage, funding_display, region, founded_year, team_size, hq_location, tags, investors, links_json, workflow_status, codex_stage)
VALUES ('$id', '$slug', '$domain', '$url', '$name', '$summary', '$note', $rating, '$why', '$ptype', '$fstage', '$fdisplay', '$region', $fyear, '$tsize', '$hq', '$tags', '$investors', '$links', 'draft', 'manual');"

  echo ""
  echo "Adding '$name' as draft..."
  run_sql "$sql" --local
  echo "Done. Run './scripts/manage.sh screenshot $slug' to capture screenshot."
  echo "Then './scripts/manage.sh publish $slug' to make it live."
}

cmd_screenshot() {
  local slug="$1"
  local url
  url=$(run_sql "SELECT canonical_url FROM sites WHERE slug='$slug'" --local | grep -oE 'https?://[^ "]+' | head -1)

  if [ -z "$url" ]; then
    echo "ERROR: Startup '$slug' not found"
    exit 1
  fi

  echo "Taking screenshot of $url..."
  mkdir -p public/screenshots

  local http_code
  http_code=$(curl -s -X POST "$SCREENSHOT_API" \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"$url\",\"screenshotOptions\":{\"type\":\"webp\"},\"viewport\":{\"width\":1440,\"height\":900},\"gotoOptions\":{\"waitUntil\":\"load\",\"timeout\":30000}}" \
    --output "public/screenshots/$slug.webp" \
    -w "%{http_code}")

  if [ "$http_code" = "200" ]; then
    run_sql "UPDATE sites SET screenshot_r2_key='$slug.webp', screenshot_status='ready' WHERE slug='$slug'" --local
    echo "Screenshot saved: public/screenshots/$slug.webp"
  else
    echo "Screenshot failed (HTTP $http_code)"
  fi
}

cmd_publish() {
  local slug="$1"
  run_sql "UPDATE sites SET workflow_status='published', published_at=datetime('now') WHERE slug='$slug'" --local
  echo "Published '$slug' locally. Run './scripts/manage.sh sync' to push to production."
}

cmd_list() {
  echo "=== All Startups ==="
  echo ""
  printf "%-20s %-25s %-12s %s\n" "SLUG" "NAME" "STATUS" "TYPE"
  printf "%-20s %-25s %-12s %s\n" "----" "----" "------" "----"
  run_sql "SELECT slug, product_name, workflow_status, product_type FROM sites ORDER BY created_at DESC" --local \
    | python3 -c "
import sys, json
data = json.load(sys.stdin)
for row in data[0]['results']:
    print(f\"{row['slug']:<20} {row['product_name']:<25} {row['workflow_status']:<12} {row.get('product_type','')}\")
" 2>/dev/null || echo "(install python3 for formatted output)"
}

cmd_weekly() {
  echo "=== Create Weekly Issue ==="
  local next_num
  next_num=$(run_sql "SELECT COALESCE(MAX(issue_number),0)+1 as n FROM weekly_issues" --local | grep -oE '[0-9]+' | tail -1)
  next_num=${next_num:-1}

  read -p "Title for Weekly #$next_num: " title
  read -p "Editorial intro: " intro
  read -p "Pick slugs (comma-separated, e.g. linear,cursor,resend): " picks_raw

  local id="w-$(date +%s)"
  run_sql "INSERT INTO weekly_issues (id, issue_number, title, editorial_intro, published_at, status) VALUES ('$id', $next_num, '$title', '$intro', datetime('now'), 'published')" --local

  IFS=',' read -ra picks <<< "$picks_raw"
  local order=1
  for pick in "${picks[@]}"; do
    pick=$(echo "$pick" | xargs)
    local site_id
    site_id=$(run_sql "SELECT id FROM sites WHERE slug='$pick'" --local | grep -oE 's-[0-9]+' | head -1)
    if [ -n "$site_id" ]; then
      run_sql "INSERT INTO weekly_issue_sites (issue_id, site_id, display_order) VALUES ('$id', '$site_id', $order)" --local
      echo "  Added #$order: $pick"
      ((order++))
    else
      echo "  SKIP: '$pick' not found"
    fi
  done

  echo "Weekly #$next_num created locally. Run './scripts/manage.sh sync' to push."
}

cmd_sync() {
  echo "=== Syncing to production ==="

  echo "Step 1: Re-applying schema..."
  run_sql_file d1/schema.sql --remote

  echo "Step 2: Exporting local data..."
  local tmpfile=$(mktemp /tmp/venturedex-sync-XXXXXX.sql)

  # Export sites
  run_sql "SELECT 'INSERT OR REPLACE INTO sites VALUES(' || quote(id) || ',' || quote(slug) || ',' || quote(domain) || ',' || quote(canonical_url) || ',' || quote(product_name) || ',' || quote(title) || ',' || quote(summary) || ',' || quote(long_description) || ',' || quote(editor_note) || ',' || COALESCE(editor_rating,'NULL') || ',' || quote(why_featured) || ',' || quote(curator) || ',' || quote(product_type) || ',' || quote(funding_stage) || ',' || quote(funding_display) || ',' || COALESCE(founded_year,'NULL') || ',' || quote(team_size) || ',' || quote(hq_location) || ',' || quote(region) || ',' || quote(framework) || ',' || quote(runtime_status) || ',' || quote(workflow_status) || ',' || quote(codex_stage) || ',' || quote(screenshot_r2_key) || ',' || quote(screenshot_status) || ',' || quote(og_image_r2_key) || ',' || quote(founder_name) || ',' || quote(founder_email) || ',' || quote(founder_quote) || ',' || quote(founder_responded_at) || ',' || quote(first_seen_at) || ',' || quote(last_checked_at) || ',' || quote(published_at) || ',' || COALESCE(investors, 'NULL') || ',' || COALESCE(links_json, 'NULL') || ',' || COALESCE(tags, 'NULL') || ',' || is_featured || ',' || quote(created_at) || ',' || quote(updated_at) || ');' FROM sites" --local > "$tmpfile" 2>/dev/null || true

  echo "Step 3: Pushing to remote D1..."
  run_sql_file "$tmpfile" --remote 2>/dev/null || echo "(some rows may already exist)"

  echo "Step 4: Git add screenshots + push..."
  git add public/screenshots/ 2>/dev/null || true
  if git diff --cached --quiet; then
    echo "  No new screenshots to commit."
  else
    git commit -m "content: update screenshots" 2>/dev/null
    git push 2>/dev/null
    echo "  Screenshots pushed, auto-deploy triggered."
  fi

  rm -f "$tmpfile"
  echo "Sync complete."
}

case "${1:-help}" in
  add) cmd_add ;;
  screenshot) cmd_screenshot "${2:?Usage: manage.sh screenshot <slug>}" ;;
  publish) cmd_publish "${2:?Usage: manage.sh publish <slug>}" ;;
  weekly) cmd_weekly ;;
  list) cmd_list ;;
  sync) cmd_sync ;;
  *)
    echo "VentureDex Content Manager"
    echo ""
    echo "Usage:"
    echo "  ./scripts/manage.sh add                — Add a new startup (interactive)"
    echo "  ./scripts/manage.sh screenshot <slug>  — Capture screenshot via CF API"
    echo "  ./scripts/manage.sh publish <slug>     — Set status to published"
    echo "  ./scripts/manage.sh weekly             — Create a new weekly issue"
    echo "  ./scripts/manage.sh list               — List all startups"
    echo "  ./scripts/manage.sh sync               — Push local changes to production"
    ;;
esac
