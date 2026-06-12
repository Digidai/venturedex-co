#!/bin/bash
# Submit VentureDex detail URLs to Google Search Console's URL Inspection
# "Request indexing" flow through the authenticated local browser.
#
# Examples:
#   bash scripts/submit-gsc-direct.sh --dry-run --latest-daily
#   bash scripts/submit-gsc-direct.sh --latest-daily
#   bash scripts/submit-gsc-direct.sh --dry-run --latest-weekly
#   bash scripts/submit-gsc-direct.sh --url "https://venturedex.co/startups/kodesage" --expect-url "https://venturedex.co/startups/kodesage"

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUN_TS="$(date '+%Y-%m-%d %H:%M:%S')"

SITE_BASE_URL="${SITE_BASE_URL:-https://venturedex.co}"
GSC_RESOURCE_ID="${GSC_RESOURCE_ID:-sc-domain%3Aventuredex.co}"
GSC_LANG="${GSC_LANG:-zh-cn}"

NAV_WAIT_SECONDS="${NAV_WAIT_SECONDS:-8}"
INSPECT_WAIT_SECONDS="${INSPECT_WAIT_SECONDS:-18}"
POST_CLICK_WAIT_SECONDS="${POST_CLICK_WAIT_SECONDS:-12}"
POST_MODAL_WAIT_SECONDS="${POST_MODAL_WAIT_SECONDS:-5}"
BB_BROWSER_CONNECT_MAX_ATTEMPTS="${BB_BROWSER_CONNECT_MAX_ATTEMPTS:-6}"
BB_BROWSER_CONNECT_RETRY_SLEEP="${BB_BROWSER_CONNECT_RETRY_SLEEP:-2}"
MAX_URLS="${MAX_URLS:-10}"

HISTORY_FILE="${HISTORY_FILE:-${ROOT_DIR}/.gsc_submission_history.tsv}"
GSC_ARTIFACT_DIR="${GSC_ARTIFACT_DIR:-${ROOT_DIR}/docs/promotion/gsc-artifacts}"
BB_BROWSER_CMD="${BB_BROWSER_CMD:-bb-browser}"
COMET_APP="${COMET_APP:-/Applications/Comet.app/Contents/MacOS/Comet}"
COMET_LOG_FILE="${COMET_LOG_FILE:-/tmp/venturedex-gsc-comet.log}"
BB_BROWSER_DAEMON_LOG_FILE="${BB_BROWSER_DAEMON_LOG_FILE:-/tmp/venturedex-gsc-bb-browser-daemon.log}"
COMET_CDP_HOST="${COMET_CDP_HOST:-127.0.0.1}"
COMET_CDP_PORT="${COMET_CDP_PORT:-19825}"

DRY_RUN=0
ADD_LATEST_DAILY=0
ADD_LATEST_WEEKLY=0
DAILY_DATE=""
WEEKLY_ISSUE=""
EXPECT_URL=""
FORCE=0
SKIP_LIVE_CHECK=0
BB_BROWSER_TAB_OPENED=0
BB_BROWSER_TAB_ID=""
TARGET_URLS=()

usage() {
  cat <<USAGE
VentureDex GSC direct submitter

Usage:
  bash scripts/submit-gsc-direct.sh --dry-run --latest-daily
  bash scripts/submit-gsc-direct.sh --latest-daily
  bash scripts/submit-gsc-direct.sh --dry-run --latest-weekly
  bash scripts/submit-gsc-direct.sh --latest-weekly
  bash scripts/submit-gsc-direct.sh --url <url> [--expect-url <url>]

Options:
  --dry-run             Preview targets and write dry-run ledger rows only.
  --latest-daily        Submit startup detail pages from the newest publish date.
  --daily-date <date>   Submit startup detail pages published on YYYY-MM-DD.
  --latest-weekly       Submit the newest published weekly issue detail page.
  --weekly-issue <N>    Submit one published weekly issue detail page.
  --url <url>           Submit one detail URL; may be repeated.
  --expect-url <url>    Safety check for single-URL submissions.
  --force               Do not skip URLs already marked requested in the ledger.
  --skip-live-check     Do not verify the target URL returns 2xx before submit.
  --max-urls <N>        Safety cap for one run. Default: ${MAX_URLS}.
  --artifact-dir <dir>  Write failed GSC page diagnostics to this directory.
  -h, --help            Show this help.

Supported target paths:
  https://venturedex.co/startups/<slug>
  https://venturedex.co/weekly/<issue>
USAGE
}

ensure_history_file() {
  if [ ! -f "$HISTORY_FILE" ]; then
    printf 'timestamp\tstatus\turl\tmessage\n' > "$HISTORY_FILE"
  fi
}

append_history() {
  local status="$1"
  local url="$2"
  local message="$3"
  ensure_history_file
  printf '%s\t%s\t%s\t%s\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" \
    "$status" \
    "$url" \
    "$(printf '%s' "$message" | tr '\t\r\n' '   ')" >> "$HISTORY_FILE"
}

sanitize_artifact_name() {
  python3 - "$1" <<'PY'
import re
import sys

value = sys.argv[1].strip().lower()
value = re.sub(r"^https?://", "", value)
value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
print(value[:90] or "unknown")
PY
}

capture_page_text() {
  run_js "(function(){var text=document.body?document.body.innerText:'';return text.replace(/\\s+$/,'').slice(0,8000);})();" 2>/dev/null || true
}

write_gsc_artifact() {
  local status="$1"
  local url="$2"
  local message="$3"
  local page_text page_state safe_url file

  page_text="$(capture_page_text)"
  page_state="$(page_request_state 2>/dev/null || true)"
  safe_url="$(sanitize_artifact_name "$url")"
  mkdir -p "$GSC_ARTIFACT_DIR"
  file="${GSC_ARTIFACT_DIR}/$(date '+%Y%m%d-%H%M%S')-${status}-${safe_url}.txt"

  {
    printf 'timestamp: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    printf 'status: %s\n' "$status"
    printf 'url: %s\n' "$url"
    printf 'message: %s\n' "$message"
    printf 'page_state: %s\n' "${page_state:-unknown}"
    printf '\n--- page text ---\n'
    printf '%s\n' "$page_text"
  } > "$file"

  echo "GSC diagnostic artifact: $file" >&2
}

normalize_url() {
  local url="$1"
  url="${url%/}"
  printf '%s\n' "$url"
}

add_target() {
  local target
  target="$(normalize_url "$1")"
  if [ -n "$target" ]; then
    TARGET_URLS+=("$target")
  fi
}

validate_detail_url() {
  local url="$1"
  if ! printf '%s' "$url" | grep -Eq '^https://venturedex\.co/(startups/[a-z0-9][a-z0-9-]*|weekly/[0-9]+)$'; then
    echo "Invalid VentureDex detail URL: $url" >&2
    return 1
  fi
  return 0
}

dedupe_targets() {
  local seen_file unique_file url
  seen_file="$(mktemp)"
  unique_file="$(mktemp)"

  for url in "${TARGET_URLS[@]}"; do
    url="$(normalize_url "$url")"
    if [ -n "$url" ] && ! grep -Fxq "$url" "$seen_file"; then
      printf '%s\n' "$url" >> "$seen_file"
      printf '%s\n' "$url" >> "$unique_file"
    fi
  done

  TARGET_URLS=()
  while IFS= read -r url; do
    [ -n "$url" ] && TARGET_URLS+=("$url")
  done < "$unique_file"

  rm -f "$seen_file" "$unique_file"
}

latest_daily_urls() {
  python3 - "$ROOT_DIR" "$SITE_BASE_URL" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
base = sys.argv[2].rstrip("/")
timestamps = json.loads((root / "content" / "timestamps.json").read_text())
startup_dir = root / "content" / "startups"

rows = []
for slug, value in timestamps.items():
    if slug.startswith("__") or not isinstance(value, dict):
        continue
    published_at = str(value.get("published_at") or "").strip()
    if not published_at:
        continue
    if not (startup_dir / f"{slug}.json").exists():
        continue
    rows.append((published_at[:10], slug))

if not rows:
    raise SystemExit("No published startup timestamp rows found.")

latest_date = max(date for date, _slug in rows)
for _date, slug in sorted(row for row in rows if row[0] == latest_date):
    print(f"{base}/startups/{slug}")
PY
}

daily_date_urls() {
  local target_date="$1"
  python3 - "$ROOT_DIR" "$SITE_BASE_URL" "$target_date" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
base = sys.argv[2].rstrip("/")
target_date = sys.argv[3]
timestamps = json.loads((root / "content" / "timestamps.json").read_text())
startup_dir = root / "content" / "startups"

found = False
for slug, value in sorted(timestamps.items()):
    if slug.startswith("__") or not isinstance(value, dict):
        continue
    published_at = str(value.get("published_at") or "").strip()
    if published_at[:10] != target_date:
        continue
    if not (startup_dir / f"{slug}.json").exists():
        continue
    found = True
    print(f"{base}/startups/{slug}")

if not found:
    raise SystemExit(f"No startup detail URLs found for {target_date}.")
PY
}

latest_weekly_url() {
  python3 - "$ROOT_DIR" "$SITE_BASE_URL" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
base = sys.argv[2].rstrip("/")
weekly_dir = root / "content" / "weekly"
issues = []

for path in weekly_dir.glob("*.json"):
    data = json.loads(path.read_text())
    if data.get("status", "published") != "published":
        continue
    issue_number = data.get("issue_number")
    if isinstance(issue_number, int):
        issues.append(issue_number)

if not issues:
    raise SystemExit("No published weekly issues found.")

print(f"{base}/weekly/{max(issues)}")
PY
}

weekly_issue_url() {
  local issue="$1"
  python3 - "$ROOT_DIR" "$SITE_BASE_URL" "$issue" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
base = sys.argv[2].rstrip("/")
issue = int(sys.argv[3])
path = root / "content" / "weekly" / f"{issue}.json"

if not path.exists():
    raise SystemExit(f"Weekly issue file not found: {path}")

data = json.loads(path.read_text())
if data.get("status", "published") != "published":
    raise SystemExit(f"Weekly issue {issue} is not published.")
if data.get("issue_number") != issue:
    raise SystemExit(f"Weekly issue file {path.name} has mismatched issue_number.")

print(f"{base}/weekly/{issue}")
PY
}

target_already_requested() {
  local url="$1"
  [ -f "$HISTORY_FILE" ] || return 1
  awk -F '\t' -v target="$url" '$2 == "requested" && $3 == target { found = 1 } END { exit(found ? 0 : 1) }' "$HISTORY_FILE"
}

check_live_url() {
  local url="$1"
  if [ "$SKIP_LIVE_CHECK" -eq 1 ]; then
    return 0
  fi
  curl -fsSL --max-time 20 -o /dev/null "$url"
}

require_deps() {
  local missing=0 cmd
  for cmd in "$BB_BROWSER_CMD" curl tail sed grep pkill python3; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo "Missing dependency: $cmd" >&2
      missing=1
    fi
  done
  if [ ! -x "$COMET_APP" ]; then
    echo "Comet executable not found: $COMET_APP" >&2
    missing=1
  fi
  if [ "$missing" -ne 0 ]; then
    exit 1
  fi
}

bb_browser_connected() {
  local status_output
  status_output=$("$BB_BROWSER_CMD" status 2>&1 || true)
  printf '%s\n' "$status_output" | grep -Eq 'CDP connected:[[:space:]]+yes'
}

bb_browser_status() {
  "$BB_BROWSER_CMD" status 2>&1 || true
}

bb_browser_daemon_status() {
  "$BB_BROWSER_CMD" daemon status 2>&1 || true
}

comet_cdp_reachable() {
  curl -fsS "http://${COMET_CDP_HOST}:${COMET_CDP_PORT}/json/version" >/dev/null 2>&1
}

wait_for_bb_browser_connection() {
  local attempt=1
  while [ "$attempt" -le "$BB_BROWSER_CONNECT_MAX_ATTEMPTS" ]; do
    if bb_browser_connected; then
      return 0
    fi
    sleep "$BB_BROWSER_CONNECT_RETRY_SLEEP"
    attempt=$((attempt + 1))
  done
  return 1
}

stop_bb_browser_daemon() {
  "$BB_BROWSER_CMD" daemon stop >/dev/null 2>&1 || true
  pkill -f '[/]bb-browser/dist/daemon.js' >/dev/null 2>&1 || true
}

start_bb_browser_daemon() {
  nohup "$BB_BROWSER_CMD" daemon --cdp-host "$COMET_CDP_HOST" --cdp-port "$COMET_CDP_PORT" >"$BB_BROWSER_DAEMON_LOG_FILE" 2>&1 &
}

print_bb_browser_debug() {
  echo "----- bb-browser daemon status -----" >&2
  bb_browser_daemon_status >&2
  echo "----- bb-browser status -----" >&2
  bb_browser_status >&2

  if [ -f "$BB_BROWSER_DAEMON_LOG_FILE" ]; then
    echo "----- bb-browser daemon log (tail) -----" >&2
    tail -n 20 "$BB_BROWSER_DAEMON_LOG_FILE" >&2
  fi

  if [ -f "$COMET_LOG_FILE" ]; then
    echo "----- Comet log (tail) -----" >&2
    tail -n 20 "$COMET_LOG_FILE" >&2
  fi
}

ensure_comet_cdp_ready() {
  if comet_cdp_reachable; then
    return 0
  fi

  echo "Comet CDP is not ready; starting managed browser..."
  nohup "$COMET_APP" --remote-debugging-port="$COMET_CDP_PORT" >"$COMET_LOG_FILE" 2>&1 &
  sleep 4

  if comet_cdp_reachable; then
    return 0
  fi

  echo "Comet CDP is still unavailable (${COMET_CDP_HOST}:${COMET_CDP_PORT})." >&2
  if [ -f "$COMET_LOG_FILE" ]; then
    tail -n 20 "$COMET_LOG_FILE" >&2
  fi
  return 1
}

ensure_bb_browser_connected() {
  if bb_browser_connected; then
    return 0
  fi

  ensure_comet_cdp_ready || return 1

  echo "bb-browser is not connected to Comet; restarting daemon..."
  stop_bb_browser_daemon
  sleep 1
  start_bb_browser_daemon

  if wait_for_bb_browser_connection; then
    return 0
  fi

  echo "First daemon restart did not recover CDP; retrying once..."
  stop_bb_browser_daemon
  sleep 1
  start_bb_browser_daemon

  if wait_for_bb_browser_connection; then
    return 0
  fi

  echo "bb-browser is still not connected to Comet (CDP ${COMET_CDP_HOST}:${COMET_CDP_PORT})." >&2
  print_bb_browser_debug
  return 1
}

open_gsc_page() {
  local inspect_url="$1"
  local output
  output=$("$BB_BROWSER_CMD" open "$inspect_url")
  BB_BROWSER_TAB_ID=$(printf '%s\n' "$output" | sed -nE 's/^tab:[[:space:]]*([^[:space:]]+).*$/\1/p' | head -n 1)
  BB_BROWSER_TAB_OPENED=1
}

run_js() {
  local js="$1"
  local flattened
  flattened=$(printf '%s' "$js" | tr '\n' ' ')
  if [ -n "${BB_BROWSER_TAB_ID:-}" ]; then
    "$BB_BROWSER_CMD" eval "$flattened" --tab "$BB_BROWSER_TAB_ID"
  else
    "$BB_BROWSER_CMD" eval "$flattened"
  fi
}

cleanup_browser_tab() {
  if [ "${BB_BROWSER_TAB_OPENED:-0}" -eq 1 ]; then
    if [ -n "${BB_BROWSER_TAB_ID:-}" ]; then
      "$BB_BROWSER_CMD" close --tab "$BB_BROWSER_TAB_ID" >/dev/null 2>&1 || true
    else
      "$BB_BROWSER_CMD" close >/dev/null 2>&1 || true
    fi
    BB_BROWSER_TAB_OPENED=0
    BB_BROWSER_TAB_ID=""
  fi
}

page_has_quota() {
  local result
  result=$(run_js "(function(){var t=document.body?document.body.innerText:'';return /(quota|配额)/i.test(t)?'quota':'ok';})();" 2>/dev/null || true)
  if printf '%s' "$result" | grep -q 'quota'; then
    return 0
  fi
  return 1
}

page_request_state() {
  run_js "
(function(){
  var text=(document.body?document.body.innerText:'').replace(/\\s+/g,' ').trim();
  if(/(quota|配额)/i.test(text)) return 'quota';
  if(/(indexing requested|request submitted|request was submitted|已请求编入索引|已请求|请求[^。\\n]*已提交|已提交[^。\\n]*请求)/i.test(text)) return 'success';
  if(/(request failed|couldn.?t request|unable to request|something went wrong|失败|无法|出错)/i.test(text)) return 'failed';
  return 'unknown';
})();" 2>/dev/null || true
}

wait_for_request_result() {
  local attempt state
  for attempt in 1 2 3 4 5; do
    state="$(page_request_state)"
    if printf '%s' "$state" | grep -q 'success'; then
      return 0
    fi
    if printf '%s' "$state" | grep -q 'quota'; then
      return 2
    fi
    if printf '%s' "$state" | grep -q 'failed'; then
      return 4
    fi
    sleep 3
  done
  return 3
}

dismiss_success_dialog() {
  run_js "(function(){var els=document.querySelectorAll('span,button,div[role=button]');for(var i=0;i<els.length;i++){var t=(els[i].textContent||'').replace(/\\s+/g,' ').trim();if(t==='确定'||t==='OK'||t==='Got it'||t==='知道了'){els[i].click();return 'closed';}}return 'none';})();" >/dev/null 2>&1 || true
}

submit_single_url() {
  local url="$1"
  local escaped_url input_js click_js input_result click_result result

  escaped_url=${url//\\/\\\\}
  escaped_url=${escaped_url//\'/\\\'}

  input_js="
(function(){
  var input = document.querySelector('input[aria-label*=\"Inspect any URL\"]') ||
              document.querySelector('input[aria-label*=\"检查\"]') ||
              document.querySelector('input.Ax4B8') ||
              document.querySelector('input[type=\"text\"]');
  if(!input) return 'input_not_found';
  input.focus();
  var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '');
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
  setter.call(input, '${escaped_url}');
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
  input.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
  return 'submitted';
})();"

  input_result=$(run_js "$input_js" 2>&1)
  if ! printf '%s' "$input_result" | grep -q 'submitted'; then
    echo "URL inspection input was not found or did not accept the URL." >&2
    return 3
  fi

  sleep "$INSPECT_WAIT_SECONDS"

  if page_has_quota; then
    echo "Detected Search Console quota limit." >&2
    return 2
  fi

  click_js="
(function(){
  var allEls=document.querySelectorAll('span,button,div[role=button],a,material-button');
  for(var i=0;i<allEls.length;i++){
    var text=(allEls[i].textContent||'').replace(/\\s+/g,' ').trim();
    var lower=text.toLowerCase();
    if(lower==='request indexing' || text==='请求编入索引'){allEls[i].click();return 'clicked';}
  }
  var xpath=\"//span[contains(translate(normalize-space(text()), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'request indexing')] | //button[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'request indexing')] | //div[contains(normalize-space(text()), '请求编入索引')] | //button[contains(normalize-space(.), '请求编入索引')]\";
  var snapshot=document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  for(var j=0;j<snapshot.snapshotLength;j++){
    var el=snapshot.snapshotItem(j);
    if(el && el.offsetParent!==null){el.click();return 'clicked';}
  }
  return 'not_found';
})();"

  click_result=$(run_js "$click_js" 2>&1)
  if ! printf '%s' "$click_result" | grep -q 'clicked'; then
    echo "Request indexing button was not found." >&2
    return 1
  fi

  sleep "$POST_CLICK_WAIT_SECONDS"
  wait_for_request_result
  result=$?
  if [ "$result" -ne 0 ]; then
    return "$result"
  fi

  dismiss_success_dialog
  sleep "$POST_MODAL_WAIT_SECONDS"

  if page_has_quota; then
    echo "Detected quota after submit click." >&2
    return 2
  fi

  return 0
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --latest-daily)
        ADD_LATEST_DAILY=1
        shift
        ;;
      --latest-weekly)
        ADD_LATEST_WEEKLY=1
        shift
        ;;
      --daily-date)
        if [ $# -lt 2 ]; then
          echo "--daily-date requires YYYY-MM-DD" >&2
          exit 1
        fi
        DAILY_DATE="$2"
        shift 2
        ;;
      --weekly-issue)
        if [ $# -lt 2 ]; then
          echo "--weekly-issue requires an issue number" >&2
          exit 1
        fi
        WEEKLY_ISSUE="$2"
        shift 2
        ;;
      --url)
        if [ $# -lt 2 ]; then
          echo "--url requires a URL" >&2
          exit 1
        fi
        add_target "$2"
        shift 2
        ;;
      --expect-url)
        if [ $# -lt 2 ]; then
          echo "--expect-url requires a URL" >&2
          exit 1
        fi
        EXPECT_URL="$2"
        shift 2
        ;;
      --force)
        FORCE=1
        shift
        ;;
      --skip-live-check)
        SKIP_LIVE_CHECK=1
        shift
        ;;
      --max-urls)
        if [ $# -lt 2 ]; then
          echo "--max-urls requires a number" >&2
          exit 1
        fi
        MAX_URLS="$2"
        shift 2
        ;;
      --artifact-dir)
        if [ $# -lt 2 ]; then
          echo "--artifact-dir requires a directory" >&2
          exit 1
        fi
        GSC_ARTIFACT_DIR="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $1" >&2
        usage
        exit 1
        ;;
    esac
  done
}

collect_targets() {
  local url

  if [ "$ADD_LATEST_DAILY" -eq 1 ]; then
    while IFS= read -r url; do
      add_target "$url"
    done < <(latest_daily_urls)
  fi

  if [ -n "$DAILY_DATE" ]; then
    if ! printf '%s' "$DAILY_DATE" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
      echo "--daily-date must be YYYY-MM-DD: $DAILY_DATE" >&2
      exit 1
    fi
    while IFS= read -r url; do
      add_target "$url"
    done < <(daily_date_urls "$DAILY_DATE")
  fi

  if [ "$ADD_LATEST_WEEKLY" -eq 1 ]; then
    add_target "$(latest_weekly_url)"
  fi

  if [ -n "$WEEKLY_ISSUE" ]; then
    if ! printf '%s' "$WEEKLY_ISSUE" | grep -Eq '^[0-9]+$'; then
      echo "--weekly-issue must be a number: $WEEKLY_ISSUE" >&2
      exit 1
    fi
    add_target "$(weekly_issue_url "$WEEKLY_ISSUE")"
  fi

  dedupe_targets
}

validate_targets() {
  local url count

  count="${#TARGET_URLS[@]}"
  if [ "$count" -eq 0 ]; then
    echo "No GSC target URLs were selected." >&2
    usage >&2
    exit 1
  fi

  if ! printf '%s' "$MAX_URLS" | grep -Eq '^[0-9]+$'; then
    echo "--max-urls must be numeric: $MAX_URLS" >&2
    exit 1
  fi
  if [ "$count" -gt "$MAX_URLS" ]; then
    echo "Refusing to submit $count URLs in one run; max is $MAX_URLS." >&2
    echo "Use --max-urls to raise the cap intentionally." >&2
    exit 1
  fi

  if [ -n "$EXPECT_URL" ]; then
    EXPECT_URL="$(normalize_url "$EXPECT_URL")"
    if [ "$count" -ne 1 ]; then
      echo "--expect-url can only be used with exactly one target URL." >&2
      exit 1
    fi
    if [ "${TARGET_URLS[0]}" != "$EXPECT_URL" ]; then
      echo "Target URL does not match --expect-url." >&2
      echo "target: ${TARGET_URLS[0]}" >&2
      echo "expect: $EXPECT_URL" >&2
      append_history "stopped_mismatch" "${TARGET_URLS[0]}" "target mismatch with --expect-url"
      exit 2
    fi
  fi

  for url in "${TARGET_URLS[@]}"; do
    validate_detail_url "$url" || exit 1
  done
}

print_summary() {
  local mode url
  if [ "$DRY_RUN" -eq 1 ]; then
    mode="dry-run"
  else
    mode="submit"
  fi

  echo "=========================================="
  echo "  VentureDex GSC Direct Submit"
  echo "  ${RUN_TS}"
  echo "  Mode: ${mode}"
  echo "  History: ${HISTORY_FILE}"
  echo "  Artifacts: ${GSC_ARTIFACT_DIR}"
  echo "  Resource: ${GSC_RESOURCE_ID}"
  echo "  Targets:"
  for url in "${TARGET_URLS[@]}"; do
    echo "    - ${url}"
  done
  echo "=========================================="
}

precheck_targets() {
  local url
  for url in "${TARGET_URLS[@]}"; do
    if [ "$FORCE" -ne 1 ] && target_already_requested "$url"; then
      echo "Already requested, skipping unless --force is set: $url"
      continue
    fi
    if ! check_live_url "$url"; then
      echo "Live URL check failed: $url" >&2
      append_history "live_check_failed" "$url" "target URL did not return a successful response"
      exit 1
    fi
    if [ "$DRY_RUN" -eq 1 ]; then
      append_history "dry_run" "$url" "preview only"
    fi
  done
}

all_targets_already_requested() {
  local url
  if [ "$FORCE" -eq 1 ]; then
    return 1
  fi
  for url in "${TARGET_URLS[@]}"; do
    if ! target_already_requested "$url"; then
      return 1
    fi
  done
  return 0
}

submit_targets() {
  local inspect_url url result submitted_count=0 skipped_count=0

  require_deps
  ensure_bb_browser_connected || exit 1
  trap cleanup_browser_tab EXIT INT TERM

  inspect_url="https://search.google.com/search-console/inspect?resource_id=${GSC_RESOURCE_ID}&hl=${GSC_LANG}"
  open_gsc_page "$inspect_url"
  sleep "$NAV_WAIT_SECONDS"

  for url in "${TARGET_URLS[@]}"; do
    if [ "$FORCE" -ne 1 ] && target_already_requested "$url"; then
      echo "Already requested, skipping: $url"
      skipped_count=$((skipped_count + 1))
      continue
    fi

    if ! check_live_url "$url"; then
      echo "Live URL check failed: $url" >&2
      append_history "live_check_failed" "$url" "target URL did not return a successful response"
      write_gsc_artifact "live_check_failed" "$url" "target URL did not return a successful response"
      return 1
    fi

    echo "Submitting: $url"
    submit_single_url "$url"
    result=$?

    case "$result" in
      0)
        echo "Requested indexing: $url"
        append_history "requested" "$url" "indexing requested"
        submitted_count=$((submitted_count + 1))
        ;;
      1)
        echo "Request button not found; manual confirmation may be required: $url" >&2
        append_history "retry_pending" "$url" "request button not found"
        write_gsc_artifact "retry_pending" "$url" "request button not found"
        return 1
        ;;
      2)
        echo "Quota detected; stopping remaining submissions." >&2
        append_history "quota_exceeded" "$url" "quota detected"
        write_gsc_artifact "quota_exceeded" "$url" "quota detected"
        return 2
        ;;
      4)
        echo "Search Console reported a request failure." >&2
        append_history "retry_pending" "$url" "request failure detected"
        write_gsc_artifact "retry_pending" "$url" "request failure detected"
        return 1
        ;;
      *)
        echo "Submit confirmation was not detected: $url" >&2
        append_history "retry_pending" "$url" "submit confirmation not detected"
        write_gsc_artifact "retry_pending" "$url" "submit confirmation not detected"
        return 3
        ;;
    esac
  done

  echo "GSC submit complete: requested=${submitted_count}, skipped=${skipped_count}"
}

main() {
  parse_args "$@"
  collect_targets
  validate_targets
  print_summary
  precheck_targets

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "Dry-run complete; no indexing request was sent."
    exit 0
  fi

  if all_targets_already_requested; then
    echo "All selected targets already have requested rows in ${HISTORY_FILE}; no browser submission needed."
    exit 0
  fi

  submit_targets
}

main "$@"
