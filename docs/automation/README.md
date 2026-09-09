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
5. `scripts/promotion/indexnow.ts`

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

1. `scripts/gsc-codex.py`
2. `package.json`
3. `docs/automation/venturedex-daily-runbook.md`
4. `docs/automation/venturedex-weekly-runbook.md`
5. `$CODEX_HOME/automations/venturedex-daily-curator/automation.toml`
6. `$CODEX_HOME/automations/venturedex-weekly-curator/automation.toml`

## File Roles

- `curation-decisions.md`
  Fixed-pool accounting, source coverage, eight-state decision overlay, hash-bound historical corrections and bounded re-review planning. No rejection quota.
- `venturedex-daily-prompt.md`
  Versioned human-authorized prompt to install into the existing Daily automation after the corresponding main release. The app config is read back for exact equality; this file alone does not prove scheduler activation.
- `funding-terms.md`
  Native currencies, named early/extension stages, financing instruments, backward-compatible data contracts and additive D1 migration.

- `investor-research.md`
  Source-bound investor profiles, 90-day associated-firm refresh, event-driven early review, new-firm supplementation and bounded failed-attempt retries.
- `../research/2026-09-09-curation-review.md`
  Human-requested audit of source coverage, false-negative risks, recent rejection reasons and the investor-profile rollout. The initial findings are preserved; the authorized repair and release are tracked in `../plans/2026-09-09-curation-repair-design.md`.

- `venturedex-daily-runbook.md`
  The operational contract for each daily run. It contains immutable guards and adaptive heuristics.
- `venturedex-weekly-runbook.md`
  The operational contract for each weekly research digest run. It keeps weekly draft generation separate from daily curation.
- `gsc-codex-browser.md`
  The exact Codex in-app browser protocol and evidence schema for read-only target planning, durable pre-click intent, one native UI click, result receipts, and fail-closed recovery boundaries.
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
  The scheduled and manual GitHub Actions wrapper for the launch discovery sync. It invokes the sync implementation, waits for the exact dispatched deployment to succeed, and only then sends the exact changed URL set to IndexNow.
- `../../scripts/launch-covers.ts` and `../../content/launch-covers.json`
  Generate and validate small original-video-derived stills, served as first-party immutable assets. Normal site builds never fetch media; the list never downloads MP4s.
- `../../scripts/launch-sync-state.ts`
  Compare with the last successful publication/notification checkpoint, recover interrupted no-op runs, and verify the live catalog/cover fingerprint before notification. The six-hour importer uses bounded addition batches so backlog can drain without disabling deletion guards.
- `../../scripts/promotion/indexnow.ts`
  The canonical IndexNow client. It validates VentureDex URL scope, supports bounded launch backfills and file-based incremental URL sets, retries transient responses, and records provider receipts without claiming that a submitted URL is indexed.
- `../../scripts/automation-run-state.py`
  Atomic lease and checkpoint manager for Daily recovery. It stores the rendered checkpoint in `$CODEX_HOME/automations/venturedex-daily-curator/run-state.md`, keeps the corresponding lease in `run-state.lease.json`, and serializes updates through `.run-state.lock`. The authority files contain only a one-way owner fingerprint, epoch/revision counters, routing fields, and blocker summaries; they must never contain credentials, the raw thread identity, or copied source content.
- `../newsletter.md`
  The delivery contract for Daily additions and Weekly research email sends, including delay gates, compliance configuration, module review notes, and test cases.
- `../../content/timestamps.json`
  The repo-managed first-seen and published timestamp sidecar. Prerendered pages and the D1 seed both read it, so new Daily additions must keep it aligned.
- `../../scripts/gsc-codex.py`
  The local transaction and evidence bridge for Search Console URL Inspection in the Codex in-app browser. It plans only canonical VentureDex startup and weekly detail URLs, persists click intent before a CUA browser action, validates the resulting evidence, and writes the authoritative ledger at `$CODEX_HOME/automations/venturedex-daily-curator/gsc_submission_history.tsv`. It does not launch or control a browser. The CUA browser tool owns navigation, inspection, and the single request-indexing click; Google’s general Indexing API is not a substitute. The ignored repo-local ledger is legacy input, never current completion evidence. A missing confirmation leaves a durable blocker rather than authorizing a second click.

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
- Browser-driven product trials, page verification, screenshots, authenticated Search Console work, and browser-side debugging use the Codex in-app browser through the CUA browser tool. Open task-owned Codex tabs and ground every action in a fresh visible page state. Do not attach to Comet/Chrome, require a CDP port or daemon, or fall back to `bb-browser`; an unavailable Codex browser is an explicit blocker. Close only tabs created by this run, and leave user tabs and other browser processes untouched.
- Current code architecture is JSON-first and mostly prerendered on Astro 7 with Cloudflare adapter 14: `content/*.json` is transformed through `src/lib/content-transform.ts` for Astro pages, while `scripts/build-db.sh` emits the D1 seed used by the newsletter/runtime path. `tests/content-parity.test.ts` guards those two transforms from drifting.
- The Daily prompt should read the learning-log template plus the latest 10 entries named by the feedback loop, then search older history only for a concrete error. Replaying the entire append-only log on every run adds context and latency without changing the governing state.
- Local pre-publish validation should use `./scripts/manage.sh validate` plus `git diff --check`. The complete gate includes the high-severity dependency audit, content validation, deterministic D1 seed generation, newsletter/unit tests, Astro sync, TypeScript checking, and Astro build. The individual commands remain useful for isolating failures, but they are not the final gate.
- Screenshot publication additionally requires the exact-hash, six-check review ledger in `content/screenshot-reviews.json`. Follow [the screenshot protocol](screenshot-quality.md): Codex-native capture, aspect-preserving offline import, independent final/card/detail review, then explicit approval. Import success or `--reviewed` alone is not approval; changing the image invalidates its review, and missing/stale review blocks both full validation and the normal build. The ledger is an allowed content asset and must be staged with the screenshot.
- Daily automation must add or confirm `content/timestamps.json` entries for newly accepted slugs before publishing so prerendered sort order, sitemap dates, RSS dates, and the D1 seed agree.
- Daily automation must require structured startup `research` before publishing; weekly automation must consume that `research` when producing source-bound issue evaluations.
- Daily automation must add `links.careers` when the official site, official ATS page, or clearly official company jobs page exposes a Careers/Jobs/Open Roles entry. This is a static company-detail link only; do not scrape dynamic job lists, role counts, or hiring claims into VentureDex records.
- Weekly issue allocation may reserve a week or issue number only from an open, same-repository, non-cross-repository PR whose head owner matches the target repository owner and whose branch starts with `automation/weekly-draft-`; PR titles are descriptive evidence and never authorization by themselves.
- Every production release, including `workflow_dispatch`, must start from a clean checkout at the exact current `origin/main` SHA; only a successful Validate result for that same SHA may skip the repeated full local gate. The release holds a Git-common-directory lock, rechecks source cleanliness after validation/build and immediately before both Worker upload and D1 sync, and allows only the unstaged generated D1 seed plus untracked Weekly OG files whose issue numbers resolve to published Weekly records. Build-time SHA-256 locks cover the generated seed and ignored `dist/` tree; both are checked before Worker upload, and the exact seed hash is checked again immediately before remote D1 execution. Public `manage.sh sync` and `manage.sh deploy` are non-mutating blockers: the unified `manage.sh release` path is the only CLI path allowed to publish the Worker or write D1. Deploys are serialized, the Worker/static bundle is published before D1 content sync, and bounded live-smoke retries absorb short edge propagation windows without blind workflow reruns. D1 sync compares the complete remote and local published/manual startup slug sets plus published Weekly issue-number sets. Any remote-only startup slug or Weekly issue number is blocked unless a human-reviewed release supplies the exact comma-separated removal set through `VENTUREDEX_ALLOW_STARTUP_REMOVALS` or `VENTUREDEX_ALLOW_WEEKLY_ISSUE_REMOVALS`; automation must never set either override.
- Destructive automation-worktree cleanup refreshes `origin` first and removes only registered worktrees whose HEAD is reachable from an explicit `refs/remotes/origin/*` ref. Dirty execution targets return a nonzero blocker, and HEAD is reread immediately before removal so a concurrent clean commit is preserved. An unregistered Git directory is treated as recoverable evidence and is never recursively deleted by the cleanup script.
- A terminal blocked run must not leave an evidence-only dirty worktree indefinitely. After its learning entry, automation memory, inbox closeout, exact process check, and terminal/released authority are durable, use `scripts/archive-automation-worktree-evidence.sh` in dry-run mode, then execute it with the printed exact HEAD and status SHA-256. The helper accepts only the Daily learning log, or for Weekly the learning log plus one numeric issue JSON; it refuses active Daily leases, extra content paths, matching processes, CAS drift, unreachable HEADs, and unregistered worktrees. It writes and verifies an external Git bundle plus JSON manifest before cleaning those paths. Only then run ordinary worktree cleanup without `--force-dirty`. Accepted/rejected startup content, assets, screenshots, or any ambiguous surface remain manual recovery blockers.
- After deploy and live smoke, Daily automation must run `python3 scripts/gsc-codex.py plan --latest-daily`; Weekly uses `plan --latest-weekly`. This is a read-only plan, not a submission. For each allowed URL, inspect the exact URL in a task-owned Codex in-app browser tab, persist `begin --url URL --evidence FILE` before any click, use CUA for at most one request-indexing click, and record the observed result with `finish --attempt ID --evidence FILE`. Follow `content/STANDARD.md` and [the exact browser protocol](gsc-codex-browser.md); only URL-bound success may become `requested`, which is not proof of indexing. Ordinary unclicked backlog may be selected with `plan --retry-pending` in deterministic bounded batches. An unresolved durable click intent or `post_request_confirmation_unknown` blocks another click. For an interrupted receipt-to-ledger append, `recover --attempt ID` validates and replays only the already-existing immutable receipt: no browser action, new evidence, or new click authorization. An older receipt is allowed; ordinary `finish` still requires fresh evidence. Unknown outcomes remain unknown. If the authenticated browser, Search Console UI, or quota blocks submission, preserve the exact blocker and live URL list instead of treating the run as complete.
- If authentication/browser access blocks before `begin`, or a quota result stops a batch, record each remaining never-clicked URL with `python3 scripts/gsc-codex.py defer --url URL --reason "observed blocker; target never clicked"`. This is an authority-locked backlog write with no browser action, live check, or click authorization. Reasons are non-sensitive single-line text up to 500 characters. The next `plan --retry-pending` can discover these targets; `defer` must never reset a clicked quota URL, requested, pending, unknown, orphan-intent, or legacy-reconciliation state.
- Newsletter delivery must lag website publication. Daily sends use a default 6-hour delay and weekly sends use a default 24-hour delay so editors can correct live content before it reaches inboxes.
- Newsletter sends are a production-delivery surface: do not bypass `newsletter_sends`, `newsletter_deliveries`, unsubscribe links, or dry-run checks.
