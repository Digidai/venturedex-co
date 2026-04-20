#!/bin/bash
# VentureDex screenshot tool using Cloudflare Browser Rendering API.
# Saves a local copy to public/screenshots/. If the current token also has R2
# permission, it uploads the same file to R2; otherwise it degrades cleanly.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export REPO_ROOT

# shellcheck disable=SC1091
. "$SCRIPT_DIR/load-local-env.sh"

CF_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-48d9ccaf5ee7914c803b5d0656462848}"
API="https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/browser-rendering/screenshot"
R2_BUCKET="venturedex-assets"

if [ -z "$CF_TOKEN" ]; then
  echo "CLOUDFLARE_API_TOKEN is required."
  exit 1
fi

r2_permission_state() {
  python3 - <<'PY'
import os
import requests

token = os.environ["CLOUDFLARE_API_TOKEN"]
account_id = os.environ["CLOUDFLARE_ACCOUNT_ID"]
headers = {"Authorization": f"Bearer {token}"}

try:
    response = requests.get(
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/r2/buckets",
        headers=headers,
        timeout=20,
    )
except Exception:
    print("unknown")
    raise SystemExit

if response.status_code == 200:
    print("yes")
elif response.status_code == 403:
    print("no")
else:
    print("unknown")
PY
}

upload_to_r2() {
  local local_output="$1"
  local slug="$2"

  python3 - "$REPO_ROOT" "$local_output" "$slug" "$R2_BUCKET" <<'PY'
import os
import subprocess
import sys

repo_root, local_output, slug, bucket = sys.argv[1:]
env = os.environ.copy()
env["CI"] = "1"
env["NO_COLOR"] = "1"

cmd = [
    "npx",
    "wrangler",
    "r2",
    "object",
    "put",
    f"{bucket}/screenshots/{slug}.webp",
    "--file",
    local_output,
    "--remote",
    "--force",
]

try:
    proc = subprocess.run(
        cmd,
        cwd=repo_root,
        env=env,
        text=True,
        capture_output=True,
        timeout=45,
    )
except subprocess.TimeoutExpired:
    print("wrangler_timeout")
    raise SystemExit(124)

if proc.returncode != 0:
    output = (proc.stdout or "") + (proc.stderr or "")
    print(output.strip())
    raise SystemExit(proc.returncode)
PY
}

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

  local size
  size=$(wc -c < "$local_output" | tr -d ' ')

  local r2_state
  r2_state="$(r2_permission_state)"
  case "$r2_state" in
    yes)
      if upload_to_r2 "$local_output" "$slug" >/dev/null; then
        echo "OK (${size} bytes → public/screenshots + R2)"
      else
        echo "OK (${size} bytes → public/screenshots; R2 upload skipped after wrangler failure)"
      fi
      ;;
    no)
      echo "OK (${size} bytes → public/screenshots; R2 upload skipped: token lacks R2 permission)"
      ;;
    *)
      echo "OK (${size} bytes → public/screenshots; R2 upload skipped: permission check unavailable)"
      ;;
  esac
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
