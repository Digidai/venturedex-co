# Astro 6 / @astrojs/cloudflare 13 upgrade

What changed when moving off Astro 5 / adapter 12, and what to verify on deploy.

## Dependency + runtime

- `astro` 5 → **6**, `@astrojs/cloudflare` 12 → **13** (requires Astro 6 + Vite 7).
- **Node 22.12+ required** (Astro 6 dropped 18/20): `.nvmrc`, `package.json`
  `engines`, and both CI workflows now pin Node 22.
- `better-sqlite3` 11 → 12 (test-only; v12 ships Node 22/24/26 prebuilds).

## Code changes (all locally build + test verified)

- **Custom worker entrypoint** (`src/worker.ts`): adapter 13 removed
  `createExports(manifest)`. The entry is now a plain `ExportedHandler` that calls
  `handle()` from `@astrojs/cloudflare/handler` for Astro requests, wrapped with our
  one-click unsubscribe, daily/weekly cron, and the delivery-queue consumer.
- **`Astro.locals.runtime` was removed.** Every SSR route now reads bindings via
  `import { env } from "cloudflare:workers"` and the execution context via
  `Astro.locals.cfContext` (was `locals.runtime.ctx`). Affected: `api/subscribe.ts`,
  `api/newsletter/{confirm,run,unsubscribe}.ts`, `pages/unsubscribe.astro`.
- **`env.d.ts`**: declares the global `Env` interface (binding types) and
  `App.Locals = { cfContext }`.
- **`astro.config.mjs`**: removed `workerEntryPoint`; set `imageService: "passthrough"`
  (we never use `<Image/>`/`getImage()`); set `session: { driver: sessionDrivers.null() }`
  (see Sessions below).
- **`package.json` build**: dropped the stale `printf '_worker.js' > dist/.assetsignore`
  postbuild step — the adapter now writes `dist/client/.assetsignore` itself.

## Deploy layout + command (CHANGED)

Adapter 13 emits a new layout:

- `dist/client/` — prerendered HTML + static assets (the ASSETS upload).
- `dist/server/` — `entry.mjs` (the Worker) + an adapter-generated `wrangler.json`
  with the correct `main`, `assets.directory: ../client`, and all bindings.

The **root `wrangler.toml` is now build-time only**: its `main = "src/worker.ts"`
lets `@cloudflare/vite-plugin` resolve the entry during `astro build`. **Deploys use
the generated config**, so `scripts/manage.sh` now runs:

```
npx wrangler deploy -c dist/server/wrangler.json
```

(the newsletter preflight `--dry-run` uses the same `-c`). Verified locally:
`wrangler deploy --dry-run` bundles the Worker and resolves every binding (EMAIL,
NEWSLETTER_DELIVERY_QUEUE, DB, R2, ASSETS) plus the cron triggers.

## Sessions

Astro 6 enables sessions by default, and adapter 13 would otherwise auto-provision a
`SESSION` KV binding (with no namespace id → broken deploy). This site never calls
`Astro.session`, so `astro.config.mjs` sets `session: { driver: sessionDrivers.null() }`.
The generated deploy config then has `kv_namespaces: []` — no KV namespace to create.

## Post-deploy smoke test (DO THIS — not verifiable locally)

The build, the full test suite, and `wrangler deploy --dry-run` all pass locally, but
the Worker **runtime** only runs on Cloudflare. After the first deploy to a preview or
production, confirm:

1. **Pages render**: `/`, a `/startups/<slug>`, `/search`, `/collections`, `/news`,
   `/weekly/1` return 200 with content (assets served from `dist/client`).
2. **Trailing-slash + canonical redirects** still 301 as before (middleware).
3. **Subscribe flow**: POST `/api/subscribe` → pending; confirmation email arrives;
   `/api/newsletter/confirm` GET shows the interstitial and POST confirms (this is the
   main `cloudflare:workers` `env` + `cfContext.waitUntil` path).
4. **One-click unsubscribe**: `POST /api/newsletter/unsubscribe?token=…` with
   `List-Unsubscribe=One-Click` returns 204 (the custom fetch wrap).
5. **Admin run (dry run)**: `POST /api/newsletter/run?type=daily&dry_run=1` with the
   admin bearer token returns a `dry_run` result (exercises D1 via the worker).
6. **Cron**: trigger the scheduled handler (or wait for the window) and check the
   `newsletter_cycle` JSON log line via `wrangler tail venturedex`.
7. **Queue**: a real send should drain `venturedex-newsletter-delivery`; watch for
   `newsletter_queue_error` logs and check `newsletter_deliveries` rows flip to `sent`.

If anything fails, the most likely culprits are the worker entry (`handle()` wiring)
or a binding name mismatch — both visible in `wrangler tail`.
