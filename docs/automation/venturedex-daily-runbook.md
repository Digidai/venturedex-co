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
- After deploy and live smoke, submit the newly published startup detail pages through Google Search Console URL Inspection in the Codex in-app browser, using `scripts/gsc-codex.py` for the read-only plan and durable intent/result ledger. This is a request-indexing step, not a newsletter or content-generation step.

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

- Run `npm run curation:plan` and select at most three due reviews, then fill one fixed pool of 10-20 unique companies using funding announcements from the last 30 days. Reviews and fresh candidates share this bound. Search at least three complementary non-aggregator source families, recording queries and no-results; avoid language/currency/US-media-only selection. Follow `curation-decisions.md`, save the identity-hashed pool before evaluation, and never expand it to manufacture negative decisions.
- Respect all F1-F4 filters from `content/CODEX_TASK.md`.
- Respect the taste standard in `content/STANDARD.md`.
- Treat F1 as product evaluability, not mandatory no-login self-serve access; for ToB, API, infrastructure, regulated, medical, or defense products, public docs, SDKs, API references, demos, real UI screenshots, benchmarks, pricing/usage pages, and customer workflows can satisfy product evidence.
- Treat Pre-Seed, Seed, Pre-Series A through Series C as the default stage preference, not an absolute ceiling; independent private breakout companies may continue through review at Series D+, >$10B valuation, or unusually large financing when product evidence, taste, and reader relevance are strong.
- A named Series D or later round requires a structured `research.breakout_exception` in the startup JSON: an 80-500 character reason plus at least three unique research source IDs that include official and funding sources and bind at least two product-evidence claims. This records the exception without weakening the independent-private-company or manual taste review.
- A verified financing with no source-stated round name uses canonical `stage: "Unspecified"`, displayed as “Stage undisclosed,” and requires `research.unnamed_round_assessment` with the same 80-500 character, three-source, official-plus-funding and two-product-claim binding. Never add `stage_raw` or infer Seed/Growth; ambiguous named labels such as Growth or Late Stage remain invalid.
- Never fabricate amount, stage, date, investor, or source URL.
- The funding event, date and source must be supported by an original announcement or original reporting. A source-stated named stage is preserved; a verified unnamed financing uses `Unspecified`; an unverified financing stays `evidence_pending`, never a quality rejection. Follow `funding-terms.md`: preserve native currency, explicit extension labels and equity/debt/mixed/grant distinctions; never infer FX, stage, allocation or lead investor.
- Lead-investor identity must be cross-validated against the source article, the canonical directory entry in `content/investors.json`, and the official investor website before publish.
- If the source article naming, resolved directory slug, and official website branding do not converge on the same investor, stop the startup addition instead of guessing.
- Company and investor logos must come from official sources only and be recorded in `content/brand-assets.json`.
- Do not use Google favicon, third-party logo APIs, or aggregator assets.
- If the official site, official ATS page, or clearly official company jobs page exposes a Careers/Jobs/Open Roles entry, record it as `links.careers`. Do not scrape job lists, role counts, locations, salaries, or hiring claims into startup records.
- Consult the validated review overlay before the historical rejection ledger. Revisit only on a documented funding/product/company/governance trigger or a due pending review, within the same fixed pool. Preserve historical rows and hashes; append actual attempts, not inferred research. Access failures, missing evidence, format limitations and publication blocks are separate pending states. Industry-appropriate product evidence, not landing-page polish or self-serve access, determines craft.
- Accept every startup that clears the bar in this run, up to 5 additions.
- No rejection-count, rejection-ratio or acceptance-rate target applies. Keep every qualified overflow as `qualified_pending`; retain publication blockers as `publication_blocked`, never relabel them as low quality.
- Treat the 5-addition cap as a ceiling, not a quota.
- A clean no-op run is valid.

### File Scope

Allowed persistent content changes:

- `content/startups/{slug}.json`
- `content/timestamps.json`
- `content/investors.json`
- `content/investor-profiles.json` (only run-associated firms; follow `investor-research.md`)
- `content/brand-assets.json`
- `content/screenshot-reviews.json`
- `content/rejected.jsonl` (confirmed negative decisions only; preserve existing rows)
- `content/curation-reviews.json` (run-scoped decisions and due reviews)
- `content/curation-runs/{run_id}.json` (the single fixed-pool manifest)
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
- If browser interaction is required for product trials, page verification, screenshots, Search Console, or failure triage, use the Codex in-app browser through the CUA browser tool. Open task-owned Codex tabs and read a fresh visible page state before acting. Do not use `bb-browser`, Comet/Chrome CDP, or daemon lifecycle commands as a fallback; if Codex browser access is unavailable, record that exact blocker. Never manipulate user tabs or other browser processes.
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
  - `content/investor-profiles.json`
  - `content/brand-assets.json`
  - `content/screenshot-reviews.json`
  - `content/rejected.jsonl`
  - `content/curation-reviews.json`
  - `content/curation-runs/{run_id}.json`
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
10. Select at most three due reviews with `curation:plan`, then discover enough recent-funding companies for one pool of 10-20 unique candidates. Record at least three complementary source-family attempts.
11. Deduplicate against startups and `curation:lookup` (validated overlay before legacy/v2 history). Save `content/curation-runs/{run_id}.json` with fixed identities and pool hash before screening. A resumed run uses its existing pool, not a new cycle.
12. Run F1-F4 screening and record explicit outcomes in the manifest and review overlay. Pending evidence/access/schema/qualification/publication is not rejection. Append a v2 historical row only for a confirmed quality or policy negative decision. Preserve any prior row and bind the overlay to its exact hash.
13. Evaluate the product through direct trial when available, or through public product evidence for gated ToB/API/infrastructure products, using task-owned Codex in-app browser tabs through the CUA browser tool when browser interaction is needed.
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
17. Cross-validate the lead investor against any existing directory entry and the official investor website; then verify company and investor logos against official sources, add any missing investor directory entry to `content/investors.json`, and update `content/brand-assets.json`. Follow `docs/automation/investor-research.md` for all named participants and leads: plan the deduplicated associated scope, skip profiles reviewed less than 90 days ago, research missing/stale/materially changed profiles, and record failed attempts without refreshing verified dates. New investors need a sourced profile; do not expand the legacy exemption. No disclosed lead means `undisclosed`, not an invented name or a new F3 failure.
18. Add or confirm a `content/timestamps.json` entry for every newly accepted slug before validation. Use UTC `YYYY-MM-DD HH:MM:SS` for both `published_at` and `first_seen_at` unless a live D1 export gives a more exact value.
19. Add every startup that clears the bar in this run, up to 5 additions; never force-fill the cap. Persist the `content_prepared` checkpoint before the full gate.
20. If any required step fails, enter the Error Investigation Loop before stopping or deferring.
21. Capture a stable desktop product viewport through the run-owned Codex in-app browser tab (at least 1280x720, default zoom; no full-page image). Visually review the source and import with `./scripts/screenshot.sh {slug} {url} --from-codex /absolute/path/capture.png --reviewed`. This creates an UNREVIEWED final WebP without upscaling, crop, or padding. Follow `docs/automation/screenshot-quality.md`: an independent reviewer checks the final asset, card, and detail rendering, then explicitly records all six checks with `screenshot-quality.mjs approve` bound to the inspected SHA-256. Commit `content/screenshot-reviews.json` together with the image. Missing/stale approval blocks both validation and build; `--reviewed` alone is never publication approval. Static asset publication does not use R2 upload.
22. Run the GitHub Actions preflight and the full local validation gate, then persist `local_gates_passed`.
23. Perform the review passes.
24. Apply a heuristic update only if the feedback-loop gate permits it.
25. Commit and push only if the final staged files are allowed and local gates pass; persist the exact pushed SHA.
26. Wait for deploy when observable, verify live smoke against the deployed site, and persist the release evidence.
27. Plan the new Daily startup detail pages for Search Console:

   ```bash
   python3 scripts/gsc-codex.py plan --latest-daily
   ```

   The plan is read-only and never drives a browser. For each allowed URL, use a task-owned Codex in-app browser tab to confirm the authenticated VentureDex property and exact target URL in the visible inspection result. Save minimal observed evidence, then run `python3 scripts/gsc-codex.py begin --url URL --evidence FILE`. Only after that durable intent succeeds may CUA click **Request indexing**, at most once. Read a fresh result and run `python3 scripts/gsc-codex.py finish --attempt ID --evidence FILE` with the same attempt ID. Follow the evidence schema and workflow in `content/STANDARD.md`.

   The pre-click excerpt must visibly establish the exact target URL. Post-click success must bind to that intent through the same observed tab and full inspection route and contain an explicit success marker; a native modal may omit the URL from its AX excerpt. Never add unobserved URL text or splice old AX lines into that excerpt. Any VentureDex detail URL actually present must equal the target; another detail URL is a blocker. An input value or an unbound generic success message alone is not completion evidence. Then verify the authoritative `$CODEX_HOME/automations/venturedex-daily-curator/gsc_submission_history.tsv` contains a latest `requested` row for every new `/startups/{slug}` URL. `requested` means requested, not indexed. The ignored repo-local `.gsc_submission_history.tsv` is a legacy migration source, not completion evidence. GSC evidence and failure diagnostics belong in the durable `$CODEX_HOME/automations/venturedex-daily-curator/gsc-artifacts/` directory so they survive worktree cleanup without dirtying the repository. If the exact inspected URL, authenticated browser, Search Console UI, or quota blocks submission, preserve the exact blocker and target URLs. Ordinary unclicked backlog may be selected in bounded batches with:

   ```bash
   python3 scripts/gsc-codex.py plan --retry-pending
   ```

   If authentication/browser access blocks before `begin`, or quota stops the batch, preserve each remaining never-clicked exact URL with `python3 scripts/gsc-codex.py defer --url URL --reason "observed blocker; target never clicked"`. This writes only a guarded `retry_pending` row, without browser actions, live checks, or click authorization. Use a non-sensitive single-line reason of at most 500 characters. Property-wide quota cooldown permits deferring the remaining unclicked targets, but never use `defer` on the clicked quota target or to reset requested, pending, unknown, orphan-intent, or legacy-reconciliation states.

   An unresolved durable click intent or `post_request_confirmation_unknown` is not retryable through that backlog, even if the CUA handle or response stream disappears. If an immutable receipt exists but its ledger append was interrupted, `python3 scripts/gsc-codex.py recover --attempt ID` validates and replays only that original receipt without browser actions or new evidence; its observation may be older than five minutes. The same attempt must still own `request_click_pending`, or already have the matching terminal row for a no-op recovery. Unknown receipts remain unknown and never authorize another click. An original pending attempt without a receipt may finish from a valid fresh same-tab/same-route result; terminal unknowns cannot be upgraded from a new observation. See [Codex GSC browser protocol](gsc-codex-browser.md). Never invoke the old browser submitter as a recovery fallback.
28. Append the learning-log entry and update automation memory from the final evidence. Keep content and docs commits separate and persist the resulting docs SHA when one is pushed.
29. Open an inbox item summarizing the full run, including any transport interruption and the exact recovery phase.
30. Close only the Codex in-app browser tabs created by this run; leave user tabs and all other browser processes untouched. After commit/push, deploy/GSC evidence, learning log, automation memory, and inbox evidence are durable, persist an `active` `closeout` checkpoint, switch back to the main checkout, and run guarded cleanup for exact `RUN_WORKTREE`. Only after the path is absent and unregistered may the same owner atomically checkpoint `complete` and release the lease with the exact epoch/revision. Because the run worktree is then gone, load the helper from the exact pushed Git SHA rather than from the stale main checkout; first verify that blob exists and fail closed if it cannot be executed. Never mark complete before cleanup or leave an authority-file mismatch unreported.

   A failed run whose only remaining repository change is `docs/automation/venturedex-learning-log.md` uses a separate terminal-evidence closeout. First checkpoint `blocked/closeout` and release the exact lease; persist automation memory and inbox evidence; then prove no exact matching process remains. From the main checkout, dry-run `bash scripts/archive-automation-worktree-evidence.sh --path "$RUN_WORKTREE"`, retain its printed HEAD/status digest, and execute with both exact CAS values. Verify the resulting external bundle and manifest before invoking `cleanup-automation-worktrees.sh` without `--force-dirty`. Keep the historical checkpoint terminal `blocked`; do not reacquire merely to relabel an unsuccessful run complete. If any other path is dirty, the lease is active, authority does not own the exact path, or the archive/helper CAS changes, preserve the worktree and report the exact blocker.

## Review Passes

1. Facts: source, amount, stage, date, investor, source URL, lead-investor naming from the article, and any breakout-stage exception
2. Dedup and correction: prior acceptance, frozen legacy digests, exact original-row hash, effective overlay state, documented revisit trigger, one review per slug, validated startup and qualification evidence for an accepted resolution
3. Brand: company logo, investor logo, investor website, official source trace, local asset presence
4. Research: structured `research.sources`, `product_evidence`, `market_context`, and `risks`; every concrete claim has a listed source or a clear VentureDex editorial basis
5. Links: official `links.careers` is present when discoverable; no dynamic job-list, role-count, location, salary, or hiring-claim data is added
6. Taste: bet, craft, specificity, product-evidence quality, rating, banned-language scan
7. Scope and release: changed files, `content/timestamps.json`, schema, screenshot completeness, GitHub Actions availability, `./scripts/manage.sh validate`, `git diff --check`, commit, push, deploy status, live smoke, Search Console submission rows, final git status

## Commit Rules

### Content Commits

If only decision/review/manifest content changed and no company was published:

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

- Use company and investor announcements for original terms and identity; distinguish their product claims from independent verification.
- Add original reporting, regional and sector-specific media, and research sources to reduce geography and industry blind spots. Log no-results without forcing representation.
- Use aggregators only as discovery pointers and inspect the original source before writing facts. Do not count syndicated copies as independent corroboration.
- Judge source usefulness by traceable details, not by a fixed publisher whitelist or USD/English query.

### Candidate Ranking

- Rank by concrete product evidence, distinct bet, reader relevance and evidence freshness. Use industry-appropriate materials, including enterprise integrations, hardware tests and disclosed medical validation.
- A quick trial is useful evidence, not a ranking requirement. Sales-led access and a plain website are not negative product judgments.
- Include due high-priority correction cases within the same pool, but do not automatically accept them.
- Do not downgrade an otherwise publishable startup just because its lead investor is new; add the canonical investor directory entry and official brand asset in the same content change.
- Reuse an existing investor slug when the source-article name, current directory entry, and official investor website clearly refer to the same firm.
- Mint a new investor slug only after cross-checking the canonical name on the investor's official website; default to a normalized canonical name unless the repo already uses a durable short brand such as `a16z`, `yc`, or `776`.
- If investor naming is materially ambiguous after those checks, defer the startup instead of inventing an alias.
- Separate insufficient public differentiation evidence from access friction; use a bounded evidence follow-up rather than a permanent negative based on enterprise access.

### Writing Heuristics

- Start `editor_note` with a judgment, not a recap.
- Use one concrete product detail before any larger market claim.
- Use comparison to sharpen the bet, not to inflate praise.
- Keep risk statements specific and falsifiable.

### Operational Heuristics

- Treat a justified no-op run as better than a weak addition.
- Prefer an evidence-specific decision over any unsupported positive or negative conclusion.
- Keep the locked 10-20-company pool and five-addition ceiling regardless of the observed acceptance rate; qualified overflow stays pending.
- Preflight local build dependencies before deep discovery work; if `./scripts/manage.sh validate` or its `npm run build` substep cannot resolve Astro in this detached automation worktree, restore `node_modules` first and only then continue.
- Treat the mandatory bootstrap as the only pre-discovery environment gate. If credentials, GitHub Actions, dependencies, or another bootstrap check fail, stop immediately and persist the blocker; do not continue into discovery, rejected-only, or no-op work.
- When a run fails, prefer root-cause research plus one narrow evidence-backed iteration over broad speculative changes.
- Before browser-based product trials, create a task-owned Codex in-app browser tab through the CUA browser tool and verify that the target page is readable. No daemon or CDP preflight is required. A browser-tool or page-access failure is a blocker to record, not permission to attach to a separate browser or mutate its lifecycle.
- For TechCrunch WordPress API parsing, first extract date, title, excerpt, and link with simple `jq` fields; avoid shell-embedded entity rewrites for apostrophes or smart quotes unless a separate safe normalization step is required.
- Keep the handles of Codex tabs created by this run and close only those tabs. After an interruption, verify ownership from current tool state before closing anything; do not reuse stale handles, infer ownership from a matching title, or close user tabs.
- Retry screenshots only when the product itself is clearly valid and the failure is operational.
- The screenshot importer never opens a browser. Capture through the Codex in-app browser, dismiss visible consent/chat overlays with normal UI actions, and visually review the source before passing `--from-codex /absolute/path/capture.png --reviewed`. Do not delete DOM layers or hide real product UI. The importer preserves ratio with no enlargement/padding; an independent final review must be recorded against the exact hash.
- Treat screenshot success as provisional until all six visual checks pass: if blank, mostly empty, stuck on animation/loading, illegible, or obscured by consent, recapture the nearest meaningful product section. A clear product section is allowed without the homepage hero. Do not confuse actual product UI with popups, and do not set unchecked approval flags to unblock publication.
- For official investor brand assets on WordPress-hosted sites, prefer the site's declared favicon/apple-touch icon or another direct static asset from the same official host over a homepage/SVG wordmark when reachability has already failed or looks brittle; keep `source_page` and `source_url` on the official host so validator host matching still holds.
- When immediate post-deploy smoke sees remote D1 or collection-index counts from the new release but stale root, news, or collection-detail counts, classify it as a propagation hypothesis rather than a deploy failure: first rerun independent smoke on both `workers.dev` and the custom domain, and only after both pass rerun the failed Deploy job at most once to restore green observable release evidence.
- Before a formal GSC submit, open the Search Console inspection route in a task-owned Codex in-app browser tab and confirm it stays on an authenticated `search.google.com` URL Inspection surface instead of redirecting to `accounts.google.com`; if authentication is missing, close the automation tab, record `gsc_auth_session_blocker` plus every exact target URL, and do not substitute longer wait retries or another browser's session for the missing login state.
- When a detached automation worktree publishes or repairs Daily content while the main checkout is dirty, ahead, or behind, finish with a read-only main-checkout audit: fetch refs, report divergence and exact dirty paths, and preserve every pre-existing tracked or untracked file. The automation must not port, restore, delete, or rewrite main-checkout drafts during closeout.
- When a main-checkout cleanup audit finds stale detached VentureDex automation worktrees, start with `bash scripts/cleanup-automation-worktrees.sh --all` as a dry run. Use `--execute --path <worktree>` only after required commits, GSC evidence, learning-log entries, and automation-memory updates are preserved. Execution refreshes `origin`, requires the worktree HEAD to be reachable from an explicit `refs/remotes/origin/*` ref, and rereads the exact reachable HEAD immediately before removal. Dirty, concurrently changed, unreachable, and unregistered targets return a nonzero blocker; unregistered Git directories are never recursively deleted because they may contain recoverable commits.
- When that audit finds a historical terminal/released Daily worktree dirty only at the append-only learning log, do not let it accumulate as a permanent preflight blocker and do not use `--force-dirty`. After verifying exact ownership, zero matching processes, memory/inbox durability, and reachable HEAD, use `archive-automation-worktree-evidence.sh` with its dry-run HEAD/status CAS. Only a verified bundle/manifest permits the now-clean worktree to enter ordinary guarded cleanup. Any startup, rejection, asset, screenshot, additional file, active lease, or ownership mismatch still fails closed.
<!-- END AUTO-EDIT: ADAPTIVE_HEURISTICS -->
