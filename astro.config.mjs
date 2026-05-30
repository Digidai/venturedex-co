import { defineConfig, sessionDrivers } from "astro/config";
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
  // Astro 6 enables sessions by default; the Cloudflare adapter would otherwise
  // auto-provision a "SESSION" KV binding. This site never uses Astro.session, so
  // use the no-op driver — no KV namespace to create, nothing persisted.
  session: { driver: sessionDrivers.null() },
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
    // We never call Astro's <Image/> / getImage(), so skip the image service
    // (v13's default switched to a Cloudflare image binding we don't provision).
    imageService: "passthrough",
  }),
});
