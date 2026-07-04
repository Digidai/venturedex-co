#!/bin/bash

set -euo pipefail

MAIN_REPO="${VENTUREDEX_MAIN_REPO:-/Users/dai/Developer/CursorProjects/venturedex.co}"
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
prune stale Git worktree metadata.

Options:
  --all          Scan known VentureDex automation worktree locations.
  --path PATH   Clean one explicit worktree path.
  --execute     Apply changes. Without this flag, only print actions.
  --force-dirty Remove dirty automation worktrees. Use only after evidence is preserved.
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

  if [ -d /Users/dai/.codex/worktrees ]; then
    find /Users/dai/.codex/worktrees -maxdepth 2 -type d -name venturedex.co -print >>"$TMP_TARGETS"
  fi

  find /tmp /private/tmp -maxdepth 1 -type d -name 'venturedex-weekly-curator-*' -print 2>/dev/null >>"$TMP_TARGETS" || true
fi

is_safe_automation_path() {
  local path="$1"

  [ "$path" != "$MAIN_REPO" ] || return 1

  case "$path" in
    /Users/dai/.codex/worktrees/venturedex-daily-*/venturedex.co|\
    /Users/dai/.codex/worktrees/venturedex-weekly-*/venturedex.co|\
    /Users/dai/.codex/worktrees/[0-9a-f][0-9a-f][0-9a-f][0-9a-f]/venturedex.co|\
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

remove_empty_parent() {
  local path="$1"
  local parent

  parent="$(dirname "$path")"
  case "$parent" in
    /Users/dai/.codex/worktrees/venturedex-daily-*|\
    /Users/dai/.codex/worktrees/venturedex-weekly-*|\
    /Users/dai/.codex/worktrees/[0-9a-f][0-9a-f][0-9a-f][0-9a-f])
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
  local status

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
    echo "skip: not a VentureDex Git worktree: $path"
    return 0
  fi

  status="$(git -C "$path" status --porcelain --untracked-files=all)"
  if [ -n "$status" ] && [ "$FORCE_DIRTY" -ne 1 ]; then
    echo "skip: dirty worktree requires manual preservation or --force-dirty: $path"
    return 0
  fi

  if is_registered_worktree "$path"; then
    if [ "$EXECUTE" -eq 1 ]; then
      git -C "$MAIN_REPO" worktree remove ${FORCE_DIRTY:+--force} "$path"
      remove_empty_parent "$path"
      echo "removed registered worktree: $path"
    else
      echo "DRY-RUN: git -C $MAIN_REPO worktree remove ${FORCE_DIRTY:+--force }$path"
      remove_empty_parent "$path"
    fi
  else
    if [ "$EXECUTE" -eq 1 ]; then
      rm -rf "$path"
      remove_empty_parent "$path"
      echo "removed orphan automation directory: $path"
    else
      echo "DRY-RUN: rm -rf $path"
      remove_empty_parent "$path"
    fi
  fi
}

sort -u "$TMP_TARGETS" | while IFS= read -r target; do
  [ -n "$target" ] || continue
  cleanup_target "$target"
done

if [ "$EXECUTE" -eq 1 ]; then
  git -C "$MAIN_REPO" worktree prune --verbose
else
  git -C "$MAIN_REPO" worktree prune --dry-run --verbose
fi
