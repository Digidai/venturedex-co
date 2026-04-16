#!/bin/bash
# VentureDex screenshot tool using Cloudflare Browser Rendering API
# Screenshots are saved to R2 (not git). Local copy in /tmp for preview only.
#
# Usage: ./scripts/screenshot.sh [slug] [url]
#   No args: screenshot all sites from seed data
#   With args: screenshot a single site

set -euo pipefail

CF_TOKEN="${CLOUDFLARE_API_TOKEN:-cfut_JzzH8Ps7lDl6Yl8dhkpzEQWMzK1VUE73CPla4tf07f1a102f}"
ACCOUNT_ID="48d9ccaf5ee7914c803b5d0656462848"
API="https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/browser-rendering/screenshot"
R2_BUCKET="venturedex-assets"

take_screenshot() {
  local slug="$1"
  local url="$2"
  local tmpfile="/tmp/venturedex-screenshot-$slug.webp"

  echo -n "  $slug ($url) ... "

  local http_code
  http_code=$(curl -s -X POST "$API" \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"url\": \"$url\",
      \"screenshotOptions\": { \"type\": \"webp\" },
      \"viewport\": { \"width\": 1440, \"height\": 900 },
      \"gotoOptions\": { \"waitUntil\": \"load\", \"timeout\": 30000 }
    }" \
    --output "$tmpfile" \
    -w "%{http_code}")

  if [ "$http_code" = "200" ]; then
    local size
    size=$(wc -c < "$tmpfile" | tr -d ' ')

    # Upload to R2
    npx wrangler r2 object put "$R2_BUCKET/screenshots/$slug.webp" --file="$tmpfile" 2>/dev/null
    echo "OK (${size} bytes → R2)"
    rm -f "$tmpfile"
  else
    echo "FAILED (HTTP $http_code)"
    cat "$tmpfile" 2>/dev/null
    echo
    rm -f "$tmpfile"
    return 1
  fi
}

if [ $# -ge 2 ]; then
  take_screenshot "$1" "$2"
  exit 0
fi

echo "VentureDex Screenshot Tool (Cloudflare Browser Rendering → R2)"
echo "==============================================================="
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
done_count=0
failed=0

for entry in "${sites[@]}"; do
  slug="${entry%%:*}"
  url="${entry#*:}"
  if take_screenshot "$slug" "$url"; then
    done_count=$((done_count + 1))
  else
    failed=$((failed + 1))
  fi
  sleep 1
done

echo
echo "Done: $done_count/$total succeeded, $failed failed"
