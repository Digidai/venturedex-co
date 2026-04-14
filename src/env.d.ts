/// <reference path="../.astro/types.d.ts" />

type Runtime = import("@astrojs/cloudflare").Runtime<{
  DB: D1Database;
  R2: R2Bucket;
  SITE_URL: string;
}>;

declare namespace App {
  interface Locals extends Runtime {}
}
