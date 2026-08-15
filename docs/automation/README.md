# VentureDex Automation Docs

This directory keeps the VentureDex Codex automation policy in versioned Markdown instead of burying the full logic inside automation configs.

## Source of Truth

Daily curation priority order:

1. `content/STANDARD.md`
2. `content/CODEX_TASK.md`
3. `docs/automation/venturedex-daily-runbook.md`
4. `docs/automation/venturedex-feedback-loop.md`
5. `docs/automation/venturedex-learning-log.md`
6. The automation config itself

If two files conflict, the higher-priority file wins.

Weekly research digest priority order:

1. `content/STANDARD.md`
2. `content/CODEX_TASK.md`
3. `docs/automation/venturedex-weekly-runbook.md`
4. `.github/workflows/weekly-draft.yml`

Launch discovery sync priority order:

1. `docs/automation/venturedex-whatships-runbook.md`
2. `content/whatships.json`
3. `scripts/sync-whatships.ts`
4. `.github/workflows/sync-whatships.yml`

Validation and release architecture priority order:

1. `package.json`
2. `scripts/manage.sh`
3. `scripts/validate.sh`
4. `scripts/build-db.sh`
5. `src/lib/content-transform.ts`
6. `tests/content-parity.test.ts`
7. `astro.config.mjs`
8. `wrangler.toml`
9. `.github/workflows/ci.yml`
10. `.github/workflows/deploy.yml`

Newsletter delivery priority order:

1. `docs/newsletter.md`
2. `wrangler.toml`
3. `src/lib/newsletter.ts`
4. `src/worker.ts`

Search Console submission priority order:

1. `scripts/submit-gsc-direct.sh`
2. `package.json`
3. `docs/automation/venturedex-daily-runbook.md`
4. `docs/automation/venturedex-weekly-runbook.md`
5. `$CODEX_HOME/automations/venturedex-daily-curator/automation.toml`
6. `$CODEX_HOME/automations/venturedex-weekly-curator/automation.toml`

## File Roles

- `venturedex-daily-runbook.md`
  The operational contract for each daily run. It contains immutable guards and adaptive heuristics.
- `venturedex-weekly-runbook.md`
  The operational contract for each weekly research digest run. It keeps weekly draft generation separate from daily curation.
- `venturedex-whatships-runbook.md`
  The operational contract for the launch discovery sync. It defines source boundaries, normalization and deduplication rules, mutation scope, and the validation and release gates for scheduled updates.
- `venturedex-feedback-loop.md`
  The reward-guided iteration rules. This is RL-style closed-loop optimization, not a full online RL system.
- `venturedex-learning-log.md`
  Append-only run memory: outcomes, failures, reward, and accepted or rejected heuristic changes.
- `../../content/whatships.json`
  The version-controlled canonical snapshot rendered by the VentureDex launch channel after a successful sync.
- `../../scripts/sync-whatships.ts`
  The deterministic sync implementation. It fetches, normalizes, deduplicates, validates, and writes the launch snapshot; scheduling remains outside this script.
- `../../.github/workflows/sync-whatships.yml`
  The scheduled and manual GitHub Actions wrapper for the launch discovery sync. It invokes the sync implementation and repository gates without duplicating synchronization policy.
- `../../scripts/automation-run-state.py`
  Atomic lease and checkpoint manager for Daily recovery. It stores the rendered checkpoint in `$CODEX_HOME/automations/venturedex-daily-curator/run-state.md`, keeps the corresponding lease in `run-state.lease.json`, and serializes updates through `.run-state.lock`. The authority files contain only a one-way owner fingerprint, epoch/revision counters, routing fields, and blocker summaries; they must never contain credentials, the raw thread identity, or copied source content.
- `../newsletter.md`
  The delivery contract for Daily additions and Weekly research email sends, including delay gates, compliance configuration, module review notes, and test cases.
- `../../content/timestamps.json`
  The repo-managed first-seen and published timestamp sidecar. Prerendered pages and the D1 seed both read it, so new Daily additions must keep it aligned.
- `../../scripts/submit-gsc-direct.sh`
  The local Search Console URL Inspection submitter. It targets only VentureDex startup and weekly detail pages, writes the authoritative ledger at `$CODEX_HOME/automations/venturedex-daily-curator/gsc_submission_history.tsv`, can migrate the ignored repo-local legacy ledger, and depends on an authenticated local `bb-browser` + Comet CDP session because general VentureDex pages cannot use Google's Indexing API. Its post-click reconciliation mode is read-only and may resolve an exact `post_request_confirmation_unknown` artifact to `requested` only from a route-bound existing success state.

## Edit Policy

Humans may edit any file in this directory.

An explicit user-requested Codex session counts as a human editor for automation-governance work. That path may update policy text outside auto-edit regions when the user is intentionally changing the control plane, not when the scheduled automation is self-tuning.

The automation may:

- always append a new entry to `venturedex-learning-log.md`
- update only explicitly marked auto-edit regions, and only when the gates in `venturedex-feedback-loop.md` allow it

Today, the only auto-edit region is:

- `docs/automation/venturedex-daily-runbook.md`
  - `<!-- BEGIN AUTO-EDIT: ADAPTIVE_HEURISTICS -->`
  - `<!-- END AUTO-EDIT: ADAPTIVE_HEURISTICS -->`

Weekly automation does not currently have an auto-edit region. It may generate `content/weekly/*.json` drafts, but it must not rewrite governance text automatically.

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

Human-directed Codex governance changes may commit and push automation-doc updates outside auto-edit regions when all of the following are true:

- the user explicitly asked for an automation-policy or workflow change
- the resulting docs still respect higher-priority content rules
- every affected automation doc is updated in the same pass
- the current learning-log entry explains the reason, scope, and resulting policy

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

For human-directed governance changes:

- update the smallest coherent set of files needed to keep the control plane internally consistent
- when changing intake capacity or commit behavior, review the runbook, feedback loop, and commit policy together instead of editing one file in isolation

## Automation Config Alignment

The local automation prompts under `$CODEX_HOME/automations/venturedex-daily-curator/automation.toml` and `$CODEX_HOME/automations/venturedex-weekly-curator/automation.toml` should stay aligned with this control plane.

- Keep bootstrap, source-of-truth order, and error-investigation instructions consistent with the repo docs.
- Before starting a new Daily cycle, reconcile the external run-state checkpoint and lease with registered worktrees, active processes, recent commits, and the central GSC ledger. In the selected exact-origin worktree, acquire or renew `scripts/automation-run-state.py`'s lease before bootstrap or discovery. Resume one clearly owned interrupted run; never create a second cycle merely because a prior response stream ended.
- If the prompt tells the automation to investigate and iterate on failures, the runbook and feedback loop must describe the same behavior in auditable terms.
- For browser-driven product trials, page verification, and browser-side debugging, prefer the [`bb-browser`](/Users/dai/.codex/skills/bb-browser/SKILL.md) workflow instead of direct Chrome usage.
- Current code architecture is JSON-first and mostly prerendered on Astro 7 with Cloudflare adapter 14: `content/*.json` is transformed through `src/lib/content-transform.ts` for Astro pages, while `scripts/build-db.sh` emits the D1 seed used by the newsletter/runtime path. `tests/content-parity.test.ts` guards those two transforms from drifting.
- The Daily prompt should read the learning-log template plus the latest 10 entries named by the feedback loop, then search older history only for a concrete error. Replaying the entire append-only log on every run adds context and latency without changing the governing state.
- Local pre-publish validation should use `./scripts/manage.sh validate` plus `git diff --check`. The complete gate includes the high-severity dependency audit, content validation, deterministic D1 seed generation, newsletter/unit tests, Astro sync, TypeScript checking, and Astro build. The individual commands remain useful for isolating failures, but they are not the final gate.
- Daily automation must add or confirm `content/timestamps.json` entries for newly accepted slugs before publishing so prerendered sort order, sitemap dates, RSS dates, and the D1 seed agree.
- Daily automation must require structured startup `research` before publishing; weekly automation must consume that `research` when producing source-bound issue evaluations.
- Daily automation must add `links.careers` when the official site, official ATS page, or clearly official company jobs page exposes a Careers/Jobs/Open Roles entry. This is a static company-detail link only; do not scrape dynamic job lists, role counts, or hiring claims into VentureDex records.
- Weekly issue allocation may reserve a week or issue number only from an open, same-repository, non-cross-repository PR whose head owner matches the target repository owner and whose branch starts with `automation/weekly-draft-`; PR titles are descriptive evidence and never authorization by themselves.
- Every production release, including `workflow_dispatch`, must start from a clean checkout at the exact current `origin/main` SHA; only a successful Validate result for that same SHA may skip the repeated full local gate. The release holds a Git-common-directory lock, rechecks source cleanliness after validation/build and immediately before both Worker upload and D1 sync, and allows only the unstaged generated D1 seed plus untracked Weekly OG files whose issue numbers resolve to published Weekly records. Build-time SHA-256 locks cover the generated seed and ignored `dist/` tree; both are checked before Worker upload, and the exact seed hash is checked again immediately before remote D1 execution. Public `manage.sh sync` and `manage.sh deploy` are non-mutating blockers: the unified `manage.sh release` path is the only CLI path allowed to publish the Worker or write D1. Deploys are serialized, the Worker/static bundle is published before D1 content sync, and bounded live-smoke retries absorb short edge propagation windows without blind workflow reruns. D1 sync compares the complete remote and local published/manual startup slug sets plus published Weekly issue-number sets. Any remote-only startup slug or Weekly issue number is blocked unless a human-reviewed release supplies the exact comma-separated removal set through `VENTUREDEX_ALLOW_STARTUP_REMOVALS` or `VENTUREDEX_ALLOW_WEEKLY_ISSUE_REMOVALS`; automation must never set either override.
- Destructive automation-worktree cleanup refreshes `origin` first and removes only registered worktrees whose HEAD is reachable from an explicit `refs/remotes/origin/*` ref. Dirty execution targets return a nonzero blocker, and HEAD is reread immediately before removal so a concurrent clean commit is preserved. An unregistered Git directory is treated as recoverable evidence and is never recursively deleted by the cleanup script.
- After deploy and live smoke, Daily automation must run `bash scripts/submit-gsc-direct.sh --dry-run --latest-daily` and then `bash scripts/submit-gsc-direct.sh --latest-daily`; Weekly automation must do the same with `--latest-weekly`. Unresolved canonical detail URLs stay in the central ledger as `retry_pending` and can be revisited with `--retry-pending` in deterministic bounded batches. If the authenticated browser, Search Console UI, or quota blocks submission, record the exact blocker and preserve the live URL list instead of treating the run as complete.
- Newsletter delivery must lag website publication. Daily sends use a default 6-hour delay and weekly sends use a default 24-hour delay so editors can correct live content before it reaches inboxes.
- Newsletter sends are a production-delivery surface: do not bypass `newsletter_sends`, `newsletter_deliveries`, unsubscribe links, or dry-run checks.
