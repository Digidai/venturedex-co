export const prerender = true;

import type { APIRoute } from "astro";
import { buildStartupChanges } from "../lib/agent-resources";
import { getContentStartups } from "../lib/content";
import { DEFAULT_SITE_URL, getSiteUrl } from "../lib/seo";

export const GET: APIRoute = ({ site }) => new Response(
  `${JSON.stringify(buildStartupChanges(getContentStartups(), getSiteUrl(site ?? DEFAULT_SITE_URL)))}\n`,
  { headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  } },
);
