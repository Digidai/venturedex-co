#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AUTOMATION_ID="${1:-venturedex-daily-curator}"
BOOTSTRAP_LOCK_DIR=""
NPM_CI_SUCCESS_MARKER="$REPO_ROOT/node_modules/.venturedex-npm-ci-success"
NPM_CI_SUCCESS_MARKER_TMP=""
PACKAGE_LOCK_SHA256=""

export REPO_ROOT
export VENTUREDEX_AUTOMATION_ID="$AUTOMATION_ID"

bootstrap_lock_cleanup() {
  local recorded_pid=""

  if [ -n "$NPM_CI_SUCCESS_MARKER_TMP" ]; then
    unlink "$NPM_CI_SUCCESS_MARKER_TMP" 2>/dev/null || true
    NPM_CI_SUCCESS_MARKER_TMP=""
  fi
  if [ -z "$BOOTSTRAP_LOCK_DIR" ]; then
    return 0
  fi
  if [ -f "$BOOTSTRAP_LOCK_DIR/pid" ]; then
    recorded_pid="$(sed -n '1p' "$BOOTSTRAP_LOCK_DIR/pid")"
  fi
  if [ "$recorded_pid" != "$$" ]; then
    echo "WARNING: Bootstrap lock ownership changed; preserving $BOOTSTRAP_LOCK_DIR." >&2
    BOOTSTRAP_LOCK_DIR=""
    return 0
  fi

  unlink "$BOOTSTRAP_LOCK_DIR/context" 2>/dev/null || true
  unlink "$BOOTSTRAP_LOCK_DIR/pid" 2>/dev/null || true
  if ! rmdir "$BOOTSTRAP_LOCK_DIR" 2>/dev/null; then
    echo "WARNING: Bootstrap lock directory could not be removed cleanly: $BOOTSTRAP_LOCK_DIR" >&2
  fi
  BOOTSTRAP_LOCK_DIR=""
}

resolve_package_lock_sha256() {
  python3 - "$REPO_ROOT/package-lock.json" <<'PY'
import hashlib
from pathlib import Path
import sys

path = Path(sys.argv[1])
if not path.is_file():
    print(f"ERROR: Missing dependency lockfile: {path}", file=sys.stderr)
    raise SystemExit(1)
print(hashlib.sha256(path.read_bytes()).hexdigest())
PY
}

npm_dependencies_ready() {
  local recorded_hash=""

  if [ ! -x "$REPO_ROOT/node_modules/.bin/astro" ] || [ ! -f "$NPM_CI_SUCCESS_MARKER" ]; then
    return 1
  fi
  recorded_hash="$(sed -n '1p' "$NPM_CI_SUCCESS_MARKER")"
  [ "$recorded_hash" = "sha256:$PACKAGE_LOCK_SHA256" ]
}

record_npm_ci_success() {
  local current_lock_sha256

  if [ ! -x "$REPO_ROOT/node_modules/.bin/astro" ]; then
    echo "ERROR: npm ci exited successfully but Astro is still unavailable; refusing to mark dependencies ready." >&2
    return 1
  fi
  current_lock_sha256="$(resolve_package_lock_sha256)" || return 1
  if [ "$current_lock_sha256" != "$PACKAGE_LOCK_SHA256" ]; then
    echo "ERROR: package-lock.json changed during npm ci; refusing to mark dependencies ready." >&2
    return 1
  fi

  NPM_CI_SUCCESS_MARKER_TMP="$NPM_CI_SUCCESS_MARKER.$$.tmp"
  printf 'sha256:%s\n' "$PACKAGE_LOCK_SHA256" > "$NPM_CI_SUCCESS_MARKER_TMP"
  mv -f "$NPM_CI_SUCCESS_MARKER_TMP" "$NPM_CI_SUCCESS_MARKER"
  NPM_CI_SUCCESS_MARKER_TMP=""
}

acquire_bootstrap_lock() {
  local git_dir lock_owner="" lock_command=""

  if ! git_dir="$(git -C "$REPO_ROOT" rev-parse --absolute-git-dir 2>/dev/null)"; then
    echo "ERROR: Could not resolve this worktree's Git directory for the bootstrap lock." >&2
    return 1
  fi
  BOOTSTRAP_LOCK_DIR="$git_dir/venturedex-bootstrap.lock"

  if ! mkdir "$BOOTSTRAP_LOCK_DIR" 2>/dev/null; then
    if [ -f "$BOOTSTRAP_LOCK_DIR/pid" ]; then
      lock_owner="$(sed -n '1p' "$BOOTSTRAP_LOCK_DIR/pid")"
    fi

    if [[ "$lock_owner" =~ ^[1-9][0-9]*$ ]] && kill -0 "$lock_owner" 2>/dev/null; then
      lock_command="$(ps -p "$lock_owner" -o command= 2>/dev/null || true)"
      echo "ERROR: Another automation bootstrap owns this worktree lock: $BOOTSTRAP_LOCK_DIR (pid $lock_owner)." >&2
      if [ -n "$lock_command" ]; then
        echo "owner_command: $lock_command" >&2
      fi
      BOOTSTRAP_LOCK_DIR=""
      return 1
    fi

    if ! [[ "$lock_owner" =~ ^[1-9][0-9]*$ ]]; then
      echo "ERROR: Bootstrap lock has no valid owner PID; inspect before removing: $BOOTSTRAP_LOCK_DIR" >&2
      BOOTSTRAP_LOCK_DIR=""
      return 1
    fi

    echo "bootstrap_lock: recovering stale owner pid $lock_owner"
    unlink "$BOOTSTRAP_LOCK_DIR/context" 2>/dev/null || true
    unlink "$BOOTSTRAP_LOCK_DIR/pid" 2>/dev/null || true
    if ! rmdir "$BOOTSTRAP_LOCK_DIR" 2>/dev/null; then
      echo "ERROR: Stale bootstrap lock contains unexpected state; refusing to remove it: $BOOTSTRAP_LOCK_DIR" >&2
      BOOTSTRAP_LOCK_DIR=""
      return 1
    fi
    if ! mkdir "$BOOTSTRAP_LOCK_DIR" 2>/dev/null; then
      echo "ERROR: Bootstrap lock was acquired by another process during stale-lock recovery: $BOOTSTRAP_LOCK_DIR" >&2
      BOOTSTRAP_LOCK_DIR=""
      return 1
    fi
  fi

  printf '%s\n' "$$" > "$BOOTSTRAP_LOCK_DIR/pid"
  {
    printf 'repo=%s\n' "$REPO_ROOT"
    printf 'automation_id=%s\n' "$AUTOMATION_ID"
    printf 'started_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  } > "$BOOTSTRAP_LOCK_DIR/context"
  trap bootstrap_lock_cleanup EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
}

run_npm_ci_with_timeout() {
  local timeout_seconds="${VENTUREDEX_BOOTSTRAP_NPM_CI_TIMEOUT_SECONDS:-900}"

  if ! [[ "$timeout_seconds" =~ ^[1-9][0-9]*$ ]]; then
    echo "ERROR: VENTUREDEX_BOOTSTRAP_NPM_CI_TIMEOUT_SECONDS must be a positive integer." >&2
    return 2
  fi

  echo "npm_ci_timeout_seconds: $timeout_seconds"
  python3 - "$timeout_seconds" "$REPO_ROOT" <<'PY'
import os
import signal
import subprocess
import sys

timeout_seconds = int(sys.argv[1])
repo_root = sys.argv[2]
process = None


def terminate_group(sig: int, grace_seconds: int = 5) -> None:
    if process is None or process.poll() is not None:
        return
    try:
        os.killpg(process.pid, sig)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=grace_seconds)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()


def forward_signal(sig: int, _frame: object) -> None:
    terminate_group(sig)
    raise SystemExit(128 + sig)


signal.signal(signal.SIGHUP, forward_signal)
signal.signal(signal.SIGINT, forward_signal)
signal.signal(signal.SIGTERM, forward_signal)

try:
    process = subprocess.Popen(
        ["npm", "ci"],
        cwd=repo_root,
        env=os.environ.copy(),
        start_new_session=True,
    )
except OSError as exc:
    print(f"ERROR: Could not start npm ci: {exc}", file=sys.stderr)
    raise SystemExit(127)

try:
    status = process.wait(timeout=timeout_seconds)
except subprocess.TimeoutExpired:
    print(
        f"ERROR: npm ci timed out after {timeout_seconds} seconds; terminating its process group.",
        file=sys.stderr,
    )
    terminate_group(signal.SIGTERM)
    raise SystemExit(124)

raise SystemExit(status)
PY
}

acquire_bootstrap_lock
PACKAGE_LOCK_SHA256="$(resolve_package_lock_sha256)"

# shellcheck disable=SC1091
. "$SCRIPT_DIR/load-local-env.sh"

AUTOMATION_ENV_FILE="${VENTUREDEX_AUTOMATION_ENV_FILE}"
REPO_ENV_FILE="$REPO_ROOT/.env"

echo "== VentureDex automation bootstrap =="
echo "repo: $REPO_ROOT"
echo "automation_id: $AUTOMATION_ID"

if [ ! -f "$REPO_ENV_FILE" ] && [ -f "$AUTOMATION_ENV_FILE" ]; then
  cp "$AUTOMATION_ENV_FILE" "$REPO_ENV_FILE"
  chmod 600 "$REPO_ENV_FILE"
  echo "created repo-local .env from $AUTOMATION_ENV_FILE"
elif [ -f "$REPO_ENV_FILE" ]; then
  echo "repo-local .env already present"
else
  echo "ERROR: missing repo-local .env and automation env file at $AUTOMATION_ENV_FILE" >&2
  exit 1
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not available after env load" >&2
  exit 1
fi

python3 - <<'PY'
import os
import requests

token = os.environ["CLOUDFLARE_API_TOKEN"]
account_id = os.environ["CLOUDFLARE_ACCOUNT_ID"]
headers = {"Authorization": f"Bearer {token}"}

verify = requests.get("https://api.cloudflare.com/client/v4/user/tokens/verify", headers=headers, timeout=20)
verify.raise_for_status()
data = verify.json()
if not data.get("success") or data.get("result", {}).get("status") != "active":
    raise SystemExit("ERROR: Cloudflare token is not active")
print("cloudflare_token: active")

r2 = requests.get(
    f"https://api.cloudflare.com/client/v4/accounts/{account_id}/r2/buckets",
    headers=headers,
    timeout=20,
)
if r2.status_code == 200:
    print("r2_access: yes")
elif r2.status_code == 403:
    print("r2_access: no (token lacks R2 permission)")
else:
    print(f"r2_access: unknown (HTTP {r2.status_code})")
PY

if ! npm_dependencies_ready; then
  echo "node_modules missing, incomplete, or unverified for package-lock; running npm ci"
  unlink "$NPM_CI_SUCCESS_MARKER" 2>/dev/null || true
  if run_npm_ci_with_timeout; then
    record_npm_ci_success
  else
    npm_ci_status=$?
    echo "ERROR: npm ci failed during automation bootstrap (exit $npm_ci_status); refusing to continue." >&2
    exit "$npm_ci_status"
  fi
else
  echo "node_modules ready"
fi

"$SCRIPT_DIR/check-github-actions.sh"

echo "bootstrap: complete"
