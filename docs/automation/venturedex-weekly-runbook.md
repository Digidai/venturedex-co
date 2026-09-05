# VentureDex Weekly Runbook

This file defines the weekly research digest workflow. It is separate from the daily curation run.

## Precedence

Editorial authority comes from:

1. `content/STANDARD.md`
2. `content/CODEX_TASK.md`
3. this file

If this file conflicts with the first two, this file is wrong.

## Immutable Guards

Automation must never rewrite this section.

- Weekly issues use already published `content/startups/*.json` records.
- The weekly workflow may create or update `content/weekly/*.json`; it must not add new startups.
- Published weekly issues must not contain TODO text.
- Published weekly issues should use the startup record's structured `research` block when available, especially `product_evidence`, `market_context`, `risks`, and `sources`.
- The Weekly draft scaffold should carry structured startup research sources and product evidence forward, but draft TODO fields are not publication-ready copy.
- Published weekly evaluations must be source-bound. Do not infer users, revenue, retention, market share, customer migrations, reliability, or benchmark claims unless a cited source states them.
- If evidence is insufficient, keep the issue as `status: draft` or defer the claim.
- Browser-driven source checks, screenshots, and authenticated Search Console work must use the Codex in-app browser through the CUA browser tool. Open task-owned tabs and read a fresh visible page state before acting. Do not attach to Comet/Chrome, require a CDP port or daemon, or fall back to `bb-browser`; unavailable Codex browser access is a blocker. Close only tabs created by this run and leave user tabs and other browser processes untouched.
- Do not manually trigger Weekly newsletter delivery during the publishing run. The email send is intentionally delayed by the newsletter system so the live issue can be corrected first.
- After deploy and live smoke, submit the published weekly issue detail page through Google Search Console URL Inspection in the Codex in-app browser, using `scripts/gsc-codex.py` for the read-only plan and durable intent/result ledger. This is a request-indexing step, not a newsletter send.

## Cadence

- Create a draft every Monday for the previous Monday-Sunday window.
- A GitHub Actions workflow runs `scripts/weekly.py draft --check-open-prs` and opens a draft PR only when neither main nor a trusted open automation PR already owns that week. A PR is trusted for week ownership or issue-number reservation only when it is non-cross-repository, its head repository owner matches the target repository owner, and its head branch starts with `automation/weekly-draft-`; a matching title alone is never authority. Trusted automation PR issue numbers are reserved before allocating the next number, and the workflow is serialized so overlapping schedules cannot create competing drafts.
- Publishing is a review step: replace TODO fields with source-bound research, set `status` to `published`, set `published_at`, and merge only after local gates pass.
- Newsletter delivery is a separate post-publish step governed by `docs/newsletter.md`. The default Weekly email delay is 24 hours after the issue is published.

## Weekly Execution

1. Compute the previous full week.
2. Run:

   ```bash
   python3 scripts/weekly.py draft --week-start YYYY-MM-DD --week-end YYYY-MM-DD --write
   ```

3. Review candidate picks. Prioritize startups newly added or updated in the week; if fewer than 5 qualify, add related high-rating published startups and explain the theme link.
4. For every pick, review the VentureDex startup file, its `research` block, official product surface, and linked source URLs.
5. Write `why_this_week`, `product_evaluation`, `evidence`, `risks`, and `verdict`.
6. Remove every TODO and set:

   ```json
   {
     "status": "published",
     "published_at": "YYYY-MM-DD"
   }
   ```

7. Run local gates:

   ```bash
   python3 scripts/weekly.py validate
   ./scripts/manage.sh validate
   git diff --check
   ```

8. Restore `d1/generated-seed.sql` and generated cache artifacts if validation changed them locally.
9. Verify `/weekly` and `/weekly/{N}` in task-owned Codex in-app browser tabs before publish.
10. Commit with:

   ```bash
   git commit -m "content: weekly #N - {title}"
   ```

11. Push only after the worktree contains no unrelated changes and all gates pass.
12. After deployment and live smoke, plan the new Weekly detail page for Search Console:

   ```bash
   python3 scripts/gsc-codex.py plan --latest-weekly
   ```

   This plan is read-only. In a task-owned Codex in-app browser tab, inspect each allowed exact URL under the authenticated VentureDex property. Save minimal visible evidence and run `python3 scripts/gsc-codex.py begin --url URL --evidence FILE` before any click. Only after durable intent succeeds may CUA click **Request indexing**, at most once. Read a fresh result and run `python3 scripts/gsc-codex.py finish --attempt ID --evidence FILE` using that attempt ID. Follow `content/STANDARD.md`: pre-click evidence must visibly show the exact URL; post-click evidence must bind to that intent through the same observed tab and full inspection route and show the explicit result marker. A native modal may omit the URL from its AX excerpt; never add unobserved URL text or splice old AX lines into it. Any VentureDex detail URL actually present must equal the target. An input value or an unbound generic success message is insufficient.

   Verify the authoritative `$CODEX_HOME/automations/venturedex-daily-curator/gsc_submission_history.tsv` contains a latest `requested` row for `/weekly/{N}`; a request is not proof of indexing. The ignored repo-local ledger is a legacy migration source only. Keep evidence and blockers in the durable automation artifacts directory. If the authenticated browser, Search Console UI, or quota blocks submission, preserve the exact blocker and target URL. Later select ordinary unclicked backlog with bounded `plan --retry-pending`, then repeat the same guarded workflow. An unresolved durable click intent or `post_request_confirmation_unknown` must never cause a second click. For an interrupted receipt-to-ledger append, use `python3 scripts/gsc-codex.py recover --attempt ID`: it performs no browser action, accepts no new evidence, and only replays the existing validated immutable receipt to the same still-pending attempt (or returns a no-op for an already matching terminal row). Receipt age may exceed five minutes; ordinary `finish` still requires fresh same-tab/same-route evidence. Unknown receipts stay unknown and cannot be upgraded from new observations. See [the exact browser protocol](gsc-codex-browser.md).
   If authentication/browser access blocks before `begin`, or quota stops the batch, preserve each remaining never-clicked exact URL with `python3 scripts/gsc-codex.py defer --url URL --reason "observed blocker; target never clicked"`. The authority-locked command may append `retry_pending` during property-wide quota cooldown but performs no browser action or live check and grants no click authorization. Reasons must be non-sensitive, single-line, and at most 500 characters. Never reset a clicked quota URL, requested, pending, unknown, orphan intent, or legacy-reconciliation target with `defer`.
13. A blocked Weekly draft must not remain indefinitely as an uncommitted worktree. After its learning entry, Weekly automation memory, and inbox closeout are durable, prove no exact matching process owns the path. Dry-run `scripts/archive-automation-worktree-evidence.sh` for the exact worktree, then execute with its printed HEAD and status SHA-256. This route accepts only the learning log plus at most one numeric `content/weekly/N.json`, writes and verifies an external Git bundle/manifest, and cleans only those archived paths. Then use ordinary `cleanup-automation-worktrees.sh` without force. Any additional path, active process, unreachable HEAD, registration problem, or CAS drift stays blocked for manual recovery.

## Review Passes

1. Source: every factual claim links back to a VentureDex record, structured startup research entry, official page, or cited source.
2. Scope: no new startup, logo, screenshot, schema, or deployment change is mixed into a weekly content PR unless explicitly requested by a human.
3. Objectivity: the issue states evidence gaps instead of guessing.
4. Theme: the 5-7 picks share a real product or market pattern.
5. Release: local gates pass, generated verification outputs are restored, browser verification confirms `/weekly` and the issue page render the research fields, deploy/live smoke passes, and the weekly detail URL has a Search Console submission row or a recorded blocker.
6. Newsletter readiness: the issue has stable published copy, because the Weekly email will reuse `editorial_intro`, `research_summary`, themes, and pick evaluations.
