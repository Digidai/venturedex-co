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

## File Roles

- `venturedex-daily-runbook.md`
  The operational contract for each daily run. It contains immutable guards and adaptive heuristics.
- `venturedex-weekly-runbook.md`
  The operational contract for each weekly research digest run. It keeps weekly draft generation separate from daily curation.
- `venturedex-feedback-loop.md`
  The reward-guided iteration rules. This is RL-style closed-loop optimization, not a full online RL system.
- `venturedex-learning-log.md`
  Append-only run memory: outcomes, failures, reward, and accepted or rejected heuristic changes.
- `../newsletter.md`
  The delivery contract for Daily additions and Weekly research email sends, including delay gates, compliance configuration, module review notes, and test cases.
- `../../content/timestamps.json`
  The repo-managed first-seen and published timestamp sidecar. Prerendered pages and the D1 seed both read it, so new Daily additions must keep it aligned.

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
- If the prompt tells the automation to investigate and iterate on failures, the runbook and feedback loop must describe the same behavior in auditable terms.
- For browser-driven product trials, page verification, and browser-side debugging, prefer the [`bb-browser`](/Users/dai/.codex/skills/bb-browser/SKILL.md) workflow instead of direct Chrome usage.
- Current code architecture is JSON-first and mostly prerendered: `content/*.json` is transformed through `src/lib/content-transform.ts` for Astro pages, while `scripts/build-db.sh` emits the D1 seed used by the newsletter/runtime path. `tests/content-parity.test.ts` guards those two transforms from drifting.
- Local pre-publish validation should use `./scripts/manage.sh validate` plus `git diff --check`. The individual `./scripts/validate.sh`, `./scripts/build-db.sh`, `npm run typecheck`, `npm test`, and `npm run build` commands are useful for isolating failures, but they are not the full final gate anymore.
- Daily automation must add or confirm `content/timestamps.json` entries for newly accepted slugs before publishing so prerendered sort order, sitemap dates, RSS dates, and the D1 seed agree.
- Daily automation must require structured startup `research` before publishing; weekly automation must consume that `research` when producing source-bound issue evaluations.
- Daily automation must add `links.careers` when the official site, official ATS page, or clearly official company jobs page exposes a Careers/Jobs/Open Roles entry. This is a static company-detail link only; do not scrape dynamic job lists, role counts, or hiring claims into VentureDex records.
- Newsletter delivery must lag website publication. Daily sends use a default 6-hour delay and weekly sends use a default 24-hour delay so editors can correct live content before it reaches inboxes.
- Newsletter sends are a production-delivery surface: do not bypass `newsletter_sends`, `newsletter_deliveries`, unsubscribe links, or dry-run checks.
