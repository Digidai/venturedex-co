export const prerender = true;

import type { APIRoute } from "astro";
import { buildStartupAgentResource, renderStartupAgentMarkdown } from "../../lib/agent-resources";
import { getContentFundingRoundsForStartup, getContentStartupBySlug, getContentStartups } from "../../lib/content";
import { DEFAULT_SITE_URL, getSiteUrl } from "../../lib/seo";

export function getStaticPaths() {
  return getContentStartups().map((startup) => ({ params: { slug: startup.slug } }));
}

export const GET: APIRoute = ({ params, site }) => {
  const startup = getContentStartupBySlug(params.slug ?? "");
  if (!startup) return new Response("Not found", { status: 404 });
  const resource = buildStartupAgentResource({
    startup,
    fundingRounds: getContentFundingRoundsForStartup(startup.slug),
    siteUrl: getSiteUrl(site ?? DEFAULT_SITE_URL),
  });
  return new Response(renderStartupAgentMarkdown(resource), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      Link: `<${resource.canonical_url}>; rel="canonical"`,
    },
  });
};
