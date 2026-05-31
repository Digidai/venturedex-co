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

repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
permissions="$(gh api "repos/$repo/actions/permissions" --jq '.enabled')"
if [ "$permissions" != "true" ]; then
  echo "ERROR: github_actions repository permissions are disabled for $repo" >&2
  exit 1
fi

for WORKFLOW_PATH in "${WORKFLOW_PATHS[@]}"; do
  workflow_state="$(
    gh api "repos/$repo/actions/workflows" \
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
