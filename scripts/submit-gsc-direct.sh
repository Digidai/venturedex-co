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

NAV_WAIT_SECONDS="${NAV_WAIT_SECONDS:-8}"
COMET_START_WAIT_SECONDS="${COMET_START_WAIT_SECONDS:-4}"
INSPECT_WAIT_SECONDS="${INSPECT_WAIT_SECONDS:-18}"
POST_CLICK_WAIT_SECONDS="${POST_CLICK_WAIT_SECONDS:-12}"
POST_MODAL_WAIT_SECONDS="${POST_MODAL_WAIT_SECONDS:-5}"
REQUEST_RESULT_WAIT_SECONDS="${REQUEST_RESULT_WAIT_SECONDS:-3}"
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
HISTORY_FILE_IDENTITY=""
LAST_INSPECTION_ROUTE_ID=""
GSC_SURFACE_BLOCKER=""
GSC_SURFACE_OBSERVED=""
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
    "post_request_target_unverified",
    "post_request_confirmation_unknown",
}


def read_rows(
    path: Path,
    *,
    expected_identity: str = "",
    require_single_link: bool = False,
) -> list[tuple[str, str, str, str]]:
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
    text = b"".join(chunks).decode("utf-8")
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
    return rows


central.parent.mkdir(parents=True, exist_ok=True)
central_rows = read_rows(
    central,
    expected_identity=expected_central_identity,
    require_single_link=True,
)
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
        handle.write("\t".join(fields) + "\n")
        for row in central_rows:
            handle.write("\t".join(row) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    verify_flags = (
        os.O_RDONLY
        | getattr(os, "O_NONBLOCK", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    verify_fd = os.open(central, verify_flags)
    try:
        verify_stat = os.fstat(verify_fd)
        current_stat = os.lstat(central)
        if (
            not stat.S_ISREG(verify_stat.st_mode)
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
                f"Authoritative GSC ledger identity changed before migration replace: "
                f"{central}"
            )
        os.replace(temporary_name, central)
    finally:
        os.close(verify_fd)
    directory_fd = os.open(central.parent, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
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
  local sanitized_status sanitized_url sanitized_message

  case "$status" in
    requested|dry_run|retry_pending|stopped_mismatch|live_check_failed|quota_exceeded|request_click_pending|pre_request_success_unverified|post_request_target_unverified|post_request_confirmation_unknown)
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
    "$HISTORY_FILE_IDENTITY" <<'PY'
import os
import stat
import sys
from pathlib import Path

history = Path(sys.argv[1])
row = "\t".join(sys.argv[2:6]) + "\n"
expected_identity = sys.argv[6]
try:
    flags = (
        os.O_WRONLY
        | os.O_APPEND
        | getattr(os, "O_NONBLOCK", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    fd = os.open(history, flags)
    try:
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
        payload = row.encode("utf-8")
        offset = 0
        while offset < len(payload):
            written = os.write(fd, payload[offset:])
            if written <= 0:
                raise OSError("zero-byte ledger append")
            offset += written
        os.fsync(fd)
        current_stat = os.lstat(history)
        if (
            not stat.S_ISREG(current_stat.st_mode)
            or current_stat.st_nlink != 1
            or current_stat.st_dev != opened_stat.st_dev
            or current_stat.st_ino != opened_stat.st_ino
        ):
            raise OSError("ledger path changed during durable append")
    finally:
        os.close(fd)
    directory_fd = os.open(history.parent, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
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

  if [ ! -e "$GSC_ARTIFACT_DIR" ] && [ ! -L "$GSC_ARTIFACT_DIR" ]; then
    return 3
  fi
  if [ ! -d "$GSC_ARTIFACT_DIR" ]; then
    echo "GSC artifact path is not a directory: ${GSC_ARTIFACT_DIR}" >&2
    return 2
  fi
  python3 - "$GSC_ARTIFACT_DIR" "$url" <<'PY'
import hashlib
import re
import sys
from pathlib import Path

directory = Path(sys.argv[1])
target = sys.argv[2].strip().rstrip("/")
statuses = (
    "ledger_write_failed_after_request",
    "post_request_target_unverified",
    "post_request_confirmation_unknown",
    "pre_request_success_unverified",
)
canonical = re.compile(
    r"^https://venturedex\.co/(?:startups/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|weekly/[1-9][0-9]*)$"
)
hashed_key = re.compile(r"^.+--sha256-[0-9a-f]{12}$")


def safe_name(url: str) -> str:
    readable = re.sub(r"^https?://", "", url.lower())
    readable = re.sub(r"[^a-z0-9]+", "-", readable).strip("-")
    return readable[:90] or "unknown"


def target_key(url: str) -> str:
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]
    return f"{safe_name(url)}--sha256-{digest}"


expected_key = target_key(target)
try:
    paths = sorted(directory.iterdir())
except OSError as error:
    print(f"Could not scan GSC artifact directory {directory}: {error}", file=sys.stderr)
    raise SystemExit(2)

for path in paths:
    if path.suffix != ".txt":
        continue
    status = next(
        (candidate for candidate in statuses if f"-{candidate}-" in path.name),
        None,
    )
    if status is None:
        continue
    if path.is_symlink() or not path.is_file():
        print(path)
        raise SystemExit(0)
    marker = f"-{status}-"
    artifact_key = path.name.split(marker, 1)[1][:-len(".txt")]
    is_hashed = bool(hashed_key.fullmatch(artifact_key))
    if is_hashed and artifact_key == expected_key:
        print(path)
        raise SystemExit(0)

    fields = {}
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        text = ""
    for line in text.splitlines():
        if not line.strip():
            break
        name, separator, value = line.partition(":")
        if separator and name.strip():
            fields[name.strip()] = value.strip()
    artifact_url = fields.get("url", "").rstrip("/")
    header_status = fields.get("status", "")

    if is_hashed:
        if header_status and header_status != status:
            print(path)
            raise SystemExit(0)
        if artifact_url and (
            not canonical.fullmatch(artifact_url)
            or target_key(artifact_url) != artifact_key
        ):
            print(path)
            raise SystemExit(0)
        continue

    # Legacy filenames did not contain a collision-resistant URL identity.
    # Exact readable evidence can still scope them; missing, unreadable, or
    # internally inconsistent legacy evidence blocks globally.
    if (
        not canonical.fullmatch(artifact_url)
        or safe_name(artifact_url) != artifact_key
        or (header_status and header_status != status)
    ):
        print(path)
        raise SystemExit(0)
    if artifact_url == target:
        print(path)
        raise SystemExit(0)

raise SystemExit(3)
PY
}

latest_operational_history_status() {
  local url="$1"

  python3 - "$HISTORY_FILE" "$HISTORY_FILE_IDENTITY" "$url" <<'PY'
import os
import re
import stat
import sys
from pathlib import Path

history = Path(sys.argv[1])
expected_identity = sys.argv[2]
target = sys.argv[3]
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

text = b"".join(chunks).decode("utf-8")
if re.search(r"\r(?!\n)|[\v\f\x1c-\x1f\x85\ufeff\u2028\u2029]", text):
    raise SystemExit(f"Invalid GSC ledger line separator in {history}")
lines = text.replace("\r\n", "\n").split("\n")
if not lines or lines[0] != "timestamp\tstatus\turl\tmessage":
    raise SystemExit(f"Invalid GSC ledger header in {history}")
latest = ""
for line_number, line in enumerate(lines[1:], start=2):
    if not line:
        continue
    row = line.split("\t")
    if len(row) != 4:
        raise SystemExit(
            f"Invalid GSC ledger row in {history}:{line_number}: "
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
        latest = status
print(latest)
PY
}

target_has_unresolved_reconciliation_status() {
  local url="$1"
  local latest_status

  if ! latest_status="$(latest_operational_history_status "$url")"; then
    return 2
  fi
  case "$latest_status" in
    request_click_pending|post_request_target_unverified|post_request_confirmation_unknown|pre_request_success_unverified)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

require_no_unresolved_reconciliation() {
  local url="$1"
  local artifact artifact_result ledger_status

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
  artifact="$(unresolved_reconciliation_artifact "$url")"
  artifact_result=$?
  case "$artifact_result" in
    0)
      echo "BLOCKED: unresolved GSC reconciliation artifact exists for ${url}: ${artifact}" >&2
      echo "Verify Search Console state and reconcile the authoritative ledger before removing the artifact; automatic retry is disabled." >&2
      return 1
      ;;
    3)
      ;;
    *)
      echo "BLOCKED: GSC reconciliation artifacts could not be checked safely for ${url}." >&2
      echo "Repair access to ${GSC_ARTIFACT_DIR} before any dry-run or formal submission." >&2
      return 1
      ;;
  esac
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
    var routeId=current.searchParams.get('id');
    var roots=Array.from(document.querySelectorAll('c-wiz[jsrenderer=\"jtca7c\"][jsname=\"a9kxte\"][data-p]'))
      .filter(function(root){
        return root.getClientRects &&
          root.getClientRects().length>0 &&
          root.getAttribute('aria-busy')!=='true' &&
          String(root.getAttribute('data-p')||'').includes(routeId||'');
      });
    if(!routeId || roots.length!==1) {
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
  local page_text page_state target_key file

  if [ -n "${BB_BROWSER_TAB_ID:-}" ]; then
    page_text="$(capture_page_text)"
    page_state="$(page_request_state 2>/dev/null || true)"
  else
    page_text="Managed Search Console tab was unavailable; no page text captured."
    page_state="browser_tab_unavailable"
  fi
  target_key="$(artifact_target_key "$url")" || return 1
  if ! mkdir -p "$GSC_ARTIFACT_DIR"; then
    echo "Could not create GSC artifact directory: ${GSC_ARTIFACT_DIR}" >&2
    return 1
  fi
  file="${GSC_ARTIFACT_DIR}/$(date '+%Y%m%d-%H%M%S')-${status}-${target_key}.txt"

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
  local result
  GSC_SURFACE_BLOCKER=""
  GSC_SURFACE_OBSERVED=""
  result="$(run_gsc_browser_call \
    "inspection_surface" \
    "globalThis.__VENTUREDEX_GSC__.inspectionSurface();" \
    2>&1)"
  if printf '%s\n' "$result" | grep -q 'inspection_surface_ready'; then
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
  run_js "(function(){var els=document.querySelectorAll('span,button,div[role=button]');for(var i=0;i<els.length;i++){var t=(els[i].textContent||'').replace(/\\s+/g,' ').trim();if(t==='确定'||t==='OK'||t==='Got it'||t==='知道了'){els[i].click();return 'closed';}}return 'none';})();" >/dev/null 2>&1 || true
}

submit_single_url() {
  local url="$1"
  local escaped_url escaped_route_id force_js input_js input_result click_result click_call_status
  local inspection_route_id pre_click_state pre_click_state_status quota_state quota_state_status result

  escaped_url=${url//\\/\\\\}
  escaped_url=${escaped_url//\'/\\\'}

  input_js="
(function(){
  if(location.origin !== 'https://search.google.com' ||
     location.pathname !== '/search-console/inspect' ||
     new URLSearchParams(location.search).get('resource_id') !== 'sc-domain:venturedex.co') {
    var blocker = location.origin === 'https://search.google.com'
      ? 'gsc_inspection_surface_blocker'
      : 'gsc_auth_session_blocker';
    return blocker + '|||' + location.origin + location.pathname;
  }
  var input = document.querySelector('input[aria-label*=\"Inspect any URL\"]') ||
              document.querySelector('input[aria-label*=\"检查\"]') ||
              document.querySelector('input.Ax4B8[role=\"combobox\"]');
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

  input_result=$(run_js "/*VENTUREDEX_CALL:submit_input*/${input_js}" 2>&1)
  if printf '%s' "$input_result" | grep -q 'gsc_.*_blocker'; then
    capture_gsc_surface_blocker "$input_result" || true
    echo "Search Console left the authenticated inspection surface before input." >&2
    return 12
  fi
  if ! printf '%s' "$input_result" | grep -q 'submitted'; then
    echo "URL inspection input was not found or did not accept the URL." >&2
    return 7
  fi

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

  if ! append_history_or_block \
    "request_click_pending" \
    "$url" \
    "request click intent persisted before browser action; completion unresolved until a terminal ledger row is recorded"; then
    echo "Request click intent could not be persisted; refusing the browser action." >&2
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

  dismiss_success_dialog
  sleep "$POST_MODAL_WAIT_SECONDS"

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
      append_history_or_block "stopped_mismatch" "${TARGET_URLS[0]}" "target mismatch with --expect-url" || exit 1
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
  local requested_state url
  for url in "${TARGET_URLS[@]}"; do
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
    if ! check_live_url "$url"; then
      echo "Live URL check failed: $url" >&2
      append_history_or_block "live_check_failed" "$url" "target URL did not return a successful response" || exit 1
      record_retry_pending_targets \
        "" \
        "batch stopped during precheck after live check failure for ${url}; target was not attempted" \
        0 \
        "$url" \
        || exit 1
      exit 1
    fi
    if [ "$DRY_RUN" -eq 1 ]; then
      append_history_or_block "dry_run" "$url" "preview only" || exit 1
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
  local url requested_state started=0 found=0 blocked=0

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
    target_already_requested "$url"
    requested_state=$?
    case "$requested_state" in
      0)
        echo "Preserving requested state while recording batch blocker: $url"
        continue
        ;;
      1)
        ;;
      *)
        echo "Could not read authoritative requested state while recording the batch blocker: $url" >&2
        blocked=1
        continue
        ;;
    esac
    append_history_or_block "retry_pending" "$url" "$message" || return 1
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
  local inspect_url url result reconciliation_detail requested_state submitted_count=0 skipped_count=0

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
      "gsc_browser_session_blocker: bb-browser could not connect to managed Comet CDP before any Search Console interaction" \
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

    if ! check_live_url "$url"; then
      echo "Live URL check failed: $url" >&2
      append_history_or_block "live_check_failed" "$url" "target URL did not return a successful response" || return 1
      write_gsc_artifact "live_check_failed" "$url" "target URL did not return a successful response"
      record_retry_pending_targets \
        "$url" \
        "batch stopped after live check failure for ${url}; target was not attempted" \
        || return 1
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
        record_retry_pending_targets \
          "$url" \
          "batch stopped after request button blocker for ${url}; target was not attempted" \
          || return 1
        return 1
        ;;
      2)
        echo "Quota detected; stopping remaining submissions." >&2
        append_history_or_block "retry_pending" "$url" "quota blocker: Search Console quota detected" || return 1
        write_gsc_artifact "retry_pending" "$url" "quota blocker: Search Console quota detected"
        record_retry_pending_targets \
          "$url" \
          "batch stopped after Search Console quota blocker for ${url}; target was not attempted" \
          || return 1
        return 2
        ;;
      4)
        echo "Search Console reported a request failure." >&2
        append_history_or_block "retry_pending" "$url" "request failure detected" || return 1
        write_gsc_artifact "retry_pending" "$url" "request failure detected"
        record_retry_pending_targets \
          "$url" \
          "batch stopped after explicit request failure for ${url}; target was not attempted" \
          || return 1
        return 1
        ;;
      5)
        echo "Search Console inspected URL mismatch; refusing requested status: $url" >&2
        append_history_or_block "retry_pending" "$url" "inspected URL mismatch" || return 1
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
        append_history_or_block \
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
        append_history_or_block \
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
        append_history_or_block "retry_pending" "$url" "inspection input unavailable" || return 1
        write_gsc_artifact "retry_pending" "$url" "inspection input unavailable"
        record_retry_pending_targets \
          "$url" \
          "batch stopped after inspection input blocker for ${url}; target was not attempted" \
          || return 1
        return 1
        ;;
      8)
        echo "Search Console changed the active inspected target before the click: $url" >&2
        append_history_or_block "retry_pending" "$url" "inspected target changed before request click" || return 1
        write_gsc_artifact "retry_pending" "$url" "inspected target changed before request click"
        record_retry_pending_targets \
          "$url" \
          "batch stopped after pre-click target change for ${url}; target was not attempted" \
          || return 1
        return 1
        ;;
      9)
        append_history_or_block \
          "requested" \
          "$url" \
          "existing route-bound Search Console success state; duplicate click skipped" \
          || return 1
        echo "Recorded existing indexing request without a duplicate click: $url"
        skipped_count=$((skipped_count + 1))
        ;;
      10)
        echo "BLOCKED: a pre-existing success dialog could not be associated with the exact target: $url" >&2
        write_gsc_artifact \
          "pre_request_success_unverified" \
          "$url" \
          "Search Console exposed an unbound or conflicting terminal state before the request click. Completion cannot be inferred and automatic retry is disabled pending manual reconciliation." \
          || echo "Could not persist the pre-request success reconciliation artifact." >&2
        append_history_or_block \
          "pre_request_success_unverified" \
          "$url" \
          "pre-existing terminal state was unbound or conflicting; no request click occurred" \
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
        append_history_or_block \
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
        append_history_or_block \
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
        append_history_or_block \
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
        append_history_or_block "retry_pending" "$url" "unexpected local result before completion" || return 1
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
  validate_max_urls_value
  install_cleanup_traps
  acquire_history_lock || exit 1
  ensure_history_file || exit 1
  diagnose_history_layout

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
