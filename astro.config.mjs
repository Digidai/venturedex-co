import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://venturedex.co",
  output: "static",
  trailingSlash: "never",
  // Emit prerendered pages as `path.html` (not `path/index.html`) so Cloudflare
  // serves them at the no-trailing-slash canonical (/startups/x) directly,
  // instead of 307-redirecting /startups/x -> /startups/x/. Keeps prerendered
  // URLs aligned with the canonical tags, sitemap, and trailing-slash middleware.
  build: { format: "file" },
  adapter: cloudflare({
    workerEntryPoint: {
      path: "src/worker.ts",
    },
    platformProxy: {
      enabled: true,
    },
  }),
});
