#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AUTOMATION_ID="${1:-venturedex-daily-curator}"

export REPO_ROOT
export VENTUREDEX_AUTOMATION_ID="$AUTOMATION_ID"

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

if [ ! -x "$REPO_ROOT/node_modules/.bin/astro" ]; then
  echo "node_modules missing or incomplete; running npm ci"
  (cd "$REPO_ROOT" && npm ci)
else
  echo "node_modules ready"
fi

echo "bootstrap: complete"
