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

CODEX_HOME_DEFAULT="${CODEX_HOME:-${HOME}/.codex}"
CENTRAL_HISTORY_FILE="${CODEX_HOME_DEFAULT}/automations/venturedex-daily-curator/gsc_submission_history.tsv"
LEGACY_HISTORY_FILE="${GSC_LEGACY_HISTORY_FILE:-${ROOT_DIR}/.gsc_submission_history.tsv}"
HISTORY_FILE="${HISTORY_FILE:-${GSC_HISTORY_FILE:-$CENTRAL_HISTORY_FILE}}"
GSC_ARTIFACT_DIR="${GSC_ARTIFACT_DIR:-${CODEX_HOME_DEFAULT}/automations/venturedex-daily-curator/gsc-artifacts}"
BB_BROWSER_CMD="${BB_BROWSER_CMD:-bb-browser}"
COMET_APP="${COMET_APP:-/Applications/Comet.app/Contents/MacOS/Comet}"
COMET_LOG_FILE="${COMET_LOG_FILE:-/tmp/venturedex-gsc-comet.log}"
BB_BROWSER_DAEMON_LOG_FILE="${BB_BROWSER_DAEMON_LOG_FILE:-/tmp/venturedex-gsc-bb-browser-daemon.log}"
COMET_CDP_HOST="${COMET_CDP_HOST:-127.0.0.1}"
COMET_CDP_PORT="${COMET_CDP_PORT:-19825}"

DRY_RUN=0
ADD_LATEST_DAILY=0
ADD_LATEST_WEEKLY=0
ADD_RETRY_PENDING=0
MIGRATE_LEGACY_HISTORY=0
DAILY_DATE=""
WEEKLY_ISSUE=""
EXPECT_URL=""
FORCE=0
SKIP_LIVE_CHECK=0
BB_BROWSER_TAB_OPENED=0
BB_BROWSER_TAB_ID=""
HISTORY_LOCK_PATH=""
HISTORY_LOCK_OWNER_CANDIDATE=""
HISTORY_LOCK_TOKEN=""
HISTORY_LOCK_HELD=0
HISTORY_LOCK_ACQUIRING=0
TARGET_URLS=()

usage() {
  cat <<USAGE
VentureDex GSC direct submitter

Usage:
  bash scripts/submit-gsc-direct.sh --dry-run --latest-daily
  bash scripts/submit-gsc-direct.sh --latest-daily
  bash scripts/submit-gsc-direct.sh --dry-run --latest-weekly
  bash scripts/submit-gsc-direct.sh --latest-weekly
  bash scripts/submit-gsc-direct.sh --dry-run --retry-pending --max-urls 10
  bash scripts/submit-gsc-direct.sh --url <url> [--expect-url <url>]
  bash scripts/submit-gsc-direct.sh --migrate-legacy-history

Options:
  --dry-run             Preview targets and write dry-run ledger rows only.
  --latest-daily        Submit startup detail pages from the newest publish date.
  --daily-date <date>   Submit startup detail pages published on YYYY-MM-DD.
  --latest-weekly       Submit the newest published weekly issue detail page.
  --weekly-issue <N>    Submit one published weekly issue detail page.
  --retry-pending       Retry canonical detail URLs whose latest submit state is retry_pending.
  --url <url>           Submit one detail URL; may be repeated.
  --expect-url <url>    Safety check for single-URL submissions.
  --migrate-legacy-history
                        Merge unique rows from the old repo ledger into the central ledger.
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
  local history_dir
  history_dir="$(dirname "$HISTORY_FILE")"
  if ! mkdir -p "$history_dir"; then
    echo "Could not create GSC ledger directory: ${history_dir}" >&2
    return 1
  fi
  if [ ! -f "$HISTORY_FILE" ]; then
    if ! printf 'timestamp\tstatus\turl\tmessage\n' > "$HISTORY_FILE"; then
      echo "Could not create authoritative GSC ledger: ${HISTORY_FILE}" >&2
      return 1
    fi
  fi
  python3 - "$HISTORY_FILE" <<'PY'
import csv
import sys
from pathlib import Path

history = Path(sys.argv[1])
expected = ["timestamp", "status", "url", "message"]
with history.open(newline="", encoding="utf-8") as handle:
    reader = csv.reader(handle, delimiter="\t", strict=True)
    try:
        header = next(reader)
    except StopIteration:
        raise SystemExit(f"Invalid GSC ledger header in {history}: file is empty")
    if header != expected:
        raise SystemExit(f"Invalid GSC ledger header in {history}")
    for line_number, row in enumerate(reader, start=2):
        if not row or (len(row) == 1 and not row[0]):
            continue
        if len(row) != 4:
            raise SystemExit(
                f"Invalid GSC ledger row in {history}:{line_number}: expected 4 columns"
            )
        if not row[0].strip() or not row[1].strip() or not row[2].strip():
            raise SystemExit(
                f"Invalid GSC ledger row in {history}:{line_number}: "
                "timestamp, status, and url are required"
            )
PY
}

history_lock_token_matches() {
  local candidate="$1"
  local line

  [ -f "$candidate" ] || return 1
  while IFS= read -r line; do
    if [ "$line" = "token=${HISTORY_LOCK_TOKEN}" ]; then
      return 0
    fi
  done < "$candidate"
  return 1
}

release_history_lock() {
  local owns_lock=0

  if [ "$HISTORY_LOCK_ACQUIRING" -eq 1 ] \
    && [ -f "$HISTORY_LOCK_OWNER_CANDIDATE" ] \
    && [ -f "$HISTORY_LOCK_PATH" ] \
    && [ "$HISTORY_LOCK_OWNER_CANDIDATE" -ef "$HISTORY_LOCK_PATH" ]; then
    owns_lock=1
  elif [ "$HISTORY_LOCK_HELD" -eq 1 ] \
    && history_lock_token_matches "$HISTORY_LOCK_PATH"; then
    owns_lock=1
  fi

  if [ "$owns_lock" -eq 1 ]; then
    if ! rm -f "$HISTORY_LOCK_PATH"; then
      echo "Could not remove owned GSC history lock: ${HISTORY_LOCK_PATH}" >&2
    fi
  elif { [ "$HISTORY_LOCK_HELD" -eq 1 ] || [ "$HISTORY_LOCK_ACQUIRING" -eq 1 ]; } \
    && [ -e "$HISTORY_LOCK_PATH" ]; then
    echo "Refusing to remove GSC history lock with unknown ownership: ${HISTORY_LOCK_PATH}" >&2
  fi

  if [ -n "$HISTORY_LOCK_OWNER_CANDIDATE" ]; then
    rm -f "$HISTORY_LOCK_OWNER_CANDIDATE" \
      || echo "Could not remove GSC lock owner candidate: ${HISTORY_LOCK_OWNER_CANDIDATE}" >&2
  fi

  HISTORY_LOCK_HELD=0
  HISTORY_LOCK_ACQUIRING=0
  HISTORY_LOCK_OWNER_CANDIDATE=""
}

print_history_lock_owner() {
  local line

  echo "BLOCKED: authoritative GSC history lock is already held." >&2
  echo "Lock path: ${HISTORY_LOCK_PATH}" >&2
  if [ -f "$HISTORY_LOCK_PATH" ] && [ -r "$HISTORY_LOCK_PATH" ]; then
    echo "Lock owner:" >&2
    while IFS= read -r line; do
      printf '  %s\n' "$line" >&2
    done < "$HISTORY_LOCK_PATH"
  else
    echo "Lock owner metadata is unavailable; refusing to remove or replace the lock." >&2
  fi
}

acquire_history_lock() {
  local canonical_history lock_parent

  if ! canonical_history="$(python3 - "$HISTORY_FILE" <<'PY'
import sys
from pathlib import Path

print(Path(sys.argv[1]).expanduser().resolve(strict=False))
PY
)"; then
    echo "Could not canonicalize authoritative GSC ledger path: ${HISTORY_FILE}" >&2
    return 1
  fi

  HISTORY_LOCK_PATH="${canonical_history}.lock"
  lock_parent="$(dirname "$HISTORY_LOCK_PATH")"
  if ! mkdir -p "$lock_parent"; then
    echo "Could not create GSC history lock directory: ${lock_parent}" >&2
    return 1
  fi

  HISTORY_LOCK_TOKEN="$$:$(date '+%s'):${RANDOM}"
  HISTORY_LOCK_OWNER_CANDIDATE="${HISTORY_LOCK_PATH}.owner.$$.$RANDOM"
  if ! (
    umask 077
    {
      printf 'token=%s\n' "$HISTORY_LOCK_TOKEN"
      printf 'pid=%s\n' "$$"
      printf 'started_at=%s\n' "$RUN_TS"
      printf 'history_file=%s\n' "$canonical_history"
      printf 'working_directory=%s\n' "$ROOT_DIR"
    } > "$HISTORY_LOCK_OWNER_CANDIDATE"
  ); then
    echo "Could not write GSC history lock owner metadata: ${HISTORY_LOCK_OWNER_CANDIDATE}" >&2
    rm -f "$HISTORY_LOCK_OWNER_CANDIDATE" || true
    HISTORY_LOCK_OWNER_CANDIDATE=""
    return 1
  fi

  HISTORY_LOCK_ACQUIRING=1
  if ! ln "$HISTORY_LOCK_OWNER_CANDIDATE" "$HISTORY_LOCK_PATH" 2>/dev/null; then
    HISTORY_LOCK_ACQUIRING=0
    rm -f "$HISTORY_LOCK_OWNER_CANDIDATE" || true
    HISTORY_LOCK_OWNER_CANDIDATE=""
    if [ -e "$HISTORY_LOCK_PATH" ] || [ -L "$HISTORY_LOCK_PATH" ]; then
      print_history_lock_owner
    else
      echo "Could not atomically acquire GSC history lock: ${HISTORY_LOCK_PATH}" >&2
    fi
    return 1
  fi

  HISTORY_LOCK_HELD=1
  HISTORY_LOCK_ACQUIRING=0
  rm -f "$HISTORY_LOCK_OWNER_CANDIDATE" \
    || echo "Could not remove linked GSC lock owner candidate: ${HISTORY_LOCK_OWNER_CANDIDATE}" >&2
  HISTORY_LOCK_OWNER_CANDIDATE=""
  return 0
}

diagnose_history_layout() {
  if [ "$HISTORY_FILE" != "$CENTRAL_HISTORY_FILE" ]; then
    echo "GSC history override active: ${HISTORY_FILE}" >&2
    return 0
  fi

  if [ -f "$LEGACY_HISTORY_FILE" ] && [ "$LEGACY_HISTORY_FILE" != "$HISTORY_FILE" ]; then
    if awk '
      NR == FNR { central[$0] = 1; next }
      FNR == 1 || $0 == "" { next }
      !($0 in central) { missing = 1 }
      END { exit(missing ? 0 : 1) }
    ' "$HISTORY_FILE" "$LEGACY_HISTORY_FILE"; then
      echo "Legacy repo GSC ledger detected at ${LEGACY_HISTORY_FILE}." >&2
      echo "The central ledger is authoritative: ${HISTORY_FILE}" >&2
      echo "Run --migrate-legacy-history to import unique legacy rows safely." >&2
    fi
  fi
}

migrate_legacy_history() {
  if [ "$HISTORY_FILE" != "$CENTRAL_HISTORY_FILE" ]; then
    echo "--migrate-legacy-history requires the central default HISTORY_FILE." >&2
    return 1
  fi
  if [ "$LEGACY_HISTORY_FILE" = "$HISTORY_FILE" ]; then
    echo "Legacy and central GSC history paths resolve to the same file; nothing to migrate."
    return 0
  fi
  if [ ! -f "$LEGACY_HISTORY_FILE" ]; then
    echo "No legacy GSC history file found: ${LEGACY_HISTORY_FILE}"
    return 0
  fi

  python3 - "$HISTORY_FILE" "$LEGACY_HISTORY_FILE" <<'PY'
import csv
import os
import sys
import tempfile
from pathlib import Path

central = Path(sys.argv[1])
legacy = Path(sys.argv[2])
fields = ("timestamp", "status", "url", "message")


def read_rows(path: Path) -> list[tuple[str, str, str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle, delimiter="\t", strict=True)
        try:
            header = next(reader)
        except StopIteration:
            raise SystemExit(f"Invalid GSC ledger header in {path}: file is empty")
        if header != list(fields):
            raise SystemExit(f"Invalid GSC ledger header in {path}")
        rows = []
        try:
            for row in reader:
                line_number = reader.line_num
                if not row or (len(row) == 1 and not row[0]):
                    continue
                if len(row) != len(fields):
                    raise SystemExit(
                        f"Invalid GSC ledger row in {path}:{line_number}: "
                        f"expected 4 columns; found {len(row)}"
                    )
                if (
                    not row[0].strip()
                    or not row[1].strip()
                    or not row[2].strip()
                ):
                    raise SystemExit(
                        f"Invalid GSC ledger row in {path}:{line_number}: "
                        "timestamp, status, and url are required"
                    )
                rows.append(tuple(row))
        except csv.Error as error:
            raise SystemExit(
                f"Invalid GSC ledger row in {path}:{reader.line_num}: {error}"
            ) from error
        return rows


central.parent.mkdir(parents=True, exist_ok=True)
central_rows = read_rows(central)
legacy_rows = read_rows(legacy)
seen = set(central_rows)
merged = [(row, 1, index) for index, row in enumerate(central_rows)]
imported = 0
for index, row in enumerate(legacy_rows):
    if row in seen:
        continue
    seen.add(row)
    merged.append((row, 0, index))
    imported += 1

# Preserve each ledger's line order. If timestamps tie, existing central rows
# come after imported rows and therefore remain authoritative.
merged.sort(key=lambda item: (item[0][0], item[1], item[2]))
central_rows = [row for row, _source_priority, _index in merged]
fd, temporary_name = tempfile.mkstemp(
    prefix=".gsc-history-",
    suffix=".tsv",
    dir=central.parent,
    text=True,
)
try:
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
        writer.writerow(fields)
        writer.writerows(central_rows)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary_name, central)
finally:
    if os.path.exists(temporary_name):
        os.unlink(temporary_name)

suffix = "" if imported == 1 else "s"
print(
    f"History migration: imported {imported} unique legacy row{suffix}; "
    f"authoritative ledger: {central}"
)
PY
}

append_history() {
  local status="$1"
  local url="$2"
  local message="$3"
  local sanitized_message

  if ! ensure_history_file; then
    echo "Could not validate authoritative GSC ledger before appending status=${status} url=${url}" >&2
    return 1
  fi
  sanitized_message="$(printf '%s' "$message" | tr '\t\r\n' '   ')"
  if ! printf '%s\t%s\t%s\t%s\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" \
    "$status" \
    "$url" \
    "$sanitized_message" >> "$HISTORY_FILE"; then
    echo "Could not persist authoritative GSC ledger row for status=${status} url=${url}" >&2
    return 1
  fi
  return 0
}

append_history_or_block() {
  local status="$1"
  local url="$2"
  local message="$3"

  if append_history "$status" "$url" "$message"; then
    return 0
  fi

  echo "BLOCKED: authoritative GSC ledger persistence failed for status=${status} url=${url}" >&2
  echo "Do not retry automatically or report this URL complete; reconcile Search Console state and the ledger manually." >&2
  if [ "$status" = "requested" ]; then
    write_gsc_artifact \
      "ledger_write_failed_after_request" \
      "$url" \
      "Search Console may have accepted the request, but the authoritative ledger row could not be persisted; manual reconciliation required and automatic retry disabled." \
      || echo "Could not persist the fallback GSC reconciliation artifact." >&2
  fi
  return 1
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

unresolved_reconciliation_artifact() {
  local url="$1"
  local safe_url candidate

  [ -d "$GSC_ARTIFACT_DIR" ] || return 1
  safe_url="$(sanitize_artifact_name "$url")" || return 1
  for candidate in \
    "$GSC_ARTIFACT_DIR"/*-ledger_write_failed_after_request-"$safe_url".txt; do
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

require_no_unresolved_reconciliation() {
  local url="$1"
  local artifact

  if artifact="$(unresolved_reconciliation_artifact "$url")"; then
    echo "BLOCKED: unresolved GSC reconciliation artifact exists for ${url}: ${artifact}" >&2
    echo "Verify Search Console state and reconcile the authoritative ledger before removing the artifact; automatic retry is disabled." >&2
    return 1
  fi
  return 0
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
  if ! mkdir -p "$GSC_ARTIFACT_DIR"; then
    echo "Could not create GSC artifact directory: ${GSC_ARTIFACT_DIR}" >&2
    return 1
  fi
  file="${GSC_ARTIFACT_DIR}/$(date '+%Y%m%d-%H%M%S')-${status}-${safe_url}.txt"

  if ! {
    printf 'timestamp: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    printf 'status: %s\n' "$status"
    printf 'url: %s\n' "$url"
    printf 'message: %s\n' "$message"
    printf 'page_state: %s\n' "${page_state:-unknown}"
    printf '\n--- page text ---\n'
    printf '%s\n' "$page_text"
  } > "$file"; then
    echo "Could not write GSC diagnostic artifact: ${file}" >&2
    return 1
  fi

  echo "GSC diagnostic artifact: $file" >&2
  return 0
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
  if ! printf '%s' "$url" | grep -Eq '^https://venturedex\.co/(startups/([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])|weekly/[1-9][0-9]*)$'; then
    echo "Invalid VentureDex detail URL: $url" >&2
    return 1
  fi
  return 0
}

dedupe_targets() {
  local seen_file unique_file url
  seen_file="$(mktemp)"
  unique_file="$(mktemp)"

  for url in ${TARGET_URLS[@]+"${TARGET_URLS[@]}"}; do
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
  awk -F '\t' -v target="$url" '
    $3 == target && ($2 == "requested" || $2 == "retry_pending") { latest = $2 }
    END { exit(latest == "requested" ? 0 : 1) }
  ' "$HISTORY_FILE"
}

retry_pending_urls() {
  python3 - "$HISTORY_FILE" <<'PY'
import csv
import re
import sys
from pathlib import Path

history = Path(sys.argv[1])
canonical = re.compile(
    r"^https://venturedex\.co/(?:startups/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|weekly/[1-9][0-9]*)$"
)
latest = {}

with history.open(newline="", encoding="utf-8") as handle:
    reader = csv.DictReader(handle, delimiter="\t")
    expected = ["timestamp", "status", "url", "message"]
    if reader.fieldnames != expected:
        raise SystemExit(f"Invalid GSC ledger header in {history}")
    for sequence, row in enumerate(reader):
        status = str(row.get("status") or "").strip()
        if status not in {"requested", "retry_pending"}:
            continue
        url = str(row.get("url") or "").strip().rstrip("/")
        if not canonical.fullmatch(url):
            continue
        latest[url] = (status, str(row.get("timestamp") or ""), sequence)

pending = [
    (timestamp, sequence, url)
    for url, (status, timestamp, sequence) in latest.items()
    if status == "retry_pending"
]
for _timestamp, _sequence, url in sorted(pending):
    print(url)
PY
}

validate_max_urls_value() {
  if ! printf '%s' "$MAX_URLS" | grep -Eq '^[1-9][0-9]*$'; then
    echo "--max-urls must be a positive integer: $MAX_URLS" >&2
    exit 1
  fi
}

target_is_selected() {
  local candidate="$1"
  local selected
  for selected in ${TARGET_URLS[@]+"${TARGET_URLS[@]}"}; do
    if [ "$selected" = "$candidate" ]; then
      return 0
    fi
  done
  return 1
}

target_count() {
  local selected
  local count=0
  for selected in ${TARGET_URLS[@]+"${TARGET_URLS[@]}"}; do
    count=$((count + 1))
  done
  printf '%s\n' "$count"
}

has_targets() {
  [ "$(target_count)" -gt 0 ]
}

append_discovered_targets() {
  local output url
  if ! output="$("$@")"; then
    echo "GSC target discovery failed: $*" >&2
    return 1
  fi
  while IFS= read -r url; do
    [ -n "$url" ] && add_target "$url"
  done <<< "$output"
}

collect_retry_pending_targets() {
  local pending_output url
  local selected_count
  local capacity=0
  local added=0
  local remaining=0

  if ! pending_output="$(retry_pending_urls)"; then
    echo "Could not read the GSC retry backlog from ${HISTORY_FILE}." >&2
    return 1
  fi

  selected_count="$(target_count)"

  if [ "$selected_count" -lt "$MAX_URLS" ]; then
    capacity=$((MAX_URLS - selected_count))
  fi

  while IFS= read -r url; do
    url="$(normalize_url "$url")"
    [ -n "$url" ] || continue
    if target_is_selected "$url"; then
      continue
    fi
    if [ "$added" -lt "$capacity" ]; then
      add_target "$url"
      added=$((added + 1))
    else
      remaining=$((remaining + 1))
    fi
  done <<< "$pending_output"

  echo "GSC retry backlog: selected=${added}, remaining=${remaining}, max_urls=${MAX_URLS}"
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

cleanup_run() {
  local exit_code=$?

  trap - EXIT HUP INT QUIT TERM
  cleanup_browser_tab || true
  release_history_lock || true
  exit "$exit_code"
}

install_cleanup_traps() {
  trap cleanup_run EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 131' QUIT
  trap 'exit 143' TERM
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

page_matches_inspected_url() {
  local url="$1"
  local escaped_url input_match page_text
  escaped_url=${url//\\/\\\\}
  escaped_url=${escaped_url//\'/\\\'}
  input_match="$(run_js "
(function(){
  var expected='${escaped_url}';
  var input = document.querySelector('input[aria-label*=\"Inspect any URL\"]') ||
              document.querySelector('input[aria-label*=\"检查\"]') ||
              document.querySelector('input.Ax4B8') ||
              document.querySelector('input[type=\"text\"]');
  return input && input.value.trim()===expected
    ? 'input_target_match'
    : 'input_target_mismatch';
})();" 2>/dev/null || true)"
  if ! printf '%s' "$input_match" | grep -q 'input_target_match'; then
    return 1
  fi
  page_text="$(capture_page_text)"
  printf '%s' "$page_text" | python3 -c '
import re
import sys
from urllib.parse import urlsplit, urlunsplit

expected = sys.argv[1]
visible_text = sys.stdin.read()

def normalize(raw):
    raw = raw.strip().strip("\"'"'"'()[]{}<>,.;:!?")
    try:
        parsed = urlsplit(raw)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    path = parsed.path.rstrip("/") or "/"
    return urlunsplit(
        (parsed.scheme.lower(), parsed.netloc.lower(), path, parsed.query, "")
    )

normalized_expected = normalize(expected)
candidates = re.findall(r"https?://[^\s<>\"'"'"'()]+", visible_text)
raise SystemExit(
    0
    if normalized_expected
    and any(normalize(candidate) == normalized_expected for candidate in candidates)
    else 1
)
' "$url"
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

  if ! page_matches_inspected_url "$url"; then
    echo "Search Console did not render the exact inspected URL; refusing to click: $url" >&2
    return 5
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

  if ! page_matches_inspected_url "$url"; then
    echo "Search Console success state is not associated with the exact inspected URL: $url" >&2
    return 5
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
      --retry-pending)
        ADD_RETRY_PENDING=1
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
      --migrate-legacy-history)
        MIGRATE_LEGACY_HISTORY=1
        shift
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
  if [ "$ADD_LATEST_DAILY" -eq 1 ]; then
    append_discovered_targets latest_daily_urls || return 1
  fi

  if [ -n "$DAILY_DATE" ]; then
    if ! printf '%s' "$DAILY_DATE" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
      echo "--daily-date must be YYYY-MM-DD: $DAILY_DATE" >&2
      exit 1
    fi
    append_discovered_targets daily_date_urls "$DAILY_DATE" || return 1
  fi

  if [ "$ADD_LATEST_WEEKLY" -eq 1 ]; then
    append_discovered_targets latest_weekly_url || return 1
  fi

  if [ -n "$WEEKLY_ISSUE" ]; then
    if ! printf '%s' "$WEEKLY_ISSUE" | grep -Eq '^[0-9]+$'; then
      echo "--weekly-issue must be a number: $WEEKLY_ISSUE" >&2
      exit 1
    fi
    append_discovered_targets weekly_issue_url "$WEEKLY_ISSUE" || return 1
  fi

  dedupe_targets

  if [ "$ADD_RETRY_PENDING" -eq 1 ]; then
    collect_retry_pending_targets || return 1
    dedupe_targets
  fi
}

validate_targets() {
  local url count

  count="$(target_count)"
  if [ "$count" -eq 0 ]; then
    echo "No GSC target URLs were selected." >&2
    usage >&2
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
      append_history_or_block "stopped_mismatch" "${TARGET_URLS[0]}" "target mismatch with --expect-url" || exit 1
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
    require_no_unresolved_reconciliation "$url" || exit 1
    if ! check_live_url "$url"; then
      echo "Live URL check failed: $url" >&2
      append_history_or_block "live_check_failed" "$url" "target URL did not return a successful response" || exit 1
      exit 1
    fi
    if [ "$DRY_RUN" -eq 1 ]; then
      append_history_or_block "dry_run" "$url" "preview only" || exit 1
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

  inspect_url="https://search.google.com/search-console/inspect?resource_id=${GSC_RESOURCE_ID}&hl=${GSC_LANG}"
  open_gsc_page "$inspect_url"
  sleep "$NAV_WAIT_SECONDS"

  for url in "${TARGET_URLS[@]}"; do
    if [ "$FORCE" -ne 1 ] && target_already_requested "$url"; then
      echo "Already requested, skipping: $url"
      skipped_count=$((skipped_count + 1))
      continue
    fi
    require_no_unresolved_reconciliation "$url" || return 1

    if ! check_live_url "$url"; then
      echo "Live URL check failed: $url" >&2
      append_history_or_block "live_check_failed" "$url" "target URL did not return a successful response" || return 1
      write_gsc_artifact "live_check_failed" "$url" "target URL did not return a successful response"
      return 1
    fi

    echo "Submitting: $url"
    submit_single_url "$url"
    result=$?

    case "$result" in
      0)
        append_history_or_block "requested" "$url" "indexing requested" || return 1
        echo "Requested indexing: $url"
        submitted_count=$((submitted_count + 1))
        ;;
      1)
        echo "Request button not found; manual confirmation may be required: $url" >&2
        append_history_or_block "retry_pending" "$url" "request button not found" || return 1
        write_gsc_artifact "retry_pending" "$url" "request button not found"
        return 1
        ;;
      2)
        echo "Quota detected; stopping remaining submissions." >&2
        append_history_or_block "quota_exceeded" "$url" "quota detected" || return 1
        write_gsc_artifact "quota_exceeded" "$url" "quota detected"
        return 2
        ;;
      4)
        echo "Search Console reported a request failure." >&2
        append_history_or_block "retry_pending" "$url" "request failure detected" || return 1
        write_gsc_artifact "retry_pending" "$url" "request failure detected"
        return 1
        ;;
      5)
        echo "Search Console inspected URL mismatch; refusing requested status: $url" >&2
        append_history_or_block "retry_pending" "$url" "inspected URL mismatch" || return 1
        write_gsc_artifact "retry_pending" "$url" "inspected URL mismatch"
        return 1
        ;;
      *)
        echo "Submit confirmation was not detected: $url" >&2
        append_history_or_block "retry_pending" "$url" "submit confirmation not detected" || return 1
        write_gsc_artifact "retry_pending" "$url" "submit confirmation not detected"
        return 3
        ;;
    esac
  done

  echo "GSC submit complete: requested=${submitted_count}, skipped=${skipped_count}"
}

main() {
  parse_args "$@"
  validate_max_urls_value
  install_cleanup_traps
  acquire_history_lock || exit 1
  ensure_history_file || exit 1
  diagnose_history_layout

  if [ "$MIGRATE_LEGACY_HISTORY" -eq 1 ]; then
    migrate_legacy_history || exit 1
  fi

  if [ "$MIGRATE_LEGACY_HISTORY" -eq 1 ] \
    && [ "$ADD_LATEST_DAILY" -eq 0 ] \
    && [ "$ADD_LATEST_WEEKLY" -eq 0 ] \
    && [ "$ADD_RETRY_PENDING" -eq 0 ] \
    && [ -z "$DAILY_DATE" ] \
    && [ -z "$WEEKLY_ISSUE" ] \
    && [ -z "$EXPECT_URL" ]; then
    if ! has_targets; then
      exit 0
    fi
  fi

  collect_targets || exit 1

  if [ "$ADD_RETRY_PENDING" -eq 1 ] \
    && [ "$ADD_LATEST_DAILY" -eq 0 ] \
    && [ "$ADD_LATEST_WEEKLY" -eq 0 ] \
    && [ -z "$DAILY_DATE" ] \
    && [ -z "$WEEKLY_ISSUE" ] \
    && [ -z "$EXPECT_URL" ]; then
    if ! has_targets; then
      echo "No unresolved GSC retry_pending targets remain."
      exit 0
    fi
  fi

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
