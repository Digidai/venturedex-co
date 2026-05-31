export const prerender = true;

import type { APIRoute } from "astro";
import { getContentStartups } from "../lib/content";
import { buildSearchEntries } from "../lib/search-index";

// Static, separately-cacheable search index (name/domain/type/tags for scoring,
// plus display fields so the client can render result cards). The /search page
// fetches this once and caches it, instead of inlining the whole index into the
// page HTML — keeps /search tiny and the index reusable as the directory grows.
export const GET: APIRoute = () => {
  const entries = buildSearchEntries(
    getContentStartups().sort((a, b) =>
      a.product_name.toLowerCase().localeCompare(b.product_name.toLowerCase())
    )
  );
  return new Response(JSON.stringify(entries), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Edge-cache; revalidates after deploy. Reinforced by public/_headers.
      "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
};
