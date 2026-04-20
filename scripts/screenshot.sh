#!/bin/bash
# VentureDex screenshot tool.
# Uses a local Playwright browser first so cookie banners and modal overlays can
# be dismissed or flagged before capture. Falls back to Cloudflare Browser
# Rendering only when the Playwright CLI wrapper is unavailable.
#
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
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
PLAYWRIGHT_WRAPPER="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"

if [ -z "$CF_TOKEN" ]; then
  echo "CLOUDFLARE_API_TOKEN is required."
  exit 1
fi

js_quote() {
  python3 - "$1" <<'PY'
import json
import sys

print(json.dumps(sys.argv[1]))
PY
}

playwright_available() {
  command -v npx >/dev/null 2>&1 && [ -x "$PLAYWRIGHT_WRAPPER" ]
}

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

take_screenshot_via_cloudflare() {
  local slug="$1"
  local url="$2"
  local tmpfile="/tmp/venturedex-screenshot-$slug.webp"

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
    rm -f "$tmpfile"
    return 1
  fi

  printf '%s\n' "$tmpfile"
}

take_screenshot_via_playwright() {
  local slug="$1"
  local url="$2"
  local tmp_png="/tmp/venturedex-screenshot-$slug.png"
  local tmp_webp="/tmp/venturedex-screenshot-$slug.webp"
  local session
  session="vdx-$(printf '%s' "$slug" | tr -cd 'a-z0-9' | cut -c1-8)-$$"

  local cleanup_code
  cleanup_code=$(cat <<'JS'
async page => {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(1200);

  const dismissPatterns = [
    /reject all/i,
    /decline/i,
    /dismiss/i,
    /close/i,
    /no thanks/i,
    /only necessary/i,
    /only essential/i,
    /accept essential/i,
    /continue without/i,
    /manage preferences/i,
    /got it/i,
    /ok/i,
    /okay/i,
    /拒绝/,
    /关闭/,
    /知道了/,
    /仅必要/,
    /不同意/,
  ];

  for (const pattern of dismissPatterns) {
    for (const locator of [page.getByRole('button', { name: pattern }), page.getByText(pattern, { exact: false })]) {
      try {
        const first = locator.first();
        if (await first.isVisible({ timeout: 300 })) {
          await first.click({ timeout: 1000 });
          await page.waitForTimeout(300);
        }
      } catch {}
    }
  }

  await page.keyboard.press('Escape').catch(() => {});

  await page.evaluate(() => {
    const isVisible = el => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width > 80 && r.height > 40;
    };

    const noiseLike = el => {
      const text = (el.innerText || '').toLowerCase();
      const attr = [el.id || '', el.className || '', el.getAttribute('aria-label') || ''].join(' ').toLowerCase();
      return /cookie|consent|privacy|gdpr|intercom|chat|messenger|hubspot|crisp|drift|preferences|tracking technologies/.test(`${text} ${attr}`);
    };

    const overlaySelectors = [
      '[role="dialog"]',
      '[role="alertdialog"]',
      '[aria-modal="true"]',
      '[id*="cookie" i]',
      '[class*="cookie" i]',
      '[id*="consent" i]',
      '[class*="consent" i]',
      '[id*="intercom" i]',
      '[class*="intercom" i]',
      '[class*="chat" i]',
      '[id*="chat" i]',
    ];

    const overlays = Array.from(document.querySelectorAll(overlaySelectors.join(', ')));
    for (const el of overlays) {
      if (el instanceof HTMLElement && isVisible(el) && noiseLike(el)) {
        el.remove();
      }
    }

    const fixedNoise = Array.from(document.body.querySelectorAll('*')).filter(el => {
      if (!(el instanceof HTMLElement)) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (s.position === 'fixed' || s.position === 'sticky') && r.width > 120 && r.height > 60 && noiseLike(el);
    });

    for (const el of fixedNoise) {
      el.remove();
    }

    window.scrollTo(0, 0);
  });

  await page.waitForTimeout(300);
}
JS
)

  local analysis_code
  analysis_code=$(cat <<'JS'
() => JSON.stringify(
  Array.from(document.querySelectorAll('body *'))
    .filter(el => {
      if (!(el instanceof HTMLElement)) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const text = [el.innerText || '', el.id || '', el.className || '', el.getAttribute('aria-label') || ''].join(' ').toLowerCase();
      const popupish =
        el.getAttribute('role') === 'dialog' ||
        el.getAttribute('role') === 'alertdialog' ||
        el.getAttribute('aria-modal') === 'true' ||
        /cookie|consent|privacy|gdpr|intercom|chat|messenger|hubspot|crisp|drift|preferences|tracking technologies/.test(text);
      const visible = s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width > 120 && r.height > 80;
      const coversCenter =
        r.left < window.innerWidth * 0.75 &&
        r.right > window.innerWidth * 0.25 &&
        r.top < window.innerHeight * 0.75 &&
        r.bottom > window.innerHeight * 0.25;
      const fixedish = s.position === 'fixed' || s.position === 'sticky';
      return visible && coversCenter && fixedish && popupish;
    })
    .slice(0, 10)
    .map(el => ({
      tag: el.tagName,
      text: (el.innerText || '').trim().slice(0, 120),
    }))
)
JS
)

  local screenshot_code
  screenshot_code=$(cat <<JS
async page => {
  await page.screenshot({ path: $(js_quote "$tmp_png"), type: 'png' });
}
JS
)

  local analysis_json=""

  cleanup() {
    "$PLAYWRIGHT_WRAPPER" --session "$session" close >/dev/null 2>&1 || true
  }

  trap cleanup RETURN

  "$PLAYWRIGHT_WRAPPER" --session "$session" open "$url" >/dev/null
  "$PLAYWRIGHT_WRAPPER" --session "$session" resize 1440 900 >/dev/null
  "$PLAYWRIGHT_WRAPPER" --session "$session" run-code "$cleanup_code" >/dev/null
  analysis_json=$("$PLAYWRIGHT_WRAPPER" --raw --session "$session" eval "$analysis_code")

  if ! python3 - "$analysis_json" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
if isinstance(payload, str):
    payload = json.loads(payload)
if payload:
    print("popup_detected")
    for item in payload:
        print(json.dumps(item, ensure_ascii=False))
    raise SystemExit(1)
PY
  then
    return 1
  fi

  "$PLAYWRIGHT_WRAPPER" --session "$session" run-code "$screenshot_code" >/dev/null

  if ! cwebp -quiet -q 92 "$tmp_png" -o "$tmp_webp" >/dev/null 2>&1; then
    echo "FAILED (could not convert screenshot to webp)" >&2
    return 1
  fi

  rm -f "$tmp_png"
  printf '%s\n' "$tmp_webp"
}

take_screenshot() {
  local slug="$1"
  local url="$2"
  local local_output="$REPO_ROOT/public/screenshots/$slug.webp"
  local captured_file=""

  mkdir -p "$(dirname "$local_output")"

  echo -n "  $slug ($url) ... "

  if playwright_available; then
    if captured_file="$(take_screenshot_via_playwright "$slug" "$url")"; then
      :
    else
      echo "FAILED (popup detected or Playwright capture failed)"
      rm -f /tmp/venturedex-screenshot-"$slug".png /tmp/venturedex-screenshot-"$slug".webp
      return 1
    fi
  else
    captured_file="$(take_screenshot_via_cloudflare "$slug" "$url")" || {
      echo "FAILED (Cloudflare capture failed)"
      return 1
    }
  fi

  mv "$captured_file" "$local_output"

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
