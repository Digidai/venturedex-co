export const prerender = true;

import type { APIRoute } from "astro";
import { renderLlmsFullText } from "../lib/ai-discovery";
import { buildVentureDexAiIndexFromContent } from "../lib/ai-discovery-content";
import { DEFAULT_SITE_URL, getSiteUrl } from "../lib/seo";

export const GET: APIRoute = ({ site }) => {
  const siteUrl = getSiteUrl(site ?? DEFAULT_SITE_URL);
  const body = renderLlmsFullText(buildVentureDexAiIndexFromContent(siteUrl));

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
