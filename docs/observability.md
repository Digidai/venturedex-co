# Observability

How to see what the deployed site and worker are doing.

## Daily automation execution

The Codex Daily curator has an execution surface separate from the deployed Worker. Its durable checkpoint and authority lease are:

```text
$CODEX_HOME/automations/venturedex-daily-curator/run-state.md
$CODEX_HOME/automations/venturedex-daily-curator/run-state.lease.json
```

`scripts/automation-run-state.py` manages both files under `.run-state.lock`. The checkpoint records the current run id, status, exact worktree/SHA, phase, accepted slugs, last update time, lease epoch, checkpoint revision, and latest blocker. The lease records an opaque owner fingerprint, heartbeat, epoch, and release state; it does not expose `CODEX_THREAD_ID`. Neither file contains credentials or copied source-page content. Treat them as routing evidence and reconcile them with these read-only sources before starting or resuming work:

```bash
git worktree list --porcelain
git fetch origin main --prune
git log --oneline -n 10 origin/main
tail -n 30 "$CODEX_HOME/automations/venturedex-daily-curator/gsc_submission_history.tsv"
```

For process ownership, first derive candidate PIDs from the exact run id, `RUN_WORKTREE`, or the known VentureDex automation scripts, then inspect only those PIDs' parent, start time, executable name, and cwd. Do not copy an unfiltered global process list or arbitrary argv into the run context: unrelated commands may contain sensitive parameters, and a process name without a matching cwd/lease is not ownership evidence.

Interpretation:

- a matching active lease plus one registered, owned Daily worktree means the same owner may resume the recorded phase; do not start a new discovery cycle.
- a different active owner fails closed. A heartbeat older than six hours is necessary but not sufficient for takeover: the new owner must preserve the run id, supply the exact expected epoch, and prove no matching process is still mutating the worktree.
- `pushed` or later means prove exact-SHA CI/deploy/GSC state before doing more content work.
- a missing worktree, conflicting SHA, multiple plausible dirty Daily worktrees, a lease/checkpoint epoch mismatch, or a candidate process whose cwd/lease cannot be bound to the recorded run means `blocked` until ownership is resolved.
- `complete` is valid only after learning log, automation memory, inbox closeout, release/GSC evidence, and guarded worktree cleanup are durable.
- `request timed out` or `stream disconnected before completion` is a `transport_interruption`; it does not prove a repository gate failed. Resume from durable evidence and never reuse stale exec cell ids or PIDs.

## Web analytics (Cloudflare Web Analytics)

The layout (`src/layouts/Base.astro`) renders the Cloudflare Web Analytics beacon
when, and only when, a build-time token is set:

```
PUBLIC_CF_BEACON_TOKEN=<token from the Cloudflare dashboard>
```

- It is read via `import.meta.env.PUBLIC_CF_BEACON_TOKEN`, so it is **inlined at
  build time** and ships on both prerendered and SSR pages.
- When unset (local dev, or before analytics is configured) **nothing is rendered**,
  so dev builds never beacon.
- The beacon is cookieless and privacy-friendly; no consent banner is required.

To enable it, set `PUBLIC_CF_BEACON_TOKEN` in the environment that runs
`npm run build` (e.g. the GitHub Actions deploy job / `scripts/manage.sh release`).
Get the token from **Cloudflare dashboard → Analytics & Logs → Web Analytics**
for the `venturedex.co` site. The value is public (it appears in page source).

## Session analytics (Microsoft Clarity)

The shared layout also renders the Microsoft Clarity tracking snippet through
`src/components/MicrosoftClarity.astro` with project id `xd53ih81m0`.

- Microsoft's manual setup docs say the tracking code belongs in the website
  `<head>`; `src/layouts/Base.astro` renders it there for every page.
- The snippet only loads on `venturedex.co` or `www.venturedex.co`, so local dev
  and worker preview hosts do not pollute Clarity sessions.
- `src/lib/http-policy.ts` keeps the CSP compatible with both analytics systems:
  Cloudflare Web Analytics stays allowed, and Clarity/Bing endpoints are allowed
  for script, connect, and image traffic.
- If internal traffic or sensitive text needs to be excluded, configure masking
  and IP blocking in the Clarity dashboard rather than changing the site code.

References:

- https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup
- https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-csp
- https://learn.microsoft.com/en-us/clarity/setup-and-installation/ip-exclusion

## Worker logs (cron + queue)

`src/worker.ts` emits single-line JSON logs so they can be parsed by Cloudflare
Workers Logs / Logpush and alerted on:

- `newsletter_cycle` — the result of each daily/weekly cron send
  (`status`, `type`, `itemCount`, `recipientCount`, ...).
- `newsletter_cycle_error` — the cron handler threw or returned a failed newsletter result; either form is converted to a rejection so the scheduled invocation remains failed in Cloudflare observability.
- `newsletter_queue_error` — a delivery-queue batch threw (then re-thrown so the
  platform retries the batch).

View them live with:

```
npx wrangler tail venturedex
```

Per-recipient delivery state (sent / skipped / failed, provider message id, error)
is also persisted in the `newsletter_deliveries` D1 table, and per-send status in
`newsletter_sends` — query those for delivery history beyond the log retention window.

Delivery claims are visible in `newsletter_deliveries.provider_message_id`:

- `claim:pre:*` means the message is still before provider send and may be reclaimed after the stale window.
- `claim:sending:*` means provider acceptance is uncertain. It is never automatically reclaimed or resent. Queue processing and non-dry-run Cron cycles convert a claim that remains in this state for more than 30 minutes to a terminal `failed` row while retaining the claim token; inspect `error_message` and provider logs before any human-authorized follow-up.

Useful stuck-claim query:

```sql
SELECT d.id, s.send_key, d.status, d.provider_message_id, d.error_message, d.updated_at
FROM newsletter_deliveries d
JOIN newsletter_sends s ON s.id = d.send_id
WHERE d.provider_message_id LIKE 'claim:%'
ORDER BY datetime(d.updated_at) ASC;
```
