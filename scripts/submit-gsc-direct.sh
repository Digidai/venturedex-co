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
GSC_BROWSER_RUNTIME_FILE="${SCRIPT_DIR}/gsc-browser-runtime.js"
GSC_BROWSER_RUNTIME=""

SITE_BASE_URL="${SITE_BASE_URL:-https://venturedex.co}"
GSC_RESOURCE_ID="${GSC_RESOURCE_ID:-sc-domain%3Aventuredex.co}"
GSC_LANG="${GSC_LANG:-zh-cn}"

# Search Console is a latency-sensitive SPA. These defaults are bounded waits,
# measured against the authenticated VentureDex property on 2026-08-11; callers
# may still shorten them explicitly in deterministic tests.
NAV_WAIT_SECONDS="${NAV_WAIT_SECONDS:-15}"
COMET_START_WAIT_SECONDS="${COMET_START_WAIT_SECONDS:-4}"
INSPECT_WAIT_SECONDS="${INSPECT_WAIT_SECONDS:-35}"
POST_CLICK_WAIT_SECONDS="${POST_CLICK_WAIT_SECONDS:-30}"
POST_MODAL_WAIT_SECONDS="${POST_MODAL_WAIT_SECONDS:-5}"
REQUEST_RESULT_WAIT_SECONDS="${REQUEST_RESULT_WAIT_SECONDS:-3}"
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
BB_BROWSER_HOME_DEFAULT="${BB_BROWSER_HOME:-${HOME}/.bb-browser}"
BB_BROWSER_DAEMON_STATE_FILE="${BB_BROWSER_DAEMON_STATE_FILE:-${BB_BROWSER_HOME_DEFAULT}/daemon.json}"
COMET_CDP_HOST="${COMET_CDP_HOST:-127.0.0.1}"
COMET_CDP_PORT="${COMET_CDP_PORT:-19825}"

DRY_RUN=0
ADD_LATEST_DAILY=0
ADD_LATEST_WEEKLY=0
ADD_RETRY_PENDING=0
MIGRATE_LEGACY_HISTORY=0
RECONCILE_PRE_CLICK_ARTIFACT=""
RECONCILE_POST_CLICK_ARTIFACT=""
DAILY_DATE=""
WEEKLY_ISSUE=""
EXPECT_URL=""
FORCE=0
SKIP_LIVE_CHECK=0
BB_BROWSER_TAB_OPENED=0
BB_BROWSER_TAB_ID=""
BB_BROWSER_CONNECTION_BLOCKER=""
HISTORY_LOCK_PATH=""
HISTORY_LOCK_OWNER_CANDIDATE=""
HISTORY_LOCK_TOKEN=""
HISTORY_LOCK_HELD=0
HISTORY_LOCK_ACQUIRING=0
HISTORY_FILE_IDENTITY=""
LAST_INSPECTION_ROUTE_ID=""
GSC_SURFACE_BLOCKER=""
GSC_SURFACE_OBSERVED=""
GSC_ARTIFACT_DIR_IDENTITY=""
RECONCILE_TARGET_URL=""
RECONCILE_ARTIFACT_BASENAME=""
RECONCILE_ARTIFACT_IDENTITY=""
RECONCILE_ARTIFACT_DIGEST=""
RECONCILE_ARTIFACT_CANONICAL=""
RECONCILE_ARTIFACT_DIR_IDENTITY=""
RECONCILE_RESOLVED_DIR_IDENTITY=""
RECONCILE_ARTIFACT_STATE=""
RECONCILE_ARTIFACT_STATUS=""
RECONCILE_TRANSACTION_MESSAGE=""
RECONCILE_LEDGER_SIZE=""
RECONCILE_LEDGER_DIGEST=""
REQUEST_INTENT_EXPECTED_STATUS=""
REQUEST_INTENT_EXPECTED_MESSAGE=""
REQUEST_INTENT_EXPECTED_LEDGER_SIZE=""
REQUEST_INTENT_EXPECTED_LEDGER_DIGEST=""
REQUEST_INTENT_ARTIFACT_BASENAME=""
REQUEST_INTENT_ARTIFACT_DIGEST=""
REQUEST_INTENT_ARTIFACT_IDENTITY=""
REQUEST_INTENT_ARTIFACT_DIR_IDENTITY=""
REQUEST_INTENT_RESOLVED_DIR_IDENTITY=""
REQUEST_INTENT_RECORDED=0
REQUEST_INTENT_LEDGER_SIZE=""
REQUEST_INTENT_LEDGER_DIGEST=""
REQUEST_INTENT_MESSAGE="request click intent persisted before browser action; completion unresolved until a terminal ledger row is recorded"
LAST_GSC_ARTIFACT_BASENAME=""
PARSED_LEDGER_STATUS=""
PARSED_LEDGER_MESSAGE=""
PARSED_LEDGER_SIZE=""
PARSED_LEDGER_DIGEST=""
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
  bash scripts/submit-gsc-direct.sh --reconcile-pre-click-retry <artifact>
  bash scripts/submit-gsc-direct.sh --reconcile-post-click-requested <artifact>
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
  --reconcile-pre-click-retry <artifact>
                        After manual verification proves no click occurred,
                        durably bind and archive the exact
                        pre_request_success_unverified artifact, then append
                        retry_pending while holding the authoritative ledger
                        lock. Post-click uncertainty is never eligible.
  --reconcile-post-click-requested <artifact>
                        Re-inspect the exact URL from a
                        post_request_confirmation_unknown artifact without
                        clicking Request indexing. Only an existing,
                        route-bound success_static state may archive the exact
                        blocker and append requested under the ledger lock.
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
  python3 - "$HISTORY_FILE" "$HISTORY_FILE_IDENTITY" <<'PY'
import os
import re
import stat
import sys
from pathlib import Path

history = Path(sys.argv[1])
expected_identity = sys.argv[2]
expected = "timestamp\tstatus\turl\tmessage"
canonical = re.compile(
    r"^https://venturedex\.co/(?:startups/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|weekly/[1-9][0-9]*)$"
)
timestamp_pattern = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$")
allowed_statuses = {
    "requested",
    "dry_run",
    "retry_pending",
    "stopped_mismatch",
    "live_check_failed",
    "quota_exceeded",
    "request_click_pending",
    "pre_request_success_unverified",
    "reconciliation_archive_pending",
    "post_request_target_unverified",
    "post_request_confirmation_unknown",
}


def create_ledger(path: Path) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags, 0o666)
    try:
        payload = (expected + "\n").encode("utf-8")
        offset = 0
        while offset < len(payload):
            offset += os.write(fd, payload[offset:])
        os.fsync(fd)
    finally:
        os.close(fd)
    directory_fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def read_regular_bytes(path: Path) -> bytes:
    flags = (
        os.O_RDONLY
        | getattr(os, "O_NONBLOCK", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    for _attempt in range(2):
        try:
            fd = os.open(path, flags)
        except FileNotFoundError:
            try:
                create_ledger(path)
            except FileExistsError:
                continue
            continue
        except OSError as error:
            raise SystemExit(
                f"Authoritative GSC ledger must be a readable regular, "
                f"non-symlink file: {path}: {error}"
            )
        try:
            opened_stat = os.fstat(fd)
            if not stat.S_ISREG(opened_stat.st_mode):
                raise SystemExit(
                    f"Authoritative GSC ledger must be a regular, "
                    f"non-symlink file: {path}"
                )
            if opened_stat.st_nlink != 1:
                raise SystemExit(
                    f"Authoritative GSC ledger must not have hard-link aliases: {path}"
                )
            opened_identity = f"{opened_stat.st_dev}:{opened_stat.st_ino}"
            if expected_identity and opened_identity != expected_identity:
                raise SystemExit(
                    f"Authoritative GSC ledger identity changed: {path}"
                )
            try:
                if path.resolve(strict=True) != path:
                    raise SystemExit(
                        f"Authoritative GSC ledger path no longer resolves to "
                        f"its frozen canonical authority: {path}"
                    )
            except OSError as error:
                raise SystemExit(
                    f"Could not resolve authoritative GSC ledger authority "
                    f"{path}: {error}"
                )
            chunks = []
            while True:
                chunk = os.read(fd, 65536)
                if not chunk:
                    current_stat = os.lstat(path)
                    if (
                        not stat.S_ISREG(current_stat.st_mode)
                        or current_stat.st_nlink != 1
                        or current_stat.st_dev != opened_stat.st_dev
                        or current_stat.st_ino != opened_stat.st_ino
                    ):
                        raise SystemExit(
                            f"Authoritative GSC ledger path changed while "
                            f"being validated: {path}"
                        )
                    return b"".join(chunks)
                chunks.append(chunk)
        finally:
            os.close(fd)
    raise SystemExit(f"Could not safely create or open authoritative GSC ledger: {path}")


text = read_regular_bytes(history).decode("utf-8")
if text and not text.endswith("\n"):
    raise SystemExit(
        f"Authoritative GSC ledger must end with a terminal LF: {history}"
    )
if re.search(r"\r(?!\n)|[\v\f\x1c-\x1f\x85\ufeff\u2028\u2029]", text):
    raise SystemExit(f"Invalid GSC ledger line separator in {history}")
lines = text.replace("\r\n", "\n").split("\n")
if not lines:
    raise SystemExit(f"Invalid GSC ledger header in {history}: file is empty")
if lines[0] != expected:
    raise SystemExit(f"Invalid GSC ledger header in {history}")
for line_number, line in enumerate(lines[1:], start=2):
    if not line:
        continue
    row = line.split("\t")
    if len(row) != 4:
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{line_number}: "
            f"expected 4 columns; found {len(row)}"
        )
    if (
        not row[0].strip()
        or not row[1].strip()
        or not row[2].strip()
        or any(value != value.strip() for value in row[:3])
    ):
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{line_number}: "
            "timestamp, status, and url are required and cannot have outer whitespace"
        )
    if not canonical.fullmatch(row[2]):
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{line_number}: "
            "url must be a canonical VentureDex detail URL"
        )
    if not timestamp_pattern.fullmatch(row[0]):
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{line_number}: "
            "timestamp must use YYYY-MM-DD HH:MM:SS"
        )
    if row[1] not in allowed_statuses:
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{line_number}: "
            f"unknown status {row[1]!r}"
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

capture_history_identity() {
  python3 - "$HISTORY_FILE" <<'PY'
import os
import stat
import sys
from pathlib import Path

history = Path(sys.argv[1])
flags = (
    os.O_RDONLY
    | getattr(os, "O_NONBLOCK", 0)
    | getattr(os, "O_NOFOLLOW", 0)
)
try:
    fd = os.open(history, flags)
except OSError as error:
    print(
        f"Could not open authoritative GSC ledger identity: {history}: {error}",
        file=sys.stderr,
    )
    raise SystemExit(1)
try:
    opened_stat = os.fstat(fd)
    if not stat.S_ISREG(opened_stat.st_mode):
        raise OSError(f"ledger is not a regular, non-symlink file: {history}")
    if opened_stat.st_nlink != 1:
        raise OSError(f"ledger has hard-link aliases: {history}")
    if history.resolve(strict=True) != history:
        raise OSError(
            f"ledger no longer resolves to its frozen canonical authority: {history}"
        )
    current_stat = os.lstat(history)
    if (
        not stat.S_ISREG(current_stat.st_mode)
        or current_stat.st_nlink != 1
        or current_stat.st_dev != opened_stat.st_dev
        or current_stat.st_ino != opened_stat.st_ino
    ):
        raise OSError(f"ledger path changed while resolving identity: {history}")
    print(f"{opened_stat.st_dev}:{opened_stat.st_ino}")
finally:
    os.close(fd)
PY
}

verify_history_identity() {
  local observed_identity

  if ! observed_identity="$(capture_history_identity)"; then
    return 1
  fi
  if [ -z "$HISTORY_FILE_IDENTITY" ]; then
    echo "Authoritative GSC ledger identity was not frozen." >&2
    return 1
  fi
  if [ "$observed_identity" != "$HISTORY_FILE_IDENTITY" ]; then
    echo "Authoritative GSC ledger identity changed after lock acquisition: ${HISTORY_FILE}" >&2
    return 1
  fi
  return 0
}

refresh_history_identity_after_controlled_replace() {
  HISTORY_FILE_IDENTITY=""
  if ! ensure_history_file; then
    return 1
  fi
  if ! HISTORY_FILE_IDENTITY="$(capture_history_identity)"; then
    echo "Could not refresh authoritative GSC ledger identity after migration: ${HISTORY_FILE}" >&2
    return 1
  fi
  verify_history_identity
}

acquire_history_lock() {
  local canonical_central canonical_history lock_parent

  if ! canonical_history="$(python3 - "$HISTORY_FILE" <<'PY'
import os
import stat
import sys
from pathlib import Path

candidate = Path(sys.argv[1]).expanduser()
try:
    if stat.S_ISLNK(os.lstat(candidate).st_mode):
        raise SystemExit(
            f"Authoritative GSC ledger must be a regular, non-symlink file; "
            f"the ledger itself is a symlink: {candidate}"
        )
except FileNotFoundError:
    pass
print(candidate.resolve(strict=False))
PY
)"; then
    echo "Could not canonicalize authoritative GSC ledger path: ${HISTORY_FILE}" >&2
    return 1
  fi

  if ! canonical_central="$(python3 - "$CENTRAL_HISTORY_FILE" <<'PY'
import sys
from pathlib import Path

print(Path(sys.argv[1]).expanduser().resolve(strict=False))
PY
)"; then
    echo "Could not canonicalize central GSC ledger path: ${CENTRAL_HISTORY_FILE}" >&2
    return 1
  fi
  CENTRAL_HISTORY_FILE="$canonical_central"

  # Freeze the canonical authority before creating or reading the ledger. All
  # later operations use this path, so changing an input parent symlink cannot
  # redirect the locked run to a different file.
  HISTORY_FILE="$canonical_history"
  HISTORY_FILE_IDENTITY=""
  if ! ensure_history_file; then
    return 1
  fi
  if ! HISTORY_FILE_IDENTITY="$(capture_history_identity)"; then
    echo "Could not freeze authoritative GSC ledger identity: ${HISTORY_FILE}" >&2
    return 1
  fi

  HISTORY_LOCK_PATH="${canonical_history}.lock"
  lock_parent="$(dirname "$HISTORY_LOCK_PATH")"
  if ! mkdir -p "$lock_parent"; then
    echo "Could not create GSC history lock directory: ${lock_parent}" >&2
    return 1
  fi

  HISTORY_LOCK_TOKEN="$$:$(date '+%s'):${RANDOM}"
  REQUEST_INTENT_MESSAGE="request click intent persisted before browser action; completion unresolved until a terminal ledger row is recorded; run_token=${HISTORY_LOCK_TOKEN}"
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
  if ! verify_history_identity; then
    echo "Authoritative GSC ledger authority changed while acquiring its lock." >&2
    return 1
  fi
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
  if [ ! -e "$LEGACY_HISTORY_FILE" ] && [ ! -L "$LEGACY_HISTORY_FILE" ]; then
    echo "No legacy GSC history file found: ${LEGACY_HISTORY_FILE}"
    return 0
  fi

  python3 - "$HISTORY_FILE" "$LEGACY_HISTORY_FILE" "$HISTORY_FILE_IDENTITY" <<'PY'
import fcntl
import os
import re
import stat
import sys
import tempfile
from pathlib import Path

central = Path(sys.argv[1])
legacy = Path(sys.argv[2])
expected_central_identity = sys.argv[3]
fields = ("timestamp", "status", "url", "message")
canonical = re.compile(
    r"^https://venturedex\.co/(?:startups/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|weekly/[1-9][0-9]*)$"
)
timestamp_pattern = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$")
allowed_statuses = {
    "requested",
    "dry_run",
    "retry_pending",
    "stopped_mismatch",
    "live_check_failed",
    "quota_exceeded",
    "request_click_pending",
    "pre_request_success_unverified",
    "reconciliation_archive_pending",
    "post_request_target_unverified",
    "post_request_confirmation_unknown",
}


def read_rows(
    path: Path,
    *,
    expected_identity: str = "",
    require_single_link: bool = False,
) -> tuple[list[tuple[str, str, str, str]], bytes]:
    flags = (
        os.O_RDONLY
        | getattr(os, "O_NONBLOCK", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    try:
        fd = os.open(path, flags)
    except OSError as error:
        raise SystemExit(
            f"GSC ledger must be a readable regular, non-symlink file: "
            f"{path}: {error}"
        )
    try:
        fcntl.flock(fd, fcntl.LOCK_SH)
        opened_stat = os.fstat(fd)
        if not stat.S_ISREG(opened_stat.st_mode):
            raise SystemExit(
                f"GSC ledger must be a regular, non-symlink file: {path}"
            )
        if require_single_link and opened_stat.st_nlink != 1:
            raise SystemExit(f"GSC ledger must not have hard-link aliases: {path}")
        if (
            expected_identity
            and f"{opened_stat.st_dev}:{opened_stat.st_ino}" != expected_identity
        ):
            raise SystemExit(f"GSC ledger identity changed before migration: {path}")
        if expected_identity and path.resolve(strict=True) != path:
            raise SystemExit(
                f"GSC ledger no longer resolves to its frozen canonical "
                f"authority: {path}"
            )
        chunks = []
        while True:
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            chunks.append(chunk)
        payload = b"".join(chunks)
        os.lseek(fd, 0, os.SEEK_SET)
        stable_chunks = []
        while True:
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            stable_chunks.append(chunk)
        if b"".join(stable_chunks) != payload:
            raise SystemExit(f"GSC ledger changed during migration read: {path}")
        current_stat = os.lstat(path)
        if (
            not stat.S_ISREG(current_stat.st_mode)
            or current_stat.st_dev != opened_stat.st_dev
            or current_stat.st_ino != opened_stat.st_ino
            or (require_single_link and current_stat.st_nlink != 1)
        ):
            raise SystemExit(f"GSC ledger path changed during migration read: {path}")
    finally:
        os.close(fd)
    text = payload.decode("utf-8")
    if text and not text.endswith("\n"):
        raise SystemExit(
            f"Authoritative GSC ledger must end with a terminal LF: {path}"
        )
    if re.search(r"\r(?!\n)|[\v\f\x1c-\x1f\x85\ufeff\u2028\u2029]", text):
        raise SystemExit(f"Invalid GSC ledger line separator in {path}")
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines:
        raise SystemExit(f"Invalid GSC ledger header in {path}: file is empty")
    if lines[0] != "\t".join(fields):
        raise SystemExit(f"Invalid GSC ledger header in {path}")
    rows = []
    for line_number, line in enumerate(lines[1:], start=2):
        if not line:
            continue
        row = line.split("\t")
        if len(row) != len(fields):
            raise SystemExit(
                f"Invalid GSC ledger row in {path}:{line_number}: "
                f"expected 4 columns; found {len(row)}"
            )
        if (
            not row[0].strip()
            or not row[1].strip()
            or not row[2].strip()
            or any(value != value.strip() for value in row[:3])
        ):
            raise SystemExit(
                f"Invalid GSC ledger row in {path}:{line_number}: "
                "timestamp, status, and url are required and cannot have outer whitespace"
            )
        if not canonical.fullmatch(row[2]):
            raise SystemExit(
                f"Invalid GSC ledger row in {path}:{line_number}: "
                "url must be a canonical VentureDex detail URL"
            )
        if not timestamp_pattern.fullmatch(row[0]):
            raise SystemExit(
                f"Invalid GSC ledger row in {path}:{line_number}: "
                "timestamp must use YYYY-MM-DD HH:MM:SS"
            )
        if row[1] not in allowed_statuses:
            raise SystemExit(
                f"Invalid GSC ledger row in {path}:{line_number}: "
                f"unknown status {row[1]!r}"
            )
        rows.append(tuple(row))
    return rows, payload


central.parent.mkdir(parents=True, exist_ok=True)
central_rows, central_payload = read_rows(
    central,
    expected_identity=expected_central_identity,
    require_single_link=True,
)
legacy_rows, _legacy_payload = read_rows(legacy)
seen = set(central_rows)
legacy_unique_rows = []
imported = 0
for row in legacy_rows:
    if row in seen:
        continue
    seen.add(row)
    legacy_unique_rows.append(row)
    imported += 1

# Imported history is older authority regardless of its wall-clock timestamp.
# Preserve each source's original line order and keep every existing central
# row after all imported legacy rows so migration can never make a legacy
# operational state newer than central authority.
central_rows = legacy_unique_rows + central_rows
fd, temporary_name = tempfile.mkstemp(
    prefix=".gsc-history-",
    suffix=".tsv",
    dir=central.parent,
    text=True,
)
central_flags = (
    os.O_RDWR
    | getattr(os, "O_NONBLOCK", 0)
    | getattr(os, "O_NOFOLLOW", 0)
)
central_fd = os.open(central, central_flags)
try:
    fcntl.flock(central_fd, fcntl.LOCK_EX)
    locked_stat = os.fstat(central_fd)
    locked_path_stat = os.lstat(central)
    if (
        not stat.S_ISREG(locked_stat.st_mode)
        or locked_stat.st_nlink != 1
        or f"{locked_stat.st_dev}:{locked_stat.st_ino}"
        != expected_central_identity
        or not stat.S_ISREG(locked_path_stat.st_mode)
        or locked_path_stat.st_nlink != 1
        or locked_path_stat.st_dev != locked_stat.st_dev
        or locked_path_stat.st_ino != locked_stat.st_ino
        or central.resolve(strict=True) != central
    ):
        raise SystemExit(
            f"Authoritative GSC ledger identity changed before migration lock: "
            f"{central}"
        )
    os.lseek(central_fd, 0, os.SEEK_SET)
    locked_chunks = []
    while True:
        chunk = os.read(central_fd, 65536)
        if not chunk:
            break
        locked_chunks.append(chunk)
    if b"".join(locked_chunks) != central_payload:
        raise SystemExit(
            f"Authoritative GSC ledger changed before migration lock: {central}"
        )
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
        handle.write("\t".join(fields) + "\n")
        for row in central_rows:
            handle.write("\t".join(row) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.lseek(central_fd, 0, os.SEEK_SET)
    final_locked_chunks = []
    while True:
        chunk = os.read(central_fd, 65536)
        if not chunk:
            break
        final_locked_chunks.append(chunk)
    verify_stat = os.fstat(central_fd)
    current_stat = os.lstat(central)
    if (
        b"".join(final_locked_chunks) != central_payload
        or not stat.S_ISREG(verify_stat.st_mode)
        or verify_stat.st_nlink != 1
        or f"{verify_stat.st_dev}:{verify_stat.st_ino}"
        != expected_central_identity
        or not stat.S_ISREG(current_stat.st_mode)
        or current_stat.st_nlink != 1
        or current_stat.st_dev != verify_stat.st_dev
        or current_stat.st_ino != verify_stat.st_ino
        or central.resolve(strict=True) != central
    ):
        raise SystemExit(
            f"Authoritative GSC ledger changed before migration replace: "
            f"{central}"
        )
    os.replace(temporary_name, central)
    directory_fd = os.open(central.parent, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
finally:
    os.close(central_fd)
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
  local expected_ledger_size="$4"
  local expected_ledger_digest="$5"
  local sanitized_status sanitized_url sanitized_message

  case "$status" in
    requested|dry_run|retry_pending|stopped_mismatch|live_check_failed|quota_exceeded|request_click_pending|pre_request_success_unverified|reconciliation_archive_pending|post_request_target_unverified|post_request_confirmation_unknown)
      ;;
    *)
      echo "Refusing to append an unknown GSC ledger status: ${status}" >&2
      return 1
      ;;
  esac
  if ! ensure_history_file; then
    echo "Could not validate authoritative GSC ledger before appending status=${status} url=${url}" >&2
    return 1
  fi
  sanitized_status="$(printf '%s' "$status" | tr '\t\r\n' '   ')"
  sanitized_url="$(printf '%s' "$url" | tr '\t\r\n' '   ')"
  sanitized_message="$(printf '%s' "$message" | tr '\t\r\n' '   ')"
  if [ "$sanitized_status" != "$status" ] || [ "$sanitized_url" != "$url" ]; then
    echo "Refusing to append a GSC ledger row with control characters in status or URL." >&2
    return 1
  fi
  if ! python3 - \
    "$HISTORY_FILE" \
    "$(date '+%Y-%m-%d %H:%M:%S')" \
    "$sanitized_status" \
    "$sanitized_url" \
    "$sanitized_message" \
    "$HISTORY_FILE_IDENTITY" \
    "$expected_ledger_size" \
    "$expected_ledger_digest" <<'PY'
import fcntl
import hashlib
import os
import re
import stat
import sys
from pathlib import Path

history = Path(sys.argv[1])
timestamp, status_value, target, message = sys.argv[2:6]
row = "\t".join((timestamp, status_value, target, message)) + "\n"
expected_identity = sys.argv[6]
expected_ledger_size = sys.argv[7]
expected_ledger_digest = sys.argv[8]
canonical = re.compile(
    r"^https://venturedex\.co/(?:startups/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|weekly/[1-9][0-9]*)$"
)
timestamp_pattern = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$"
)
allowed_statuses = {
    "requested",
    "dry_run",
    "retry_pending",
    "stopped_mismatch",
    "live_check_failed",
    "quota_exceeded",
    "request_click_pending",
    "pre_request_success_unverified",
    "reconciliation_archive_pending",
    "post_request_target_unverified",
    "post_request_confirmation_unknown",
}


def read_all(fd: int) -> bytes:
    os.lseek(fd, 0, os.SEEK_SET)
    chunks = []
    while True:
        chunk = os.read(fd, 65536)
        if not chunk:
            return b"".join(chunks)
        chunks.append(chunk)


def validate_ledger(payload: bytes) -> None:
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as error:
        raise OSError(f"ledger is not valid UTF-8: {history}: {error}")
    if text and not text.endswith("\n"):
        raise OSError(f"ledger must end with a terminal LF: {history}")
    if re.search(r"\r(?!\n)|[\v\f\x1c-\x1f\x85\ufeff\u2028\u2029]", text):
        raise OSError(f"ledger contains an invalid line separator: {history}")
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines or lines[0] != "timestamp\tstatus\turl\tmessage":
        raise OSError(f"ledger has an invalid header: {history}")
    for line_number, line in enumerate(lines[1:], start=2):
        if not line:
            continue
        fields = line.split("\t")
        if len(fields) != 4:
            raise OSError(
                f"ledger row {line_number} must contain exactly four columns: "
                f"{history}"
            )
        row_timestamp, row_status, row_url, _row_message = fields
        if (
            any(
                value != value.strip()
                for value in (row_timestamp, row_status, row_url)
            )
            or not timestamp_pattern.fullmatch(row_timestamp)
            or row_status not in allowed_statuses
            or not canonical.fullmatch(row_url)
        ):
            raise OSError(f"ledger row {line_number} is invalid: {history}")


if (
    not timestamp_pattern.fullmatch(timestamp)
    or status_value not in allowed_statuses
    or not canonical.fullmatch(target)
    or any(character in message for character in "\t\r\n\0")
    or not re.fullmatch(r"[0-9]+", expected_ledger_size)
    or not re.fullmatch(r"[0-9a-f]{64}", expected_ledger_digest)
):
    raise SystemExit("Invalid authoritative GSC ledger append arguments.")

try:
    flags = (
        os.O_RDWR
        | os.O_APPEND
        | getattr(os, "O_NONBLOCK", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    fd = os.open(history, flags)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        opened_stat = os.fstat(fd)
        if not stat.S_ISREG(opened_stat.st_mode):
            raise OSError(
                f"ledger is not a regular, non-symlink file: {history}"
            )
        if opened_stat.st_nlink != 1:
            raise OSError(f"ledger has hard-link aliases: {history}")
        opened_identity = f"{opened_stat.st_dev}:{opened_stat.st_ino}"
        if not expected_identity or opened_identity != expected_identity:
            raise OSError(f"ledger identity changed before durable append: {history}")
        if history.resolve(strict=True) != history:
            raise OSError(
                f"ledger no longer resolves to its frozen canonical authority: {history}"
            )
        original = read_all(fd)
        validate_ledger(original)
        if (
            len(original) != int(expected_ledger_size)
            or hashlib.sha256(original).hexdigest() != expected_ledger_digest
        ):
            raise OSError(
                f"ledger no longer matches its frozen append snapshot: {history}"
            )
        if len(original) != opened_stat.st_size:
            raise OSError(f"ledger changed during locked validation: {history}")
        if read_all(fd) != original:
            raise OSError(f"ledger changed before durable append: {history}")
        payload = row.encode("utf-8")
        written = os.write(fd, payload)
        if written != len(payload):
            raise OSError(
                f"partial ledger append: expected {len(payload)} bytes; "
                f"wrote {written}"
            )
        os.fsync(fd)
        expected_after = original + payload
        after = read_all(fd)
        if after != expected_after:
            raise OSError("ledger changed or interleaved during durable append")
        validate_ledger(after)
        current_stat = os.lstat(history)
        current_opened_stat = os.fstat(fd)
        if (
            not stat.S_ISREG(current_stat.st_mode)
            or current_stat.st_nlink != 1
            or current_stat.st_dev != opened_stat.st_dev
            or current_stat.st_ino != opened_stat.st_ino
            or current_opened_stat.st_dev != opened_stat.st_dev
            or current_opened_stat.st_ino != opened_stat.st_ino
            or current_opened_stat.st_nlink != 1
            or current_opened_stat.st_size != len(expected_after)
        ):
            raise OSError("ledger path changed during durable append")
        directory_fd = os.open(history.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        if read_all(fd) != expected_after:
            raise OSError("ledger changed before durable append completion")
    finally:
        os.close(fd)
except OSError as error:
    print(f"Could not durably append authoritative GSC ledger row: {error}", file=sys.stderr)
    raise SystemExit(1)
PY
  then
    echo "Could not persist authoritative GSC ledger row for status=${status} url=${url}" >&2
    return 1
  fi
  return 0
}

append_history_or_block() {
  local status="$1"
  local url="$2"
  local message="$3"
  local expected_ledger_size="$4"
  local expected_ledger_digest="$5"

  if append_history \
    "$status" \
    "$url" \
    "$message" \
    "$expected_ledger_size" \
    "$expected_ledger_digest"; then
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

append_history_transition_or_block() {
  local expected_status="$1"
  local require_expected_message="$2"
  local expected_message="$3"
  local new_status="$4"
  local url="$5"
  local message="$6"
  local expected_ledger_size="$7"
  local expected_ledger_digest="$8"
  local evidence_directory="${9:-}"
  local evidence_name="${10:-}"
  local evidence_file_identity="${11:-}"
  local evidence_directory_identity="${12:-}"
  local evidence_resolved_identity="${13:-}"
  local evidence_digest="${14:-}"
  local sanitized_message transition_output

  sanitized_message="$(printf '%s' "$message" | tr '\t\r\n' '   ')"
  if ! ensure_history_file; then
    echo "Could not validate authoritative GSC ledger before conditional transition for ${url}." >&2
    return 1
  fi
  if ! transition_output="$(python3 - \
    "$HISTORY_FILE" \
    "$HISTORY_FILE_IDENTITY" \
    "$url" \
    "$expected_status" \
    "$require_expected_message" \
    "$expected_message" \
    "$(date '+%Y-%m-%d %H:%M:%S')" \
    "$new_status" \
    "$sanitized_message" \
    "$expected_ledger_size" \
    "$expected_ledger_digest" \
    "${SCRIPT_DIR}/gsc-reconciliation.py" \
    "$evidence_directory" \
    "$evidence_name" \
    "$evidence_file_identity" \
    "$evidence_directory_identity" \
    "$evidence_resolved_identity" \
    "$evidence_digest" <<'PY'
import fcntl
import hashlib
import importlib.util
import os
import re
import stat
import sys
from pathlib import Path

history = Path(sys.argv[1])
expected_identity = sys.argv[2]
target = sys.argv[3]
expected_status = sys.argv[4]
require_expected_message = sys.argv[5] == "1"
expected_message = sys.argv[6]
transition_timestamp = sys.argv[7]
new_status = sys.argv[8]
new_message = sys.argv[9]
expected_ledger_size = sys.argv[10]
expected_ledger_digest = sys.argv[11]
evidence_helper_path = Path(sys.argv[12])
evidence_directory = sys.argv[13]
evidence_name = sys.argv[14]
evidence_file_identity = sys.argv[15]
evidence_directory_identity = sys.argv[16]
evidence_resolved_identity = sys.argv[17]
evidence_digest = sys.argv[18]
canonical = re.compile(
    r"^https://venturedex\.co/(?:startups/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|weekly/[1-9][0-9]*)$"
)
timestamp_pattern = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$"
)
allowed_statuses = {
    "requested",
    "dry_run",
    "retry_pending",
    "stopped_mismatch",
    "live_check_failed",
    "quota_exceeded",
    "request_click_pending",
    "pre_request_success_unverified",
    "reconciliation_archive_pending",
    "post_request_target_unverified",
    "post_request_confirmation_unknown",
}
missing_status = "__missing__"
expects_missing = expected_status == missing_status
if (
    (expected_status not in allowed_statuses and not expects_missing)
    or new_status not in allowed_statuses
    or not canonical.fullmatch(target)
    or not timestamp_pattern.fullmatch(transition_timestamp)
):
    raise SystemExit("Invalid conditional GSC ledger transition arguments.")
if expects_missing and (
    new_status not in {
        "stopped_mismatch",
        "live_check_failed",
        "request_click_pending",
        "retry_pending",
        "requested",
        "pre_request_success_unverified",
        "reconciliation_archive_pending",
        "post_request_confirmation_unknown",
    }
    or not require_expected_message
    or expected_message
):
    raise SystemExit("Invalid missing-row GSC ledger transition arguments.")
if any(character in expected_message + new_message for character in "\t\r\n\0"):
    raise SystemExit("Conditional GSC ledger transition messages must be one line.")
if (
    not re.fullmatch(r"[0-9]+", expected_ledger_size)
    or not re.fullmatch(r"[0-9a-f]{64}", expected_ledger_digest)
):
    raise SystemExit(
        "Conditional GSC ledger transition requires an exact ledger snapshot token."
    )
evidence_enabled = bool(evidence_directory)
evidence_transition = (
    (
        expected_status == "reconciliation_archive_pending"
        and new_status in {"retry_pending", "requested"}
    )
    or (
        expected_status == "retry_pending"
        and new_status in {"request_click_pending", "requested"}
    )
)
if evidence_enabled and (
    not evidence_transition
    or not require_expected_message
    or not all(
        (
            evidence_name,
            evidence_file_identity,
            evidence_directory_identity,
            evidence_resolved_identity,
            evidence_digest,
        )
    )
):
    raise SystemExit("Invalid evidence-bound GSC ledger transition arguments.")
if not evidence_enabled and any(
    (
        evidence_name,
        evidence_file_identity,
        evidence_directory_identity,
        evidence_resolved_identity,
        evidence_digest,
    )
):
    raise SystemExit("Incomplete evidence-bound GSC ledger transition arguments.")

evidence_helper = None
evidence = None
if evidence_enabled:
    spec = importlib.util.spec_from_file_location(
        "venturedex_gsc_reconciliation",
        evidence_helper_path,
    )
    if spec is None or spec.loader is None:
        raise SystemExit("Could not load the GSC reconciliation evidence helper.")
    evidence_helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(evidence_helper)
    expected_evidence_status = (
        "post_request_confirmation_unknown"
        if (
            expected_status == "reconciliation_archive_pending"
            and new_status == "requested"
        )
        else "pre_request_success_unverified"
    )
    evidence = evidence_helper.open_verified_resolved_evidence(
        evidence_directory,
        evidence_name,
        evidence_file_identity,
        evidence_directory_identity,
        evidence_resolved_identity,
        evidence_digest,
        target,
        expected_evidence_status,
    )


def parse_rows(payload: bytes) -> list[tuple[str, str, str, str]]:
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as error:
        raise SystemExit(f"Invalid UTF-8 in authoritative GSC ledger: {error}")
    if text and not text.endswith("\n"):
        raise SystemExit(
            f"Authoritative GSC ledger must end with a terminal LF: {history}"
        )
    if re.search(r"\r(?!\n)|[\v\f\x1c-\x1f\x85\ufeff\u2028\u2029]", text):
        raise SystemExit(f"Invalid GSC ledger line separator in {history}")
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines or lines[0] != "timestamp\tstatus\turl\tmessage":
        raise SystemExit(f"Invalid GSC ledger header in {history}")
    rows = []
    for line_number, line in enumerate(lines[1:], start=2):
        if not line:
            continue
        row = line.split("\t")
        if len(row) != 4:
            raise SystemExit(
                f"Invalid GSC ledger row in {history}:{line_number}: "
                f"expected 4 columns; found {len(row)}"
            )
        timestamp, status, url, message = row
        if (
            not timestamp
            or not status
            or not url
            or any(value != value.strip() for value in (timestamp, status, url))
            or not timestamp_pattern.fullmatch(timestamp)
            or status not in allowed_statuses
            or not canonical.fullmatch(url)
        ):
            raise SystemExit(
                f"Invalid GSC ledger row in {history}:{line_number}"
            )
        rows.append((timestamp, status, url, message))
    return rows


def append_once(fd: int, payload: bytes) -> None:
    written = os.write(fd, payload)
    if written != len(payload):
        raise OSError(
            "partial conditional GSC ledger append: "
            f"expected {len(payload)} bytes; wrote {written}"
        )


def read_all(fd: int) -> bytes:
    os.lseek(fd, 0, os.SEEK_SET)
    chunks = []
    while True:
        chunk = os.read(fd, 65536)
        if not chunk:
            return b"".join(chunks)
        chunks.append(chunk)


def latest_for_target(
    rows: list[tuple[str, str, str, str]],
) -> tuple[str, str, str, str] | None:
    return next(
        (
            row
            for row in reversed(rows)
            if row[2] == target and row[1] != "dry_run"
        ),
        None,
    )


def seal_interference(
    fd: int,
    opened_stat: os.stat_result,
    reason: str,
) -> None:
    try:
        current_path_stat = os.lstat(history)
        current_opened_stat = os.fstat(fd)
    except OSError as error:
        raise SystemExit(
            "Conditional GSC ledger transition interference could not be "
            f"sealed because authority inspection failed for {target}: {error}"
        )
    if (
        current_path_stat.st_dev != opened_stat.st_dev
        or current_path_stat.st_ino != opened_stat.st_ino
        or current_path_stat.st_nlink != 1
        or current_opened_stat.st_dev != opened_stat.st_dev
        or current_opened_stat.st_ino != opened_stat.st_ino
        or current_opened_stat.st_nlink != 1
    ):
        raise SystemExit(
            "Conditional GSC ledger transition interference could not be "
            f"sealed because the authoritative path changed for {target}"
        )

    current_payload = read_all(fd)
    current_rows = parse_rows(current_payload)
    current_latest = latest_for_target(current_rows)
    current_status = "missing" if current_latest is None else current_latest[1]
    current_message = "" if current_latest is None else current_latest[3]
    unresolved_statuses = {
        "request_click_pending",
        "pre_request_success_unverified",
        "reconciliation_archive_pending",
        "post_request_target_unverified",
        "post_request_confirmation_unknown",
    }
    post_click_phase = expected_status == "request_click_pending"
    archive_final_phase = (
        expected_status == "reconciliation_archive_pending"
        and new_status in {"retry_pending", "requested"}
    )

    if current_status == "requested":
        raise SystemExit(
            f"{reason}; preserving concurrent requested authority for {target}"
        )
    if post_click_phase:
        if current_status in unresolved_statuses:
            raise SystemExit(
                f"{reason}; preserving concurrent reconciliation authority "
                f"{current_status!r} for {target}"
            )
        interference_status = "post_request_confirmation_unknown"
    elif archive_final_phase:
        if (
            current_status in unresolved_statuses
            and not (
                current_status == "reconciliation_archive_pending"
                and current_message == expected_message
            )
        ):
            raise SystemExit(
                f"{reason}; preserving concurrent reconciliation authority "
                f"{current_status!r} for {target}"
            )
        interference_status = "reconciliation_archive_pending"
    else:
        if (
            current_status in unresolved_statuses
            and not (
                current_status == expected_status
                and current_message == expected_message
            )
        ):
            raise SystemExit(
                f"{reason}; preserving concurrent reconciliation authority "
                f"{current_status!r} for {target} before any browser click"
            )
        interference_status = "reconciliation_archive_pending"

    interference_message = (
        "conditional transition interference detected while appending "
        f"{new_status}; manual reconciliation required"
    )
    blocker_payload = (
        f"{transition_timestamp}\t{interference_status}\t"
        f"{target}\t{interference_message}\n"
    ).encode("utf-8")
    before_blocker = current_payload
    append_once(fd, blocker_payload)
    os.fsync(fd)
    blocked = read_all(fd)
    blocked_rows = parse_rows(blocked)
    latest_blocker = latest_for_target(blocked_rows)
    final_path_stat = os.lstat(history)
    final_opened_stat = os.fstat(fd)
    if (
        not blocked.startswith(before_blocker)
        or latest_blocker is None
        or latest_blocker[1] != interference_status
        or latest_blocker[3] != interference_message
        or final_path_stat.st_dev != opened_stat.st_dev
        or final_path_stat.st_ino != opened_stat.st_ino
        or final_path_stat.st_nlink != 1
        or final_opened_stat.st_dev != opened_stat.st_dev
        or final_opened_stat.st_ino != opened_stat.st_ino
        or final_opened_stat.st_nlink != 1
        or final_opened_stat.st_size != len(blocked)
    ):
        raise SystemExit(
            "Conditional GSC ledger transition interference could not be "
            f"sealed with a verified non-retry blocker for {target}"
        )
    raise SystemExit(
        f"{reason}; a durable non-retry reconciliation blocker was recorded "
        f"for {target}"
    )


flags = (
    os.O_RDWR
    | os.O_APPEND
    | getattr(os, "O_NONBLOCK", 0)
    | getattr(os, "O_NOFOLLOW", 0)
)
try:
    fd = os.open(history, flags)
except OSError as error:
    if evidence is not None:
        evidence.close()
    raise SystemExit(
        f"Authoritative GSC ledger could not be opened safely: {history}: {error}"
    )
try:
    fcntl.flock(fd, fcntl.LOCK_EX)
    opened_stat = os.fstat(fd)
    if (
        not stat.S_ISREG(opened_stat.st_mode)
        or opened_stat.st_nlink != 1
        or f"{opened_stat.st_dev}:{opened_stat.st_ino}" != expected_identity
        or history.resolve(strict=True) != history
    ):
        raise SystemExit(
            f"Authoritative GSC ledger identity changed before transition: {history}"
        )
    original = read_all(fd)
    rows = parse_rows(original)
    if (
        len(original) != int(expected_ledger_size)
        or hashlib.sha256(original).hexdigest() != expected_ledger_digest
    ):
        seal_interference(
            fd,
            opened_stat,
            "Conditional GSC ledger transition detected a replayed or drifted "
            "ledger snapshot",
        )
    latest = latest_for_target(rows)
    if (
        (expects_missing and latest is not None)
        or (
            not expects_missing
            and (latest is None or latest[1] != expected_status)
        )
    ):
        observed = "missing" if latest is None else latest[1]
        raise SystemExit(
            f"Conditional GSC ledger transition refused: expected latest "
            f"{expected_status!r} for {target}; observed {observed!r}"
        )
    if (
        require_expected_message
        and latest is not None
        and latest[3] != expected_message
    ):
        raise SystemExit(
            "Conditional GSC ledger transition refused: latest transaction "
            f"provenance does not match the exact artifact for {target}"
        )
    current_stat = os.lstat(history)
    locked_stat = os.fstat(fd)
    if (
        current_stat.st_dev != opened_stat.st_dev
        or current_stat.st_ino != opened_stat.st_ino
        or current_stat.st_nlink != 1
        or locked_stat.st_size != len(original)
    ):
        raise SystemExit(
            f"Authoritative GSC ledger changed before conditional append: {history}"
        )
    if evidence is not None:
        evidence_helper.verify_held_resolved_evidence(evidence)
    payload = (
        f"{transition_timestamp}\t{new_status}\t{target}\t{new_message}\n"
    ).encode("utf-8")
    expected_after = original + payload
    append_once(fd, payload)
    try:
        os.fsync(fd)
    except OSError as error:
        seal_interference(
            fd,
            opened_stat,
            f"Conditional GSC ledger transition file fsync failed: {error}",
        )
    if evidence is not None:
        try:
            evidence_helper.verify_held_resolved_evidence(evidence)
        except (OSError, SystemExit) as error:
            seal_interference(
                fd,
                opened_stat,
                "Resolved reconciliation evidence authority changed during "
                f"the ledger append: {error}",
            )
    after = read_all(fd)
    if after != expected_after:
        seal_interference(
            fd,
            opened_stat,
            "Conditional GSC ledger transition detected an interleaved append",
        )
    after_rows = parse_rows(after)
    latest_after = latest_for_target(after_rows)
    if (
        latest_after is None
        or latest_after[1] != new_status
        or latest_after[3] != new_message
    ):
        seal_interference(
            fd,
            opened_stat,
            "Conditional GSC ledger transition lost latest-row authority",
        )
    final_stat = os.lstat(history)
    final_opened_stat = os.fstat(fd)
    if (
        final_stat.st_dev != opened_stat.st_dev
        or final_stat.st_ino != opened_stat.st_ino
        or final_stat.st_nlink != 1
        or final_opened_stat.st_dev != opened_stat.st_dev
        or final_opened_stat.st_ino != opened_stat.st_ino
        or final_opened_stat.st_nlink != 1
        or final_opened_stat.st_size != len(expected_after)
    ):
        seal_interference(
            fd,
            opened_stat,
            "Authoritative GSC ledger identity or size changed during transition",
        )
    directory_fd = -1
    try:
        directory_fd = os.open(history.parent, os.O_RDONLY)
        os.fsync(directory_fd)
    except OSError as error:
        seal_interference(
            fd,
            opened_stat,
            f"Conditional GSC ledger directory fsync failed: {error}",
        )
    finally:
        if directory_fd >= 0:
            os.close(directory_fd)
    final_bytes = read_all(fd)
    final_stat = os.lstat(history)
    final_opened_stat = os.fstat(fd)
    if (
        final_bytes != expected_after
        or final_stat.st_dev != opened_stat.st_dev
        or final_stat.st_ino != opened_stat.st_ino
        or final_stat.st_nlink != 1
        or final_opened_stat.st_dev != opened_stat.st_dev
        or final_opened_stat.st_ino != opened_stat.st_ino
        or final_opened_stat.st_nlink != 1
        or final_opened_stat.st_size != len(expected_after)
    ):
        seal_interference(
            fd,
            opened_stat,
            "Authoritative GSC ledger changed before transition completion",
        )
    if evidence is not None:
        try:
            evidence_helper.verify_held_resolved_evidence(evidence)
        except (OSError, SystemExit) as error:
            seal_interference(
                fd,
                opened_stat,
                "Resolved reconciliation evidence authority changed before "
                f"transition completion: {error}",
            )
    print(f"{len(final_bytes)}\t{hashlib.sha256(final_bytes).hexdigest()}")
finally:
    os.close(fd)
    if evidence is not None:
        evidence.close()
PY
  )"; then
    echo "BLOCKED: conditional authoritative GSC ledger transition failed for ${url}." >&2
    echo "No browser retry is authorized; preserve the reconciliation evidence and inspect the latest ledger row." >&2
    return 1
  fi
  printf '%s\n' "$transition_output"
  return 0
}

artifact_target_key() {
  python3 - "$1" <<'PY'
import hashlib
import re
import sys

url = sys.argv[1].strip().rstrip("/")
readable = re.sub(r"^https?://", "", url.lower())
readable = re.sub(r"[^a-z0-9]+", "-", readable).strip("-")
readable = readable[:90] or "unknown"
digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]
print(f"{readable}--sha256-{digest}")
PY
}

unresolved_reconciliation_artifact() {
  local url="$1"

  python3 \
    "${SCRIPT_DIR}/gsc-reconciliation.py" \
    scan \
    "$GSC_ARTIFACT_DIR" \
    "$GSC_ARTIFACT_DIR_IDENTITY" \
    "$url"
}

latest_operational_history_row() {
  local url="$1"
  local output_mode="${2:-row}"

  python3 - "$HISTORY_FILE" "$HISTORY_FILE_IDENTITY" "$url" "$output_mode" <<'PY'
import hashlib
import os
import re
import stat
import sys
from pathlib import Path

history = Path(sys.argv[1])
expected_identity = sys.argv[2]
target = sys.argv[3]
output_mode = sys.argv[4]
if output_mode not in {"row", "snapshot"}:
    raise SystemExit("Invalid authoritative GSC ledger output mode.")
canonical = re.compile(
    r"^https://venturedex\.co/(?:startups/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|weekly/[1-9][0-9]*)$"
)
timestamp_pattern = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$"
)
allowed_statuses = {
    "requested",
    "dry_run",
    "retry_pending",
    "stopped_mismatch",
    "live_check_failed",
    "quota_exceeded",
    "request_click_pending",
    "pre_request_success_unverified",
    "reconciliation_archive_pending",
    "post_request_target_unverified",
    "post_request_confirmation_unknown",
}
flags = (
    os.O_RDONLY
    | getattr(os, "O_NONBLOCK", 0)
    | getattr(os, "O_NOFOLLOW", 0)
)
try:
    fd = os.open(history, flags)
except OSError as error:
    raise SystemExit(
        f"Authoritative GSC ledger could not be opened safely: {history}: {error}"
    )
try:
    opened_stat = os.fstat(fd)
    if not stat.S_ISREG(opened_stat.st_mode):
        raise SystemExit(
            f"Authoritative GSC ledger must be a regular, non-symlink file: {history}"
        )
    if opened_stat.st_nlink != 1:
        raise SystemExit(
            f"Authoritative GSC ledger must not have hard-link aliases: {history}"
        )
    if (
        not expected_identity
        or f"{opened_stat.st_dev}:{opened_stat.st_ino}" != expected_identity
    ):
        raise SystemExit(f"Authoritative GSC ledger identity changed: {history}")
    if history.resolve(strict=True) != history:
        raise SystemExit(
            f"Authoritative GSC ledger no longer resolves to its frozen "
            f"canonical authority: {history}"
        )
    chunks = []
    while True:
        chunk = os.read(fd, 65536)
        if not chunk:
            break
        chunks.append(chunk)
    current_stat = os.lstat(history)
    if (
        not stat.S_ISREG(current_stat.st_mode)
        or current_stat.st_nlink != 1
        or current_stat.st_dev != opened_stat.st_dev
        or current_stat.st_ino != opened_stat.st_ino
    ):
        raise SystemExit(
            f"Authoritative GSC ledger path changed while reading: {history}"
        )
finally:
    os.close(fd)

payload = b"".join(chunks)
text = payload.decode("utf-8")
if text and not text.endswith("\n"):
    raise SystemExit(
        f"Authoritative GSC ledger must end with a terminal LF: {history}"
    )
if re.search(r"\r(?!\n)|[\v\f\x1c-\x1f\x85\ufeff\u2028\u2029]", text):
    raise SystemExit(f"Invalid GSC ledger line separator in {history}")
lines = text.replace("\r\n", "\n").split("\n")
if not lines or lines[0] != "timestamp\tstatus\turl\tmessage":
    raise SystemExit(f"Invalid GSC ledger header in {history}")
latest_status = ""
latest_message = ""
for line_number, line in enumerate(lines[1:], start=2):
    if not line:
        continue
    row = line.split("\t")
    if len(row) != 4:
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{line_number}: "
            f"expected 4 columns; found {len(row)}"
        )
    timestamp, status, url, message = row
    if (
        not timestamp
        or not status
        or not url
        or any(value != value.strip() for value in (timestamp, status, url))
    ):
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{line_number}: "
            "timestamp, status, and url are required and cannot have outer whitespace"
        )
    if not timestamp_pattern.fullmatch(timestamp):
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{line_number}: "
            "timestamp must use YYYY-MM-DD HH:MM:SS"
        )
    if status not in allowed_statuses:
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{line_number}: "
            f"unknown status {status!r}"
        )
    if not canonical.fullmatch(url):
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{line_number}: "
            "url must be a canonical VentureDex detail URL"
        )
    if url == target and status != "dry_run":
        latest_status = status
        latest_message = message
if output_mode == "snapshot":
    print(
        f"{latest_status}\t{latest_message}\t{len(payload)}\t"
        f"{hashlib.sha256(payload).hexdigest()}"
    )
else:
    print(f"{latest_status}\t{latest_message}")
PY
}

latest_operational_history_snapshot() {
  latest_operational_history_row "$1" "snapshot"
}

parse_operational_history_snapshot() {
  local snapshot="$1"
  local without_digest without_size row

  PARSED_LEDGER_STATUS=""
  PARSED_LEDGER_MESSAGE=""
  PARSED_LEDGER_SIZE=""
  PARSED_LEDGER_DIGEST=""
  if [[ "$snapshot" != *$'\t'* ]]; then
    return 1
  fi
  PARSED_LEDGER_DIGEST="${snapshot##*$'\t'}"
  without_digest="${snapshot%$'\t'*}"
  if [ "$without_digest" = "$snapshot" ] \
    || [[ "$without_digest" != *$'\t'* ]]; then
    return 1
  fi
  PARSED_LEDGER_SIZE="${without_digest##*$'\t'}"
  without_size="${without_digest%$'\t'*}"
  if [ "$without_size" = "$without_digest" ] \
    || [[ "$without_size" != *$'\t'* ]]; then
    return 1
  fi
  row="$without_size"
  PARSED_LEDGER_STATUS="${row%%$'\t'*}"
  PARSED_LEDGER_MESSAGE="${row#*$'\t'}"
  if [[ ! "$PARSED_LEDGER_SIZE" =~ ^[0-9]+$ ]] \
    || [[ ! "$PARSED_LEDGER_DIGEST" =~ ^[0-9a-f]{64}$ ]] \
    || { [ -z "$PARSED_LEDGER_STATUS" ] \
      && [ -n "$PARSED_LEDGER_MESSAGE" ]; }; then
    PARSED_LEDGER_STATUS=""
    PARSED_LEDGER_MESSAGE=""
    PARSED_LEDGER_SIZE=""
    PARSED_LEDGER_DIGEST=""
    return 1
  fi
  return 0
}

latest_operational_history_status() {
  local row
  row="$(latest_operational_history_row "$1")" || return 1
  printf '%s\n' "${row%%$'\t'*}"
}

block_invalid_reconciliation_retry_authorization() {
  local url="$1"
  local expected_message="$2"
  local expected_ledger_size="$3"
  local expected_ledger_digest="$4"
  local blocker_message
  local transition_output

  blocker_message="reconciliation-derived retry evidence verification failed; current canonical evidence no longer matches the latest retry provenance; manual reconciliation required"
  if ! transition_output="$(append_history_transition_or_block \
    "retry_pending" \
    1 \
    "$expected_message" \
    "reconciliation_archive_pending" \
    "$url" \
    "$blocker_message" \
    "$expected_ledger_size" \
    "$expected_ledger_digest")"; then
    echo "BLOCKED: invalid reconciliation-derived retry authorization could not be sealed durably for ${url}." >&2
    echo "Do not select, preview, or submit this URL until the authoritative ledger is reconciled manually." >&2
    return 2
  fi

  echo "BLOCKED: reconciliation-derived retry evidence is missing, moved, or no longer matches its durable provenance for ${url}." >&2
  echo "A non-retry reconciliation blocker was recorded; automatic selection and browser submission are disabled." >&2
  return 1
}

classify_reconciliation_retry_provenance() {
  python3 - "$1" <<'PY'
import re
import sys

message = sys.argv[1]
prefix = "manual pre-click reconciliation confirmed no request click; "
family_prefix = "manual pre-click reconciliation"
provenance_keys = (
    "artifact=",
    "sha256=",
    "file_identity=",
    "artifact_dir_identity=",
    "resolved_dir_identity=",
)
if not message.startswith(family_prefix) and not any(
    key in message for key in provenance_keys
):
    print("ordinary")
    raise SystemExit(0)

pattern = re.compile(
    r"^manual pre-click reconciliation confirmed no request click; "
    r"artifact=("
    r"[0-9]{8}-[0-9]{6}-pre_request_success_unverified-"
    r"[a-z0-9][a-z0-9-]{0,89}--sha256-[0-9a-f]{12}\.txt"
    r"); sha256=([0-9a-f]{64}); "
    r"file_identity=([0-9]+:[0-9]+); "
    r"artifact_dir_identity=([0-9]+:[0-9]+); "
    r"resolved_dir_identity=([0-9]+:[0-9]+)$"
)
match = pattern.fullmatch(message)
if match is None:
    print("malformed")
    raise SystemExit(0)
print("derived\t" + "\t".join(match.groups()))
PY
}

verify_reconciliation_retry_authorization() {
  local url="$1"
  local latest_snapshot latest_status latest_message ledger_size ledger_digest
  local provenance provenance_kind
  local artifact_name artifact_digest file_identity
  local artifact_dir_identity resolved_dir_identity

  latest_snapshot="$(latest_operational_history_snapshot "$url")" || {
    echo "BLOCKED: authoritative GSC ledger could not be read while checking retry authorization for ${url}." >&2
    return 2
  }
  if ! parse_operational_history_snapshot "$latest_snapshot"; then
    echo "BLOCKED: authoritative GSC ledger returned an invalid retry authorization snapshot for ${url}." >&2
    return 2
  fi
  latest_status="$PARSED_LEDGER_STATUS"
  latest_message="$PARSED_LEDGER_MESSAGE"
  ledger_size="$PARSED_LEDGER_SIZE"
  ledger_digest="$PARSED_LEDGER_DIGEST"
  if [ "$latest_status" != "retry_pending" ]; then
    return 0
  fi

  provenance="$(classify_reconciliation_retry_provenance "$latest_message")" || {
    echo "BLOCKED: reconciliation retry provenance could not be parsed safely for ${url}." >&2
    return 2
  }

  IFS=$'\t' read -r \
    provenance_kind \
    artifact_name \
    artifact_digest \
    file_identity \
    artifact_dir_identity \
    resolved_dir_identity \
    <<<"$provenance"
  case "$provenance_kind" in
    ordinary)
      return 0
      ;;
    malformed)
      block_invalid_reconciliation_retry_authorization \
        "$url" \
        "$latest_message" \
        "$ledger_size" \
        "$ledger_digest"
      return $?
      ;;
    derived)
      if [ -z "$artifact_name" ] \
        || [ -z "$artifact_digest" ] \
        || [ -z "$file_identity" ] \
        || [ -z "$artifact_dir_identity" ] \
        || [ -z "$resolved_dir_identity" ]; then
        block_invalid_reconciliation_retry_authorization \
          "$url" \
          "$latest_message" \
          "$ledger_size" \
          "$ledger_digest"
        return $?
      fi
      ;;
    *)
      echo "BLOCKED: reconciliation retry provenance parser returned an invalid classification for ${url}." >&2
      return 2
      ;;
  esac

  if python3 \
    "${SCRIPT_DIR}/gsc-reconciliation.py" \
    verify \
    "$GSC_ARTIFACT_DIR" \
    "$artifact_name" \
    "$file_identity" \
    "$artifact_dir_identity" \
    "$resolved_dir_identity" \
    "$artifact_digest" \
    "$url" \
    >/dev/null; then
    return 0
  fi

  block_invalid_reconciliation_retry_authorization \
    "$url" \
    "$latest_message" \
    "$ledger_size" \
    "$ledger_digest"
  return $?
}

freeze_request_intent_authority() {
  local url="$1"
  local latest_snapshot latest_status latest_message
  local provenance provenance_kind

  REQUEST_INTENT_EXPECTED_STATUS=""
  REQUEST_INTENT_EXPECTED_MESSAGE=""
  REQUEST_INTENT_EXPECTED_LEDGER_SIZE=""
  REQUEST_INTENT_EXPECTED_LEDGER_DIGEST=""
  REQUEST_INTENT_ARTIFACT_BASENAME=""
  REQUEST_INTENT_ARTIFACT_DIGEST=""
  REQUEST_INTENT_ARTIFACT_IDENTITY=""
  REQUEST_INTENT_ARTIFACT_DIR_IDENTITY=""
  REQUEST_INTENT_RESOLVED_DIR_IDENTITY=""
  REQUEST_INTENT_RECORDED=0
  REQUEST_INTENT_LEDGER_SIZE=""
  REQUEST_INTENT_LEDGER_DIGEST=""

  verify_reconciliation_retry_authorization "$url" || return $?
  latest_snapshot="$(latest_operational_history_snapshot "$url")" || {
    echo "BLOCKED: authoritative GSC ledger could not be frozen before browser input for ${url}." >&2
    return 2
  }
  if ! parse_operational_history_snapshot "$latest_snapshot"; then
    echo "BLOCKED: authoritative GSC ledger returned an invalid latest-row snapshot for ${url}." >&2
    return 2
  fi
  latest_status="$PARSED_LEDGER_STATUS"
  latest_message="$PARSED_LEDGER_MESSAGE"
  REQUEST_INTENT_EXPECTED_LEDGER_SIZE="$PARSED_LEDGER_SIZE"
  REQUEST_INTENT_EXPECTED_LEDGER_DIGEST="$PARSED_LEDGER_DIGEST"
  if [ -z "$latest_status" ]; then
    latest_status="__missing__"
    latest_message=""
  fi

  case "$latest_status" in
    __missing__|retry_pending|stopped_mismatch|live_check_failed|quota_exceeded)
      ;;
    requested)
      if [ "$FORCE" -ne 1 ]; then
        echo "BLOCKED: ${url} became requested before browser input; refusing a duplicate request click." >&2
        return 1
      fi
      ;;
    request_click_pending|pre_request_success_unverified|reconciliation_archive_pending|post_request_target_unverified|post_request_confirmation_unknown)
      echo "BLOCKED: ${url} gained unresolved reconciliation state before browser input: ${latest_status}." >&2
      return 1
      ;;
    *)
      echo "BLOCKED: ${url} has an unsafe latest operational state before browser input: ${latest_status}." >&2
      return 2
      ;;
  esac

  if [ "$latest_status" = "retry_pending" ]; then
    provenance="$(classify_reconciliation_retry_provenance "$latest_message")" \
      || return 2
    IFS=$'\t' read -r \
      provenance_kind \
      REQUEST_INTENT_ARTIFACT_BASENAME \
      REQUEST_INTENT_ARTIFACT_DIGEST \
      REQUEST_INTENT_ARTIFACT_IDENTITY \
      REQUEST_INTENT_ARTIFACT_DIR_IDENTITY \
      REQUEST_INTENT_RESOLVED_DIR_IDENTITY \
      <<<"$provenance"
    case "$provenance_kind" in
      ordinary)
        REQUEST_INTENT_ARTIFACT_BASENAME=""
        REQUEST_INTENT_ARTIFACT_DIGEST=""
        REQUEST_INTENT_ARTIFACT_IDENTITY=""
        REQUEST_INTENT_ARTIFACT_DIR_IDENTITY=""
        REQUEST_INTENT_RESOLVED_DIR_IDENTITY=""
        ;;
      derived)
        if [ -z "$REQUEST_INTENT_ARTIFACT_BASENAME" ] \
          || [ -z "$REQUEST_INTENT_ARTIFACT_DIGEST" ] \
          || [ -z "$REQUEST_INTENT_ARTIFACT_IDENTITY" ] \
          || [ -z "$REQUEST_INTENT_ARTIFACT_DIR_IDENTITY" ] \
          || [ -z "$REQUEST_INTENT_RESOLVED_DIR_IDENTITY" ]; then
          echo "BLOCKED: reconciliation retry provenance could not be frozen for ${url}." >&2
          return 2
        fi
        ;;
      malformed)
        block_invalid_reconciliation_retry_authorization \
          "$url" \
          "$latest_message" \
          "$REQUEST_INTENT_EXPECTED_LEDGER_SIZE" \
          "$REQUEST_INTENT_EXPECTED_LEDGER_DIGEST"
        return $?
        ;;
      *)
        echo "BLOCKED: reconciliation retry provenance classification changed before browser input for ${url}." >&2
        return 2
        ;;
    esac
  fi

  REQUEST_INTENT_EXPECTED_STATUS="$latest_status"
  REQUEST_INTENT_EXPECTED_MESSAGE="$latest_message"
  return 0
}

append_frozen_request_click_intent() {
  local url="$1"
  local transition_output transition_size transition_digest

  if ! require_no_unresolved_reconciliation "$url"; then
    echo "BLOCKED: reconciliation authority appeared after browser input; refusing to persist or execute a request click for ${url}." >&2
    return 1
  fi
  if [ -n "$REQUEST_INTENT_ARTIFACT_BASENAME" ]; then
    verify_reconciliation_retry_authorization "$url" || return $?
    if ! transition_output="$(append_history_transition_or_block \
      "$REQUEST_INTENT_EXPECTED_STATUS" \
      1 \
      "$REQUEST_INTENT_EXPECTED_MESSAGE" \
      "request_click_pending" \
      "$url" \
      "$REQUEST_INTENT_MESSAGE" \
      "$REQUEST_INTENT_EXPECTED_LEDGER_SIZE" \
      "$REQUEST_INTENT_EXPECTED_LEDGER_DIGEST" \
      "$GSC_ARTIFACT_DIR" \
      "$REQUEST_INTENT_ARTIFACT_BASENAME" \
      "$REQUEST_INTENT_ARTIFACT_IDENTITY" \
      "$REQUEST_INTENT_ARTIFACT_DIR_IDENTITY" \
      "$REQUEST_INTENT_RESOLVED_DIR_IDENTITY" \
      "$REQUEST_INTENT_ARTIFACT_DIGEST")"; then
      return 1
    fi
  else
    if ! transition_output="$(append_history_transition_or_block \
      "$REQUEST_INTENT_EXPECTED_STATUS" \
      1 \
      "$REQUEST_INTENT_EXPECTED_MESSAGE" \
      "request_click_pending" \
      "$url" \
      "$REQUEST_INTENT_MESSAGE" \
      "$REQUEST_INTENT_EXPECTED_LEDGER_SIZE" \
      "$REQUEST_INTENT_EXPECTED_LEDGER_DIGEST")"; then
      return 1
    fi
  fi

  if [[ "$transition_output" != *$'\t'* ]] \
    || [[ "${transition_output#*$'\t'}" == *$'\t'* ]]; then
    echo "BLOCKED: request click intent transition returned an invalid ledger token for ${url}." >&2
    return 1
  fi
  transition_size="${transition_output%%$'\t'*}"
  transition_digest="${transition_output#*$'\t'}"
  if [[ ! "$transition_size" =~ ^[0-9]+$ ]] \
    || [[ ! "$transition_digest" =~ ^[0-9a-f]{64}$ ]]; then
    echo "BLOCKED: request click intent transition returned an invalid ledger token for ${url}." >&2
    return 1
  fi
  REQUEST_INTENT_LEDGER_SIZE="$transition_size"
  REQUEST_INTENT_LEDGER_DIGEST="$transition_digest"
  REQUEST_INTENT_RECORDED=1
  if ! require_no_unresolved_reconciliation_artifact "$url"; then
    echo "BLOCKED: reconciliation evidence appeared at the final pre-click boundary; the persisted intent remains unresolved and no browser click was attempted for ${url}." >&2
    return 1
  fi
  return 0
}

frozen_operational_snapshot_is_current() {
  local url="$1"
  local expected_status="$2"
  local expected_message="$3"
  local expected_ledger_size="$4"
  local expected_ledger_digest="$5"
  local latest_snapshot latest_status latest_message

  latest_snapshot="$(latest_operational_history_snapshot "$url")" || return 2
  if ! parse_operational_history_snapshot "$latest_snapshot"; then
    return 2
  fi
  latest_status="$PARSED_LEDGER_STATUS"
  latest_message="$PARSED_LEDGER_MESSAGE"
  if [ -z "$latest_status" ]; then
    latest_status="__missing__"
    latest_message=""
  fi
  [ "$latest_status" = "$expected_status" ] \
    && [ "$latest_message" = "$expected_message" ] \
    && [ "$PARSED_LEDGER_SIZE" = "$expected_ledger_size" ] \
    && [ "$PARSED_LEDGER_DIGEST" = "$expected_ledger_digest" ]
}

seal_drifted_request_intent_outcome() {
  local url="$1"
  local desired_status="$2"
  local latest_snapshot latest_status latest_message ledger_size ledger_digest
  local blocker_message transition_output

  latest_snapshot="$(latest_operational_history_snapshot "$url")" || return 2
  if ! parse_operational_history_snapshot "$latest_snapshot"; then
    return 2
  fi
  latest_status="$PARSED_LEDGER_STATUS"
  latest_message="$PARSED_LEDGER_MESSAGE"
  ledger_size="$PARSED_LEDGER_SIZE"
  ledger_digest="$PARSED_LEDGER_DIGEST"
  if [ -z "$latest_status" ]; then
    latest_status="__missing__"
    latest_message=""
  fi
  case "$latest_status" in
    requested)
      echo "Preserving concurrent requested authority after request-intent finalization drift: $url"
      return 0
      ;;
    request_click_pending|pre_request_success_unverified|reconciliation_archive_pending|post_request_target_unverified|post_request_confirmation_unknown)
      echo "BLOCKED: preserving concurrent reconciliation authority after request-intent finalization drift for ${url}: ${latest_status}." >&2
      return 1
      ;;
  esac

  blocker_message="request intent finalization lost exact ledger authority while recording ${desired_status}; click may have occurred and requires manual reconciliation"
  if transition_output="$(append_history_transition_or_block \
    "$latest_status" \
    1 \
    "$latest_message" \
    "post_request_confirmation_unknown" \
    "$url" \
    "$blocker_message" \
    "$ledger_size" \
    "$ledger_digest")"; then
    echo "BLOCKED: sealed request-intent finalization drift with a durable non-retry reconciliation blocker for ${url}." >&2
    return 1
  else
    echo "BLOCKED: request-intent finalization drift could not be sealed safely for ${url}." >&2
    return 2
  fi
}

append_frozen_operational_outcome() {
  local status="$1"
  local url="$2"
  local message="$3"
  local expected_status expected_message expected_ledger_size
  local expected_ledger_digest transition_output seal_status

  if [ "$REQUEST_INTENT_RECORDED" -eq 1 ]; then
    expected_status="request_click_pending"
    expected_message="$REQUEST_INTENT_MESSAGE"
    expected_ledger_size="$REQUEST_INTENT_LEDGER_SIZE"
    expected_ledger_digest="$REQUEST_INTENT_LEDGER_DIGEST"
  else
    expected_status="$REQUEST_INTENT_EXPECTED_STATUS"
    expected_message="$REQUEST_INTENT_EXPECTED_MESSAGE"
    expected_ledger_size="$REQUEST_INTENT_EXPECTED_LEDGER_SIZE"
    expected_ledger_digest="$REQUEST_INTENT_EXPECTED_LEDGER_DIGEST"
  fi
  if [ -z "$expected_status" ] \
    || [[ ! "$expected_ledger_size" =~ ^[0-9]+$ ]] \
    || [[ ! "$expected_ledger_digest" =~ ^[0-9a-f]{64}$ ]]; then
    echo "BLOCKED: no frozen authoritative state exists for outcome status=${status} url=${url}." >&2
    return 1
  fi

  if [ "$status" = "requested" ] \
    && ! require_no_unresolved_reconciliation_artifact "$url"; then
    echo "BLOCKED: reconciliation evidence exists; refusing to report requested for ${url}." >&2
    return 1
  fi

  if [ "$REQUEST_INTENT_RECORDED" -eq 0 ] \
    && { { [ "$expected_status" = "requested" ] \
        && [ "$status" != "requested" ]; } \
      || { [ "$expected_status" = "retry_pending" ] \
        && { [ "$status" = "retry_pending" ] \
          || [ "$status" = "stopped_mismatch" ] \
          || [ "$status" = "live_check_failed" ] \
          || [ "$status" = "quota_exceeded" ]; }; }; }; then
    if frozen_operational_snapshot_is_current \
      "$url" \
      "$expected_status" \
      "$expected_message" \
      "$expected_ledger_size" \
      "$expected_ledger_digest"; then
      echo "Preserving existing ${expected_status} authority for ${url}; outcome=${status} was not allowed to downgrade it."
      return 0
    fi
    echo "BLOCKED: authoritative state drifted while preserving ${expected_status} for ${url}." >&2
    return 1
  fi

  if [ "$REQUEST_INTENT_RECORDED" -eq 0 ] \
    && [ "$expected_status" = "retry_pending" ] \
    && [ "$status" = "requested" ] \
    && [ -n "$REQUEST_INTENT_ARTIFACT_BASENAME" ]; then
    verify_reconciliation_retry_authorization "$url" || return $?
    transition_output="$(append_history_transition_or_block \
      "$expected_status" \
      1 \
      "$expected_message" \
      "$status" \
      "$url" \
      "$message" \
      "$expected_ledger_size" \
      "$expected_ledger_digest" \
      "$GSC_ARTIFACT_DIR" \
      "$REQUEST_INTENT_ARTIFACT_BASENAME" \
      "$REQUEST_INTENT_ARTIFACT_IDENTITY" \
      "$REQUEST_INTENT_ARTIFACT_DIR_IDENTITY" \
      "$REQUEST_INTENT_RESOLVED_DIR_IDENTITY" \
      "$REQUEST_INTENT_ARTIFACT_DIGEST")"
    return $?
  fi

  if transition_output="$(append_history_transition_or_block \
    "$expected_status" \
    1 \
    "$expected_message" \
    "$status" \
    "$url" \
    "$message" \
    "$expected_ledger_size" \
    "$expected_ledger_digest")"; then
    return 0
  fi
  if [ "$REQUEST_INTENT_RECORDED" -eq 1 ]; then
    seal_drifted_request_intent_outcome "$url" "$status"
    seal_status=$?
    if [ "$seal_status" -eq 2 ] && [ "$status" = "requested" ]; then
      echo "BLOCKED: authoritative GSC ledger persistence failed for status=requested url=${url}" >&2
      echo "Do not retry automatically or report this URL complete; reconcile Search Console state and the ledger manually." >&2
      write_gsc_artifact \
        "ledger_write_failed_after_request" \
        "$url" \
        "Search Console may have accepted the request, but the authoritative ledger row could not be persisted; manual reconciliation required and automatic retry disabled." \
        || echo "Could not persist the fallback GSC reconciliation artifact." >&2
    fi
    return "$seal_status"
  fi
  return 1
}

verify_selected_reconciliation_retry_authorizations() {
  local url authorization_state

  for url in "${TARGET_URLS[@]}"; do
    verify_reconciliation_retry_authorization "$url"
    authorization_state=$?
    case "$authorization_state" in
      0)
        ;;
      1)
        return 1
        ;;
      *)
        echo "BLOCKED: retry authorization could not be established safely for ${url}." >&2
        return 2
        ;;
    esac
  done
  return 0
}

target_has_unresolved_reconciliation_status() {
  local url="$1"
  local latest_status

  if ! latest_status="$(latest_operational_history_status "$url")"; then
    return 2
  fi
  case "$latest_status" in
    request_click_pending|post_request_target_unverified|post_request_confirmation_unknown|pre_request_success_unverified|reconciliation_archive_pending)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

seal_reconciliation_artifact_blocker() {
  local url="$1"
  local reason="$2"
  local latest_snapshot latest_status latest_message
  local ledger_size ledger_digest transition_output

  if [ "$HISTORY_LOCK_HELD" -ne 1 ]; then
    return 1
  fi
  latest_snapshot="$(latest_operational_history_snapshot "$url")" || return 1
  parse_operational_history_snapshot "$latest_snapshot" || return 1
  latest_status="$PARSED_LEDGER_STATUS"
  latest_message="$PARSED_LEDGER_MESSAGE"
  ledger_size="$PARSED_LEDGER_SIZE"
  ledger_digest="$PARSED_LEDGER_DIGEST"
  if [ -z "$latest_status" ]; then
    latest_status="__missing__"
    latest_message=""
  fi
  case "$latest_status" in
    requested)
      echo "Preserving requested authority while artifact reconciliation blocks browser action: ${url}" >&2
      return 0
      ;;
    request_click_pending|pre_request_success_unverified|reconciliation_archive_pending|post_request_target_unverified|post_request_confirmation_unknown)
      echo "Preserving existing durable reconciliation authority ${latest_status} for ${url}." >&2
      return 0
      ;;
  esac
  transition_output="$(append_history_transition_or_block \
    "$latest_status" \
    1 \
    "$latest_message" \
    "reconciliation_archive_pending" \
    "$url" \
    "$reason" \
    "$ledger_size" \
    "$ledger_digest")" || return 1
  return 0
}

require_no_unresolved_reconciliation_artifact() {
  local url="$1"
  local artifact artifact_result

  artifact="$(unresolved_reconciliation_artifact "$url")"
  artifact_result=$?
  case "$artifact_result" in
    0)
      seal_reconciliation_artifact_blocker \
        "$url" \
        "active GSC reconciliation evidence blocks automatic submission; manual reconciliation required" \
        || echo "BLOCKED: active reconciliation evidence could not be sealed in the authoritative ledger for ${url}." >&2
      echo "BLOCKED: unresolved GSC reconciliation artifact exists for ${url}: ${artifact}" >&2
      echo "Verify Search Console state and reconcile the authoritative ledger before removing the artifact; automatic retry is disabled." >&2
      return 1
      ;;
    3)
      return 0
      ;;
    *)
      seal_reconciliation_artifact_blocker \
        "$url" \
        "GSC artifact authority changed or could not be verified; manual reconciliation required" \
        || echo "BLOCKED: artifact authority failure could not be sealed in the authoritative ledger for ${url}." >&2
      echo "BLOCKED: GSC reconciliation artifacts could not be checked safely for ${url}." >&2
      echo "Repair access to ${GSC_ARTIFACT_DIR} before any dry-run or formal submission." >&2
      return 1
      ;;
  esac
}

require_no_unresolved_reconciliation() {
  local url="$1"
  local ledger_status

  target_has_unresolved_reconciliation_status "$url"
  ledger_status=$?
  case "$ledger_status" in
    0)
      echo "BLOCKED: unresolved GSC reconciliation state exists in the authoritative ledger for ${url}." >&2
      echo "Verify Search Console state and append a reconciled requested/blocking row before retrying; automatic retry is disabled." >&2
      return 1
      ;;
    1)
      ;;
    *)
      echo "BLOCKED: authoritative GSC ledger identity or contents could not be checked safely for ${url}." >&2
      return 1
      ;;
  esac
  require_no_unresolved_reconciliation_artifact "$url"
}

prepare_pre_click_reconciliation() {
  local metadata active_artifact active_status

  metadata="$(python3 \
    "${SCRIPT_DIR}/gsc-reconciliation.py" \
    prepare \
    "$GSC_ARTIFACT_DIR" \
    "$GSC_ARTIFACT_DIR_IDENTITY" \
    "$RECONCILE_PRE_CLICK_ARTIFACT")" || return 1
  IFS=$'\t' read -r \
    RECONCILE_TARGET_URL \
    RECONCILE_ARTIFACT_BASENAME \
    RECONCILE_ARTIFACT_IDENTITY \
    RECONCILE_ARTIFACT_CANONICAL \
    RECONCILE_ARTIFACT_DIGEST \
    RECONCILE_ARTIFACT_DIR_IDENTITY \
    RECONCILE_ARTIFACT_STATE \
    RECONCILE_RESOLVED_DIR_IDENTITY \
    RECONCILE_ARTIFACT_STATUS <<<"$metadata"
  if [ -z "$RECONCILE_TARGET_URL" ] \
    || [ -z "$RECONCILE_ARTIFACT_BASENAME" ] \
    || [ -z "$RECONCILE_ARTIFACT_IDENTITY" ] \
    || [ -z "$RECONCILE_ARTIFACT_CANONICAL" ] \
    || [ -z "$RECONCILE_ARTIFACT_DIGEST" ] \
    || [ -z "$RECONCILE_ARTIFACT_DIR_IDENTITY" ] \
    || [ "$RECONCILE_ARTIFACT_DIR_IDENTITY" != "$GSC_ARTIFACT_DIR_IDENTITY" ] \
    || [ -z "$RECONCILE_RESOLVED_DIR_IDENTITY" ] \
    || [ "$RECONCILE_ARTIFACT_STATUS" != "pre_request_success_unverified" ] \
    || { [ "$RECONCILE_ARTIFACT_STATE" != "active" ] \
      && [ "$RECONCILE_ARTIFACT_STATE" != "archived" ]; }; then
    echo "Could not parse exact pre-click reconciliation metadata." >&2
    return 1
  fi

  active_artifact="$(unresolved_reconciliation_artifact "$RECONCILE_TARGET_URL")"
  active_status=$?
  if [ "$RECONCILE_ARTIFACT_STATE" = "active" ]; then
    if [ "$active_status" -ne 0 ] \
      || [ "$active_artifact" != "$RECONCILE_ARTIFACT_CANONICAL" ]; then
      echo "The supplied artifact is not the exact active reconciliation blocker for ${RECONCILE_TARGET_URL}." >&2
      return 1
    fi
  elif [ "$active_status" -ne 3 ]; then
    echo "Resolved reconciliation recovery is unsafe because another active artifact still blocks ${RECONCILE_TARGET_URL}." >&2
    return 1
  fi
  if [[ ! "$RECONCILE_RESOLVED_DIR_IDENTITY" =~ ^[0-9]+:[0-9]+$ ]]; then
    echo "Could not parse the resolved reconciliation authority identity." >&2
    return 1
  fi
  RECONCILE_TRANSACTION_MESSAGE="artifact=${RECONCILE_ARTIFACT_BASENAME}; sha256=${RECONCILE_ARTIFACT_DIGEST}; file_identity=${RECONCILE_ARTIFACT_IDENTITY}; artifact_dir_identity=${RECONCILE_ARTIFACT_DIR_IDENTITY}; resolved_dir_identity=${RECONCILE_RESOLVED_DIR_IDENTITY}; zero-click reconciliation archive pending"
  return 0
}

archive_reconciliation_artifact() {
  python3 \
    "${SCRIPT_DIR}/gsc-reconciliation.py" \
    archive \
    "$GSC_ARTIFACT_DIR" \
    "$RECONCILE_ARTIFACT_BASENAME" \
    "$RECONCILE_ARTIFACT_IDENTITY" \
    "$RECONCILE_ARTIFACT_DIR_IDENTITY" \
    "$RECONCILE_RESOLVED_DIR_IDENTITY" \
    "$RECONCILE_ARTIFACT_DIGEST"
}

reconcile_pre_click_retry() {
  local latest_snapshot latest_status latest_message archive_output
  local archived_path archived_resolved_identity
  local transition_output transition_size transition_digest
  local legacy_pre_click_message legacy_pre_click_message_v1

  prepare_pre_click_reconciliation || return 1
  latest_snapshot="$(latest_operational_history_snapshot "$RECONCILE_TARGET_URL")" \
    || return 1
  if ! parse_operational_history_snapshot "$latest_snapshot"; then
    echo "Could not parse the exact authoritative reconciliation snapshot." >&2
    return 1
  fi
  latest_status="$PARSED_LEDGER_STATUS"
  latest_message="$PARSED_LEDGER_MESSAGE"
  RECONCILE_LEDGER_SIZE="$PARSED_LEDGER_SIZE"
  RECONCILE_LEDGER_DIGEST="$PARSED_LEDGER_DIGEST"
  legacy_pre_click_message="pre-existing terminal state was unbound or conflicting; no request click occurred"
  legacy_pre_click_message_v1="pre-existing terminal state was unbound; no request click occurred"
  case "$latest_status" in
    pre_request_success_unverified)
      if [ "$RECONCILE_ARTIFACT_STATE" != "active" ]; then
        echo "Refusing an unbound archived artifact without a durable reconciliation transaction." >&2
        return 1
      fi
      if [[ "$latest_message" != "artifact=${RECONCILE_ARTIFACT_BASENAME};"* ]] \
        && [ "$latest_message" != "$legacy_pre_click_message" ] \
        && [ "$latest_message" != "$legacy_pre_click_message_v1" ]; then
        echo "Refusing pre-click reconciliation because the latest ledger message does not bind the exact active artifact." >&2
        return 1
      fi
      if ! transition_output="$(append_history_transition_or_block \
        "pre_request_success_unverified" \
        1 \
        "$latest_message" \
        "reconciliation_archive_pending" \
        "$RECONCILE_TARGET_URL" \
        "$RECONCILE_TRANSACTION_MESSAGE" \
        "$RECONCILE_LEDGER_SIZE" \
        "$RECONCILE_LEDGER_DIGEST")"; then
        return 1
      fi
      if [[ "$transition_output" != *$'\t'* ]] \
        || [[ "${transition_output#*$'\t'}" == *$'\t'* ]]; then
        echo "The reconciliation archive transition returned an invalid ledger token." >&2
        return 1
      fi
      transition_size="${transition_output%%$'\t'*}"
      transition_digest="${transition_output#*$'\t'}"
      if [[ ! "$transition_size" =~ ^[0-9]+$ ]] \
        || [[ ! "$transition_digest" =~ ^[0-9a-f]{64}$ ]]; then
        echo "The reconciliation archive transition returned an invalid ledger token." >&2
        return 1
      fi
      RECONCILE_LEDGER_SIZE="$transition_size"
      RECONCILE_LEDGER_DIGEST="$transition_digest"
      ;;
    reconciliation_archive_pending)
      if [ "$latest_message" != "$RECONCILE_TRANSACTION_MESSAGE" ]; then
        echo "Refusing reconciliation recovery because the latest transaction provenance does not bind the exact artifact." >&2
        return 1
      fi
      echo "Resuming transaction-bound reconciliation archival for ${RECONCILE_TARGET_URL}."
      ;;
    *)
      echo "Refusing pre-click retry reconciliation because the latest operational status is ${latest_status:-missing}, not pre_request_success_unverified or its exact archive transaction." >&2
      return 1
      ;;
  esac

  archive_output="$(archive_reconciliation_artifact)" || {
    echo "The reconciliation_archive_pending outcome is durable, but the exact artifact could not be archived." >&2
    echo "Automatic retry remains blocked; rerun the same command only after repairing the exact evidence authority." >&2
    return 1
  }
  IFS=$'\t' read -r archived_path archived_resolved_identity <<<"$archive_output"
  if [ "$archived_path" != "${GSC_ARTIFACT_DIR}/resolved/${RECONCILE_ARTIFACT_BASENAME}" ] \
    || [[ ! "$archived_resolved_identity" =~ ^[0-9]+:[0-9]+$ ]]; then
    echo "The reconciliation archive helper returned invalid authority metadata." >&2
    return 1
  fi
  if [ "$RECONCILE_RESOLVED_DIR_IDENTITY" != "$archived_resolved_identity" ]; then
    echo "The resolved reconciliation authority changed during archival recovery." >&2
    return 1
  fi
  if ! transition_output="$(append_history_transition_or_block \
    "reconciliation_archive_pending" \
    1 \
    "$RECONCILE_TRANSACTION_MESSAGE" \
    "retry_pending" \
    "$RECONCILE_TARGET_URL" \
    "manual pre-click reconciliation confirmed no request click; artifact=${RECONCILE_ARTIFACT_BASENAME}; sha256=${RECONCILE_ARTIFACT_DIGEST}; file_identity=${RECONCILE_ARTIFACT_IDENTITY}; artifact_dir_identity=${RECONCILE_ARTIFACT_DIR_IDENTITY}; resolved_dir_identity=${RECONCILE_RESOLVED_DIR_IDENTITY}" \
    "$RECONCILE_LEDGER_SIZE" \
    "$RECONCILE_LEDGER_DIGEST" \
    "$GSC_ARTIFACT_DIR" \
    "$RECONCILE_ARTIFACT_BASENAME" \
    "$RECONCILE_ARTIFACT_IDENTITY" \
    "$RECONCILE_ARTIFACT_DIR_IDENTITY" \
    "$RECONCILE_RESOLVED_DIR_IDENTITY" \
    "$RECONCILE_ARTIFACT_DIGEST")"; then
    return 1
  fi
  echo "Reconciled pre-click zero-click evidence for retry: ${RECONCILE_TARGET_URL}"
  echo "Archived reconciliation artifact: ${archived_path}"
  return 0
}

prepare_post_click_reconciliation() {
  local metadata active_artifact active_status

  metadata="$(python3 \
    "${SCRIPT_DIR}/gsc-reconciliation.py" \
    prepare \
    "$GSC_ARTIFACT_DIR" \
    "$GSC_ARTIFACT_DIR_IDENTITY" \
    "$RECONCILE_POST_CLICK_ARTIFACT")" || return 1
  IFS=$'\t' read -r \
    RECONCILE_TARGET_URL \
    RECONCILE_ARTIFACT_BASENAME \
    RECONCILE_ARTIFACT_IDENTITY \
    RECONCILE_ARTIFACT_CANONICAL \
    RECONCILE_ARTIFACT_DIGEST \
    RECONCILE_ARTIFACT_DIR_IDENTITY \
    RECONCILE_ARTIFACT_STATE \
    RECONCILE_RESOLVED_DIR_IDENTITY \
    RECONCILE_ARTIFACT_STATUS <<<"$metadata"
  if [ -z "$RECONCILE_TARGET_URL" ] \
    || [ -z "$RECONCILE_ARTIFACT_BASENAME" ] \
    || [ -z "$RECONCILE_ARTIFACT_IDENTITY" ] \
    || [ -z "$RECONCILE_ARTIFACT_CANONICAL" ] \
    || [ -z "$RECONCILE_ARTIFACT_DIGEST" ] \
    || [ -z "$RECONCILE_ARTIFACT_DIR_IDENTITY" ] \
    || [ "$RECONCILE_ARTIFACT_DIR_IDENTITY" != "$GSC_ARTIFACT_DIR_IDENTITY" ] \
    || [ -z "$RECONCILE_RESOLVED_DIR_IDENTITY" ] \
    || [ "$RECONCILE_ARTIFACT_STATUS" != "post_request_confirmation_unknown" ] \
    || { [ "$RECONCILE_ARTIFACT_STATE" != "active" ] \
      && [ "$RECONCILE_ARTIFACT_STATE" != "archived" ]; }; then
    echo "Could not parse exact post-click reconciliation metadata." >&2
    return 1
  fi

  active_artifact="$(unresolved_reconciliation_artifact "$RECONCILE_TARGET_URL")"
  active_status=$?
  if [ "$RECONCILE_ARTIFACT_STATE" = "active" ]; then
    if [ "$active_status" -ne 0 ] \
      || [ "$active_artifact" != "$RECONCILE_ARTIFACT_CANONICAL" ]; then
      echo "The supplied artifact is not the exact active reconciliation blocker for ${RECONCILE_TARGET_URL}." >&2
      return 1
    fi
  elif [ "$active_status" -ne 3 ]; then
    echo "Resolved post-click reconciliation recovery is unsafe because another active artifact still blocks ${RECONCILE_TARGET_URL}." >&2
    return 1
  fi
  if [[ ! "$RECONCILE_RESOLVED_DIR_IDENTITY" =~ ^[0-9]+:[0-9]+$ ]]; then
    echo "Could not parse the resolved reconciliation authority identity." >&2
    return 1
  fi
  RECONCILE_TRANSACTION_MESSAGE="artifact=${RECONCILE_ARTIFACT_BASENAME}; sha256=${RECONCILE_ARTIFACT_DIGEST}; file_identity=${RECONCILE_ARTIFACT_IDENTITY}; artifact_dir_identity=${RECONCILE_ARTIFACT_DIR_IDENTITY}; resolved_dir_identity=${RECONCILE_RESOLVED_DIR_IDENTITY}; read-only post-click success reconciliation archive pending"
  return 0
}

inspect_existing_requested_state() {
  local url="$1"
  local escaped_url input_result input_status result inspection_route_id
  local state state_status

  escaped_url=${url//\\/\\\\}
  escaped_url=${escaped_url//\'/\\\'}
  input_result="$(run_gsc_browser_call \
    "submit_input" \
    "globalThis.__VENTUREDEX_GSC__.submitInspectionInput('${escaped_url}');" \
    2>&1)"
  input_status=$?
  if [ "$input_status" -ne 0 ] || [ "$input_result" != "submitted" ]; then
    capture_gsc_surface_blocker "$input_result" || true
    echo "Post-click reconciliation could not submit the exact URL for read-only inspection; no request click was attempted." >&2
    return 1
  fi

  sleep "$INSPECT_WAIT_SECONDS"
  page_matches_inspected_url "$url"
  result=$?
  if [ "$result" -ne 0 ]; then
    echo "Post-click reconciliation did not render the exact inspected URL; no request click was attempted." >&2
    return 1
  fi
  inspection_route_id="$LAST_INSPECTION_ROUTE_ID"
  state="$(page_request_state "$url" "$inspection_route_id")"
  state_status=$?
  if [ "$state_status" -ne 0 ]; then
    echo "Post-click reconciliation request-state transport failed; the original blocker remains active." >&2
    return 1
  fi
  if [ "$state" != "success_static" ]; then
    capture_gsc_surface_blocker "$state" || true
    echo "Post-click reconciliation requires an existing route-bound success_static state; observed ${state:-transport_failure}." >&2
    echo "The original blocker remains active and Request indexing was not clicked." >&2
    return 1
  fi
  if ! page_matches_inspected_url "$url" "$inspection_route_id"; then
    echo "Post-click reconciliation lost exact target binding after the success probe; the original blocker remains active." >&2
    return 1
  fi
  return 0
}

verify_post_click_requested_state() {
  local inspect_url

  if ! require_deps; then
    echo "Post-click reconciliation browser dependencies are unavailable; the original blocker remains active." >&2
    return 1
  fi
  if ! ensure_bb_browser_connected; then
    echo "Post-click reconciliation could not connect to managed Comet; the original blocker remains active." >&2
    return 1
  fi
  inspect_url="https://search.google.com/search-console/inspect?resource_id=${GSC_RESOURCE_ID}&hl=${GSC_LANG}"
  if ! open_gsc_page "$inspect_url"; then
    echo "Post-click reconciliation could not open Search Console; the original blocker remains active." >&2
    return 1
  fi
  sleep "$NAV_WAIT_SECONDS"
  if ! verify_gsc_inspection_surface; then
    echo "Post-click reconciliation did not reach the authenticated VentureDex inspection surface; the original blocker remains active." >&2
    return 1
  fi
  inspect_existing_requested_state "$RECONCILE_TARGET_URL"
}

reconcile_post_click_requested() {
  local latest_snapshot latest_status latest_message archive_output
  local archived_path archived_resolved_identity transition_output
  local transition_size transition_digest final_message

  prepare_post_click_reconciliation || return 1
  latest_snapshot="$(latest_operational_history_snapshot "$RECONCILE_TARGET_URL")" \
    || return 1
  if ! parse_operational_history_snapshot "$latest_snapshot"; then
    echo "Could not parse the exact authoritative post-click reconciliation snapshot." >&2
    return 1
  fi
  latest_status="$PARSED_LEDGER_STATUS"
  latest_message="$PARSED_LEDGER_MESSAGE"
  RECONCILE_LEDGER_SIZE="$PARSED_LEDGER_SIZE"
  RECONCILE_LEDGER_DIGEST="$PARSED_LEDGER_DIGEST"
  final_message="manual post-click reconciliation observed existing route-bound Search Console success state without a request click; artifact=${RECONCILE_ARTIFACT_BASENAME}; sha256=${RECONCILE_ARTIFACT_DIGEST}; file_identity=${RECONCILE_ARTIFACT_IDENTITY}; artifact_dir_identity=${RECONCILE_ARTIFACT_DIR_IDENTITY}; resolved_dir_identity=${RECONCILE_RESOLVED_DIR_IDENTITY}"

  case "$latest_status" in
    post_request_confirmation_unknown)
      if [ "$RECONCILE_ARTIFACT_STATE" != "active" ]; then
        echo "Refusing an unbound archived post-click artifact without a durable reconciliation transaction." >&2
        return 1
      fi
      case "$latest_message" in
        "request click may have occurred; terminal confirmation was not detected"|\
        "browser click outcome was not returned reliably; click may have occurred"|\
        request\ intent\ finalization\ lost\ exact\ ledger\ authority*)
          ;;
        artifact="${RECONCILE_ARTIFACT_BASENAME}"\;*)
          ;;
        *)
          echo "Refusing post-click reconciliation because the latest ledger message does not match recognized uncertainty provenance." >&2
          return 1
          ;;
      esac
      if ! verify_post_click_requested_state; then
        return 1
      fi
      if ! transition_output="$(append_history_transition_or_block \
        "post_request_confirmation_unknown" \
        1 \
        "$latest_message" \
        "reconciliation_archive_pending" \
        "$RECONCILE_TARGET_URL" \
        "$RECONCILE_TRANSACTION_MESSAGE" \
        "$RECONCILE_LEDGER_SIZE" \
        "$RECONCILE_LEDGER_DIGEST")"; then
        return 1
      fi
      if [[ "$transition_output" != *$'\t'* ]] \
        || [[ "${transition_output#*$'\t'}" == *$'\t'* ]]; then
        echo "The post-click reconciliation transition returned an invalid ledger token." >&2
        return 1
      fi
      transition_size="${transition_output%%$'\t'*}"
      transition_digest="${transition_output#*$'\t'}"
      if [[ ! "$transition_size" =~ ^[0-9]+$ ]] \
        || [[ ! "$transition_digest" =~ ^[0-9a-f]{64}$ ]]; then
        echo "The post-click reconciliation transition returned an invalid ledger token." >&2
        return 1
      fi
      RECONCILE_LEDGER_SIZE="$transition_size"
      RECONCILE_LEDGER_DIGEST="$transition_digest"
      ;;
    reconciliation_archive_pending)
      if [ "$latest_message" != "$RECONCILE_TRANSACTION_MESSAGE" ]; then
        echo "Refusing post-click reconciliation recovery because the latest transaction provenance does not bind the exact artifact." >&2
        return 1
      fi
      echo "Resuming transaction-bound post-click reconciliation archival for ${RECONCILE_TARGET_URL}."
      ;;
    requested)
      if [ "$RECONCILE_ARTIFACT_STATE" = "archived" ] \
        && [ "$latest_message" = "$final_message" ]; then
        echo "Post-click reconciliation was already completed for ${RECONCILE_TARGET_URL}."
        return 0
      fi
      echo "Refusing post-click reconciliation because requested authority is not bound to this exact archived artifact." >&2
      return 1
      ;;
    *)
      echo "Refusing post-click requested reconciliation because the latest operational status is ${latest_status:-missing}." >&2
      return 1
      ;;
  esac

  archive_output="$(archive_reconciliation_artifact)" || {
    echo "The reconciliation_archive_pending outcome is durable, but the exact post-click artifact could not be archived." >&2
    echo "The requested outcome remains blocked; rerun the same command only after repairing the exact evidence authority." >&2
    return 1
  }
  IFS=$'\t' read -r archived_path archived_resolved_identity <<<"$archive_output"
  if [ "$archived_path" != "${GSC_ARTIFACT_DIR}/resolved/${RECONCILE_ARTIFACT_BASENAME}" ] \
    || [[ ! "$archived_resolved_identity" =~ ^[0-9]+:[0-9]+$ ]] \
    || [ "$RECONCILE_RESOLVED_DIR_IDENTITY" != "$archived_resolved_identity" ]; then
    echo "The post-click reconciliation archive helper returned invalid authority metadata." >&2
    return 1
  fi
  if ! transition_output="$(append_history_transition_or_block \
    "reconciliation_archive_pending" \
    1 \
    "$RECONCILE_TRANSACTION_MESSAGE" \
    "requested" \
    "$RECONCILE_TARGET_URL" \
    "$final_message" \
    "$RECONCILE_LEDGER_SIZE" \
    "$RECONCILE_LEDGER_DIGEST" \
    "$GSC_ARTIFACT_DIR" \
    "$RECONCILE_ARTIFACT_BASENAME" \
    "$RECONCILE_ARTIFACT_IDENTITY" \
    "$RECONCILE_ARTIFACT_DIR_IDENTITY" \
    "$RECONCILE_RESOLVED_DIR_IDENTITY" \
    "$RECONCILE_ARTIFACT_DIGEST")"; then
    return 1
  fi
  echo "Reconciled existing indexing request without a duplicate click: ${RECONCILE_TARGET_URL}"
  echo "Archived reconciliation artifact: ${archived_path}"
  return 0
}

capture_page_text() {
  run_js "/*VENTUREDEX_SAFE_PAGE_CAPTURE:inspection_surface_ready*/(function(){
    var observed='invalid_location';
    var current;
    try {
      current=new URL(location.href);
      observed=current.origin+current.pathname;
      if(current.origin!=='https://search.google.com' ||
         current.pathname!=='/search-console/inspect' ||
         current.searchParams.get('resource_id')!=='sc-domain:venturedex.co') {
        return 'Page text capture suppressed outside authenticated VentureDex Search Console inspection surface; observed '+observed;
      }
    } catch (_error) {
      return 'Page text capture suppressed outside authenticated VentureDex Search Console inspection surface; observed '+observed;
    }
    var runtime=globalThis.__VENTUREDEX_GSC__;
    if(!runtime || runtime.inspectionSurface()!=='inspection_surface_ready') {
      return 'Page text capture suppressed because the authenticated VentureDex Search Console inspection surface was not ready; observed '+observed;
    }
    var routeIds=current.searchParams.getAll('id');
    var routeId=routeIds.length===1?routeIds[0]:'';
    var roots=Array.from(document.querySelectorAll('c-wiz[jsrenderer=\"jtca7c\"][jsname=\"a9kxte\"][data-p]'))
      .filter(function(root){
        return root.getClientRects &&
          root.getClientRects().length>0 &&
          root.getAttribute('aria-busy')!=='true' &&
          String(root.getAttribute('data-p')||'').includes(routeId||'');
      });
    if(routeIds.length!==1 || !routeId || roots.length!==1) {
      return 'Page text capture suppressed because one active route-bound inspection root was not available; observed '+observed;
    }
    var text=roots[0].innerText||roots[0].textContent||'';
    return text
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi,'[redacted-email]')
      .replace(/\\s+$/,'')
      .slice(0,8000);
  })();" 2>/dev/null || true
}

write_gsc_artifact() {
  local status="$1"
  local url="$2"
  local message="$3"
  local page_text page_state target_key file artifact_timestamp filename_timestamp
  local sanitized_message sanitized_page_state

  LAST_GSC_ARTIFACT_BASENAME=""
  if [ -n "${BB_BROWSER_TAB_ID:-}" ]; then
    page_text="$(capture_page_text)"
    page_state="$(page_request_state 2>/dev/null || true)"
  else
    page_text="Managed Search Console tab was unavailable; no page text captured."
    page_state="browser_tab_unavailable"
  fi
  target_key="$(artifact_target_key "$url")" || return 1
  artifact_timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  filename_timestamp="$(date '+%Y%m%d-%H%M%S')"
  LAST_GSC_ARTIFACT_BASENAME="${filename_timestamp}-${status}-${target_key}.txt"
  sanitized_message="$(printf '%s' "$message" | tr '\t\r\n' '   ')"
  sanitized_page_state="$(printf '%s' "${page_state:-unknown}" | tr '\t\r\n' '   ')"
  file="$(python3 \
    "${SCRIPT_DIR}/gsc-reconciliation.py" \
    write \
    "$GSC_ARTIFACT_DIR" \
    "$GSC_ARTIFACT_DIR_IDENTITY" \
    "$LAST_GSC_ARTIFACT_BASENAME" \
    "$artifact_timestamp" \
    "$status" \
    "$url" \
    "$sanitized_message" \
    "$sanitized_page_state" \
    "$page_text")" || {
    echo "Could not durably create exclusive GSC diagnostic artifact: ${GSC_ARTIFACT_DIR}/${LAST_GSC_ARTIFACT_BASENAME}" >&2
    LAST_GSC_ARTIFACT_BASENAME=""
    return 1
  }

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
  local latest_status

  if ! latest_status="$(latest_operational_history_status "$url")"; then
    return 2
  fi
  [ "$latest_status" = "requested" ]
}

retry_pending_urls() {
  python3 - "$HISTORY_FILE" "$HISTORY_FILE_IDENTITY" <<'PY'
import os
import re
import stat
import sys
from pathlib import Path

history = Path(sys.argv[1])
expected_identity = sys.argv[2]
canonical = re.compile(
    r"^https://venturedex\.co/(?:startups/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|weekly/[1-9][0-9]*)$"
)
timestamp_pattern = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$")
allowed_statuses = {
    "requested",
    "dry_run",
    "retry_pending",
    "stopped_mismatch",
    "live_check_failed",
    "quota_exceeded",
    "request_click_pending",
    "pre_request_success_unverified",
    "reconciliation_archive_pending",
    "post_request_target_unverified",
    "post_request_confirmation_unknown",
}
latest = {}

flags = (
    os.O_RDONLY
    | getattr(os, "O_NONBLOCK", 0)
    | getattr(os, "O_NOFOLLOW", 0)
)
try:
    fd = os.open(history, flags)
except OSError as error:
    raise SystemExit(
        f"Authoritative GSC ledger must be a readable regular, "
        f"non-symlink file: {history}: {error}"
    )
try:
    opened_stat = os.fstat(fd)
    if not stat.S_ISREG(opened_stat.st_mode):
        raise SystemExit(
            f"Authoritative GSC ledger must be a regular, non-symlink file: {history}"
        )
    if opened_stat.st_nlink != 1:
        raise SystemExit(
            f"Authoritative GSC ledger must not have hard-link aliases: {history}"
        )
    if (
        not expected_identity
        or f"{opened_stat.st_dev}:{opened_stat.st_ino}" != expected_identity
    ):
        raise SystemExit(f"Authoritative GSC ledger identity changed: {history}")
    if history.resolve(strict=True) != history:
        raise SystemExit(
            f"Authoritative GSC ledger no longer resolves to its frozen "
            f"canonical authority: {history}"
        )
    chunks = []
    while True:
        chunk = os.read(fd, 65536)
        if not chunk:
            break
        chunks.append(chunk)
    current_stat = os.lstat(history)
    if (
        not stat.S_ISREG(current_stat.st_mode)
        or current_stat.st_nlink != 1
        or current_stat.st_dev != opened_stat.st_dev
        or current_stat.st_ino != opened_stat.st_ino
    ):
        raise SystemExit(
            f"Authoritative GSC ledger path changed while reading: {history}"
        )
finally:
    os.close(fd)
text = b"".join(chunks).decode("utf-8")
if text and not text.endswith("\n"):
    raise SystemExit(
        f"Authoritative GSC ledger must end with a terminal LF: {history}"
    )
if re.search(r"\r(?!\n)|[\v\f\x1c-\x1f\x85\ufeff\u2028\u2029]", text):
    raise SystemExit(f"Invalid GSC ledger line separator in {history}")
lines = text.replace("\r\n", "\n").split("\n")
if not lines or lines[0] != "timestamp\tstatus\turl\tmessage":
    raise SystemExit(f"Invalid GSC ledger header in {history}")
for sequence, line in enumerate(lines[1:]):
    if not line:
        continue
    row = line.split("\t")
    if len(row) != 4:
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{sequence + 2}: "
            f"expected 4 columns; found {len(row)}"
        )
    timestamp, status, url, _message = row
    if (
        not timestamp
        or not status
        or not url
        or any(value != value.strip() for value in (timestamp, status, url))
    ):
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{sequence + 2}: "
            "timestamp, status, and url are required and cannot have outer whitespace"
        )
    if not canonical.fullmatch(url):
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{sequence + 2}: "
            "url must be a canonical VentureDex detail URL"
        )
    if not timestamp_pattern.fullmatch(timestamp):
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{sequence + 2}: "
            "timestamp must use YYYY-MM-DD HH:MM:SS"
        )
    if status not in allowed_statuses:
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{sequence + 2}: "
            f"unknown status {status!r}"
        )
    if status == "dry_run":
        continue
    latest[url] = (status, timestamp, sequence)

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
  local pending_output url authorization_state
  local selected_count
  local capacity=0
  local added=0
  local remaining=0
  local blocked=0

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
    verify_reconciliation_retry_authorization "$url"
    authorization_state=$?
    case "$authorization_state" in
      0)
        ;;
      1)
        blocked=$((blocked + 1))
        continue
        ;;
      *)
        echo "Could not establish fail-closed GSC retry authorization for ${url}." >&2
        return 1
        ;;
    esac
    if [ "$added" -lt "$capacity" ]; then
      add_target "$url"
      added=$((added + 1))
    else
      remaining=$((remaining + 1))
    fi
  done <<< "$pending_output"

  echo "GSC retry backlog: selected=${added}, remaining=${remaining}, blocked=${blocked}, max_urls=${MAX_URLS}"
  if [ "$blocked" -ne 0 ]; then
    echo "BLOCKED: the GSC retry backlog contained ${blocked} reconciliation-derived target(s) without current canonical evidence." >&2
    echo "No backlog target will be previewed or submitted until those durable blockers are reconciled." >&2
    return 1
  fi
  return 0
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
  for cmd in "$BB_BROWSER_CMD" curl tail sed grep python3; do
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
    return 1
  fi
  return 0
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

daemon_state_present() {
  [ -e "$BB_BROWSER_DAEMON_STATE_FILE" ] || [ -L "$BB_BROWSER_DAEMON_STATE_FILE" ]
}

bb_browser_daemon_presence() {
  local daemon_status
  if daemon_state_present; then
    return 0
  fi
  daemon_status="$(bb_browser_daemon_status)"
  if printf '%s\n' "$daemon_status" | grep -Eq 'Daemon running:[[:space:]]+yes'; then
    return 0
  fi
  if printf '%s\n' "$daemon_status" | grep -Eq 'Daemon not running'; then
    return 1
  fi
  return 2
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
  sleep "$COMET_START_WAIT_SECONDS"

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
  local daemon_presence_status
  BB_BROWSER_CONNECTION_BLOCKER=""
  if bb_browser_connected; then
    return 0
  fi

  if ! ensure_comet_cdp_ready; then
    BB_BROWSER_CONNECTION_BLOCKER="gsc_browser_cdp_blocker: managed Comet CDP ${COMET_CDP_HOST}:${COMET_CDP_PORT} was unavailable; no daemon lifecycle action or Search Console interaction occurred"
    return 1
  fi

  bb_browser_daemon_presence
  daemon_presence_status=$?
  case "$daemon_presence_status" in
    0)
      BB_BROWSER_CONNECTION_BLOCKER="gsc_browser_unowned_daemon_blocker: an existing bb-browser daemon or daemon state is not owned by this run while managed Comet CDP is reachable; no daemon was stopped, restarted, or replaced before any Search Console interaction"
      echo "bb-browser is disconnected, but an existing daemon is not owned by this run; refusing to stop or replace it." >&2
      print_bb_browser_debug
      return 1
      ;;
    1)
      BB_BROWSER_CONNECTION_BLOCKER="gsc_browser_daemon_unavailable_blocker: managed Comet CDP is reachable but no bb-browser daemon is running; this submitter does not start, stop, or replace daemons on the shared browser endpoint before Search Console interaction"
      echo "bb-browser is disconnected and no daemon is running; automatic daemon startup is disabled for shared-browser safety." >&2
      print_bb_browser_debug
      return 1
      ;;
    *)
      BB_BROWSER_CONNECTION_BLOCKER="gsc_browser_shared_cdp_blocker: managed Comet CDP is reachable but bb-browser daemon ownership is ambiguous; no daemon was stopped, restarted, or replaced before any Search Console interaction"
      echo "bb-browser daemon state is ambiguous; refusing to start, stop, or replace a daemon on the shared CDP endpoint." >&2
      print_bb_browser_debug
      return 1
      ;;
  esac
}

open_gsc_page() {
  local inspect_url="$1"
  local output
  if ! output=$("$BB_BROWSER_CMD" open "$inspect_url" 2>&1); then
    echo "Could not open the managed Search Console tab." >&2
    printf '%s\n' "$output" >&2
    return 1
  fi
  BB_BROWSER_TAB_ID=$(printf '%s\n' "$output" | sed -nE 's/^tab:[[:space:]]*([^[:space:]]+).*$/\1/p' | head -n 1)
  if ! printf '%s\n' "$BB_BROWSER_TAB_ID" | grep -Eq '^[A-Za-z0-9_-]+$'; then
    echo "Managed Search Console tab opened without a usable tab id." >&2
    printf '%s\n' "$output" >&2
    BB_BROWSER_TAB_ID=""
    return 1
  fi
  BB_BROWSER_TAB_OPENED=1
  return 0
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

load_gsc_browser_runtime() {
  if [ -n "$GSC_BROWSER_RUNTIME" ]; then
    return 0
  fi
  if [ ! -r "$GSC_BROWSER_RUNTIME_FILE" ]; then
    echo "Missing GSC browser runtime: $GSC_BROWSER_RUNTIME_FILE" >&2
    return 1
  fi
  GSC_BROWSER_RUNTIME="$(tr '\n' ' ' < "$GSC_BROWSER_RUNTIME_FILE")"
}

run_gsc_browser_call() {
  local marker="$1"
  local call="$2"
  load_gsc_browser_runtime || return 1
  run_js "${GSC_BROWSER_RUNTIME};/*VENTUREDEX_CALL:${marker}*/${call}"
}

verify_gsc_inspection_surface() {
  local result result_status
  GSC_SURFACE_BLOCKER=""
  GSC_SURFACE_OBSERVED=""
  result="$(run_gsc_browser_call \
    "inspection_entry_surface" \
    "globalThis.__VENTUREDEX_GSC__.inspectionEntrySurface();" \
    2>&1)"
  result_status=$?
  if [ "$result_status" -eq 0 ] \
    && [ "$result" = "inspection_entry_surface_ready" ]; then
    return 0
  fi
  capture_gsc_surface_blocker "$result" || true
  if [ -z "$GSC_SURFACE_BLOCKER" ]; then
    GSC_SURFACE_BLOCKER="gsc_inspection_surface_blocker"
    GSC_SURFACE_OBSERVED="unknown"
  fi
  echo "Search Console inspection surface preflight failed: ${GSC_SURFACE_BLOCKER}; observed=${GSC_SURFACE_OBSERVED}" >&2
  return 1
}

capture_gsc_surface_blocker() {
  local result="$1"
  local observed
  if printf '%s\n' "$result" | grep -q 'gsc_auth_session_blocker'; then
    GSC_SURFACE_BLOCKER="gsc_auth_session_blocker"
  elif printf '%s\n' "$result" | grep -q 'gsc_inspection_surface_blocker'; then
    GSC_SURFACE_BLOCKER="gsc_inspection_surface_blocker"
  else
    return 1
  fi
  observed="$(printf '%s\n' "$result" | sed -nE 's/.*(gsc_[a-z_]+_blocker)\|\|\|([^[:space:]]+).*/\2/p' | tail -n 1)"
  GSC_SURFACE_OBSERVED="${observed:-unknown}"
  return 0
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

page_quota_state() {
  run_js "(function(){var t=document.body?document.body.innerText:'';return /(quota|配额)/i.test(t)?'quota':'ok';})();" 2>/dev/null
}

page_request_state() {
  local url="${1:-}"
  local expected_route_id="${2:-}"
  local escaped_url escaped_route_id
  escaped_url=${url//\\/\\\\}
  escaped_url=${escaped_url//\'/\\\'}
  escaped_route_id=${expected_route_id//\\/\\\\}
  escaped_route_id=${escaped_route_id//\'/\\\'}
  run_gsc_browser_call \
    "request_state" \
    "globalThis.__VENTUREDEX_GSC__.requestState('${escaped_url}','${escaped_route_id}');" \
    2>/dev/null
}

page_matches_inspected_url() {
  local url="$1"
  local expected_route_id="${2:-}"
  local escaped_url escaped_route_id inspection_probe validated_route_id
  escaped_url=${url//\\/\\\\}
  escaped_url=${escaped_url//\'/\\\'}
  escaped_route_id=${expected_route_id//\\/\\\\}
  escaped_route_id=${escaped_route_id//\'/\\\'}
  inspection_probe="$(run_gsc_browser_call \
    "inspect_target" \
    "globalThis.__VENTUREDEX_GSC__.inspectTarget('${escaped_url}','${escaped_route_id}');" \
    2>/dev/null || true)"
  case "$inspection_probe" in
    inspection_target_match\|\|\|*)
      validated_route_id="${inspection_probe#inspection_target_match|||}"
      ;;
    *gsc_auth_session_blocker*|*gsc_inspection_surface_blocker*)
      capture_gsc_surface_blocker "$inspection_probe" || true
      LAST_INSPECTION_ROUTE_ID=""
      return 2
      ;;
    *)
      LAST_INSPECTION_ROUTE_ID=""
      return 1
      ;;
  esac
  if ! printf '%s\n' "$validated_route_id" |
    grep -Eq '^[A-Za-z0-9_-]{1,255}$'; then
    LAST_INSPECTION_ROUTE_ID=""
    return 1
  fi
  LAST_INSPECTION_ROUTE_ID="$validated_route_id"
  return 0
}

wait_for_request_result() {
  local pre_click_state="${1:-unknown}"
  local url="${2:-}"
  local inspection_route_id="${3:-}"
  local attempt state state_status saw_non_failed_after_click=0
  for attempt in 1 2 3 4 5; do
    state="$(page_request_state "$url" "$inspection_route_id")"
    state_status=$?
    if [ "$state_status" -ne 0 ]; then
      return 3
    fi
    if [ "$state" = "success" ] && [ "$pre_click_state" != "success" ]; then
      return 0
    fi
    if [ "$state" = "success_static" ] && [ "$pre_click_state" != "success_static" ]; then
      return 0
    fi
    if [ "$state" = "quota" ]; then
      return 2
    fi
    if [ "$state" = "failed" ] && [ "$pre_click_state" != "failed" ]; then
      return 4
    fi
    if [ "$pre_click_state" = "failed" ]; then
      if [ "$state" != "failed" ]; then
        saw_non_failed_after_click=1
      elif [ "$saw_non_failed_after_click" -eq 1 ]; then
        return 4
      fi
    fi
    if [ "$state" = "target_changed" ]; then
      return 6
    fi
    case "$state" in
      gsc_auth_session_blocker\|\|\|*|gsc_inspection_surface_blocker\|\|\|*)
        capture_gsc_surface_blocker "$state" || true
        return 6
        ;;
      unknown|failed|success|success_static)
        ;;
      conflict)
        return 3
        ;;
      *)
        return 3
        ;;
    esac
    sleep "$REQUEST_RESULT_WAIT_SECONDS"
  done
  return 3
}

dismiss_success_dialog() {
  local dismiss_result dismiss_status verify_result verify_status

  dismiss_result="$(run_gsc_browser_call \
    "dismiss_success_dialog" \
    "globalThis.__VENTUREDEX_GSC__.dismissSuccessDialog();" \
    2>&1)"
  dismiss_status=$?
  if [ "$dismiss_status" -ne 0 ]; then
    echo "Confirmed request, but success-dialog cleanup transport failed." >&2
    return 1
  fi
  case "$dismiss_result" in
    success_dialog_absent)
      return 0
      ;;
    success_dialog_dismissed)
      ;;
    *)
      echo "Confirmed request, but the success dialog could not be dismissed unambiguously: ${dismiss_result}" >&2
      return 1
      ;;
  esac

  sleep "$POST_MODAL_WAIT_SECONDS"
  verify_result="$(run_gsc_browser_call \
    "success_dialog_state" \
    "globalThis.__VENTUREDEX_GSC__.successDialogState();" \
    2>&1)"
  verify_status=$?
  if [ "$verify_status" -eq 0 ] \
    && [ "$verify_result" = "success_dialog_absent" ]; then
    return 0
  fi
  echo "Confirmed request, but the success dialog remained or its cleanup state was ambiguous: ${verify_result:-transport_failure}" >&2
  return 1
}

submit_single_url() {
  local url="$1"
  local escaped_url escaped_route_id force_js input_result input_call_status click_result click_call_status
  local inspection_route_id pre_click_state pre_click_state_status quota_state quota_state_status result

  if ! freeze_request_intent_authority "$url"; then
    echo "The authoritative GSC request state could not be frozen before browser input; refusing to click: $url" >&2
    return 16
  fi

  escaped_url=${url//\\/\\\\}
  escaped_url=${escaped_url//\'/\\\'}

  input_result="$(run_gsc_browser_call \
    "submit_input" \
    "globalThis.__VENTUREDEX_GSC__.submitInspectionInput('${escaped_url}');" \
    2>&1)"
  input_call_status=$?
  if [ "$input_call_status" -ne 0 ]; then
    echo "URL inspection input transport failed before any request click." >&2
    return 7
  fi
  case "$input_result" in
    submitted)
      ;;
    gsc_auth_session_blocker\|\|\|*|gsc_inspection_surface_blocker\|\|\|*)
      capture_gsc_surface_blocker "$input_result" || true
      echo "Search Console left the authenticated inspection entry surface before input." >&2
      return 12
      ;;
    *)
      echo "URL inspection input was not found unambiguously or did not accept the URL." >&2
      return 7
      ;;
  esac

  sleep "$INSPECT_WAIT_SECONDS"

  page_matches_inspected_url "$url"
  result=$?
  if [ "$result" -ne 0 ]; then
    echo "Search Console did not render the exact inspected URL; refusing to click: $url" >&2
    if [ "$result" -eq 2 ]; then
      return 12
    fi
    return 5
  fi
  inspection_route_id="$LAST_INSPECTION_ROUTE_ID"
  escaped_route_id=${inspection_route_id//\\/\\\\}
  escaped_route_id=${escaped_route_id//\'/\\\'}
  force_js="false"
  if [ "$FORCE" -eq 1 ]; then
    force_js="true"
  fi
  pre_click_state="$(page_request_state "$url" "$inspection_route_id")"
  pre_click_state_status=$?
  if [ "$pre_click_state_status" -ne 0 ] || [ -z "$pre_click_state" ]; then
    echo "The pre-click Search Console request-state probe was unavailable; refusing to click." >&2
    return 14
  fi
  case "$pre_click_state" in
    gsc_auth_session_blocker\|\|\|*|gsc_inspection_surface_blocker\|\|\|*)
      capture_gsc_surface_blocker "$pre_click_state" || true
      return 12
      ;;
    target_changed)
      return 8
      ;;
    success|success_static|conflict|quota|failed|unknown)
      ;;
    *)
      echo "The pre-click Search Console request-state probe returned an unknown marker; refusing to click." >&2
      return 14
      ;;
  esac
  if [ "$pre_click_state" = "success" ] || [ "$pre_click_state" = "conflict" ]; then
    echo "Search Console exposes an unbound or conflicting pre-request terminal state; refusing to infer completion or click." >&2
    return 10
  fi
  if [ "$FORCE" -ne 1 ] && [ "$pre_click_state" = "success_static" ]; then
    echo "Search Console already shows an indexing-request success state for the exact target; refusing a duplicate click." >&2
    return 9
  fi
  if [ "$pre_click_state" = "quota" ]; then
    echo "Detected target-bound Search Console quota limit." >&2
    return 2
  fi
  if [ "$pre_click_state" = "unknown" ] || [ "$pre_click_state" = "failed" ]; then
    quota_state="$(page_quota_state)"
    quota_state_status=$?
    if [ "$quota_state_status" -ne 0 ] \
      || { [ "$quota_state" != "quota" ] && [ "$quota_state" != "ok" ]; }; then
      echo "The pre-click Search Console quota probe was unavailable; refusing to click." >&2
      return 14
    fi
    if [ "$quota_state" = "quota" ]; then
      echo "Detected Search Console quota limit." >&2
      return 2
    fi
  fi

  if ! append_frozen_request_click_intent "$url"; then
    echo "Request click intent could not be persisted; refusing the browser action." >&2
    return 11
  fi
  if ! frozen_operational_snapshot_is_current \
    "$url" \
    "request_click_pending" \
    "$REQUEST_INTENT_MESSAGE" \
    "$REQUEST_INTENT_LEDGER_SIZE" \
    "$REQUEST_INTENT_LEDGER_DIGEST"; then
    echo "The authoritative request-click intent changed at the final browser boundary; refusing the browser action." >&2
    return 11
  fi
  if ! require_no_unresolved_reconciliation_artifact "$url"; then
    echo "Reconciliation evidence appeared at the final browser boundary; refusing the browser action." >&2
    return 11
  fi

  click_result="$(run_gsc_browser_call \
    "click_target" \
    "globalThis.__VENTUREDEX_GSC__.clickTarget('${escaped_url}','${escaped_route_id}',${force_js},'${pre_click_state}');" \
    2>&1)"
  click_call_status=$?
  if [ "$click_call_status" -ne 0 ]; then
    echo "Browser click transport failed; the persisted intent requires manual reconciliation." >&2
    return 13
  fi
  if [ "$click_result" != "clicked" ]; then
    if printf '%s' "$click_result" | grep -q '^gsc_.*_blocker|||'; then
      capture_gsc_surface_blocker "$click_result" || true
      echo "Search Console left the authenticated inspection surface before the request click." >&2
      return 12
    fi
    if printf '%s' "$click_result" | grep -q '^inspection_'; then
      echo "The active Search Console inspection changed before the request click." >&2
      return 8
    fi
    if [ "$click_result" = "request_button_ambiguous" ]; then
      echo "Request indexing button was not found unambiguously." >&2
      return 1
    fi
    case "$click_result" in
      preclick_terminal\|\|\|success_static)
        return 9
        ;;
      preclick_terminal\|\|\|success|preclick_terminal\|\|\|conflict)
        return 10
        ;;
      preclick_terminal\|\|\|quota)
        return 2
        ;;
      preclick_terminal\|\|\|failed)
        return 4
        ;;
    esac
    echo "Browser click outcome was not returned reliably; the persisted intent requires manual reconciliation." >&2
    return 13
  fi

  sleep "$POST_CLICK_WAIT_SECONDS"
  wait_for_request_result "$pre_click_state" "$url" "$inspection_route_id"
  result=$?
  if [ "$result" -ne 0 ]; then
    return "$result"
  fi

  if ! page_matches_inspected_url "$url" "$inspection_route_id"; then
    echo "Search Console success state is not associated with the exact inspected URL: $url" >&2
    return 6
  fi

  if ! dismiss_success_dialog; then
    return 15
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
      --reconcile-pre-click-retry)
        if [ $# -lt 2 ]; then
          echo "--reconcile-pre-click-retry requires an artifact path" >&2
          exit 1
        fi
        if [ -n "$RECONCILE_PRE_CLICK_ARTIFACT" ]; then
          echo "--reconcile-pre-click-retry may be specified only once" >&2
          exit 1
        fi
        RECONCILE_PRE_CLICK_ARTIFACT="$2"
        shift 2
        ;;
      --reconcile-post-click-requested)
        if [ $# -lt 2 ]; then
          echo "--reconcile-post-click-requested requires an artifact path" >&2
          exit 1
        fi
        if [ -n "$RECONCILE_POST_CLICK_ARTIFACT" ]; then
          echo "--reconcile-post-click-requested may be specified only once" >&2
          exit 1
        fi
        RECONCILE_POST_CLICK_ARTIFACT="$2"
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

normalize_artifact_directory() {
  local normalized_metadata normalized_directory normalized_identity

  normalized_metadata="$(python3 \
    "${SCRIPT_DIR}/gsc-reconciliation.py" \
    normalize \
    "$GSC_ARTIFACT_DIR")" || {
    echo "Could not normalize the GSC artifact authority before mutation." >&2
    return 1
  }
  IFS=$'\t' read -r normalized_directory normalized_identity \
    <<<"$normalized_metadata"
  if [ -z "$normalized_directory" ] \
    || [ "${normalized_directory#/}" = "$normalized_directory" ] \
    || [[ ! "$normalized_identity" =~ ^[0-9]+:[0-9]+$ ]]; then
    echo "The GSC artifact authority did not normalize to an absolute path." >&2
    return 1
  fi
  GSC_ARTIFACT_DIR="$normalized_directory"
  GSC_ARTIFACT_DIR_IDENTITY="$normalized_identity"
  return 0
}

validate_reconciliation_mode() {
  local reconciliation_label

  if [ -n "$RECONCILE_PRE_CLICK_ARTIFACT" ] \
    && [ -n "$RECONCILE_POST_CLICK_ARTIFACT" ]; then
    echo "Choose exactly one reconciliation mode." >&2
    return 1
  fi
  if [ -z "$RECONCILE_PRE_CLICK_ARTIFACT" ] \
    && [ -z "$RECONCILE_POST_CLICK_ARTIFACT" ]; then
    return 0
  fi
  if [ -n "$RECONCILE_PRE_CLICK_ARTIFACT" ]; then
    reconciliation_label="--reconcile-pre-click-retry"
  else
    reconciliation_label="--reconcile-post-click-requested"
  fi
  if [ "$DRY_RUN" -ne 0 ] \
    || [ "$ADD_LATEST_DAILY" -ne 0 ] \
    || [ "$ADD_LATEST_WEEKLY" -ne 0 ] \
    || [ "$ADD_RETRY_PENDING" -ne 0 ] \
    || [ "$MIGRATE_LEGACY_HISTORY" -ne 0 ] \
    || [ -n "$DAILY_DATE" ] \
    || [ -n "$WEEKLY_ISSUE" ] \
    || [ -n "$EXPECT_URL" ] \
    || [ "$FORCE" -ne 0 ] \
    || [ "$SKIP_LIVE_CHECK" -ne 0 ] \
    || [ "${#TARGET_URLS[@]}" -ne 0 ]; then
    if [ "$reconciliation_label" = "--reconcile-pre-click-retry" ]; then
      echo "--reconcile-pre-click-retry is an exclusive, non-browser operation." >&2
    else
      echo "--reconcile-post-click-requested is an exclusive, read-only browser operation." >&2
    fi
    echo "Do not combine it with target discovery, submission, force, migration, or dry-run options." >&2
    return 1
  fi
  return 0
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

  for url in "${TARGET_URLS[@]}"; do
    validate_detail_url "$url" || exit 1
  done

  if [ -n "$EXPECT_URL" ]; then
    EXPECT_URL="$(normalize_url "$EXPECT_URL")"
    validate_detail_url "$EXPECT_URL" || exit 1
    if [ "$count" -ne 1 ]; then
      echo "--expect-url can only be used with exactly one target URL." >&2
      exit 1
    fi
    if [ "${TARGET_URLS[0]}" != "$EXPECT_URL" ]; then
      echo "Target URL does not match --expect-url." >&2
      echo "target: ${TARGET_URLS[0]}" >&2
      echo "expect: $EXPECT_URL" >&2
      require_no_unresolved_reconciliation "${TARGET_URLS[0]}" || exit 1
      freeze_request_intent_authority "${TARGET_URLS[0]}" || exit 1
      append_frozen_operational_outcome \
        "stopped_mismatch" \
        "${TARGET_URLS[0]}" \
        "target mismatch with --expect-url" \
        || exit 1
      exit 2
    fi
  fi

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
  local requested_state authorization_state url
  for url in "${TARGET_URLS[@]}"; do
    verify_reconciliation_retry_authorization "$url"
    authorization_state=$?
    if [ "$authorization_state" -ne 0 ]; then
      if [ "$authorization_state" -eq 1 ]; then
        record_retry_pending_targets \
          "" \
          "batch stopped during precheck after retry evidence authorization failed for ${url}; target was not attempted" \
          0 \
          "$url" \
          || exit 1
      fi
      exit 1
    fi
    if ! require_no_unresolved_reconciliation "$url"; then
      record_retry_pending_targets \
        "" \
        "batch stopped during precheck after reconciliation blocker for ${url}; target was not attempted" \
        0 \
        "$url" \
        || exit 1
      exit 1
    fi
    if [ "$FORCE" -ne 1 ]; then
      target_already_requested "$url"
      requested_state=$?
      case "$requested_state" in
        0)
          echo "Already requested, skipping unless --force is set: $url"
          continue
          ;;
        1)
          ;;
        *)
          echo "BLOCKED: authoritative GSC ledger changed while checking requested state for ${url}." >&2
          exit 1
          ;;
      esac
    fi
    freeze_request_intent_authority "$url" || exit 1
    if ! check_live_url "$url"; then
      echo "Live URL check failed: $url" >&2
      append_frozen_operational_outcome \
        "live_check_failed" \
        "$url" \
        "target URL did not return a successful response" \
        || exit 1
      record_retry_pending_targets \
        "" \
        "batch stopped during precheck after live check failure for ${url}; target was not attempted" \
        0 \
        "$url" \
        || exit 1
      exit 1
    fi
    if [ "$DRY_RUN" -eq 1 ]; then
      append_history_or_block \
        "dry_run" \
        "$url" \
        "preview only" \
        "$REQUEST_INTENT_EXPECTED_LEDGER_SIZE" \
        "$REQUEST_INTENT_EXPECTED_LEDGER_DIGEST" \
        || exit 1
    fi
  done
}

all_targets_already_requested() {
  local requested_state url
  if [ "$FORCE" -eq 1 ]; then
    return 1
  fi
  for url in "${TARGET_URLS[@]}"; do
    require_no_unresolved_reconciliation "$url" || return 1
    target_already_requested "$url"
    requested_state=$?
    case "$requested_state" in
      0)
        ;;
      1)
        return 1
        ;;
      *)
        echo "BLOCKED: authoritative GSC ledger changed while checking requested state for ${url}." >&2
        return 2
        ;;
    esac
  done
  return 0
}

record_retry_pending_targets() {
  local after_url="$1"
  local message="$2"
  local write_artifacts="${3:-0}"
  local exclude_url="${4:-}"
  local url authorization_state latest_snapshot latest_status latest_message
  local latest_ledger_size latest_ledger_digest
  local refreshed_snapshot refreshed_status refreshed_message
  local transition_output
  local started=0 found=0 blocked=0

  if [ -z "$after_url" ]; then
    started=1
    found=1
  fi
  for url in "${TARGET_URLS[@]}"; do
    if [ "$started" -eq 0 ]; then
      if [ "$url" = "$after_url" ]; then
        started=1
        found=1
      fi
      continue
    fi
    if [ -n "$after_url" ] && [ "$url" = "$after_url" ]; then
      continue
    fi
    if [ -n "$exclude_url" ] && [ "$url" = "$exclude_url" ]; then
      continue
    fi
    if ! require_no_unresolved_reconciliation "$url"; then
      echo "Preserving existing reconciliation evidence while recording the batch blocker: $url" >&2
      blocked=1
      continue
    fi
    if ! latest_snapshot="$(latest_operational_history_snapshot "$url")"; then
      echo "Could not read authoritative state while preserving the remaining batch target: $url" >&2
      blocked=1
      continue
    fi
    if ! parse_operational_history_snapshot "$latest_snapshot"; then
      echo "Could not parse authoritative state while preserving the remaining batch target: $url" >&2
      blocked=1
      continue
    fi
    latest_status="$PARSED_LEDGER_STATUS"
    latest_message="$PARSED_LEDGER_MESSAGE"
    latest_ledger_size="$PARSED_LEDGER_SIZE"
    latest_ledger_digest="$PARSED_LEDGER_DIGEST"
    if [ -z "$latest_status" ]; then
      latest_status="__missing__"
      latest_message=""
    fi
    if [ "$latest_status" = "retry_pending" ]; then
      verify_reconciliation_retry_authorization "$url"
      authorization_state=$?
      case "$authorization_state" in
        0)
          echo "Preserving existing retry_pending provenance while recording the batch blocker: $url"
          continue
          ;;
        *)
          echo "Could not preserve fail-closed retry provenance while recording the batch blocker: $url" >&2
          blocked=1
          continue
          ;;
      esac
    fi
    case "$latest_status" in
      requested)
        echo "Preserving requested state while recording batch blocker: $url"
        continue
        ;;
      request_click_pending|pre_request_success_unverified|reconciliation_archive_pending|post_request_target_unverified|post_request_confirmation_unknown)
        echo "Preserving concurrent reconciliation state while recording batch blocker: $url" >&2
        blocked=1
        continue
        ;;
      __missing__|stopped_mismatch|live_check_failed|quota_exceeded)
        ;;
    esac
    if ! transition_output="$(append_history_transition_or_block \
      "$latest_status" \
      1 \
      "$latest_message" \
      "retry_pending" \
      "$url" \
      "$message" \
      "$latest_ledger_size" \
      "$latest_ledger_digest")"; then
      if ! refreshed_snapshot="$(latest_operational_history_snapshot "$url")"; then
        echo "Could not reread authoritative state after a batch retry transition race: $url" >&2
        blocked=1
        continue
      fi
      if ! parse_operational_history_snapshot "$refreshed_snapshot"; then
        echo "Could not parse authoritative state after a batch retry transition race: $url" >&2
        blocked=1
        continue
      fi
      refreshed_status="$PARSED_LEDGER_STATUS"
      refreshed_message="$PARSED_LEDGER_MESSAGE"
      case "$refreshed_status" in
        retry_pending)
          verify_reconciliation_retry_authorization "$url"
          authorization_state=$?
          if [ "$authorization_state" -eq 0 ]; then
            echo "Preserving concurrent retry_pending provenance while recording the batch blocker: $url"
            continue
          fi
          ;;
        requested)
          echo "Preserving concurrent requested state while recording batch blocker: $url"
          continue
          ;;
      esac
      echo "Could not record the batch retry blocker without overriding concurrent authoritative state: $url" >&2
      blocked=1
      continue
    fi
    if [ "$write_artifacts" -eq 1 ]; then
      write_gsc_artifact "retry_pending" "$url" "$message" \
        || echo "Could not persist GSC retry artifact for ${url}." >&2
    fi
  done
  if [ "$found" -eq 0 ]; then
    echo "Could not locate current GSC target while recording the remaining batch: ${after_url}" >&2
    return 1
  fi
  if [ "$blocked" -ne 0 ]; then
    return 1
  fi
  return 0
}

submit_targets() {
  local inspect_url url result reconciliation_detail requested_state authorization_state submitted_count=0 skipped_count=0

  if ! verify_selected_reconciliation_retry_authorizations; then
    echo "BLOCKED: selected GSC targets lost retry authorization before browser startup." >&2
    return 1
  fi

  if ! require_deps; then
    record_retry_pending_targets \
      "" \
      "gsc_browser_dependency_blocker: a required bb-browser, Comet, or submitter dependency is unavailable before any Search Console interaction" \
      1 \
      || return 1
    return 1
  fi
  if ! ensure_bb_browser_connected; then
    record_retry_pending_targets \
      "" \
      "${BB_BROWSER_CONNECTION_BLOCKER:-gsc_browser_session_blocker: bb-browser could not connect to managed Comet CDP before any Search Console interaction}" \
      1 \
      || return 1
    return 1
  fi

  inspect_url="https://search.google.com/search-console/inspect?resource_id=${GSC_RESOURCE_ID}&hl=${GSC_LANG}"
  if ! open_gsc_page "$inspect_url"; then
    record_retry_pending_targets \
      "" \
      "gsc_browser_session_blocker: managed Search Console tab open failed before any input or request click" \
      1 \
      || return 1
    return 1
  fi
  sleep "$NAV_WAIT_SECONDS"
  if ! verify_gsc_inspection_surface; then
    record_retry_pending_targets \
      "" \
      "${GSC_SURFACE_BLOCKER}: observed ${GSC_SURFACE_OBSERVED}; Search Console did not remain on the authenticated VentureDex URL Inspection surface before any input or request click" \
      0 \
      || return 1
    return 1
  fi

  for url in "${TARGET_URLS[@]}"; do
    require_no_unresolved_reconciliation "$url" || return 1
    if [ "$FORCE" -ne 1 ]; then
      target_already_requested "$url"
      requested_state=$?
      case "$requested_state" in
        0)
          echo "Already requested, skipping: $url"
          skipped_count=$((skipped_count + 1))
          continue
          ;;
        1)
          ;;
        *)
          echo "BLOCKED: authoritative GSC ledger changed while checking requested state for ${url}." >&2
          return 1
          ;;
      esac
    fi

    freeze_request_intent_authority "$url" || return 1
    if ! check_live_url "$url"; then
      echo "Live URL check failed: $url" >&2
      append_frozen_operational_outcome \
        "live_check_failed" \
        "$url" \
        "target URL did not return a successful response" \
        || return 1
      write_gsc_artifact "live_check_failed" "$url" "target URL did not return a successful response"
      record_retry_pending_targets \
        "$url" \
        "batch stopped after live check failure for ${url}; target was not attempted" \
        || return 1
      return 1
    fi

    verify_reconciliation_retry_authorization "$url"
    authorization_state=$?
    if [ "$authorization_state" -ne 0 ]; then
      echo "BLOCKED: retry authorization changed before the request click for ${url}; no click occurred." >&2
      record_retry_pending_targets \
        "$url" \
        "batch stopped after retry evidence authorization changed for ${url}; target was not attempted" \
        0 \
        "$url" \
        || return 1
      return 1
    fi

    echo "Submitting: $url"
    submit_single_url "$url"
    result=$?

    case "$result" in
      16)
        echo "BLOCKED: authoritative request state changed before browser input for ${url}; no request click occurred." >&2
        record_retry_pending_targets \
          "$url" \
          "batch stopped after authoritative request-state drift for ${url}; target was not attempted" \
          || return 1
        return 1
        ;;
      0)
        append_frozen_operational_outcome \
          "requested" \
          "$url" \
          "indexing requested" \
          || return 1
        echo "Requested indexing: $url"
        submitted_count=$((submitted_count + 1))
        ;;
      15)
        append_frozen_operational_outcome \
          "requested" \
          "$url" \
          "indexing requested; batch stopped because the confirmed success dialog could not be cleared safely" \
          || return 1
        echo "Requested indexing: $url"
        submitted_count=$((submitted_count + 1))
        record_retry_pending_targets \
          "$url" \
          "batch stopped after a confirmed indexing request because its success dialog could not be cleared safely; target was not attempted" \
          || return 1
        echo "Confirmed the request for ${url}, but stopped before the next target because success-dialog cleanup was not verified." >&2
        return 1
        ;;
      1)
        echo "Request button not found; manual confirmation may be required: $url" >&2
        append_frozen_operational_outcome \
          "retry_pending" \
          "$url" \
          "request button not found" \
          || return 1
        write_gsc_artifact "retry_pending" "$url" "request button not found"
        record_retry_pending_targets \
          "$url" \
          "batch stopped after request button blocker for ${url}; target was not attempted" \
          || return 1
        return 1
        ;;
      2)
        echo "Quota detected; stopping remaining submissions." >&2
        append_frozen_operational_outcome \
          "retry_pending" \
          "$url" \
          "quota blocker: Search Console quota detected" \
          || return 1
        write_gsc_artifact "retry_pending" "$url" "quota blocker: Search Console quota detected"
        record_retry_pending_targets \
          "$url" \
          "batch stopped after Search Console quota blocker for ${url}; target was not attempted" \
          || return 1
        return 2
        ;;
      4)
        echo "Search Console reported a request failure." >&2
        append_frozen_operational_outcome \
          "retry_pending" \
          "$url" \
          "request failure detected" \
          || return 1
        write_gsc_artifact "retry_pending" "$url" "request failure detected"
        record_retry_pending_targets \
          "$url" \
          "batch stopped after explicit request failure for ${url}; target was not attempted" \
          || return 1
        return 1
        ;;
      5)
        echo "Search Console inspected URL mismatch; refusing requested status: $url" >&2
        append_frozen_operational_outcome \
          "retry_pending" \
          "$url" \
          "inspected URL mismatch" \
          || return 1
        write_gsc_artifact "retry_pending" "$url" "inspected URL mismatch"
        record_retry_pending_targets \
          "$url" \
          "batch stopped after inspected URL mismatch for ${url}; target was not attempted" \
          || return 1
        return 1
        ;;
      6)
        echo "BLOCKED: request succeeded but the post-request target could not be verified: $url" >&2
        if [ -n "${GSC_SURFACE_BLOCKER:-}" ]; then
          reconciliation_detail="${GSC_SURFACE_BLOCKER}: observed ${GSC_SURFACE_OBSERVED:-unknown}; Search Console left the authenticated VentureDex inspection surface after the request click. Acceptance is unknown, so manual reconciliation is required and automatic retry is disabled."
        else
          reconciliation_detail="Search Console reported success after the click, but the active route-bound inspection header no longer proved the exact target; manual reconciliation required and automatic retry disabled."
        fi
        write_gsc_artifact \
          "post_request_target_unverified" \
          "$url" \
          "$reconciliation_detail" \
          || echo "Could not persist the post-request target reconciliation artifact." >&2
        append_frozen_operational_outcome \
          "post_request_target_unverified" \
          "$url" \
          "request may have been accepted; ${reconciliation_detail}" \
          || return 1
        record_retry_pending_targets \
          "$url" \
          "batch stopped after post-request target reconciliation blocker for ${url}; target was not attempted" \
          || return 1
        return 1
        ;;
      11)
        echo "BLOCKED: no request click occurred because its durable intent could not be recorded: $url" >&2
        return 1
        ;;
      14)
        echo "Pre-click Search Console state could not be verified; no request click occurred: $url" >&2
        append_frozen_operational_outcome \
          "retry_pending" \
          "$url" \
          "pre-click Search Console state or quota probe was unavailable; no request click occurred" \
          || return 1
        write_gsc_artifact \
          "retry_pending" \
          "$url" \
          "Pre-click Search Console state or quota probe was unavailable; the request button was not clicked."
        record_retry_pending_targets \
          "$url" \
          "batch stopped after pre-click Search Console state probe blocker for ${url}; target was not attempted" \
          || return 1
        return 1
        ;;
      7)
        echo "URL inspection input was unavailable before any request click: $url" >&2
        append_frozen_operational_outcome \
          "retry_pending" \
          "$url" \
          "inspection input unavailable" \
          || return 1
        write_gsc_artifact "retry_pending" "$url" "inspection input unavailable"
        record_retry_pending_targets \
          "$url" \
          "batch stopped after inspection input blocker for ${url}; target was not attempted" \
          || return 1
        return 1
        ;;
      8)
        echo "Search Console changed the active inspected target before the click: $url" >&2
        append_frozen_operational_outcome \
          "retry_pending" \
          "$url" \
          "inspected target changed before request click" \
          || return 1
        write_gsc_artifact "retry_pending" "$url" "inspected target changed before request click"
        record_retry_pending_targets \
          "$url" \
          "batch stopped after pre-click target change for ${url}; target was not attempted" \
          || return 1
        return 1
        ;;
      9)
        append_frozen_operational_outcome \
          "requested" \
          "$url" \
          "existing route-bound Search Console success state; duplicate click skipped" \
          || return 1
        echo "Recorded existing indexing request without a duplicate click: $url"
        skipped_count=$((skipped_count + 1))
        ;;
      10)
        echo "BLOCKED: a pre-existing success dialog could not be associated with the exact target: $url" >&2
        if write_gsc_artifact \
          "pre_request_success_unverified" \
          "$url" \
          "Search Console exposed an unbound or conflicting terminal state before the request click. Completion cannot be inferred and automatic retry is disabled pending manual reconciliation."; then
          reconciliation_detail="artifact=${LAST_GSC_ARTIFACT_BASENAME}; pre-existing terminal state was unbound or conflicting; no request click occurred"
        else
          echo "Could not persist the pre-request success reconciliation artifact." >&2
          reconciliation_detail="artifact_unavailable; pre-existing terminal state was unbound or conflicting; no request click occurred"
        fi
        append_frozen_operational_outcome \
          "pre_request_success_unverified" \
          "$url" \
          "$reconciliation_detail" \
          || return 1
        record_retry_pending_targets \
          "$url" \
          "batch stopped after pre-request reconciliation blocker for ${url}; target was not attempted" \
          || return 1
        return 1
        ;;
      3)
        echo "BLOCKED: request was clicked but submit confirmation was not detected: $url" >&2
        write_gsc_artifact \
          "post_request_confirmation_unknown" \
          "$url" \
          "The request click intent was persisted and the browser action may have occurred, but Search Console did not expose a terminal success or failure state; manual reconciliation required and automatic retry disabled." \
          || echo "Could not persist the post-request confirmation reconciliation artifact." >&2
        append_frozen_operational_outcome \
          "post_request_confirmation_unknown" \
          "$url" \
          "request click may have occurred; terminal confirmation was not detected" \
          || return 1
        record_retry_pending_targets \
          "$url" \
          "batch stopped after post-request confirmation reconciliation blocker for ${url}; target was not attempted" \
          || return 1
        return 3
        ;;
      13)
        echo "BLOCKED: browser click transport did not prove whether the persisted request intent executed: $url" >&2
        write_gsc_artifact \
          "post_request_confirmation_unknown" \
          "$url" \
          "The request click intent was persisted, but the browser transport did not return a reliable click outcome. The click may have occurred; manual reconciliation is required and automatic retry is disabled." \
          || echo "Could not persist the browser-transport reconciliation artifact." >&2
        append_frozen_operational_outcome \
          "post_request_confirmation_unknown" \
          "$url" \
          "browser click outcome was not returned reliably; click may have occurred" \
          || return 1
        record_retry_pending_targets \
          "$url" \
          "batch stopped after uncertain browser click transport for ${url}; target was not attempted" \
          || return 1
        return 3
        ;;
      12)
        echo "Search Console left the authenticated VentureDex inspection surface before input: $url" >&2
        append_frozen_operational_outcome \
          "retry_pending" \
          "$url" \
          "${GSC_SURFACE_BLOCKER:-gsc_inspection_surface_blocker}: observed ${GSC_SURFACE_OBSERVED:-unknown}; inspection surface changed before any request click" \
          || return 1
        record_retry_pending_targets \
          "$url" \
          "${GSC_SURFACE_BLOCKER:-gsc_inspection_surface_blocker}: observed ${GSC_SURFACE_OBSERVED:-unknown}; batch stopped after authenticated inspection surface changed for ${url}; target was not attempted" \
          || return 1
        return 1
        ;;
      *)
        echo "Unexpected GSC submission result code ${result}: $url" >&2
        append_frozen_operational_outcome \
          "retry_pending" \
          "$url" \
          "unexpected local result before completion" \
          || return 1
        write_gsc_artifact "retry_pending" "$url" "unexpected local result before completion"
        record_retry_pending_targets \
          "$url" \
          "batch stopped after unexpected local result for ${url}; target was not attempted" \
          || return 1
        return 1
        ;;
    esac
  done

  echo "GSC submit complete: requested=${submitted_count}, skipped=${skipped_count}"
}

main() {
  local requested_state

  parse_args "$@"
  validate_reconciliation_mode || exit 1
  normalize_artifact_directory || exit 1
  validate_max_urls_value
  install_cleanup_traps
  acquire_history_lock || exit 1
  ensure_history_file || exit 1
  diagnose_history_layout

  if [ -n "$RECONCILE_PRE_CLICK_ARTIFACT" ]; then
    reconcile_pre_click_retry || exit 1
    exit 0
  fi

  if [ -n "$RECONCILE_POST_CLICK_ARTIFACT" ]; then
    reconcile_post_click_requested || exit 1
    exit 0
  fi

  if [ "$MIGRATE_LEGACY_HISTORY" -eq 1 ]; then
    migrate_legacy_history || exit 1
    refresh_history_identity_after_controlled_replace || exit 1
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
  verify_selected_reconciliation_retry_authorizations || exit 1
  print_summary
  precheck_targets

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "Dry-run complete; no indexing request was sent."
    exit 0
  fi

  all_targets_already_requested
  requested_state=$?
  case "$requested_state" in
    0)
      echo "All selected targets already have requested rows in ${HISTORY_FILE}; no browser submission needed."
      exit 0
      ;;
    1)
      ;;
    *)
      exit 1
      ;;
  esac

  submit_targets
}

main "$@"
