#!/bin/bash

# Shared local env loader for VentureDex scripts.
# Priority:
# 1. repo-local .env
# 2. automation-scoped local env in $CODEX_HOME/automations/<id>/local.env

if [ -n "${VENTUREDEX_LOCAL_ENV_LOADED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
AUTOMATION_ID="${VENTUREDEX_AUTOMATION_ID:-venturedex-daily-curator}"
CODEX_BASE="${CODEX_HOME:-$HOME/.codex}"
AUTOMATION_ENV_FILE_DEFAULT="$CODEX_BASE/automations/$AUTOMATION_ID/local.env"
AUTOMATION_ENV_FILE="${VENTUREDEX_AUTOMATION_ENV_FILE:-$AUTOMATION_ENV_FILE_DEFAULT}"

load_env_file() {
  local path="$1"
  if [ -f "$path" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$path"
    set +a
    return 0
  fi
  return 1
}

load_env_file "$REPO_ROOT/.env" || true

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  load_env_file "$AUTOMATION_ENV_FILE" || true
fi

export VENTUREDEX_LOCAL_ENV_LOADED=1
export VENTUREDEX_AUTOMATION_ENV_FILE="$AUTOMATION_ENV_FILE"
