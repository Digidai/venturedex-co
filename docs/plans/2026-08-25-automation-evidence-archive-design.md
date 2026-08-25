# Automation Evidence Archive Design

## Problem

A blocked automation run must append durable learning evidence, but an unpublished run cannot always pass the complete release gate or push a docs commit. The old policy then preserved the dirty worktree indefinitely. Later Daily preflight correctly treated several dirty worktrees as ambiguous ownership and stopped, but there was no narrow mechanism to retire evidence-only historical worktrees. The safe failure accumulated into operational debt.

## Considered approaches

1. Automatically commit and push blocked-run documentation. This makes evidence remote, but it can move `origin/main` without the complete gate and turns an operational closeout into a release-side effect.
2. Ignore terminal dirty worktrees during preflight. This keeps scheduling moving, but can hide unpublished content, assets, or concurrent work.
3. Archive only explicitly allowlisted evidence before cleanup. This preserves fail-closed behavior for content while giving terminal evidence a durable closeout path. This is the selected approach.

## Design

`scripts/archive-automation-worktree-evidence.sh` is read-only by default. Its dry run prints the exact worktree HEAD and SHA-256 of Git status. Execution requires both values, verifies registration, VentureDex origin, remote reachability, and zero exact matching non-ancestor processes, then rechecks both CAS values.

Daily use is limited to `docs/automation/venturedex-learning-log.md` and additionally requires an exact `blocked/closeout` checkpoint with its matching released lease. Weekly use permits the learning log plus at most one numeric issue JSON. Startup records, rejections, assets, screenshots, extra files, active ownership, or ambiguous paths fail closed.

The helper constructs an archive commit through a temporary Git index without staging the real worktree, writes a thin Git bundle and JSON manifest outside the repository, verifies the bundle, and only then cleans the archived paths. Ordinary cleanup still runs separately and without `--force-dirty`.

## Verification

Tests cover successful Daily evidence archiving, HEAD/status CAS, archive content recovery, active-lease refusal, and non-evidence content refusal. The full repository gate remains required before merging the maintenance change.
