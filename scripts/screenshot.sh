#!/bin/bash
# VentureDex screenshot tool using Cloudflare Browser Rendering API.
# Saves a local copy to public/screenshots/ and uploads the same file to R2.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load repo-local secrets without committing them.
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.env"
  set +a
fi

CF_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
ACCOUNT_ID="48d9ccaf5ee7914c803b5d0656462848"
API="https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/browser-rendering/screenshot"
R2_BUCKET="venturedex-assets"

if [ -z "$CF_TOKEN" ]; then
  echo "CLOUDFLARE_API_TOKEN is required."
  exit 1
fi

take_screenshot() {
  local slug="$1"
  local url="$2"
  local tmpfile="/tmp/venturedex-screenshot-$slug.webp"
  local local_output="$REPO_ROOT/public/screenshots/$slug.webp"

  mkdir -p "$(dirname "$local_output")"

  echo -n "  $slug ($url) ... "

  local http_code
  http_code=$(curl -sS -X POST "$API" \
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

  if [ "$http_code" != "200" ]; then
    echo "FAILED (HTTP $http_code)"
    rm -f "$tmpfile"
    return 1
  fi

  mv "$tmpfile" "$local_output"

  if ! npx wrangler r2 object put "$R2_BUCKET/screenshots/$slug.webp" --file="$local_output" >/dev/null; then
    echo "FAILED (R2 upload)"
    return 1
  fi

  local size
  size=$(wc -c < "$local_output" | tr -d ' ')
  echo "OK (${size} bytes → public/screenshots + R2)"
}

if [ $# -ge 2 ]; then
  take_screenshot "$1" "$2"
  exit 0
fi

echo "VentureDex Screenshot Tool (Cloudflare Browser Rendering -> local + R2)"
echo "===================================================================="
echo

sites=(
  "linear:https://linear.app"
  "resend:https://resend.com"
  "cal-com:https://cal.com"
  "perplexity:https://perplexity.ai"
  "cursor:https://cursor.com"
  "val-town:https://val.town"
  "supabase:https://supabase.com"
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
