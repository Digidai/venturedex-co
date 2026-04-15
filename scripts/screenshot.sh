#!/bin/bash
# VentureDex screenshot tool using Cloudflare Browser Rendering API
# Usage: ./scripts/screenshot.sh [slug] [url]
#   No args: screenshot all sites from seed data
#   With args: screenshot a single site

set -euo pipefail

CF_TOKEN="${CLOUDFLARE_API_TOKEN:-cfut_JzzH8Ps7lDl6Yl8dhkpzEQWMzK1VUE73CPla4tf07f1a102f}"
ACCOUNT_ID="48d9ccaf5ee7914c803b5d0656462848"
API="https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/browser-rendering/screenshot"
OUT_DIR="public/screenshots"

mkdir -p "$OUT_DIR"

take_screenshot() {
  local slug="$1"
  local url="$2"
  local outfile="$OUT_DIR/$slug.webp"

  echo -n "  $slug ($url) ... "

  local http_code
  http_code=$(curl -s -X POST "$API" \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"url\": \"$url\",
      \"screenshotOptions\": { \"type\": \"webp\" },
      \"viewport\": { \"width\": 1440, \"height\": 900 },
      \"gotoOptions\": { \"waitUntil\": \"networkidle0\", \"timeout\": 30000 }
    }" \
    --output "$outfile" \
    -w "%{http_code}")

  if [ "$http_code" = "200" ]; then
    local size
    size=$(wc -c < "$outfile" | tr -d ' ')
    echo "OK (${size} bytes)"
  else
    echo "FAILED (HTTP $http_code)"
    cat "$outfile" 2>/dev/null
    echo
    rm -f "$outfile"
  fi
}

if [ $# -ge 2 ]; then
  take_screenshot "$1" "$2"
  exit 0
fi

echo "VentureDex Screenshot Tool (Cloudflare Browser Rendering)"
echo "========================================================="
echo

sites=(
  "linear:https://linear.app"
  "resend:https://resend.com"
  "cal-com:https://cal.com"
  "perplexity:https://perplexity.ai"
  "cursor:https://cursor.com"
  "val-town:https://val.town"
  "anthropic-claude:https://claude.ai"
  "supabase:https://supabase.com"
  "vercel:https://vercel.com"
  "eleven-labs:https://elevenlabs.io"
)

total=${#sites[@]}
done=0
failed=0

for entry in "${sites[@]}"; do
  slug="${entry%%:*}"
  url="${entry#*:}"
  take_screenshot "$slug" "$url" && ((done++)) || ((failed++))
  sleep 1
done

echo
echo "Done: $done/$total succeeded, $failed failed"
