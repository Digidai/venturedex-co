export const prerender = true;

import type { APIRoute } from "astro";
import { buildVentureDexAiIndexFromContent } from "../lib/ai-discovery-content";
import { DEFAULT_SITE_URL, getSiteUrl } from "../lib/seo";

export const GET: APIRoute = ({ site }) => {
  const siteUrl = getSiteUrl(site ?? DEFAULT_SITE_URL);
  const body = JSON.stringify(buildVentureDexAiIndexFromContent(siteUrl), null, 2);

  return new Response(`${body}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
};
