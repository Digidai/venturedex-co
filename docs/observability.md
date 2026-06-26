# Observability

How to see what the deployed site and worker are doing.

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
- `newsletter_cycle_error` — the cron handler threw.
- `newsletter_queue_error` — a delivery-queue batch threw (then re-thrown so the
  platform retries the batch).

View them live with:

```
npx wrangler tail venturedex
```

Per-recipient delivery state (sent / skipped / failed, provider message id, error)
is also persisted in the `newsletter_deliveries` D1 table, and per-send status in
`newsletter_sends` — query those for delivery history beyond the log retention window.
