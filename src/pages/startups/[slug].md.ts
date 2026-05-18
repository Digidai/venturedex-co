export const prerender = false;

import type { APIRoute } from "astro";
import { getStartupBySlug } from "../../lib/db";
import {
  DEFAULT_SITE_URL,
  absoluteUrl,
  cleanText,
  escapeMarkdown,
  getSiteUrl,
  parseLinks,
  splitCsv,
} from "../../lib/seo";
import type { FundingRound } from "../../lib/types";

export const GET: APIRoute = async ({ locals, params }) => {
  const slug = params.slug;
  if (!slug) return markdownNotFound();

  const siteUrl = getSiteUrl(locals.runtime.env.SITE_URL ?? DEFAULT_SITE_URL);
  const db = locals.runtime.env.DB;
  const startup = await getStartupBySlug(db, slug);

  if (!startup) return markdownNotFound();

  const rounds = await db
    .prepare(
      `SELECT *
       FROM funding_rounds
       WHERE company_slug = ?
       ORDER BY date DESC, created_at DESC`
    )
    .bind(startup.slug)
    .all<FundingRound>();

  const links = parseLinks(startup.links_json);
  const tags = splitCsv(startup.tags);
  const investors = splitCsv(startup.investors);
  const canonical = absoluteUrl(`/startups/${startup.slug}`, siteUrl);

  const body = [
    `# ${escapeMarkdown(startup.product_name)}`,
    "",
    startup.summary ? cleanText(startup.summary) : null,
    "",
    "## VentureDex Context",
    "",
    startup.editor_note ? cleanText(startup.editor_note) : null,
    "",
    "## Company Facts",
    "",
    `- Website: ${startup.canonical_url ?? `https://${startup.domain}`}`,
    startup.product_type ? `- Product type: ${escapeMarkdown(startup.product_type)}` : null,
    startup.funding_stage ? `- Funding stage: ${escapeMarkdown(startup.funding_stage)}` : null,
    startup.funding_display ? `- Funding display: ${escapeMarkdown(startup.funding_display)}` : null,
    startup.founded_year ? `- Founded: ${startup.founded_year}` : null,
    startup.team_size ? `- Team size: ${escapeMarkdown(startup.team_size)}` : null,
    startup.hq_location ? `- Headquarters: ${escapeMarkdown(startup.hq_location)}` : null,
    startup.region ? `- Region: ${escapeMarkdown(startup.region)}` : null,
    startup.why_featured ? `- Why featured: ${escapeMarkdown(startup.why_featured)}` : null,
    tags.length > 0 ? `- Tags: ${tags.map(escapeMarkdown).join(", ")}` : null,
    investors.length > 0 ? `- Investors: ${investors.map(escapeMarkdown).join(", ")}` : null,
    "",
    "## Links",
    "",
    ...[
      ["Canonical page", canonical],
      ["Official website", startup.canonical_url ?? `https://${startup.domain}`],
      ["GitHub", links.github],
      ["X / Twitter", links.twitter],
      ["LinkedIn", links.linkedin],
      ["Product Hunt", links.producthunt],
    ]
      .filter(([, url]) => Boolean(url))
      .map(([label, url]) => `- ${label}: ${url}`),
    "",
    "## Funding Sources",
    "",
    ...(rounds.results.length > 0
      ? rounds.results.map((round) => {
          const details = [round.amount, round.stage, round.lead_investor, round.date].filter(Boolean).join(" | ");
          return `- ${escapeMarkdown(details)}${round.source_url ? `: ${round.source_url}` : ""}`;
        })
      : ["- No VentureDex funding source attached yet."]),
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
