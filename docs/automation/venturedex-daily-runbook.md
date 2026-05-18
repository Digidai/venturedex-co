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

- Search recent funding news broadly and collect 20-40 candidates when evidence exists.
- Respect all F1-F4 filters from `content/CODEX_TASK.md`.
- Respect the taste standard in `content/STANDARD.md`.
- Treat F1 as product evaluability, not mandatory no-login self-serve access; for ToB, API, infrastructure, regulated, medical, or defense products, public docs, SDKs, API references, demos, real UI screenshots, benchmarks, pricing/usage pages, and customer workflows can satisfy product evidence.
- Treat Seed-Series C as the default stage preference, not an absolute ceiling; independent private breakout companies may continue through review at Series D+, >$10B valuation, or unusually large financing when product evidence, taste, and reader relevance are strong.
- Never fabricate amount, stage, date, investor, or source URL.
- `stage`, `date`, and `source_url` must come from the original article or the company is not eligible.
- Lead-investor identity must be cross-validated against the source article, the canonical directory entry in `content/investors.json`, and the official investor website before publish.
- If the source article naming, resolved directory slug, and official website branding do not converge on the same investor, stop the startup addition instead of guessing.
- Company and investor logos must come from official sources only and be recorded in `content/brand-assets.json`.
- Do not use Google favicon, third-party logo APIs, or aggregator assets.
- Rejected companies stay rejected unless there is a later funding round, new product evidence, or an explicit human-governance change makes the original rejection reason obsolete.
- Accept every startup that clears the bar in this run, up to 5 additions.
- Rejections in a run must be at least 3x accepted additions.
- Treat the 5-addition cap as a ceiling, not a quota.
- A clean no-op run is valid.

### File Scope

Allowed persistent content changes:

- `content/startups/{slug}.json`
- `content/investors.json`
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

- `./scripts/check-github-actions.sh .github/workflows/deploy.yml`
- `./scripts/validate.sh`
- `./scripts/build-db.sh`
- `npm run build`

`d1/generated-seed.sql` is verification output only. If it changes locally, restore it before commit.

If screenshot generation fails, do not keep a half-complete startup addition.

### Error Investigation Loop

- If any required step fails, pause forward progress and investigate before deciding to stop, defer, or downgrade the run.
- Capture the exact failing command, file, output, and stage of the run.
- Read the most relevant local script, validator, config, runbook clause, and recent learning-log entries before changing anything.
- If browser interaction is required for product trials, page verification, or failure triage, use the [`bb-browser`](/Users/dai/.codex/skills/bb-browser/SKILL.md) workflow instead of direct Chrome usage.
- Use official or other primary external sources only when the failure depends on current behavior outside the repo.
- State a concrete root cause or blocker class before making the next attempt.
- Make the smallest allowed fix or process adjustment supported by that evidence.
- Rerun the failed step and every downstream gate that depends on it.
- Do not blind-retry; each iteration must add new evidence, a narrower hypothesis, or a concrete fix.
- If the blocker survives evidence-backed iterations, record the root cause, attempts, and deferred next step in the learning log and inbox item.

### Staging and Release Scope

- For a content commit, staged files may only be:
  - `content/startups/{slug}.json`
  - `content/investors.json`
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
- After push, record the commit SHA, confirm the deploy workflow is still enabled, wait for the deploy run when it is observable, and require post-deploy live smoke to pass before marking the run as shipped. If CI/deploy cannot be observed, record the blocker explicitly instead of treating the run as successfully deployed. Do not auto-revert `main`.

## Daily Execution

1. Read `content/STANDARD.md`.
2. Read `content/CODEX_TASK.md`.
3. Read this file.
4. Read `docs/automation/venturedex-feedback-loop.md`.
5. Read `docs/automation/venturedex-learning-log.md`.
6. Sync `main` with `origin/main`.
7. Check for a clean worktree.
8. Discover 20-40 recent funding candidates.
9. Deduplicate against `content/startups/*.json` and `content/rejected.jsonl`.
10. Run F1-F4 screening.
11. Evaluate the product through direct trial when available, or through public product evidence for gated ToB/API/infrastructure products, using [`bb-browser`](/Users/dai/.codex/skills/bb-browser/SKILL.md) when browser interaction is needed.
12. Run the taste review.
13. Verify funding facts against the source article, including the exact lead-investor naming used in the article.
14. Cross-validate the lead investor against any existing directory entry and the official investor website; then verify company and investor logos against official sources, add any missing investor directory entry to `content/investors.json`, and update `content/brand-assets.json`.
15. Add every startup that clears the bar in this run, up to 5 additions; never force-fill the cap.
16. If any required step fails, enter the Error Investigation Loop before stopping or deferring.
17. Generate screenshot if and only if the environment is ready.
18. Run the GitHub Actions preflight and the three local validation steps.
19. Perform the five review passes.
20. Update the learning log.
21. Apply a heuristic update only if the feedback-loop gate permits it.
22. Commit and push only if the final staged files are allowed and local gates pass.
23. Wait for deploy when observable and verify live smoke against the deployed site.
24. Open an inbox item summarizing the full run.

## Five Review Passes

1. Facts: source, amount, stage, date, investor, source URL, lead-investor naming from the article, and any breakout-stage exception
2. Dedup: prior acceptance, prior rejection, later-round exception
3. Brand: company logo, investor logo, investor website, official source trace, local asset presence
4. Taste: bet, craft, specificity, product-evidence quality, rating, banned-language scan
5. Scope and release: changed files, schema, screenshot completeness, GitHub Actions availability, validation, build, commit, push, deploy status, live smoke, final git status

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

If two to five new startups were added:

`content: add curated startups`

Body:

- `Count: {N} startups`
- `Names: {Name A}, {Name B}, {Name C}`
- `Note: every addition passed F1-F4, taste review, screenshot, and local gates`

### Automation-Doc Commits

For automation self-edits, only create a docs commit when the feedback-loop gate approves a high-confidence heuristic change.

Recommended subject:

`docs: tune automation heuristics`

For an explicit human-requested governance change outside auto-edit regions, use:

`docs: update automation policy`

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
- Do not downgrade an otherwise publishable startup just because its lead investor is new; add the canonical investor directory entry and official brand asset in the same content change.
- Reuse an existing investor slug when the source-article name, current directory entry, and official investor website clearly refer to the same firm.
- Mint a new investor slug only after cross-checking the canonical name on the investor's official website; default to a normalized canonical name unless the repo already uses a durable short brand such as `a16z`, `yc`, or `776`.
- If investor naming is materially ambiguous after those checks, defer the startup instead of inventing an alias.
- Deprioritize products whose differentiation depends mainly on sales motion or enterprise access.

### Writing Heuristics

- Start `editor_note` with a judgment, not a recap.
- Use one concrete product detail before any larger market claim.
- Use comparison to sharpen the bet, not to inflate praise.
- Keep risk statements specific and falsifiable.

### Operational Heuristics

- Treat a justified no-op run as better than a weak addition.
- Prefer a precise rejection reason over a vague acceptance.
- When the run's addition cap is above one, widen discovery enough to satisfy the rejection bar without lowering the acceptance threshold.
- Preflight local build dependencies before deep discovery work; if `npm run build` cannot resolve Astro in this detached automation worktree, restore `node_modules` first and only then continue.
- Check for `CLOUDFLARE_API_TOKEN` or a repo-local `.env` before promoting finalists into brand-asset and screenshot work; if credentials are absent, stop at rejected-only or no-op after documenting any viable survivors.
- When a run fails, prefer root-cause research plus one narrow evidence-backed iteration over broad speculative changes.
- Before browser-based product trials, preflight `bb-browser daemon status`; if it reports no running daemon while `ps` still shows a `bb-browser/dist/daemon.js --cdp-port 19825` process, terminate only that stale daemon process, confirm CDP still responds, and rerun the failed `bb-browser` step once.
- For TechCrunch WordPress API parsing, first extract date, title, excerpt, and link with simple `jq` fields; avoid shell-embedded entity rewrites for apostrophes or smart quotes unless a separate safe normalization step is required.
- For `bb-browser` tab cleanup, list tabs first and close automation-opened tabs by visible short index in descending order; avoid `--tab current` and full CDP tab IDs unless the installed CLI has just accepted that form.
- Retry screenshots only when the product itself is clearly valid and the failure is operational.
- When `scripts/screenshot.sh` fails with `popup_detected`, inspect the overlay candidates before recapturing; if the candidates are decorative `pointer-events-none`/empty fixed layers or consent/chat widgets rather than real modal blockers, dismiss or remove only that non-product layer, capture a clean 1440x900 WebP, and visually review it before continuing.
- Treat screenshot success as provisional until visual review: if the generated image is blank, mostly empty, stuck on an animation/loading surface, or still contains a consent layer over product content, verify the product page with `bb-browser`, then recapture a clean 1440x900 WebP from the nearest product-visible section without removing real product wrappers.
<!-- END AUTO-EDIT: ADAPTIVE_HEURISTICS -->
