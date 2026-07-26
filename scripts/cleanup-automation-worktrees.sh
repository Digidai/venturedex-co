#!/bin/bash

set -euo pipefail

MAIN_REPO="${VENTUREDEX_MAIN_REPO:-/Users/dai/Developer/CursorProjects/venturedex.co}"
AUTOMATION_WORKTREE_ROOT="${VENTUREDEX_AUTOMATION_WORKTREE_ROOT:-${CODEX_HOME:-/Users/dai/.codex}/worktrees}"
EXECUTE=0
FORCE_DIRTY=0
SCAN_ALL=0
TARGETS=()

usage() {
  cat <<'EOF'
Usage:
  bash scripts/cleanup-automation-worktrees.sh --all [--execute]
  bash scripts/cleanup-automation-worktrees.sh --path PATH [--execute]

Safely removes VentureDex automation worktrees after a Daily or Weekly run.
The default mode is a dry run. Use --execute to remove clean worktrees and
prune stale Git worktree metadata. Execution also refreshes origin and requires
the worktree HEAD to be reachable from an explicit refs/remotes/origin/* ref.
Unregistered Git directories are never deleted automatically.

Options:
  --all          Scan known VentureDex automation worktree locations.
  --path PATH   Clean one explicit worktree path.
  --execute     Apply changes. Without this flag, only print actions.
  --force-dirty Remove dirty registered automation worktrees. This never bypasses
                remote-reachability or registration checks.
  --main PATH   Main VentureDex checkout. Defaults to VENTUREDEX_MAIN_REPO or
                /Users/dai/Developer/CursorProjects/venturedex.co.
  -h, --help    Show this help.
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
    --all)
      SCAN_ALL=1
      shift
      ;;
    --path)
      [ "$#" -ge 2 ] || die "--path requires a value"
      TARGETS+=("$2")
      shift 2
      ;;
    --execute)
      EXECUTE=1
      shift
      ;;
    --force-dirty)
      FORCE_DIRTY=1
      shift
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

[ "$SCAN_ALL" -eq 1 ] || [ "${#TARGETS[@]}" -gt 0 ] || {
  usage >&2
  exit 1
}

[ -d "$MAIN_REPO/.git" ] || die "main repo is not a Git checkout: $MAIN_REPO"
MAIN_REPO="$(canonical_existing_dir "$MAIN_REPO")"
if [ -d "$AUTOMATION_WORKTREE_ROOT" ]; then
  AUTOMATION_WORKTREE_ROOT="$(canonical_existing_dir "$AUTOMATION_WORKTREE_ROOT")"
fi
ORIGIN_URL="$(git -C "$MAIN_REPO" config --get remote.origin.url || true)"
case "$ORIGIN_URL" in
  *github.com/Digidai/venturedex-co.git|*github.com:Digidai/venturedex-co.git)
    ;;
  *)
    die "main repo remote is not VentureDex: ${ORIGIN_URL:-missing}"
    ;;
esac

TMP_TARGETS="$(mktemp)"
trap 'rm -f "$TMP_TARGETS"' EXIT

add_target() {
  local candidate="$1"

  if [ -d "$candidate/venturedex.co" ]; then
    candidate="$candidate/venturedex.co"
  fi

  if [ -d "$candidate" ]; then
    canonical_existing_dir "$candidate" >>"$TMP_TARGETS"
  else
    printf '%s\n' "$candidate" >>"$TMP_TARGETS"
  fi
}

if [ "${#TARGETS[@]}" -gt 0 ]; then
  for target in "${TARGETS[@]}"; do
    add_target "$target"
  done
fi

if [ "$SCAN_ALL" -eq 1 ]; then
  git -C "$MAIN_REPO" worktree list --porcelain | sed -n 's/^worktree //p' >>"$TMP_TARGETS"

  if [ -d "$AUTOMATION_WORKTREE_ROOT" ]; then
    find "$AUTOMATION_WORKTREE_ROOT" -maxdepth 2 -type d -name venturedex.co -print >>"$TMP_TARGETS"
  fi

  find /tmp /private/tmp -maxdepth 1 -type d -name 'venturedex-weekly-curator-*' -print 2>/dev/null >>"$TMP_TARGETS" || true
fi

is_safe_automation_path() {
  local path="$1"

  [ "$path" != "$MAIN_REPO" ] || return 1

  case "$path" in
    "$AUTOMATION_WORKTREE_ROOT"/venturedex-daily-*/venturedex.co|\
    "$AUTOMATION_WORKTREE_ROOT"/venturedex-weekly-*/venturedex.co|\
    "$AUTOMATION_WORKTREE_ROOT"/venturedex-repair-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]/venturedex.co|\
    "$AUTOMATION_WORKTREE_ROOT"/[0-9a-f][0-9a-f][0-9a-f][0-9a-f]/venturedex.co|\
    /tmp/venturedex-weekly-curator-*|\
    /private/tmp/venturedex-weekly-curator-*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_venturedex_worktree() {
  local path="$1"
  local remote

  [ -d "$path" ] || return 1
  git -C "$path" rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1
  remote="$(git -C "$path" config --get remote.origin.url || true)"

  case "$remote" in
    *github.com/Digidai/venturedex-co.git|*github.com:Digidai/venturedex-co.git)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_registered_worktree() {
  local path="$1"
  git -C "$MAIN_REPO" worktree list --porcelain | sed -n 's/^worktree //p' | grep -Fx -- "$path" >/dev/null
}

origin_refs_containing_head() {
  local head="$1"

  git -C "$MAIN_REPO" for-each-ref \
    --format='%(refname)' \
    --contains "$head" \
    refs/remotes/origin/ \
    | grep -vFx 'refs/remotes/origin/HEAD' || true
}

remove_empty_parent() {
  local path="$1"
  local parent

  parent="$(dirname "$path")"
  case "$parent" in
    "$AUTOMATION_WORKTREE_ROOT"/venturedex-daily-*|\
    "$AUTOMATION_WORKTREE_ROOT"/venturedex-weekly-*|\
    "$AUTOMATION_WORKTREE_ROOT"/venturedex-repair-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]|\
    "$AUTOMATION_WORKTREE_ROOT"/[0-9a-f][0-9a-f][0-9a-f][0-9a-f])
      if [ "$EXECUTE" -eq 1 ]; then
        rmdir "$parent" 2>/dev/null || true
      else
        echo "DRY-RUN: rmdir $parent if empty"
      fi
      ;;
  esac
}

cleanup_target() {
  local path="$1"
  local status status_again head head_again reachable_refs
  local -a remove_args

  if [ -d "$path" ]; then
    path="$(canonical_existing_dir "$path")"
  fi

  if ! is_safe_automation_path "$path"; then
    echo "skip: outside VentureDex automation worktree patterns: $path"
    return 0
  fi

  if [ ! -d "$path" ]; then
    echo "skip: missing path, Git prune will handle metadata if registered: $path"
    return 0
  fi

  if ! is_venturedex_worktree "$path"; then
    if [ -f "$path/.git" ] || [ -d "$path/.git" ] || [ -L "$path/.git" ]; then
      echo "BLOCKED: Git metadata exists but the automation path cannot be verified as a VentureDex worktree: $path" >&2
      echo "Preserve the directory and repair or inspect .git metadata before cleanup." >&2
      if [ "$EXECUTE" -eq 1 ]; then
        return 1
      fi
      return 0
    fi
    echo "skip: not a VentureDex Git worktree: $path"
    return 0
  fi

  status="$(git -C "$path" status --porcelain --untracked-files=all)"
  if [ -n "$status" ] && [ "$FORCE_DIRTY" -ne 1 ]; then
    echo "BLOCKED: dirty worktree requires manual preservation or --force-dirty: $path" >&2
    if [ "$EXECUTE" -eq 1 ]; then
      return 1
    fi
    return 0
  fi

  head="$(git -C "$path" rev-parse HEAD)"
  reachable_refs="$(origin_refs_containing_head "$head")"
  if [ -z "$reachable_refs" ]; then
    echo "BLOCKED: worktree HEAD $head is not reachable from any refreshed origin ref: $path" >&2
    echo "Preserve the worktree and push or otherwise recover the commit before cleanup." >&2
    if [ "$EXECUTE" -eq 1 ]; then
      return 1
    fi
    return 0
  fi

  if is_registered_worktree "$path"; then
    remove_args=("$path")
    if [ "$FORCE_DIRTY" -eq 1 ]; then
      remove_args=(--force "$path")
    fi

    if [ "$EXECUTE" -eq 1 ]; then
      # A clean commit can appear after the reachability check, and Git will
      # happily remove such a clean worktree. Re-read HEAD immediately before
      # removal and require the exact SHA whose origin reachability was proven.
      head_again="$(git -C "$path" rev-parse HEAD)"
      if [ "$head_again" != "$head" ]; then
        echo "BLOCKED: worktree HEAD changed after reachability verification: $path" >&2
        echo "Verified $head, now $head_again. Rerun cleanup after pushing and refreshing origin." >&2
        return 1
      fi
      # Without --force, Git performs its own final dirtiness check. This closes
      # the race between the status snapshot above and the destructive removal.
      git -C "$MAIN_REPO" worktree remove "${remove_args[@]}"
      remove_empty_parent "$path"
      echo "removed registered worktree: $path"
    else
      if [ "$FORCE_DIRTY" -eq 1 ]; then
        echo "DRY-RUN: git -C $MAIN_REPO worktree remove --force $path"
      else
        echo "DRY-RUN: git -C $MAIN_REPO worktree remove $path"
      fi
      remove_empty_parent "$path"
    fi
  else
    # A path can become unregistered because metadata was lost while its Git
    # directory still contains recoverable commits. Recheck its complete status
    # immediately before refusing automatic deletion so a concurrent write is
    # visible in the blocker report.
    status_again="$(git -C "$path" status --porcelain --untracked-files=all)"
    if [ "$status_again" != "$status" ]; then
      echo "BLOCKED: unregistered worktree changed during cleanup and was preserved: $path" >&2
    else
      echo "BLOCKED: unregistered VentureDex Git directory; automatic deletion is refused: $path" >&2
    fi
    printf 'Reachable origin refs for HEAD %s:\n%s\n' "$head" "$reachable_refs" >&2
    echo "Recover by re-registering/moving the directory or preserving it manually; do not use recursive deletion." >&2
    if [ "$EXECUTE" -eq 1 ]; then
      return 1
    fi
  fi
}

if [ "$EXECUTE" -eq 1 ]; then
  echo "Refreshing origin refs before destructive cleanup..."
  git -C "$MAIN_REPO" fetch --quiet --prune origin \
    || die "could not refresh origin refs; refusing worktree cleanup"
fi

sort -u "$TMP_TARGETS" | while IFS= read -r target; do
  [ -n "$target" ] || continue
  cleanup_target "$target"
done

if [ "$EXECUTE" -eq 1 ]; then
  git -C "$MAIN_REPO" worktree prune --verbose
else
  git -C "$MAIN_REPO" worktree prune --dry-run --verbose
fi
