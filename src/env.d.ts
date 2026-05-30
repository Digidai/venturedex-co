/// <reference path="../.astro/types.d.ts" />

// Cloudflare Worker bindings (wrangler.toml). In adapter v13 the runtime env is
// no longer on `Astro.locals.runtime` — it's the global `Env`, read via
// `import { env } from "cloudflare:workers"`. This interface types both that
// import and the worker entrypoint's handlers (src/worker.ts).
declare global {
  interface Env {
    DB: D1Database;
    R2: R2Bucket;
    EMAIL: SendEmail;
    NEWSLETTER_DELIVERY_QUEUE: Queue;
    ASSETS: Fetcher;
    SITE_URL: string;
    NEWSLETTER_FROM?: string;
    NEWSLETTER_REPLY_TO?: string;
    NEWSLETTER_ADMIN_TOKEN?: string;
    NEWSLETTER_DAILY_DELAY_HOURS?: string;
    NEWSLETTER_WEEKLY_DELAY_HOURS?: string;
    NEWSLETTER_WEEKLY_MAX_AGE_DAYS?: string;
    NEWSLETTER_BOOTSTRAP_DAILY?: string;
    NEWSLETTER_MAILING_ADDRESS?: string;
  }
}

declare namespace App {
  // v13: only the Cloudflare ExecutionContext is exposed on locals
  // (Astro.locals.cfContext). Bindings come from `cloudflare:workers`.
  interface Locals {
    cfContext: ExecutionContext;
  }
}

// Build-time public env (inlined by Astro/Vite). Set in CI before `npm run build`.
interface ImportMetaEnv {
  // Cloudflare Web Analytics beacon token; when unset the beacon is not rendered.
  readonly PUBLIC_CF_BEACON_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
