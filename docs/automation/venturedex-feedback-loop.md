# VentureDex Feedback Loop

This file defines the reward-guided iteration loop for the daily automation.

## Accuracy Note

This is not a full reinforcement-learning system. It is a reward-guided closed loop:

- state: recent runs, outcomes, failures, accepted heuristics
- action: choose or refine search, evaluation, writing, and operational heuristics
- reward: score the run outcome
- update: change only narrow heuristic sections when evidence is strong enough

That framing is deliberate. It keeps the system interpretable and auditable.

## Immutable Guards

Automation must never rewrite this section.

These limits apply to scheduled automation self-edits. They do not block explicit human-directed governance changes that are reviewed and committed on purpose.

- Never auto-edit `content/STANDARD.md` or `content/CODEX_TASK.md`.
- Never auto-edit any `Immutable Guards` section.
- Never relax factual verification rules automatically.
- Never relax local validation or build gates automatically.
- Never widen allowed file scope automatically.
- Never increase the per-run addition cap automatically.

## State

For each run, look at:

- the current run outcome
- the last 10 entries in `docs/automation/venturedex-learning-log.md`
- repeated `failure_tags`
- repeated no-op reasons
- repeated false-positive or false-negative patterns

## Actions

Allowed automatic actions:

- reorder search-source priority
- tighten or clarify ranking heuristics
- tighten or clarify rejection wording guidance
- tighten or clarify `editor_note` writing heuristics
- tighten or clarify failure-investigation order and rerun sequencing
- tighten screenshot retry rules
- tighten commit criteria or review wording

Disallowed automatic actions:

- changing editorial standards
- changing JSON schema
- changing validation commands
- changing deployment commands
- changing branch strategy
- rewriting history in the learning log
- editing governance text outside explicitly marked auto-edit regions

## Failure Tag Vocabulary

Use stable tags in the learning log so repeated issues can be detected without guessing.

- `none`
- `no_candidates`
- `duplicate_or_old_round`
- `source_incomplete`
- `taste_reject`
- `screenshot_env`
- `validate_fail`
- `build_db_fail`
- `build_app_fail`
- `staging_scope`
- `push_rejected`
- `ci_fail`
- `policy_conflict`
- `investor_identity_ambiguous`
- `capacity_budget_mismatch`
- `governance_trace_missing`
- `other`

## Reward Model

Score each run with a simple additive reward:

- `+3` one accepted startup, all five reviews pass, all local checks pass, push succeeds, no cleanup needed
- `+4` two to five accepted startups, all five reviews pass, all local checks pass, push succeeds, and every addition independently clears the bar
- `+2` no accepted startup, but candidate search and rejection set are specific, justified, and meet the 3:1 bar
- `+1` clean no-op run with clear reasons and no process drift
- `0` neutral run with no major learning and no regressions
- `-1` operational friction that required retry but did not threaten content quality
- `-2` local validation or build failure during the run, even if fixed later
- `-3` wrong file scope, broken staging, or push blocked by a preventable process mistake
- `-5` any factual error or bad content that is pushed and later needs correction or rollback

If multiple events happen, add them.

## Update Gate

Automation may update `Adaptive Heuristics` sections only when all of the following are true:

1. the proposed change is narrow and textual, not structural
2. the change affects only allowed automation docs and only an explicitly marked auto-edit region
3. the same issue appeared in at least 2 of the last 3 runs, or the current run produced a high-confidence root cause with direct evidence
4. the change tightens, clarifies, or deprioritizes behavior; it must not weaken a hard guard
5. the current learning-log entry records the evidence and the exact section changed
6. the five review passes still succeed after the doc update

If any condition fails, record the proposal in the learning log as `deferred` or `rejected`, but do not rewrite the docs.

## Human-Directed Governance Changes

When a human explicitly asks Codex to change automation policy, Codex may edit automation docs outside auto-edit regions if all of the following are true:

1. the request is clearly governance-directed rather than a normal daily run
2. the change does not conflict with `content/STANDARD.md` or `content/CODEX_TASK.md`
3. every affected automation doc is updated in the same pass so the control plane stays internally consistent
4. the current learning-log entry records the reason, changed files, and resulting policy
5. the review covers throughput math, commit behavior, and mutation boundaries when any intake-cap or scope rule changes

If those conditions are not met, stop and leave the proposed governance change uncommitted.

## Error Research and Iteration Loop

When a run hits an operational or policy error, the automation should:

1. capture the exact failing step, command, artifact, and observed error
2. inspect the local script, validator, config, and recent learning-log evidence most likely tied to that failure
3. when browser interaction is needed for investigation, use the [`bb-browser`](/Users/dai/.codex/skills/bb-browser/SKILL.md) workflow rather than direct Chrome-driven steps
4. consult official or other primary external sources only when the failure depends on current external behavior or a referenced system outside the repo
5. classify the blocker as content, environment, policy, external dependency, or unknown
6. apply the smallest allowed fix or heuristic adjustment supported by evidence
7. rerun the failed step and any downstream gates that depend on it
8. repeat only when the previous iteration produced new evidence; do not blind-retry

If the blocker remains after evidence-backed iterations, record the root cause, attempted fixes, stable `failure_tags`, and any deferred policy change instead of summarizing it as a generic error.

## Learning-Log Protocol

Every run must append one entry to `docs/automation/venturedex-learning-log.md`.

Each entry must include:

- run timestamp
- candidate count
- accepted count
- rejected count
- whether the 3:1 bar was met
- validation/build/push outcome
- stable `failure_tags`
- reward
- dominant failure mode, if any
- proposed heuristic change
- decision: `none`, `deferred`, `applied`, or `rejected`
- affected file and section, if any
- commit SHA and pushed branch, if any
- CI/deploy status if observed

## Review for Heuristic Changes

If a heuristic change is being applied, run these checks in addition to the normal five-pass review:

1. Is the wording more precise than before?
2. Does it reduce false positives, false negatives, or avoidable retries?
3. Does it avoid touching any immutable rule?
4. Does it preserve the ability to run a clean no-op?
5. Would a human reviewer understand why this change happened from the learning-log entry alone?

If any answer is no, do not apply the heuristic change.

## Review for Human-Directed Governance Changes

If a human-directed governance change is being applied, run these checks:

1. Does the new wording distinguish human overrides from automation self-edits?
2. If intake capacity changed, do candidate-discovery targets still comfortably satisfy the rejection bar?
3. Do commit rules still describe both single-addition and multi-addition runs?
4. Is the learning-log trail sufficient for a future automation run to understand why the policy changed?
5. Is the resulting policy stricter or clearer about quality, even if throughput increased?

If any answer is no, revise the docs before committing.
