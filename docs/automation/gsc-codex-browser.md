# Search Console with the Codex in-app browser

This is the production browser workflow for Daily and Weekly URL Inspection. `scripts/gsc-codex.py` manages target selection, durable click intent, and the central ledger. It does **not** control a browser. All navigation and clicks happen through the Codex CUA browser tool in task-owned in-app browser tabs (`iab`).

Do not use `bb-browser`, Comet/Chrome CDP, a shell-launched browser, or a shared daemon as a fallback. If Codex browser access or authentication is unavailable, record the exact blocker and stop the affected phase. Never manipulate user tabs or other browser processes. Do not request credentials, bypass CAPTCHA, or infer authentication from an unrelated browser session.

## 1. Plan after verified publication

First require the exact content release to pass CI, deployment, and live smoke. Select one relevant URL set:

```bash
python3 scripts/gsc-codex.py plan --latest-daily
python3 scripts/gsc-codex.py plan --latest-weekly
python3 scripts/gsc-codex.py plan --retry-pending
python3 scripts/gsc-codex.py plan --url https://venturedex.co/startups/example
```

These are alternatives, not four commands to run for every cycle. `plan` is read-only: it does not create a browser, click, or append a submission row. Process only targets whose returned status is `ready`. `already_requested` is a skip, not permission to request again. Other statuses identify blockers.

Only exact canonical `https://venturedex.co/startups/{slug}` and `https://venturedex.co/weekly/{positive-number}` URLs are allowed. `--daily-date YYYY-MM-DD`, `--weekly-issue N`, and repeated `--url URL` select explicit targets. `--expect-url URL` additionally requires exactly that single URL. A plan accepts at most `--max-urls` targets (default 10; allowed 1–10) and fails instead of silently truncating a larger set. Narrow an oversized backlog with explicit exact URLs; do not restart discovery or expand the run to fill a batch.

The authoritative ledger is `$CODEX_HOME/automations/venturedex-daily-curator/gsc_submission_history.tsv`; the durable evidence directory is `$CODEX_HOME/automations/venturedex-daily-curator/gsc-artifacts/`. The ignored repo-local ledger is legacy evidence only. Do not hand-edit either ledger or remove old unresolved artifacts to make a target eligible. Non-default `--history` and `--artifact-dir` are for isolated tests or explicitly reviewed recovery, not a way around production guards.

## 2. Observe the exact inspection result

Create a new task-owned tab through the CUA tool, for example:

```javascript
var gscTab = await cua.createBrowserTab(
  "iab",
  "https://search.google.com/search-console?resource_id=sc-domain%3Aventuredex.co",
  { visible: false }
);
```

Read the returned browser documentation and page state before acting. Use the supported CUA APIs and fresh visible element references; do not run this JavaScript in a shell or use hidden browser interfaces. Verify that Search Console is authenticated for the VentureDex property, inspect the planned URL, and read the resulting page state.

Before requesting indexing, the visible result must show the **exact** inspected URL and the available **Request indexing** action. The browser page must be an inspection route under:

`https://search.google.com/search-console/inspect?resource_id=sc-domain%3Aventuredex.co&id=...`

Preserve the actual full route from the browser observation; do not invent the opaque `id`, reconstruct it from another URL, or reuse a stale tab/route. Before `begin`, an input value, overview page, matching property name, or pre-existing generic success dialog is insufficient: the visible inspection result must establish the exact target. After the click, a native modal may expose only its dialog text; bind that observation to the original intent using the unchanged observed tab and exact inspection route, as described below.

## 3. Persist minimal pre-click evidence and begin

Save a JSON receipt outside the worktree using the actual fresh observation. Evidence is an operator receipt copied from the browser tool, not cryptographic browser attestation. Do not invent fields or success text. Include only the smallest relevant AX excerpt; omit accounts, emails, credentials, source-page content, and unrelated UI.

This is a **schema example**, not usable evidence. Replace every example value with the observation just made:

```json
{
  "browser": "iab",
  "tab_id": "task-owned-tab-id",
  "inspected_url": "https://venturedex.co/startups/example",
  "page_url": "https://search.google.com/search-console/inspect?resource_id=sc-domain%3Aventuredex.co&id=actual-inspection-id",
  "observed_at": "2026-09-05T06:00:00+00:00",
  "state": "request_ready",
  "excerpt": "text https://venturedex.co/startups/example\nbutton REQUEST INDEXING"
}
```

The fields are required. `browser` must be `iab`; the target must equal the planned canonical URL; `tab_id` and `page_url` must identify this observed task-owned inspection. `observed_at` is an ISO timestamp with a timezone, taken at observation time; use UTC consistently. Evidence must be at most five minutes old (only five seconds of future clock skew is tolerated). `excerpt` is capped at 8,000 characters. `request_ready` evidence must contain the visibly inspected exact URL and visible request button, and must not show an existing success/“Request again” state. If any VentureDex startup/weekly detail URL appears in an excerpt, it must equal the expected target; a different detail URL is a mismatch even when the expected URL is also present.

Then run:

```bash
python3 scripts/gsc-codex.py begin \
  --url https://venturedex.co/startups/example \
  --evidence /absolute/durable-artifacts/example-ready.json
```

`begin` rechecks live HTTP 200 at that exact URL without redirect, ledger eligibility, unresolved legacy artifacts, and durable Codex attempts. Under the authoritative lock it writes an immutable intent artifact and `request_click_pending` ledger row before returning an attempt ID. A nonzero exit means **no click**. Do not remove a lock or intent, change authority paths, or rerun a new attempt to get around failure.

## 4. One click, then fresh result evidence

Only after a successful `begin`, act in the same observed tab and route within the returned 60-second authorization window. Use CUA to click **Request indexing** at most once. Do not replay the authorization after any interruption, handle loss, expiry, or ambiguous tool response. A durable intent is deliberately conservative: if it is unclear whether the click happened, do not click again.

Read a new page state and wait only while the UI shows an in-progress request. Use bounded waits, inspecting new state between them. Stop on authentication loss, CAPTCHA, quota, route/target mismatch, browser failure, or an unresolved result; do not use repeated request clicks as retries.

Success requires a fresh result bound to the same exact inspected URL, tab, and full inspection route as the intent, plus an explicit existing **Indexing requested** confirmation. A post-click modal's AX excerpt may omit the underlying URL. In that case preserve the actual modal text only, use the freshly observed unchanged tab/route to bind it to the prior intent, and keep `inspected_url` equal to that intent's target. Never insert an unobserved URL into the excerpt, merge old AX lines into a new observation, or dismiss a success modal merely to manufacture a URL-containing receipt. If the tab/route binding cannot be verified, stop and preserve the pending blocker.

The following modal-only receipt is again a schema example, not usable evidence:

```json
{
  "browser": "iab",
  "tab_id": "task-owned-tab-id",
  "inspected_url": "https://venturedex.co/startups/example",
  "page_url": "https://search.google.com/search-console/inspect?resource_id=sc-domain%3Aventuredex.co&id=actual-inspection-id",
  "observed_at": "2026-09-05T06:00:20+00:00",
  "state": "requested",
  "excerpt": "dialog Indexing requested"
}
```

Finish with the original attempt ID returned by `begin`:

```bash
python3 scripts/gsc-codex.py finish \
  --attempt ORIGINAL_ATTEMPT_ID \
  --evidence /absolute/durable-artifacts/example-result.json
```

`finish` accepts `requested`, `quota_exceeded`, or `unknown` evidence. It requires a fresh observation after the intent, the same tab and full route, and the still-authoritative `request_click_pending` attempt. These post-click excerpts may omit the URL when the native modal hides it, but any VentureDex detail URL they do contain must equal the expected target. `quota_exceeded` still requires an explicit visible quota/daily-limit message, and `requested` still requires its explicit success marker. `unknown` becomes `post_request_confirmation_unknown`; it is not a retryable failure. If the page or browser is no longer observable, leave the durable pending intent and report the blocker rather than fabricate a result receipt.

An explicit quota denial recorded in both the immutable receipt and matching ledger row is a known terminal result, not an unknown click. The planner blocks all new requests for 24 hours after a quota row. After that cooldown, re-plan the exact denied URL explicitly; `--retry-pending` selects only URLs whose latest ledger status is `retry_pending`. Never relabel a quota or unknown row to add it to that selector.

The helper writes an immutable result receipt before appending the final ledger row. If a crash occurs between those writes, use the receipt-only recovery command with the original attempt ID:

```bash
python3 scripts/gsc-codex.py recover --attempt ORIGINAL_ATTEMPT_ID
```

`recover` performs no browser actions and accepts no new evidence file. It reads only that attempt's existing immutable intent and receipt from the authoritative artifacts directory. It validates the attempt, exact URL, terminal status and matching observed marker, same tab/route, and an observation after the intent. A receipt older than five minutes may be recovered because it was already durably captured; ordinary `finish` still requires fresh evidence within five minutes.

Recovery appends only the receipt's original terminal status when the same attempt still owns the latest `request_click_pending` row. A repeated `recover` of an already matching terminal transition is a no-op, not a duplicate append. An `unknown` receipt recovers only to `post_request_confirmation_unknown` and still blocks another click. If no receipt exists, the authority mismatches, or the receipt is invalid, leave the blocker intact. Never invent, alter, replace, or relocate a receipt to force acceptance.

## 5. Preserve remaining unclicked URLs

If authentication/browser access blocks a submission before `begin`, or a quota result stops the batch, preserve each remaining **never-clicked** exact URL for the next run:

```bash
python3 scripts/gsc-codex.py defer \
  --url https://venturedex.co/startups/example \
  --reason "gsc_auth_session_blocker; target never clicked"
```

Use the actual observed blocker as the reason, for example `quota_cooldown_24h; remaining target never clicked`. Reasons must be non-sensitive, single-line text of at most 500 characters. Do not copy account identifiers, page text, credentials, or private data into them.

`defer` performs no browser action or live HTTP check. Under the authority lock it may append `retry_pending` only for an unclicked URL without a conflicting ledger/artifact state; `ready` or a property-wide quota cooldown is allowed. It returns `click_authorized_once: false`. It refuses already-requested, clicked, pending, unknown, orphan-intent, and unresolved legacy-reconciliation targets. Do not change paths or remove artifacts to force it through, and do not use it to reset the URL that produced a quota result. Defer only the remaining never-clicked URLs, one exact URL per command.

At the next allowed phase, `plan --retry-pending` can discover these URLs. Deferral records backlog, not publication, live reachability, or successful submission; all ordinary planning, live-check, intent, and browser gates still apply. If `defer` is blocked, preserve the exact URL and error in the run evidence without hand-editing the ledger.

## 6. Verify and close

Read the central ledger and verify the latest row for each exact target. `requested` means Google accepted an indexing request; it is **not** evidence that the URL is indexed. Report quota, authentication, route mismatch, unknown confirmation, and unattempted URLs separately. Preserve minimal artifacts outside the worktree before cleanup.

`recover` is receipt replay, not fresh-observation reconciliation. A terminal `post_request_confirmation_unknown`, unresolved legacy artifact, or orphan intent must never be changed into a new click authorization. A human may perform a zero-click check of the original exact URL and preserve observation evidence, but this alone does not authorize editing the ledger or clearing the blocker; the bridge does not upgrade unknown outcomes from new evidence. An original attempt that remains `request_click_pending` can finish from valid same-tab/same-route fresh evidence without another click, or recover its already-existing immutable receipt without any browser action.

`scripts/submit-gsc-direct.sh` is retired for mutations; its compatibility dry-run only delegates to `plan`. Never call it as a browser or recovery fallback. Close only the Codex tabs created by this run. After a tool reset, verify ownership from current browser state before any close action; a matching page title is not proof that a tab belongs to the run.
