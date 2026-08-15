#!/bin/bash
# VentureDex screenshot tool.
# Uses a local Playwright browser first so cookie banners and modal overlays can
# be dismissed or flagged before capture. Falls back to Cloudflare Browser
# Rendering only when the Playwright CLI wrapper is unavailable.
#
# Saves the captured image to public/screenshots/, which is bundled as a static
# asset at build time and served directly from there.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export REPO_ROOT

# shellcheck disable=SC1091
. "$SCRIPT_DIR/load-local-env.sh"

CF_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-48d9ccaf5ee7914c803b5d0656462848}"
API="https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/browser-rendering/screenshot"
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

  rm -f "$tmp_png" "$tmp_webp"

  local cleanup_code
  IFS= read -r -d '' cleanup_code <<'JS' || true
async page => {
  const targetUrl = __VENTUREDEX_TARGET_URL__;
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(1200);
  await page.keyboard.press('Escape').catch(() => {});

  const remainingOverlays = await page.evaluate(async () => {
    // These caps are the large-DOM safety contract. Discovery uses one
    // semantic selector and fixed viewport hit-tests, never a body-wide scan.
    const MAX_SEMANTIC_CANDIDATES = 48;
    const MAX_VIEWPORT_STACK = 8;
    const MAX_ANCESTOR_DEPTH = 7;
    const MAX_CANDIDATE_ELEMENTS = 96;
    const MAX_CANDIDATE_ROOTS = 16;
    const MAX_CONTROLS_PER_ROOT = 48;
    const MAX_DISMISS_CLICKS = 8;
    const OVERLAY_SEMANTIC_SELECTOR = [
      '[role="dialog"]',
      '[role="alertdialog"]',
      'dialog[open]',
      '[aria-modal="true"]',
      '[aria-label*="cookie" i]',
      '[aria-label*="consent" i]',
      '[data-testid*="cookie" i]',
      '[data-testid*="consent" i]',
      '[data-cookie-banner]',
      '[data-consent-banner]',
    ].join(',');
    const CONTROL_SELECTOR = [
      'button',
      '[role="button"]',
      'input[type="button"]',
      'input[type="submit"]',
      'a[href]',
    ].join(',');
    const dismissPatterns = [
      /reject all/i,
      /reject/i,
      /decline/i,
      /only necessary/i,
      /only essential/i,
      /continue without/i,
      /no thanks/i,
      /not now/i,
      /dismiss/i,
      /close/i,
      /skip/i,
      /拒绝/,
      /不同意/,
      /仅必要/,
      /稍后再说/,
      /关闭/,
      /跳过/,
    ];

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

    // page.evaluate serializes this callback. Keep all helpers in this closure.
    const overlapArea = (rect, zone) => {
      const width = Math.max(0, Math.min(rect.right, zone.right) - Math.max(rect.left, zone.left));
      const height = Math.max(0, Math.min(rect.bottom, zone.bottom) - Math.max(rect.top, zone.top));
      return width * height;
    };

    const textFor = el =>
      [
        (el.textContent || '').slice(0, 1800),
        el.id || '',
        typeof el.className === 'string' ? el.className : '',
        el.getAttribute('aria-label') || '',
      ]
        .join(' ')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const hasVisibleColor = value => {
      if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)') return false;
      const legacyRgba = value.match(/^rgba\([^)]*,\s*([\d.]+)\s*\)$/);
      if (legacyRgba) return Number.parseFloat(legacyRgba[1]) > 0.04;
      const modernAlpha = value.match(/\/\s*([\d.]+)(%)?\s*\)$/);
      if (!modernAlpha) return true;
      const alpha = Number.parseFloat(modernAlpha[1]);
      return modernAlpha[2] ? alpha > 4 : alpha > 0.04;
    };

    const isVisible = (style, rect) => {
      const opacity = Number.parseFloat(style.opacity || '1');
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        (!Number.isFinite(opacity) || opacity > 0.04) &&
        rect.width >= 100 &&
        rect.height >= 48 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < viewport.width &&
        rect.top < viewport.height
      );
    };

    const scoreFor = el => {
      if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement) {
        return null;
      }

      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (!isVisible(style, rect)) return null;

      const text = textFor(el);
      const area = rect.width * rect.height;
      const overlapsFocus = focusZones.some(
        zone => overlapArea(rect, zone) >= Math.min(area * 0.22, 60000),
      );
      const nearCenter =
        rect.left < viewport.width * 0.82 &&
        rect.right > viewport.width * 0.18 &&
        rect.top < viewport.height * 0.82 &&
        rect.bottom > viewport.height * 0.18;
      const role = (el.getAttribute('role') || '').toLowerCase();
      const ariaModal = (el.getAttribute('aria-modal') || '').toLowerCase() === 'true';
      const semanticModal =
        role === 'dialog' ||
        role === 'alertdialog' ||
        ariaModal ||
        (el.tagName === 'DIALOG' && el.hasAttribute('open'));
      const zIndex = Number.parseInt(style.zIndex, 10);
      const zIndexHigh = Number.isFinite(zIndex) && zIndex >= 20;
      const hasBackdropLikePaint =
        hasVisibleColor(style.backgroundColor) ||
        style.backgroundImage !== 'none' ||
        style.boxShadow !== 'none' ||
        style.backdropFilter !== 'none';
      const nuisanceText =
        /cookie|consent|privacy|gdpr|intercom|hubspot|crisp|drift|newsletter|subscribe|sign up|book a demo|contact sales|accept all|allow all|preferences|live chat|message us/.test(text);
      const isFixedish = style.position === 'fixed' || style.position === 'sticky';
      const isAbsoluteOverlay = style.position === 'absolute' && zIndexHigh && nearCenter;
      const isLikelyHeader =
        isFixedish &&
        rect.top <= 24 &&
        rect.height <= 150 &&
        rect.width >= viewport.width * 0.55 &&
        !semanticModal &&
        !nuisanceText;

      // Transparent pass-through layers and ordinary sticky headers are not
      // blockers. A visible semantic modal remains fail-closed.
      if (
        isLikelyHeader ||
        (!hasBackdropLikePaint && !nuisanceText && style.pointerEvents === 'none')
      ) {
        return null;
      }

      const hasOverlayTrait =
        semanticModal ||
        (nuisanceText && isFixedish) ||
        (isAbsoluteOverlay && hasBackdropLikePaint) ||
        (zIndexHigh && hasBackdropLikePaint && overlapsFocus);
      if (!hasOverlayTrait) return null;

      let score = 0;
      if (semanticModal) score += 7;
      if (isFixedish) score += 2;
      if (zIndexHigh) score += 1;
      if (area >= viewport.width * viewport.height * 0.11) score += 1;
      if (overlapsFocus) score += 3;
      if (nearCenter) score += 1;
      if (hasBackdropLikePaint) score += 1;
      if (nuisanceText) score += 2;
      if (score < 6) return null;

      return { el, score, text, semanticModal, rect };
    };

    const collectCandidateElements = () => {
      const elements = [];
      const seen = new Set();
      const add = el => {
        if (
          elements.length >= MAX_CANDIDATE_ELEMENTS ||
          !(el instanceof HTMLElement) ||
          el === document.body ||
          el === document.documentElement ||
          seen.has(el)
        ) {
          return;
        }
        seen.add(el);
        elements.push(el);
      };

      let semanticCount = 0;
      for (const el of document.querySelectorAll(OVERLAY_SEMANTIC_SELECTOR)) {
        add(el);
        semanticCount += 1;
        if (semanticCount >= MAX_SEMANTIC_CANDIDATES) break;
      }

      const viewportPoints = [
        [0.5, 0.5],
        [0.2, 0.2],
        [0.8, 0.2],
        [0.2, 0.8],
        [0.5, 0.8],
        [0.8, 0.8],
        [0.04, 0.5],
        [0.96, 0.5],
        [0.5, 0.96],
      ];
      for (const [xRatio, yRatio] of viewportPoints) {
        const stack = document
          .elementsFromPoint(
            Math.max(0, Math.min(viewport.width - 1, viewport.width * xRatio)),
            Math.max(0, Math.min(viewport.height - 1, viewport.height * yRatio)),
          )
          .slice(0, MAX_VIEWPORT_STACK);
        for (const hit of stack) {
          let current = hit;
          for (let depth = 0; current && depth < MAX_ANCESTOR_DEPTH; depth += 1) {
            add(current);
            current = current.parentElement;
          }
        }
      }
      return elements;
    };

    const findOverlayRoots = () => {
      const candidates = collectCandidateElements()
        .map(scoreFor)
        .filter(Boolean)
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.rect.width * b.rect.height - a.rect.width * a.rect.height,
        );
      const roots = [];
      for (const candidate of candidates) {
        if (
          roots.some(
            root => root.el.contains(candidate.el) || candidate.el.contains(root.el),
          )
        ) {
          continue;
        }
        roots.push(candidate);
        if (roots.length >= MAX_CANDIDATE_ROOTS) break;
      }
      return roots;
    };

    const controlText = el =>
      [
        el.getAttribute('aria-label') || '',
        el.getAttribute('title') || '',
        el.getAttribute('value') || '',
        (el.textContent || '').slice(0, 240),
      ]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

    const isVisibleControl = el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const opacity = Number.parseFloat(style.opacity || '1');
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        (!Number.isFinite(opacity) || opacity > 0.04) &&
        rect.width > 0 &&
        rect.height > 0 &&
        !el.hasAttribute('disabled') &&
        el.getAttribute('aria-disabled') !== 'true'
      );
    };

    let clickCount = 0;
    for (const candidate of findOverlayRoots()) {
      if (clickCount >= MAX_DISMISS_CLICKS) break;
      // Exactly one semantic control scan per bounded candidate root.
      const controls = Array.from(candidate.el.querySelectorAll(CONTROL_SELECTOR))
        .slice(0, MAX_CONTROLS_PER_ROOT)
        .map(el => ({
          el,
          rank: dismissPatterns.findIndex(pattern => pattern.test(controlText(el))),
        }))
        .filter(item => item.rank >= 0 && isVisibleControl(item.el))
        .sort((a, b) => a.rank - b.rank);
      const chosen = controls[0]?.el;
      if (!chosen) continue;
      try {
        chosen.click();
        clickCount += 1;
      } catch {}
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    window.scrollTo(0, 0);
    return findOverlayRoots().slice(0, 10).map(candidate => ({
      tag: candidate.el.tagName,
      text: candidate.text.slice(0, 120),
      role: candidate.el.getAttribute('role') || '',
      semantic_modal: candidate.semanticModal,
      score: candidate.score,
    }));
  });

  if (remainingOverlays.length > 0) {
    throw new Error('popup_detected:' + JSON.stringify(remainingOverlays));
  }

  await page.waitForTimeout(250);
}
JS
  cleanup_code="${cleanup_code/__VENTUREDEX_TARGET_URL__/$(js_quote "$url")}"

  local screenshot_code
  IFS= read -r -d '' screenshot_code <<'JS' || true
async page => {
  await page.screenshot({ path: __VENTUREDEX_SCREENSHOT_PATH__, type: 'png' });
}
JS
  screenshot_code="${screenshot_code/__VENTUREDEX_SCREENSHOT_PATH__/$(js_quote "$tmp_png")}"

  local capture_status=0

  if playwright_cli "$PLAYWRIGHT_STEP_TIMEOUT_SECONDS" --session "$session" open "about:blank" >/dev/null; then
    :
  else
    capture_status=$?
    echo "FAILED (Playwright open timed out or errored)" >&2
  fi

  if [ "$capture_status" -eq 0 ]; then
    if playwright_cli "$PLAYWRIGHT_STEP_TIMEOUT_SECONDS" --session "$session" resize 1440 900 >/dev/null; then
      :
    else
      capture_status=$?
      echo "FAILED (Playwright resize errored)" >&2
    fi
  fi

  if [ "$capture_status" -eq 0 ]; then
    if playwright_cli "$PLAYWRIGHT_STEP_TIMEOUT_SECONDS" --session "$session" run-code "$cleanup_code" >/dev/null; then
      :
    else
      capture_status=$?
      echo "FAILED (overlay cleanup or fail-closed analysis errored)" >&2
    fi
  fi

  if [ "$capture_status" -eq 0 ]; then
    if playwright_cli "$PLAYWRIGHT_STEP_TIMEOUT_SECONDS" --session "$session" run-code "$screenshot_code" >/dev/null; then
      :
    else
      capture_status=$?
      echo "FAILED (Playwright screenshot step errored)" >&2
    fi
  fi

  if [ "$capture_status" -eq 0 ] && [ ! -s "$tmp_png" ]; then
    capture_status=1
    echo "FAILED (Playwright screenshot produced no PNG)" >&2
  fi

  if [ "$capture_status" -eq 0 ]; then
    if cwebp -quiet -q 92 "$tmp_png" -o "$tmp_webp" >/dev/null 2>&1; then
      :
    else
      capture_status=$?
      echo "FAILED (could not convert screenshot to webp)" >&2
    fi
  fi

  if [ "$capture_status" -eq 0 ] && [ ! -s "$tmp_webp" ]; then
    capture_status=1
    echo "FAILED (screenshot conversion produced no WebP)" >&2
  fi

  # RETURN traps fire at surprising boundaries inside command substitutions.
  # One explicit cleanup point preserves both output and failure status.
  cleanup_playwright_session "$session"

  if [ "$capture_status" -ne 0 ]; then
    rm -f "$tmp_png" "$tmp_webp"
    return "$capture_status"
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

  if [ -z "$captured_file" ] || [ ! -s "$captured_file" ]; then
    echo "FAILED (capture returned no WebP)"
    return 1
  fi

  mv -- "$captured_file" "$local_output"

  local size
  size=$(wc -c < "$local_output" | tr -d ' ')

  echo "OK (${size} bytes → public/screenshots)"
}

if [ $# -ge 2 ]; then
  if take_screenshot "$1" "$2"; then
    exit 0
  else
    status=$?
    exit "$status"
  fi
fi

echo "VentureDex Screenshot Tool (Playwright popup-safe capture -> public/screenshots)"
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
