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
- Do not manually trigger newsletter delivery. Daily newsletter delivery is handled after deploy by the delayed Cloudflare Cron flow in `docs/newsletter.md`.
- After deploy and live smoke, submit the newly published startup detail pages to Google Search Console through `scripts/submit-gsc-direct.sh`. This is a URL Inspection request-indexing step, not a newsletter or content-generation step.

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
- If the official site, official ATS page, or clearly official company jobs page exposes a Careers/Jobs/Open Roles entry, record it as `links.careers`. Do not scrape job lists, role counts, locations, salaries, or hiring claims into startup records.
- Rejected companies stay rejected unless there is a later funding round, new product evidence, or an explicit human-governance change makes the original rejection reason obsolete.
- Accept every startup that clears the bar in this run, up to 5 additions.
- Rejections in a run must be at least 3x accepted additions.
- Treat the 5-addition cap as a ceiling, not a quota.
- A clean no-op run is valid.

### File Scope

Allowed persistent content changes:

- `content/startups/{slug}.json`
- `content/timestamps.json`
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

- `./scripts/check-github-actions.sh`
- `./scripts/manage.sh validate`
- `git diff --check`

`./scripts/manage.sh validate` is the current full local gate. It runs content validation, D1 seed generation, newsletter/unit tests, Astro sync, TypeScript checking, and the Astro build. `d1/generated-seed.sql` is verification output only. If it changes locally, restore it before commit.

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
  - `content/timestamps.json`
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
- After push, record the commit SHA, confirm CI and deploy workflows are still enabled, wait for the observable runs, and require post-deploy live smoke to pass before marking the run as shipped. If CI/deploy cannot be observed, record the blocker explicitly instead of treating the run as successfully deployed. Do not auto-revert `main`.
- Do not treat post-deploy newsletter delivery as immediate success. The Daily newsletter waits for the configured delay window and records send state in D1.

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
12. Write structured `research` for every accepted startup:
    - `sources` must include the official product site and the funding source; add GitHub, docs, LinkedIn, Product Hunt, or other official sources only when they were checked.
    - `product_evidence` must contain at least two concrete, source-backed claims about the product surface, workflow, docs, pricing, customers, integrations, metrics, or other visible evidence.
    - `market_context` must identify the primary user, category, differentiation, and why the current funding/product signal makes the company worth tracking now.
    - `risks` must state at least one falsifiable risk or open question, with a basis tied to the official product evidence and source review.
    - Do not write private revenue, usage, customer, valuation, or hiring claims unless the exact source is cited.
    - If a claim cannot be traced to a listed source or the existing VentureDex editorial assessment, remove it.
    - If a company exposes a high-confidence official Careers/Jobs/Open Roles entry, add it to `links.careers` as a static detail-page link only.
13. Run the taste review.
14. Verify funding facts against the source article, including the exact lead-investor naming used in the article.
15. Cross-validate the lead investor against any existing directory entry and the official investor website; then verify company and investor logos against official sources, add any missing investor directory entry to `content/investors.json`, and update `content/brand-assets.json`.
16. Add or confirm a `content/timestamps.json` entry for every newly accepted slug before validation. Use UTC `YYYY-MM-DD HH:MM:SS` for both `published_at` and `first_seen_at` unless a live D1 export gives a more exact value.
17. Add every startup that clears the bar in this run, up to 5 additions; never force-fill the cap.
18. If any required step fails, enter the Error Investigation Loop before stopping or deferring.
19. Generate screenshot if and only if the environment is ready.
20. Run the GitHub Actions preflight and the full local validation gate.
21. Perform the review passes.
22. Update the learning log.
23. Apply a heuristic update only if the feedback-loop gate permits it.
24. Commit and push only if the final staged files are allowed and local gates pass.
25. Wait for deploy when observable and verify live smoke against the deployed site.
26. Submit the new Daily startup detail pages to Search Console:

   ```bash
   bash scripts/submit-gsc-direct.sh --dry-run --latest-daily
   bash scripts/submit-gsc-direct.sh --latest-daily
   ```

   Then verify `.gsc_submission_history.tsv` contains a latest `requested` row for every new `/startups/{slug}` URL. If the authenticated browser, Search Console UI, or quota blocks submission, record the blocker and the exact target URLs.
27. Open an inbox item summarizing the full run.

## Review Passes

1. Facts: source, amount, stage, date, investor, source URL, lead-investor naming from the article, and any breakout-stage exception
2. Dedup: prior acceptance, prior rejection, later-round exception
3. Brand: company logo, investor logo, investor website, official source trace, local asset presence
4. Research: structured `research.sources`, `product_evidence`, `market_context`, and `risks`; every concrete claim has a listed source or a clear VentureDex editorial basis
5. Links: official `links.careers` is present when discoverable; no dynamic job-list, role-count, location, salary, or hiring-claim data is added
6. Taste: bet, craft, specificity, product-evidence quality, rating, banned-language scan
7. Scope and release: changed files, `content/timestamps.json`, schema, screenshot completeness, GitHub Actions availability, `./scripts/manage.sh validate`, `git diff --check`, commit, push, deploy status, live smoke, Search Console submission rows, final git status

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
- Preflight local build dependencies before deep discovery work; if `./scripts/manage.sh validate` or its `npm run build` substep cannot resolve Astro in this detached automation worktree, restore `node_modules` first and only then continue.
- Check for `CLOUDFLARE_API_TOKEN` or a repo-local `.env` before promoting finalists into brand-asset and screenshot work; if credentials are absent, stop at rejected-only or no-op after documenting any viable survivors.
- When a run fails, prefer root-cause research plus one narrow evidence-backed iteration over broad speculative changes.
- Before browser-based product trials, preflight `bb-browser daemon status`; if it reports no running daemon while `ps` still shows a `bb-browser/dist/daemon.js --cdp-port 19825` process, terminate only that stale daemon process, confirm CDP still responds, and rerun the failed `bb-browser` step once.
- For TechCrunch WordPress API parsing, first extract date, title, excerpt, and link with simple `jq` fields; avoid shell-embedded entity rewrites for apostrophes or smart quotes unless a separate safe normalization step is required.
- For `bb-browser` tab cleanup, list tabs first and close automation-opened tabs by visible short index in descending order; avoid `--tab current` and full CDP tab IDs unless the installed CLI has just accepted that form.
- Retry screenshots only when the product itself is clearly valid and the failure is operational.
- When `scripts/screenshot.sh` fails with `popup_detected`, inspect the overlay candidates before recapturing; if the candidates are decorative `pointer-events-none`/empty fixed layers or consent/chat widgets rather than real modal blockers, dismiss or remove only that non-product layer, capture a clean 1440x900 WebP, and visually review it before continuing.
- Treat screenshot success as provisional until visual review: if the generated image is blank, mostly empty, stuck on an animation/loading surface, or still contains a consent layer over product content, verify the product page with `bb-browser`, then recapture a clean 1440x900 WebP from the nearest product-visible section without removing real product wrappers.
- For official investor brand assets on WordPress-hosted sites, prefer the site's declared favicon/apple-touch icon or another direct static asset from the same official host over a homepage/SVG wordmark when reachability has already failed or looks brittle; keep `source_page` and `source_url` on the official host so validator host matching still holds.
- When a detached automation worktree publishes or repairs Daily content while the main checkout is dirty, ahead, or behind, finish the run with a main-checkout cleanup audit before final closeout: fetch `origin/main`, compare each dirty or untracked Daily file against remote, preserve or port only independently verified improvements, discard stale generated/duplicate drafts from the working tree, and leave the main checkout either clean and aligned to `origin/main` or explicitly reported as blocked.
<!-- END AUTO-EDIT: ADAPTIVE_HEURISTICS -->
