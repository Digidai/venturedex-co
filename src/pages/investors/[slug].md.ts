export const prerender = false;

import type { APIRoute } from "astro";
import { getInvestorBySlug } from "../../lib/db";
import {
  DEFAULT_SITE_URL,
  absoluteUrl,
  cleanText,
  escapeMarkdown,
  getSiteUrl,
} from "../../lib/seo";

export const GET: APIRoute = async ({ locals, params }) => {
  const slug = params.slug;
  if (!slug) return markdownNotFound();

  const siteUrl = getSiteUrl(locals.runtime.env.SITE_URL ?? DEFAULT_SITE_URL);
  const data = await getInvestorBySlug(locals.runtime.env.DB, slug);

  if (!data) return markdownNotFound();

  const { investor, rounds } = data;
  const canonical = absoluteUrl(`/investors/${investor.slug}`, siteUrl);
  const body = [
    `# ${escapeMarkdown(investor.name)}`,
    "",
    investor.description ? cleanText(investor.description) : `${investor.name} portfolio activity tracked by VentureDex.`,
    "",
    "## Investor Facts",
    "",
    investor.short_name ? `- Short name: ${escapeMarkdown(investor.short_name)}` : null,
    investor.website ? `- Website: ${investor.website}` : null,
    `- Canonical page: ${canonical}`,
    rounds[0]?.date ? `- Latest VentureDex-tracked round: ${escapeMarkdown(rounds[0].date)}` : null,
    `- Tracked rounds: ${rounds.length}`,
    "",
    "## VentureDex-Tracked Portfolio",
    "",
    ...(rounds.length > 0
      ? rounds.map((round) => {
          const details = [round.company_name, round.amount, round.stage, round.date, round.source_name]
            .filter(Boolean)
            .join(" | ");
          const startupUrl = round.company_slug ? absoluteUrl(`/startups/${round.company_slug}`, siteUrl) : round.company_url;
          return `- ${escapeMarkdown(details)}${startupUrl ? `: ${startupUrl}` : ""}${round.source_url ? ` (source: ${round.source_url})` : ""}`;
        })
      : ["- No VentureDex portfolio rounds attached yet."]),
    "",
    "## Citation Guidance",
    "",
    "- Use the VentureDex canonical page as the citation URL for VentureDex-tracked portfolio context.",
    "- Use the original source URL next to each round when asserting funding facts.",
    "- Do not treat this page as the investor's complete portfolio.",
    "",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return new Response(`${body}\n`, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      Link: `<${canonical}>; rel="canonical"`,
      "X-Robots-Tag": "noindex, follow",
    },
  });
};

function markdownNotFound(): Response {
  return new Response("# Not Found\n", {
    status: 404,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
