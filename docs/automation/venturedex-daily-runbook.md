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
- Before creating a new worktree or starting discovery, inspect the durable run-state file at `$CODEX_HOME/automations/venturedex-daily-curator/run-state.md`, registered VentureDex Daily worktrees, active processes, and recent `origin/main` commits. If exactly one interrupted run is recoverable, resume that run at its last evidenced phase and do not start a second curation cycle. If ownership is ambiguous, stop and report every exact path instead of guessing.
- Create or enter a detached Daily worktree at the exact current `origin/main` SHA, record it as `RUN_WORKTREE`, and keep the main checkout read-only even when it is dirty, ahead, or behind.
- Before bootstrap or discovery, run `python3 scripts/automation-run-state.py acquire --run-id "$RUN_ID"` in the selected worktree and retain the returned lease epoch and checkpoint revision. `CODEX_THREAD_ID` is the normal owner identity and only its one-way fingerprint is persisted. Do not use a run id, PID, or invented shared value as an owner fallback. An active different-owner lease is a hard blocker. A stale lease may be taken over only for the same run id, with its exact expected epoch, after the six-hour stale threshold and read-only evidence show that no matching actor is still mutating the recorded worktree.
- Run `./scripts/bootstrap-automation.sh venturedex-daily-curator` inside that detached worktree before discovery. Bootstrap failure is a hard stop; do not continue with a rejected-only or no-op fallback.
- If fetch, worktree creation, pull, rebase, or conflict resolution fails, stop.
- If unrelated dirty files exist in the selected Daily worktree at run start, stop. Unrelated dirtiness in the main checkout must be preserved and reported, not cleaned or ported automatically.
- Never force-push.

### Content Safety

- Search recent funding news broadly and collect 10-20 fresh candidates after accepted/rejected deduplication, matching the higher-priority content contract. Duplicate source hits do not count toward this bound. Twenty recorded decisions are sufficient for the maximum five additions while preserving the 3:1 rejection bar.
- Respect all F1-F4 filters from `content/CODEX_TASK.md`.
- Respect the taste standard in `content/STANDARD.md`.
- Treat F1 as product evaluability, not mandatory no-login self-serve access; for ToB, API, infrastructure, regulated, medical, or defense products, public docs, SDKs, API references, demos, real UI screenshots, benchmarks, pricing/usage pages, and customer workflows can satisfy product evidence.
- Treat Seed-Series C as the default stage preference, not an absolute ceiling; independent private breakout companies may continue through review at Series D+, >$10B valuation, or unusually large financing when product evidence, taste, and reader relevance are strong.
- A named Series D or later round requires a structured `research.breakout_exception` in the startup JSON: an 80-500 character reason plus at least three unique research source IDs that include official and funding sources and bind at least two product-evidence claims. This records the exception without weakening the independent-private-company or manual taste review.
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

`./scripts/manage.sh validate` is the current full local gate. It runs the high-severity dependency audit, content validation, deterministic D1 seed generation, newsletter/unit tests, Astro sync, TypeScript checking, and the Astro build. Ordinary validation writes its seed to a run-owned temporary directory so interruption cannot dirty or overwrite tracked `d1/generated-seed.sql`; the release path explicitly regenerates and locks the tracked seed. A normal validation run that changes the tracked seed is therefore a blocker to investigate, not expected cleanup work.

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
- Do not treat an exec cell id, tool-call id, PID, or buffered command handle as a durable checkpoint. After bootstrap, discovery, content preparation, local gates, push, deploy, GSC, and closeout, call `scripts/automation-run-state.py checkpoint` with the retained lease epoch and exact expected revision. Carry the returned revision forward; an owner, epoch, or revision mismatch is a concurrent-writer blocker, not permission to overwrite the authority files. Never edit `run-state.md` or `run-state.lease.json` by hand during a managed run, and never store credentials or source-page contents there.
- If a turn or transport stream is interrupted, resume from filesystem, Git, CI, ledger, and run-state evidence. Re-run only the incomplete phase and its downstream gates; do not repeat discovery or browser clicks merely because an in-memory handle disappeared.

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
- After push, record the commit SHA, confirm CI and deploy workflows are still enabled, and wait for the observable runs. Validate must pass for a clean checkout at the exact current `origin/main` SHA before serialized Deploy can run; a manual dispatch is also restricted to that exact main SHA and reruns the full gate. Release holds a Git-common-directory lock and checks the worktree after validation/build directly before Worker upload and again before D1 sync; the only permitted dirtiness is the unstaged generated D1 seed plus untracked Weekly OG files tied to published issue numbers. The build-time generated-seed and ignored-`dist/` SHA-256 values are locked before preflight, both are rechecked before Worker upload, and the exact seed is rechecked immediately before D1 execution. Direct `manage.sh sync` and `manage.sh deploy` commands are intentionally non-mutating; only `manage.sh release` may publish the Worker or write D1. Deploy publishes the Worker/static bundle before applying the D1 seed, compares complete remote/local published-manual startup slug sets and published Weekly issue-number sets, and performs bounded smoke retries on both public hosts. An intentional removal needs separate human review plus the exact comma-separated remote-only set in `VENTUREDEX_ALLOW_STARTUP_REMOVALS` or `VENTUREDEX_ALLOW_WEEKLY_ISSUE_REMOVALS`; Daily automation must never set either override. If CI/deploy cannot be observed, record the blocker explicitly instead of treating the run as successfully deployed. Do not auto-revert `main`.
- Do not treat post-deploy newsletter delivery as immediate success. The Daily newsletter waits for the configured delay window and records send state in D1.

## Daily Execution

1. Read `content/STANDARD.md`.
2. Read `content/CODEX_TASK.md`.
3. Read this file.
4. Read `docs/automation/venturedex-feedback-loop.md`.
5. Read the template/header and last 10 entries in `docs/automation/venturedex-learning-log.md`; search older entries only for a specific repeated error. Do not load the entire append-only history into each run's context.
6. Inspect `$CODEX_HOME/automations/venturedex-daily-curator/run-state.md`, registered Daily worktrees, active processes, recent commits, and the central GSC ledger. Resume one recoverable interrupted run before considering a new cycle; stop on ambiguous ownership.
7. Sync the Git refs with `origin/main` without modifying the main checkout.
8. Create or enter a detached worktree at exact `origin/main`, record `RUN_WORKTREE`, and verify that selected worktree is clean. Acquire or renew the run lease for the exact `RUN_ID`, then atomically write the `preflight` checkpoint with the returned epoch/revision. Stop on an active-owner conflict; stale takeover must preserve the run id and pass the evidence rules above.
9. Run `./scripts/bootstrap-automation.sh venturedex-daily-curator` in `RUN_WORKTREE`. Stop immediately on failure and persist the exact blocker; discovery must not begin.
10. Discover and deduplicate until 10-20 fresh recent-funding candidates remain; duplicate source hits do not count toward the bound.
11. Deduplicate against `content/startups/*.json` and `content/rejected.jsonl`; schema-less legacy rows and v2 `active` rows suppress repeat review unless an allowed trigger is present.
12. Run F1-F4 screening and write every new rejection as a complete v2 row.
13. Evaluate the product through direct trial when available, or through public product evidence for gated ToB/API/infrastructure products, using [`bb-browser`](/Users/dai/.codex/skills/bb-browser/SKILL.md) when browser interaction is needed.
14. Write structured `research` for every accepted startup:
    - `sources` must include the official product site and the funding source; add GitHub, docs, LinkedIn, Product Hunt, or other official sources only when they were checked.
    - `product_evidence` must contain at least two concrete, source-backed claims about the product surface, workflow, docs, pricing, customers, integrations, metrics, or other visible evidence.
    - `market_context` must identify the primary user, category, differentiation, and why the current funding/product signal makes the company worth tracking now.
    - `risks` must state at least one falsifiable risk or open question, with a basis tied to the official product evidence and source review.
    - Do not write private revenue, usage, customer, valuation, or hiring claims unless the exact source is cited.
    - If a claim cannot be traced to a listed source or the existing VentureDex editorial assessment, remove it.
    - If a company exposes a high-confidence official Careers/Jobs/Open Roles entry, add it to `links.careers` as a static detail-page link only.
15. Run the taste review.
16. Verify funding facts against the source article, including the exact lead-investor naming used in the article.
17. Cross-validate the lead investor against any existing directory entry and the official investor website; then verify company and investor logos against official sources, add any missing investor directory entry to `content/investors.json`, and update `content/brand-assets.json`.
18. Add or confirm a `content/timestamps.json` entry for every newly accepted slug before validation. Use UTC `YYYY-MM-DD HH:MM:SS` for both `published_at` and `first_seen_at` unless a live D1 export gives a more exact value.
19. Add every startup that clears the bar in this run, up to 5 additions; never force-fill the cap. Persist the `content_prepared` checkpoint before the full gate.
20. If any required step fails, enter the Error Investigation Loop before stopping or deferring.
21. Generate screenshot if and only if the environment is ready.
22. Run the GitHub Actions preflight and the full local validation gate, then persist `local_gates_passed`.
23. Perform the review passes.
24. Apply a heuristic update only if the feedback-loop gate permits it.
25. Commit and push only if the final staged files are allowed and local gates pass; persist the exact pushed SHA.
26. Wait for deploy when observable, verify live smoke against the deployed site, and persist the release evidence.
27. Submit the new Daily startup detail pages to Search Console:

   ```bash
   bash scripts/submit-gsc-direct.sh --dry-run --latest-daily
   bash scripts/submit-gsc-direct.sh --latest-daily
   ```

   The submitter must see the exact target URL in Search Console's visible inspection result both before clicking **Request indexing** and after the success state appears; an input value or a generic success message alone is not completion evidence. Then verify the authoritative `$CODEX_HOME/automations/venturedex-daily-curator/gsc_submission_history.tsv` contains a latest `requested` row for every new `/startups/{slug}` URL. The ignored repo-local `.gsc_submission_history.tsv` is a legacy migration source, not completion evidence. GSC failure diagnostics default to the durable `$CODEX_HOME/automations/venturedex-daily-curator/gsc-artifacts/` directory so they survive worktree cleanup without dirtying the repository. If the exact inspected URL, authenticated browser, Search Console UI, or quota blocks submission, record `retry_pending`, the blocker, and the exact target URLs. Later runs may process unresolved canonical detail URLs in bounded batches with:

   ```bash
   bash scripts/submit-gsc-direct.sh --dry-run --retry-pending
   bash scripts/submit-gsc-direct.sh --retry-pending
   ```

   `post_request_confirmation_unknown` is not retryable through that backlog. After a human reviews the exact durable artifact, use the dedicated read-only reconciliation path:

   ```bash
   bash scripts/submit-gsc-direct.sh --reconcile-post-click-requested /absolute/path/to/post_request_confirmation_unknown-artifact.txt
   ```

   It may append `requested` only after the exact artifact URL is re-inspected and a route-bound `success_static` state is observed. The reconciliation path must never call the request-indexing click action; if success is not proven, the blocker and artifact remain active.
28. Append the learning-log entry and update automation memory from the final evidence. Keep content and docs commits separate and persist the resulting docs SHA when one is pushed.
29. Open an inbox item summarizing the full run, including any transport interruption and the exact recovery phase.
30. Close run-owned browser tabs. After commit/push, deploy/GSC evidence, learning log, automation memory, and inbox evidence are durable, persist an `active` `closeout` checkpoint, switch back to the main checkout, and run guarded cleanup for exact `RUN_WORKTREE`. Only after the path is absent and unregistered may the same owner atomically checkpoint `complete` and release the lease with the exact epoch/revision. Because the run worktree is then gone, load the helper from the exact pushed Git SHA rather than from the stale main checkout; first verify that blob exists and fail closed if it cannot be executed. If cleanup fails, the worktree still exists: checkpoint `blocked` there with the exact dirty files or ownership conflict, then release only that terminal blocked lease. Never mark complete before cleanup or leave an authority-file mismatch unreported.

## Review Passes

1. Facts: source, amount, stage, date, investor, source URL, lead-investor naming from the article, and any breakout-stage exception
2. Dedup: prior acceptance, frozen legacy block digests, v2-active rejection, allowed revisit trigger, one row per slug, and complete v2 superseded resolution when a revisit becomes accepted
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
- Treat the mandatory bootstrap as the only pre-discovery environment gate. If credentials, GitHub Actions, dependencies, or another bootstrap check fail, stop immediately and persist the blocker; do not continue into discovery, rejected-only, or no-op work.
- When a run fails, prefer root-cause research plus one narrow evidence-backed iteration over broad speculative changes.
- Before browser-based product trials, preflight `bb-browser daemon status`. Reuse an existing healthy connection, but do not start, stop, restart, or `pkill` a daemon from a scheduled run: the browser runtime may be shared, and ambiguous ownership is a fail-closed blocker rather than permission to mutate its lifecycle.
- For TechCrunch WordPress API parsing, first extract date, title, excerpt, and link with simple `jq` fields; avoid shell-embedded entity rewrites for apostrophes or smart quotes unless a separate safe normalization step is required.
- For `bb-browser` tab cleanup, list tabs first and close automation-opened tabs by visible short index in descending order; avoid `--tab current` and full CDP tab IDs unless the installed CLI has just accepted that form.
- Retry screenshots only when the product itself is clearly valid and the failure is operational.
- When `scripts/screenshot.sh` fails with `popup_detected`, inspect the overlay candidates before recapturing; if the candidates are decorative `pointer-events-none`/empty fixed layers or consent/chat widgets rather than real modal blockers, dismiss or remove only that non-product layer, capture a clean 1440x900 WebP, and visually review it before continuing.
- Treat screenshot success as provisional until visual review: if the generated image is blank, mostly empty, stuck on an animation/loading surface, or still contains a consent layer over product content, verify the product page with `bb-browser`, then recapture a clean 1440x900 WebP from the nearest product-visible section without removing real product wrappers.
- For official investor brand assets on WordPress-hosted sites, prefer the site's declared favicon/apple-touch icon or another direct static asset from the same official host over a homepage/SVG wordmark when reachability has already failed or looks brittle; keep `source_page` and `source_url` on the official host so validator host matching still holds.
- When immediate post-deploy smoke sees remote D1 or collection-index counts from the new release but stale root, news, or collection-detail counts, classify it as a propagation hypothesis rather than a deploy failure: first rerun independent smoke on both `workers.dev` and the custom domain, and only after both pass rerun the failed Deploy job at most once to restore green observable release evidence.
- Before a formal GSC submit, open the Search Console inspection route through `bb-browser` and confirm it stays on an authenticated `search.google.com` URL Inspection surface instead of redirecting to `accounts.google.com`; if authentication is missing, close the automation tab, record `gsc_auth_session_blocker` plus every exact target URL, and do not substitute longer wait retries for the missing login state.
- When a detached automation worktree publishes or repairs Daily content while the main checkout is dirty, ahead, or behind, finish with a read-only main-checkout audit: fetch refs, report divergence and exact dirty paths, and preserve every pre-existing tracked or untracked file. The automation must not port, restore, delete, or rewrite main-checkout drafts during closeout.
- When a main-checkout cleanup audit finds stale detached VentureDex automation worktrees, start with `bash scripts/cleanup-automation-worktrees.sh --all` as a dry run. Use `--execute --path <worktree>` only after required commits, GSC evidence, learning-log entries, and automation-memory updates are preserved. Execution refreshes `origin`, requires the worktree HEAD to be reachable from an explicit `refs/remotes/origin/*` ref, and rereads the exact reachable HEAD immediately before removal. Dirty, concurrently changed, unreachable, and unregistered targets return a nonzero blocker; unregistered Git directories are never recursively deleted because they may contain recoverable commits.
<!-- END AUTO-EDIT: ADAPTIVE_HEURISTICS -->
