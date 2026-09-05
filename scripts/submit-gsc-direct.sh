#!/bin/bash
# Compatibility entry point only. Browser interaction belongs to the Codex
# in-app browser, never a shell-launched browser or a fallback backend.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
dry_run=0
plan_args=()

for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then
    dry_run=1
  else
    plan_args+=("$arg")
  fi
done

if [ "$dry_run" -ne 1 ]; then
  echo "Direct GSC submission is retired. Use the Codex in-app browser with scripts/gsc-codex.py plan, begin, and finish." >&2
  echo "For a read-only target plan: bash scripts/submit-gsc-direct.sh --dry-run <target arguments>" >&2
  echo "No browser was launched and no indexing request was sent." >&2
  exit 2
fi

# Bash 3.2 (macOS) treats an empty array expansion as unset under nounset.
if [ "${#plan_args[@]}" -eq 0 ]; then
  exec python3 "${SCRIPT_DIR}/gsc-codex.py" plan
fi
exec python3 "${SCRIPT_DIR}/gsc-codex.py" plan "${plan_args[@]}"
