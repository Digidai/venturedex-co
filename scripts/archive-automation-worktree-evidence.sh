#!/bin/bash

set -euo pipefail

MAIN_REPO="${VENTUREDEX_MAIN_REPO:-/Users/dai/Developer/CursorProjects/venturedex.co}"
AUTOMATION_WORKTREE_ROOT="${VENTUREDEX_AUTOMATION_WORKTREE_ROOT:-${CODEX_HOME:-/Users/dai/.codex}/worktrees}"
DAILY_AUTOMATION_DIR="${VENTUREDEX_DAILY_AUTOMATION_DIR:-${CODEX_HOME:-/Users/dai/.codex}/automations/venturedex-daily-curator}"
ARCHIVE_ROOT="${VENTUREDEX_EVIDENCE_ARCHIVE_ROOT:-${CODEX_HOME:-/Users/dai/.codex}/automations/venturedex-worktree-evidence}"
EXECUTE=0
TARGET=""
EXPECTED_HEAD=""
EXPECTED_STATUS_SHA256=""

usage() {
  cat <<'EOF'
Usage:
  bash scripts/archive-automation-worktree-evidence.sh --path PATH
  bash scripts/archive-automation-worktree-evidence.sh --path PATH --execute \
    --expected-head SHA --expected-status-sha256 SHA256

Creates a verified Git bundle before cleaning a narrowly scoped dirty Daily or
Weekly automation worktree. The default mode is read-only and prints the exact
HEAD/status digest required for execution.

Daily archives accept only docs/automation/venturedex-learning-log.md and
require the exact run checkpoint to be terminal blocked/closeout with a released
lease. Weekly archives accept that learning log plus one content/weekly/N.json.
Any exact matching non-ancestor process, ownership mismatch, changed CAS value,
extra dirty path, unreachable HEAD, or unregistered worktree fails closed.

The archive bundle and JSON manifest are stored outside the repository. This
script cleans the archived paths but never removes the worktree; follow it with
cleanup-automation-worktrees.sh without --force-dirty.

Options:
  --path PATH                    Exact registered automation worktree.
  --execute                      Create, verify, and persist the archive, then clean.
  --expected-head SHA            Exact HEAD printed by the dry run.
  --expected-status-sha256 SHA   Exact status digest printed by the dry run.
  --archive-root PATH            Override the durable archive directory.
  --main PATH                    Override the main VentureDex checkout.
  -h, --help                     Show this help.
EOF
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

canonical_existing_dir() {
  (cd "$1" && pwd -P)
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --path)
      [ "$#" -ge 2 ] || die "--path requires a value"
      TARGET="$2"
      shift 2
      ;;
    --execute)
      EXECUTE=1
      shift
      ;;
    --expected-head)
      [ "$#" -ge 2 ] || die "--expected-head requires a value"
      EXPECTED_HEAD="$2"
      shift 2
      ;;
    --expected-status-sha256)
      [ "$#" -ge 2 ] || die "--expected-status-sha256 requires a value"
      EXPECTED_STATUS_SHA256="$2"
      shift 2
      ;;
    --archive-root)
      [ "$#" -ge 2 ] || die "--archive-root requires a value"
      ARCHIVE_ROOT="$2"
      shift 2
      ;;
    --main)
      [ "$#" -ge 2 ] || die "--main requires a value"
      MAIN_REPO="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

[ -n "$TARGET" ] || die "--path is required"
[ -d "$MAIN_REPO/.git" ] || die "main repo is not a Git checkout: $MAIN_REPO"
[ -d "$TARGET" ] || die "worktree path does not exist: $TARGET"
MAIN_REPO="$(canonical_existing_dir "$MAIN_REPO")"
TARGET="$(canonical_existing_dir "$TARGET")"
if [ -d "$AUTOMATION_WORKTREE_ROOT" ]; then
  AUTOMATION_WORKTREE_ROOT="$(canonical_existing_dir "$AUTOMATION_WORKTREE_ROOT")"
fi

case "$TARGET" in
  "$AUTOMATION_WORKTREE_ROOT"/venturedex-daily-*/venturedex.co)
    AUTOMATION_KIND="daily"
    ;;
  "$AUTOMATION_WORKTREE_ROOT"/venturedex-weekly-*/venturedex.co)
    AUTOMATION_KIND="weekly"
    ;;
  *)
    die "path is outside exact Daily/Weekly automation patterns: $TARGET"
    ;;
esac

ORIGIN_URL="$(git -C "$MAIN_REPO" config --get remote.origin.url || true)"
TARGET_ORIGIN_URL="$(git -C "$TARGET" config --get remote.origin.url || true)"
case "$ORIGIN_URL" in
  *github.com/Digidai/venturedex-co.git|*github.com:Digidai/venturedex-co.git) ;;
  *) die "main repo remote is not VentureDex: ${ORIGIN_URL:-missing}" ;;
esac
[ "$TARGET_ORIGIN_URL" = "$ORIGIN_URL" ] \
  || die "worktree remote does not match the main VentureDex checkout"

git -C "$MAIN_REPO" worktree list --porcelain \
  | sed -n 's/^worktree //p' \
  | grep -Fx -- "$TARGET" >/dev/null \
  || die "worktree is not registered and must be preserved: $TARGET"

STATUS_SNAPSHOT="$(git -C "$TARGET" status --porcelain=v1 --untracked-files=all)"
[ -n "$STATUS_SNAPSHOT" ] || die "worktree is already clean; use cleanup-automation-worktrees.sh"

CHANGED_PATHS=()
WEEKLY_FILE_COUNT=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  code="${line:0:2}"
  path="${line:3}"
  case "$code" in
    *R*|*C*) die "renamed/copied paths are not eligible for evidence archiving: $line" ;;
  esac
  case "$AUTOMATION_KIND:$path" in
    daily:docs/automation/venturedex-learning-log.md)
      ;;
    weekly:docs/automation/venturedex-learning-log.md)
      ;;
    weekly:content/weekly/[0-9]*.json)
      case "$path" in
        content/weekly/*[!0-9]*.json) die "Weekly evidence path is not numeric: $path" ;;
      esac
      WEEKLY_FILE_COUNT=$((WEEKLY_FILE_COUNT + 1))
      ;;
    *)
      die "dirty path is outside the evidence-only allowlist: $path"
      ;;
  esac
  CHANGED_PATHS+=("$path")
done <<<"$STATUS_SNAPSHOT"

if [ "$AUTOMATION_KIND" = "weekly" ] && [ "$WEEKLY_FILE_COUNT" -gt 1 ]; then
  die "Weekly evidence archive accepts at most one issue JSON"
fi

HEAD_SHA="$(git -C "$TARGET" rev-parse HEAD)"
STATUS_SHA256="$(printf '%s' "$STATUS_SNAPSHOT" | shasum -a 256 | awk '{print $1}')"
RUN_LABEL="$(basename "$(dirname "$TARGET")")"

printf 'kind=%s\npath=%s\nhead=%s\nstatus_sha256=%s\n' \
  "$AUTOMATION_KIND" "$TARGET" "$HEAD_SHA" "$STATUS_SHA256"
printf 'eligible_path=%s\n' "${CHANGED_PATHS[@]}"

if [ "$EXECUTE" -ne 1 ]; then
  echo "DRY-RUN: no archive or worktree mutation performed"
  exit 0
fi

[ "$EXPECTED_HEAD" = "$HEAD_SHA" ] \
  || die "HEAD CAS mismatch; expected ${EXPECTED_HEAD:-missing}, observed $HEAD_SHA"
[ "$EXPECTED_STATUS_SHA256" = "$STATUS_SHA256" ] \
  || die "status CAS mismatch; expected ${EXPECTED_STATUS_SHA256:-missing}, observed $STATUS_SHA256"

python3 - "$TARGET" <<'PY'
import os
import subprocess
import sys

target = sys.argv[1]
current = os.getpid()
rows = []
for raw in subprocess.check_output(
    ["ps", "-axo", "pid=,ppid=,command="], text=True
).splitlines():
    parts = raw.strip().split(None, 2)
    if len(parts) != 3:
        continue
    try:
        pid, ppid = int(parts[0]), int(parts[1])
    except ValueError:
        continue
    rows.append((pid, ppid, parts[2]))

parents = {pid: ppid for pid, ppid, _ in rows}
ancestors = set()
while current and current not in ancestors:
    ancestors.add(current)
    current = parents.get(current, 0)

matches = [(pid, command) for pid, _, command in rows if pid not in ancestors and target in command]
if matches:
    for pid, command in matches:
        print(f"BLOCKED matching process {pid}: {command}", file=sys.stderr)
    raise SystemExit(73)
PY

if [ "$AUTOMATION_KIND" = "daily" ]; then
  python3 - "$DAILY_AUTOMATION_DIR" "$TARGET" <<'PY'
import json
from pathlib import Path
import re
import sys

directory = Path(sys.argv[1])
target = sys.argv[2]
state_path = directory / "run-state.md"
lease_path = directory / "run-state.lease.json"
if not state_path.is_file() or not lease_path.is_file():
    raise SystemExit("Daily authority files are missing; refusing evidence archive")
match = re.search(r"```json\s*\n(\{.*?\})\s*\n```", state_path.read_text(), re.S)
if not match:
    raise SystemExit("Daily checkpoint JSON is malformed; refusing evidence archive")
state = json.loads(match.group(1))
lease = json.loads(lease_path.read_text())
if state.get("run_worktree") != target:
    raise SystemExit("Daily checkpoint does not own the exact worktree")
if state.get("status") != "blocked" or state.get("phase") != "closeout":
    raise SystemExit("Daily checkpoint is not terminal blocked/closeout")
if lease.get("run_id") != state.get("run_id") or lease.get("epoch") != state.get("lease_epoch"):
    raise SystemExit("Daily checkpoint and lease do not match")
if lease.get("status") != "released":
    raise SystemExit("Daily lease is not released")
PY
fi

echo "Refreshing origin refs before evidence archive..."
git -C "$MAIN_REPO" fetch --quiet --prune origin \
  || die "could not refresh origin refs; refusing evidence archive"
REACHABLE_REFS="$(git -C "$MAIN_REPO" for-each-ref \
  --format='%(refname)' --contains "$HEAD_SHA" refs/remotes/origin/ \
  | grep -vFx 'refs/remotes/origin/HEAD' || true)"
[ -n "$REACHABLE_REFS" ] || die "worktree HEAD is not reachable from an origin ref"

STATUS_AGAIN="$(git -C "$TARGET" status --porcelain=v1 --untracked-files=all)"
HEAD_AGAIN="$(git -C "$TARGET" rev-parse HEAD)"
[ "$HEAD_AGAIN" = "$HEAD_SHA" ] || die "worktree HEAD changed during archive preflight"
[ "$STATUS_AGAIN" = "$STATUS_SNAPSHOT" ] || die "worktree status changed during archive preflight"

mkdir -p "$ARCHIVE_ROOT"
chmod 700 "$ARCHIVE_ROOT" 2>/dev/null || true
TMP_DIR="$(mktemp -d "$ARCHIVE_ROOT/.archive-${RUN_LABEL}.XXXXXX")"
TEMP_REF="refs/codex/evidence-archive/${RUN_LABEL}-$(date -u '+%Y%m%dT%H%M%SZ')-$$"
TEMP_INDEX="$TMP_DIR/index"
BUNDLE_TMP="$TMP_DIR/${RUN_LABEL}.bundle"
MANIFEST_TMP="$TMP_DIR/${RUN_LABEL}.json"
ARCHIVE_COMMIT=""

cleanup_temp() {
  if [ -n "$TEMP_REF" ]; then
    git -C "$MAIN_REPO" update-ref -d "$TEMP_REF" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup_temp EXIT

GIT_INDEX_FILE="$TEMP_INDEX" git -C "$TARGET" read-tree "$HEAD_SHA"
GIT_INDEX_FILE="$TEMP_INDEX" git -C "$TARGET" add -A -- "${CHANGED_PATHS[@]}"
ARCHIVE_TREE="$(GIT_INDEX_FILE="$TEMP_INDEX" git -C "$TARGET" write-tree)"
ARCHIVE_COMMIT="$(printf 'Archive %s evidence before guarded cleanup\n' "$RUN_LABEL" \
  | git -C "$TARGET" commit-tree "$ARCHIVE_TREE" -p "$HEAD_SHA")"
git -C "$MAIN_REPO" update-ref "$TEMP_REF" "$ARCHIVE_COMMIT"
git -C "$MAIN_REPO" bundle create "$BUNDLE_TMP" "$TEMP_REF" "^$HEAD_SHA"
git -C "$MAIN_REPO" bundle verify "$BUNDLE_TMP" >/dev/null
BUNDLE_SHA256="$(shasum -a 256 "$BUNDLE_TMP" | awk '{print $1}')"

python3 - "$MANIFEST_TMP" "$RUN_LABEL" "$AUTOMATION_KIND" "$TARGET" \
  "$HEAD_SHA" "$STATUS_SHA256" "$ARCHIVE_COMMIT" "$TEMP_REF" \
  "$BUNDLE_SHA256" "${CHANGED_PATHS[@]}" <<'PY'
import datetime as dt
import json
from pathlib import Path
import sys

(
    manifest,
    run_label,
    kind,
    worktree,
    base_sha,
    status_sha256,
    archive_commit,
    archive_ref,
    bundle_sha256,
    *changed_paths,
) = sys.argv[1:]
payload = {
    "schema_version": 1,
    "archived_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "run_label": run_label,
    "automation_kind": kind,
    "worktree": worktree,
    "base_sha": base_sha,
    "status_sha256": status_sha256,
    "archive_commit": archive_commit,
    "archive_ref": archive_ref,
    "bundle_sha256": bundle_sha256,
    "changed_paths": changed_paths,
}
Path(manifest).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
PY
chmod 600 "$BUNDLE_TMP" "$MANIFEST_TMP"

FINAL_BUNDLE="$ARCHIVE_ROOT/${RUN_LABEL}-${ARCHIVE_COMMIT}.bundle"
FINAL_MANIFEST="$ARCHIVE_ROOT/${RUN_LABEL}-${ARCHIVE_COMMIT}.json"
[ ! -e "$FINAL_BUNDLE" ] && [ ! -e "$FINAL_MANIFEST" ] \
  || die "archive destination already exists for commit $ARCHIVE_COMMIT"
mv "$BUNDLE_TMP" "$FINAL_BUNDLE"
mv "$MANIFEST_TMP" "$FINAL_MANIFEST"
git -C "$MAIN_REPO" update-ref -d "$TEMP_REF"
TEMP_REF=""

STATUS_BEFORE_CLEAN="$(git -C "$TARGET" status --porcelain=v1 --untracked-files=all)"
HEAD_BEFORE_CLEAN="$(git -C "$TARGET" rev-parse HEAD)"
[ "$HEAD_BEFORE_CLEAN" = "$HEAD_SHA" ] || die "worktree HEAD changed before archived cleanup"
[ "$STATUS_BEFORE_CLEAN" = "$STATUS_SNAPSHOT" ] || die "worktree status changed before archived cleanup"

TRACKED_PATHS=()
UNTRACKED_PATHS=()
for path in "${CHANGED_PATHS[@]}"; do
  if git -C "$TARGET" ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
    TRACKED_PATHS+=("$path")
  else
    UNTRACKED_PATHS+=("$path")
  fi
done
if [ "${#TRACKED_PATHS[@]}" -gt 0 ]; then
  git -C "$TARGET" restore --source=HEAD --staged --worktree -- "${TRACKED_PATHS[@]}"
fi
if [ "${#UNTRACKED_PATHS[@]}" -gt 0 ]; then
  git -C "$TARGET" clean -f -- "${UNTRACKED_PATHS[@]}"
fi
[ -z "$(git -C "$TARGET" status --porcelain=v1 --untracked-files=all)" ] \
  || die "worktree changed while archived paths were being cleaned; preserve and inspect it"

echo "archived_commit=$ARCHIVE_COMMIT"
echo "bundle=$FINAL_BUNDLE"
echo "manifest=$FINAL_MANIFEST"
echo "bundle_sha256=$BUNDLE_SHA256"
echo "worktree_clean=true"
