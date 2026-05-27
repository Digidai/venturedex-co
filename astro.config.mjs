import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://venturedex.co",
  output: "static",
  adapter: cloudflare({
    workerEntryPoint: {
      path: "src/worker.ts",
    },
    platformProxy: {
      enabled: true,
    },
  }),
});
