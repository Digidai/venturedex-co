# VentureDex Daily Runbook

This file is the operational contract for the daily Codex curation run.

## Precedence

Editorial authority comes from:

1. `content/STANDARD.md`
2. `content/CODEX_TASK.md`
3. this file

If this file conflicts with the first two, this file is wrong.

## Immutable Guards

Automation must never rewrite this section.

### Scope

- This is a daily curation run, not a weekly issue run.
- Do not modify `content/weekly/`.
- Do not modify `src/`, `scripts/`, `.github/`, config files, lock files, or deployment files.
- Do not batch-edit old startup entries.

### Git and Execution Safety

- Start from `main`.
- Sync with `origin/main` before doing content work.
- If pull, rebase, or conflict resolution fails, stop.
- If unrelated dirty files exist at run start, stop.
- Never force-push.

### Content Safety

- Search recent funding news and collect 10-20 candidates when evidence exists.
- Respect all F1-F4 filters from `content/CODEX_TASK.md`.
- Respect the taste standard in `content/STANDARD.md`.
- Never fabricate amount, stage, date, investor, or source URL.
- `stage`, `date`, and `source_url` must come from the original article or the company is not eligible.
- Company and investor logos must come from official sources only and be recorded in `content/brand-assets.json`.
- Do not use Google favicon, third-party logo APIs, or aggregator assets.
- Rejected companies stay rejected unless there is a later funding round.
- Max 1 new startup per daily run.
- Rejections in a run must be at least 3x accepted additions.
- A clean no-op run is valid.

### File Scope

Allowed persistent content changes:

- `content/startups/{slug}.json`
- `content/brand-assets.json`
- `content/rejected.jsonl`
- `public/logos/companies/{slug}.*`
- `public/logos/investors/{slug}.*`
- `public/screenshots/{slug}.webp`

Allowed persistent automation-doc changes, but only under feedback-loop gates:

- `docs/automation/venturedex-daily-runbook.md`
- `docs/automation/venturedex-learning-log.md`

### Validation and Publish Gates

Before commit and push, all must pass:

- `./scripts/validate.sh`
- `./scripts/build-db.sh`
- `npm run build`

`d1/generated-seed.sql` is verification output only. If it changes locally, restore it before commit.

If screenshot generation fails, do not keep a half-complete startup addition.

### Staging and Release Scope

- For a content commit, staged files may only be:
  - `content/startups/{slug}.json`
  - `content/brand-assets.json`
  - `content/rejected.jsonl`
  - `public/logos/companies/{slug}.*`
  - `public/logos/investors/{slug}.*`
  - `public/screenshots/{slug}.webp`
- For a docs commit, staged files may only be:
  - `docs/automation/venturedex-daily-runbook.md`
  - `docs/automation/venturedex-learning-log.md`
- Never mix content files and automation-doc files in the same commit.
- Check the staged allowlist with `git diff --cached --name-only` before every commit.
- After push, record the commit SHA. If CI or deploy status can be observed, record it in the inbox item and learning log. Do not auto-revert `main`.

## Daily Execution

1. Read `content/STANDARD.md`.
2. Read `content/CODEX_TASK.md`.
3. Read this file.
4. Read `docs/automation/venturedex-feedback-loop.md`.
5. Read `docs/automation/venturedex-learning-log.md`.
6. Sync `main` with `origin/main`.
7. Check for a clean worktree.
8. Discover 10-20 recent funding candidates.
9. Deduplicate against `content/startups/*.json` and `content/rejected.jsonl`.
10. Run F1-F4 screening.
11. Trial the product.
12. Run the taste review.
13. Verify funding facts against the source article.
14. Verify company and investor logos against official sources and update `content/brand-assets.json`.
15. Add at most one startup, or run as a clean no-op.
16. Generate screenshot if and only if the environment is ready.
17. Run the three local validation steps.
18. Perform the five review passes.
19. Update the learning log.
20. Apply a heuristic update only if the feedback-loop gate permits it.
21. Commit and push only if the final staged files are allowed and local gates pass.
22. Open an inbox item summarizing the full run.

## Five Review Passes

1. Facts: source, amount, stage, date, investor, source URL
2. Dedup: prior acceptance, prior rejection, later-round exception
3. Brand: company logo, investor logo, official source trace, local asset presence
4. Taste: bet, craft, specificity, rating, banned-language scan
5. Scope and release: changed files, schema, screenshot completeness, validation, build, commit, push, final git status

## Commit Rules

### Content Commits

If only `content/rejected.jsonl` changed:

`content: update rejected candidates`

If one new startup was added:

`content: add {Product Name}`

Body:

- `Funding: {amount} {stage} from {lead} ({source_name})`
- `Rating: {N}/5`
- `Bet: {one-sentence bet}`

### Automation-Doc Commits

Only create a docs commit when the feedback-loop gate approves a high-confidence heuristic change.

Recommended subject:

`docs: tune automation heuristics`

<!-- BEGIN AUTO-EDIT: ADAPTIVE_HEURISTICS -->
## Adaptive Heuristics

Automation may revise this section only when `docs/automation/venturedex-feedback-loop.md` permits it.

### Search Source Priority

- Prefer TechCrunch for explicit round and investor details.
- Use Bloomberg when the company page and funding narrative are clearer than the press release trail.
- Use The Information when the product is strong and other reporting is thin.
- Deprioritize news items that only repeat a press release with no product evidence.

### Candidate Ranking

- Prefer companies whose product can be tried in under five minutes.
- Prefer companies where the bet is visible in the first screen or onboarding path.
- Prefer categories where craft and specificity can be judged directly from the product.
- Deprioritize products whose differentiation depends mainly on sales motion or enterprise access.

### Writing Heuristics

- Start `editor_note` with a judgment, not a recap.
- Use one concrete product detail before any larger market claim.
- Use comparison to sharpen the bet, not to inflate praise.
- Keep risk statements specific and falsifiable.

### Operational Heuristics

- Treat a justified no-op run as better than a weak addition.
- Prefer a precise rejection reason over a vague acceptance.
- Preflight local build dependencies before deep discovery work; if `npm run build` cannot resolve Astro in this detached automation worktree, restore `node_modules` first and only then continue.
- Retry screenshots only when the product itself is clearly valid and the failure is operational.
<!-- END AUTO-EDIT: ADAPTIVE_HEURISTICS -->
