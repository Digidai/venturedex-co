export const prerender = true;
import type { APIRoute } from "astro";
import { SITEMAP_GROUPS, selectSitemapGroup, type SitemapGroup } from "../../lib/sitemap-groups";
import { getSitemapUrls, renderSitemap } from "../sitemap.xml";

export function getStaticPaths() {
  return SITEMAP_GROUPS.map((group) => ({ params: { group } }));
}

export const GET: APIRoute = ({ params }) => new Response(
  renderSitemap(selectSitemapGroup(getSitemapUrls(), params.group as SitemapGroup)),
  { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } },
);
