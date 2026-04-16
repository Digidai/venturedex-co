# VentureDex Automation Docs

This directory keeps the daily Codex automation policy in versioned Markdown instead of burying the full logic inside the automation config.

## Source of Truth

Priority order:

1. `content/STANDARD.md`
2. `content/CODEX_TASK.md`
3. `docs/automation/venturedex-daily-runbook.md`
4. `docs/automation/venturedex-feedback-loop.md`
5. `docs/automation/venturedex-learning-log.md`
6. The automation config itself

If two files conflict, the higher-priority file wins.

## File Roles

- `venturedex-daily-runbook.md`
  The operational contract for each daily run. It contains immutable guards and adaptive heuristics.
- `venturedex-feedback-loop.md`
  The reward-guided iteration rules. This is RL-style closed-loop optimization, not a full online RL system.
- `venturedex-learning-log.md`
  Append-only run memory: outcomes, failures, reward, and accepted or rejected heuristic changes.

## Edit Policy

Humans may edit any file in this directory.

The automation may:

- always append a new entry to `venturedex-learning-log.md`
- update only explicitly marked auto-edit regions, and only when the gates in `venturedex-feedback-loop.md` allow it

Today, the only auto-edit region is:

- `docs/automation/venturedex-daily-runbook.md`
  - `<!-- BEGIN AUTO-EDIT: ADAPTIVE_HEURISTICS -->`
  - `<!-- END AUTO-EDIT: ADAPTIVE_HEURISTICS -->`

The automation must never:

- rewrite `content/STANDARD.md`
- rewrite `content/CODEX_TASK.md`
- rewrite any `Immutable Guards` section in these automation docs
- relax factual or validation guardrails automatically
- edit any text outside explicitly marked auto-edit regions

## Commit Policy

The automation may commit and push:

- content changes that pass all local checks
- automation-doc changes only when they are high-confidence, narrowly scoped, justified in the current learning-log entry, and limited to files it is allowed to mutate

When both content and automation-doc changes exist, prefer separate commits:

1. content commit
2. docs commit

Docs-only commits should be rare.

## Mutation Discipline

The automation must treat these docs as a control plane, not as scratch space.

- Any docs mutation must be justified in the current learning-log entry.
- Any docs mutation must be limited to a marked auto-edit region.
- Governance files are human-edited by default; automation only tunes heuristics, not policy.
- If a needed change falls outside an auto-edit region, record it as `deferred` and stop short of rewriting policy text.
