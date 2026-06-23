#!/bin/bash

set -euo pipefail

if [ "$#" -gt 0 ]; then
  WORKFLOW_PATHS=("$@")
else
  WORKFLOW_PATHS=(".github/workflows/ci.yml" ".github/workflows/deploy.yml")
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "github_actions: skipped (gh CLI unavailable)"
  exit 0
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: github_actions check requires an authenticated gh CLI" >&2
  exit 1
fi

GH_CHECK_ATTEMPTS="${GITHUB_ACTIONS_CHECK_ATTEMPTS:-3}"
GH_CHECK_DELAY_SECONDS="${GITHUB_ACTIONS_CHECK_DELAY_SECONDS:-5}"

case "$GH_CHECK_ATTEMPTS" in
  ''|*[!0-9]*) GH_CHECK_ATTEMPTS=3 ;;
esac

case "$GH_CHECK_DELAY_SECONDS" in
  ''|*[!0-9]*) GH_CHECK_DELAY_SECONDS=5 ;;
esac

if [ "$GH_CHECK_ATTEMPTS" -lt 1 ]; then
  GH_CHECK_ATTEMPTS=1
fi

if [ "$GH_CHECK_DELAY_SECONDS" -lt 1 ]; then
  GH_CHECK_DELAY_SECONDS=1
fi

gh_check_retry() {
  local attempt=1
  local delay="$GH_CHECK_DELAY_SECONDS"
  local output
  local status

  while true; do
    set +e
    output="$("$@" 2>&1)"
    status=$?
    set -e

    if [ "$status" -eq 0 ]; then
      printf '%s\n' "$output"
      return 0
    fi

    if [ "$attempt" -ge "$GH_CHECK_ATTEMPTS" ]; then
      printf '%s\n' "$output" >&2
      return "$status"
    fi

    printf 'github_actions: transient GitHub check failed (%s/%s); retrying in %ss\n%s\n' \
      "$attempt" "$GH_CHECK_ATTEMPTS" "$delay" "$output" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

repo="$(gh_check_retry gh repo view --json nameWithOwner --jq .nameWithOwner)"
permissions="$(gh_check_retry gh api "repos/$repo/actions/permissions" --jq '.enabled')"
if [ "$permissions" != "true" ]; then
  echo "ERROR: github_actions repository permissions are disabled for $repo" >&2
  exit 1
fi

for WORKFLOW_PATH in "${WORKFLOW_PATHS[@]}"; do
  workflow_state="$(
    gh_check_retry gh api "repos/$repo/actions/workflows" \
      --jq ".workflows[] | select(.path == \"$WORKFLOW_PATH\") | .state" \
      | head -n 1
  )"

  if [ -z "$workflow_state" ]; then
    echo "ERROR: github_actions workflow not found: $WORKFLOW_PATH" >&2
    exit 1
  fi

  if [ "$workflow_state" != "active" ]; then
    echo "ERROR: github_actions workflow $WORKFLOW_PATH is $workflow_state" >&2
    exit 1
  fi

  echo "github_actions: active ($WORKFLOW_PATH)"
done
