export const prerender = true;
import type { APIRoute } from "astro";
import { SITEMAP_GROUPS } from "../lib/sitemap-groups";
import { absoluteUrl, escapeXml } from "../lib/seo";

export const GET: APIRoute = () => new Response(
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${SITEMAP_GROUPS.map((group) => `  <sitemap><loc>${escapeXml(absoluteUrl(`/sitemaps/${group}.xml`))}</loc></sitemap>`).join("\n")}\n</sitemapindex>`,
  { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } },
);
