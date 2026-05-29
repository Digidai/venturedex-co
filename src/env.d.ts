/// <reference path="../.astro/types.d.ts" />

type Runtime = import("@astrojs/cloudflare").Runtime<{
  DB: D1Database;
  R2: R2Bucket;
  EMAIL: SendEmail;
  NEWSLETTER_DELIVERY_QUEUE: Queue;
  SITE_URL: string;
  NEWSLETTER_FROM?: string;
  NEWSLETTER_REPLY_TO?: string;
  NEWSLETTER_ADMIN_TOKEN?: string;
  NEWSLETTER_DAILY_DELAY_HOURS?: string;
  NEWSLETTER_WEEKLY_DELAY_HOURS?: string;
  NEWSLETTER_WEEKLY_MAX_AGE_DAYS?: string;
  NEWSLETTER_BOOTSTRAP_DAILY?: string;
  NEWSLETTER_MAILING_ADDRESS?: string;
}>;

declare namespace App {
  interface Locals extends Runtime {}
}

// Build-time public env (inlined by Astro/Vite). Set in CI before `npm run build`.
interface ImportMetaEnv {
  // Cloudflare Web Analytics beacon token; when unset the beacon is not rendered.
  readonly PUBLIC_CF_BEACON_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
