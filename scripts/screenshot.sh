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
PLAYWRIGHT_STEP_TIMEOUT_SECONDS="${PLAYWRIGHT_STEP_TIMEOUT_SECONDS:-60}"
PLAYWRIGHT_CLOSE_TIMEOUT_SECONDS="${PLAYWRIGHT_CLOSE_TIMEOUT_SECONDS:-10}"
ALLOW_UNSAFE_SCREENSHOT_FALLBACK="${ALLOW_UNSAFE_SCREENSHOT_FALLBACK:-0}"

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

run_with_timeout() {
  local timeout_seconds="$1"
  shift

  python3 - "$timeout_seconds" "$@" <<'PY'
import os
import subprocess
import sys

timeout_seconds = float(sys.argv[1])
cmd = sys.argv[2:]

try:
    proc = subprocess.run(
        cmd,
        text=True,
        capture_output=True,
        timeout=timeout_seconds,
        env=os.environ.copy(),
    )
except subprocess.TimeoutExpired as exc:
    stdout = exc.stdout.decode() if isinstance(exc.stdout, bytes) else exc.stdout
    stderr = exc.stderr.decode() if isinstance(exc.stderr, bytes) else exc.stderr
    if stdout:
        sys.stdout.write(stdout)
    if stderr:
        sys.stderr.write(stderr)
    sys.stderr.write(f"command_timeout_after_{timeout_seconds:.0f}s: {' '.join(cmd)}\n")
    raise SystemExit(124)

if proc.stdout:
    sys.stdout.write(proc.stdout)
if proc.stderr:
    sys.stderr.write(proc.stderr)
raise SystemExit(proc.returncode)
PY
}

playwright_cli() {
  local timeout_seconds="$1"
  shift
  run_with_timeout "$timeout_seconds" "$PLAYWRIGHT_WRAPPER" "$@"
}

cleanup_playwright_session() {
  local session="$1"

  playwright_cli "$PLAYWRIGHT_CLOSE_TIMEOUT_SECONDS" --session "$session" close >/dev/null 2>&1 || true
  pkill -f "cliDaemon.js $session" >/dev/null 2>&1 || true
}

make_playwright_session() {
  local slug="$1"
  local hash
  hash=$(printf '%s' "$slug-$$-$(date +%s)" | cksum | awk '{print $1}')
  printf 'vdx%s\n' "${hash:0:8}"
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
  session="$(make_playwright_session "$slug")"

  local cleanup_code
  cleanup_code=$(cat <<JS
async page => {
  const targetUrl = $(js_quote "$url");
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(1200);

  const dismissPatterns = [
    /reject all/i,
    /reject/i,
    /decline/i,
    /dismiss/i,
    /close/i,
    /no thanks/i,
    /not now/i,
    /only necessary/i,
    /only essential/i,
    /continue without/i,
    /skip/i,
    /拒绝/,
    /关闭/,
    /仅必要/,
    /不同意/,
    /稍后再说/,
    /跳过/,
  ];

  const viewport = {
    width: page.viewportSize()?.width ?? 1440,
    height: page.viewportSize()?.height ?? 900,
  };
  const focusZones = [
    {
      left: viewport.width * 0.18,
      right: viewport.width * 0.82,
      top: viewport.height * 0.16,
      bottom: viewport.height * 0.84,
    },
    {
      left: viewport.width * 0.05,
      right: viewport.width * 0.95,
      top: viewport.height * 0.64,
      bottom: viewport.height * 0.98,
    },
  ];

  const overlapArea = (rect, zone) => {
    const width = Math.max(0, Math.min(rect.right, zone.right) - Math.max(rect.left, zone.left));
    const height = Math.max(0, Math.min(rect.bottom, zone.bottom) - Math.max(rect.top, zone.top));
    return width * height;
  };

  const candidates = await page.evaluate(({ focusZones, viewport }) => {
    const toRect = rect => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });

    const isVisible = el => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        s.display !== 'none' &&
        s.visibility !== 'hidden' &&
        s.opacity !== '0' &&
        r.width >= 120 &&
        r.height >= 60
      );
    };

    const isLikelyHeader = (el, rect, style) => {
      const tag = el.tagName.toLowerCase();
      return (
        (tag === 'header' || tag === 'nav') &&
        rect.top <= 24 &&
        rect.height <= 140 &&
        rect.width >= viewport.width * 0.55 &&
        (style.position === 'fixed' || style.position === 'sticky')
      );
    };

    const textFor = el =>
      [el.innerText || '', el.id || '', el.className || '', el.getAttribute('aria-label') || '']
        .join(' ')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const scoreFor = el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (!isVisible(el) || isLikelyHeader(el, rect, style)) {
        return null;
      }

      const text = textFor(el);
      const area = rect.width * rect.height;
      const overlapsFocus = focusZones.some(zone => overlapArea(toRect(rect), zone) >= Math.min(area * 0.22, 60000));
      const nearCenter =
        rect.left < viewport.width * 0.82 &&
        rect.right > viewport.width * 0.18 &&
        rect.top < viewport.height * 0.82 &&
        rect.bottom > viewport.height * 0.18;
      const isFixedish = style.position === 'fixed' || style.position === 'sticky';
      const role = (el.getAttribute('role') || '').toLowerCase();
      const ariaModal = (el.getAttribute('aria-modal') || '').toLowerCase() === 'true';
      const zIndex = Number.parseInt(style.zIndex, 10);
      const zIndexHigh = Number.isFinite(zIndex) && zIndex >= 20;
      const hasBackdropLikePaint =
        (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') ||
        style.backdropFilter !== 'none';
      const nuisanceText = /cookie|consent|privacy|gdpr|intercom|hubspot|crisp|drift|newsletter|subscribe|sign up|book a demo|contact sales|accept all|allow all|preferences|live chat|message us/.test(text);
      const isAbsoluteOverlay = style.position === 'absolute' && zIndexHigh && nearCenter;
      const hasOverlayTrait =
        role === 'dialog' ||
        role === 'alertdialog' ||
        ariaModal ||
        el.tagName.toLowerCase() === 'dialog' ||
        isFixedish ||
        isAbsoluteOverlay ||
        (zIndexHigh && hasBackdropLikePaint && overlapsFocus);

      if (!hasOverlayTrait) {
        return null;
      }

      let score = 0;
      if (role === 'dialog' || role === 'alertdialog' || ariaModal || el.tagName.toLowerCase() === 'dialog') score += 4;
      if (isFixedish) score += 2;
      if (zIndexHigh) score += 1;
      if (area >= viewport.width * viewport.height * 0.11) score += 1;
      if (overlapsFocus) score += 3;
      if (nearCenter) score += 1;
      if (hasBackdropLikePaint) score += 1;
      if (nuisanceText) score += 2;

      if (score < 5) {
        return null;
      }

      return {
        text,
        score,
        rect: toRect(rect),
      };
    };

    const all = Array.from(document.querySelectorAll('body *'))
      .filter(el => el instanceof HTMLElement)
      .map(el => ({ el, candidate: scoreFor(el) }))
      .filter(item => item.candidate !== null)
      .sort((a, b) => (b.candidate.score - a.candidate.score) || ((b.candidate.rect.width * b.candidate.rect.height) - (a.candidate.rect.width * a.candidate.rect.height)));

    const roots = [];
    for (const item of all) {
      if (roots.some(root => root.el.contains(item.el))) {
        continue;
      }
      roots.push(item);
    }

    return roots.slice(0, 12).map(item => ({
      text: item.candidate.text,
      score: item.candidate.score,
      rect: item.candidate.rect,
    }));
  }, { focusZones, viewport });

  for (const candidate of candidates) {
    for (const pattern of dismissPatterns) {
      const locator = page.locator('*').filter({ hasText: pattern }).first();
      try {
        if (await locator.isVisible({ timeout: 250 })) {
          const box = await locator.boundingBox();
          if (
            box &&
            box.x >= candidate.rect.left - 24 &&
            box.x + box.width <= candidate.rect.right + 24 &&
            box.y >= candidate.rect.top - 24 &&
            box.y + box.height <= candidate.rect.bottom + 24
          ) {
            await locator.click({ timeout: 1000 });
            await page.waitForTimeout(250);
          }
        }
      } catch {}
    }
  }

  await page.keyboard.press('Escape').catch(() => {});

  await page.evaluate(() => {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const focusZones = [
      {
        left: viewport.width * 0.18,
        right: viewport.width * 0.82,
        top: viewport.height * 0.16,
        bottom: viewport.height * 0.84,
      },
      {
        left: viewport.width * 0.05,
        right: viewport.width * 0.95,
        top: viewport.height * 0.64,
        bottom: viewport.height * 0.98,
      },
    ];

    const overlapArea = (rect, zone) => {
      const width = Math.max(0, Math.min(rect.right, zone.right) - Math.max(rect.left, zone.left));
      const height = Math.max(0, Math.min(rect.bottom, zone.bottom) - Math.max(rect.top, zone.top));
      return width * height;
    };

    const isVisible = el => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width >= 120 && r.height >= 60;
    };

    const textFor = el =>
      [el.innerText || '', el.id || '', el.className || '', el.getAttribute('aria-label') || '']
        .join(' ')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const isLikelyHeader = (el, rect, style) => {
      const tag = el.tagName.toLowerCase();
      return (
        (tag === 'header' || tag === 'nav') &&
        rect.top <= 24 &&
        rect.height <= 140 &&
        rect.width >= viewport.width * 0.55 &&
        (style.position === 'fixed' || style.position === 'sticky')
      );
    };

    const scoreFor = el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (!isVisible(el) || isLikelyHeader(el, rect, style)) {
        return null;
      }

      const text = textFor(el);
      const area = rect.width * rect.height;
      const overlapsFocus = focusZones.some(zone => overlapArea(rect, zone) >= Math.min(area * 0.22, 60000));
      const nearCenter =
        rect.left < viewport.width * 0.82 &&
        rect.right > viewport.width * 0.18 &&
        rect.top < viewport.height * 0.82 &&
        rect.bottom > viewport.height * 0.18;
      const role = (el.getAttribute('role') || '').toLowerCase();
      const ariaModal = (el.getAttribute('aria-modal') || '').toLowerCase() === 'true';
      const zIndex = Number.parseInt(style.zIndex, 10);
      const zIndexHigh = Number.isFinite(zIndex) && zIndex >= 20;
      const hasBackdropLikePaint =
        (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') ||
        style.backdropFilter !== 'none';
      const nuisanceText = /cookie|consent|privacy|gdpr|intercom|hubspot|crisp|drift|newsletter|subscribe|sign up|book a demo|contact sales|accept all|allow all|preferences|live chat|message us/.test(text);
      const isFixedish = style.position === 'fixed' || style.position === 'sticky';
      const isAbsoluteOverlay = style.position === 'absolute' && zIndexHigh && nearCenter;
      const hasOverlayTrait =
        role === 'dialog' ||
        role === 'alertdialog' ||
        ariaModal ||
        el.tagName.toLowerCase() === 'dialog' ||
        isFixedish ||
        isAbsoluteOverlay ||
        (zIndexHigh && hasBackdropLikePaint && overlapsFocus);

      if (!hasOverlayTrait) {
        return null;
      }

      let score = 0;
      if (role === 'dialog' || role === 'alertdialog' || ariaModal || el.tagName.toLowerCase() === 'dialog') score += 4;
      if (isFixedish) score += 2;
      if (zIndexHigh) score += 1;
      if (area >= viewport.width * viewport.height * 0.11) score += 1;
      if (overlapsFocus) score += 3;
      if (nearCenter) score += 1;
      if (nuisanceText) score += 2;

      if (score < 5) {
        return null;
      }

      return { text, score };
    };

    const overlayCandidates = Array.from(document.querySelectorAll('body *'))
      .filter(el => el instanceof HTMLElement)
      .map(el => ({ el, candidate: scoreFor(el) }))
      .filter(item => item.candidate !== null)
      .sort((a, b) => (b.candidate.score - a.candidate.score));

    const roots = [];
    for (const item of overlayCandidates) {
      if (roots.some(root => root.el.contains(item.el))) continue;
      roots.push(item);
    }

    for (const { el } of roots) {
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
      const text = [el.innerText || '', el.id || '', el.className || '', el.getAttribute('aria-label') || '']
        .join(' ')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
      const visible = s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width >= 120 && r.height >= 60;
      if (!visible) return false;
      const likelyHeader =
        (el.tagName === 'HEADER' || el.tagName === 'NAV') &&
        r.top <= 24 &&
        r.height <= 140 &&
        r.width >= window.innerWidth * 0.55 &&
        (s.position === 'fixed' || s.position === 'sticky');
      if (likelyHeader) return false;
      const role = (el.getAttribute('role') || '').toLowerCase();
      const ariaModal = (el.getAttribute('aria-modal') || '').toLowerCase() === 'true';
      const zIndex = Number.parseInt(s.zIndex, 10);
      const zIndexHigh = Number.isFinite(zIndex) && zIndex >= 20;
      const area = r.width * r.height;
      const overlap = (zone) => {
        const width = Math.max(0, Math.min(r.right, zone.right) - Math.max(r.left, zone.left));
        const height = Math.max(0, Math.min(r.bottom, zone.bottom) - Math.max(r.top, zone.top));
        return width * height;
      };
      const focusZones = [
        {
          left: window.innerWidth * 0.18,
          right: window.innerWidth * 0.82,
          top: window.innerHeight * 0.16,
          bottom: window.innerHeight * 0.84,
        },
        {
          left: window.innerWidth * 0.05,
          right: window.innerWidth * 0.95,
          top: window.innerHeight * 0.64,
          bottom: window.innerHeight * 0.98,
        },
      ];
      const overlapsFocus = focusZones.some(zone => overlap(zone) >= Math.min(area * 0.22, 60000));
      const nearCenter =
        r.left < window.innerWidth * 0.82 &&
        r.right > window.innerWidth * 0.18 &&
        r.top < window.innerHeight * 0.82 &&
        r.bottom > window.innerHeight * 0.18;
      const hasBackdropLikePaint =
        (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') ||
        s.backdropFilter !== 'none';
      const nuisanceText = /cookie|consent|privacy|gdpr|intercom|hubspot|crisp|drift|newsletter|subscribe|sign up|book a demo|contact sales|accept all|allow all|preferences|live chat|message us/.test(text);
      const isFixedish = s.position === 'fixed' || s.position === 'sticky';
      const isAbsoluteOverlay = s.position === 'absolute' && zIndexHigh && nearCenter;
      const hasOverlayTrait =
        role === 'dialog' ||
        role === 'alertdialog' ||
        ariaModal ||
        el.tagName === 'DIALOG' ||
        isFixedish ||
        isAbsoluteOverlay ||
        (zIndexHigh && hasBackdropLikePaint && overlapsFocus);
      if (!hasOverlayTrait) return false;
      let score = 0;
      if (role === 'dialog' || role === 'alertdialog' || ariaModal || el.tagName === 'DIALOG') score += 4;
      if (isFixedish) score += 2;
      if (zIndexHigh) score += 1;
      if (area >= window.innerWidth * window.innerHeight * 0.11) score += 1;
      if (overlapsFocus) score += 3;
      if (nearCenter) score += 1;
      if (nuisanceText) score += 2;
      return score >= 5;
    })
    .slice(0, 10)
    .map(el => ({
      tag: el.tagName,
      text: (el.innerText || '').trim().slice(0, 120),
      role: el.getAttribute('role') || '',
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
    cleanup_playwright_session "$session"
  }

  trap cleanup RETURN

  if ! playwright_cli "$PLAYWRIGHT_STEP_TIMEOUT_SECONDS" --session "$session" open "about:blank" >/dev/null; then
    echo "FAILED (Playwright open timed out or errored)" >&2
    return 1
  fi
  if ! playwright_cli "$PLAYWRIGHT_STEP_TIMEOUT_SECONDS" --session "$session" resize 1440 900 >/dev/null; then
    echo "FAILED (Playwright resize errored)" >&2
    return 1
  fi
  if ! playwright_cli "$PLAYWRIGHT_STEP_TIMEOUT_SECONDS" --session "$session" run-code "$cleanup_code" >/dev/null; then
    echo "FAILED (overlay cleanup step errored)" >&2
    return 1
  fi
  if ! analysis_json=$(playwright_cli "$PLAYWRIGHT_STEP_TIMEOUT_SECONDS" --raw --session "$session" eval "$analysis_code"); then
    echo "FAILED (overlay analysis step errored)" >&2
    return 1
  fi
  if [ -z "$analysis_json" ]; then
    echo "FAILED (overlay analysis returned no data)" >&2
    return 1
  fi

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

  if ! playwright_cli "$PLAYWRIGHT_STEP_TIMEOUT_SECONDS" --session "$session" run-code "$screenshot_code" >/dev/null; then
    echo "FAILED (Playwright screenshot step errored)" >&2
    return 1
  fi

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
    if [ "$ALLOW_UNSAFE_SCREENSHOT_FALLBACK" = "1" ]; then
      captured_file="$(take_screenshot_via_cloudflare "$slug" "$url")" || {
        echo "FAILED (Cloudflare capture failed)"
        return 1
      }
    else
      echo "FAILED (Playwright unavailable; refusing unsafe fallback without popup checks)"
      return 1
    fi
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

echo "VentureDex Screenshot Tool (Playwright popup-safe capture -> local + R2)"
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
