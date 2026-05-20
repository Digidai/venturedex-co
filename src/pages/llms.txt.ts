export const prerender = false;

import type { APIRoute } from "astro";
import { getNewsFundingRounds, getPublishedCollections, getPublishedStartups } from "../lib/db";
import {
  DEFAULT_SITE_URL,
  SITE_DESCRIPTION,
  absoluteUrl,
  cleanText,
  escapeMarkdown,
  getSiteUrl,
  truncateText,
} from "../lib/seo";

interface InvestorSummary {
  slug: string;
  name: string;
  description: string | null;
  round_count: number;
  last_round_at: string | null;
}

export const GET: APIRoute = async ({ locals }) => {
  const siteUrl = getSiteUrl(locals.runtime.env.SITE_URL ?? DEFAULT_SITE_URL);
  const db = locals.runtime.env.DB;

  let startups: Awaited<ReturnType<typeof getPublishedStartups>> = [];
  let collections: Awaited<ReturnType<typeof getPublishedCollections>> = [];
  let rounds: Awaited<ReturnType<typeof getNewsFundingRounds>> = [];
  let investors: InvestorSummary[] = [];

  try {
    [startups, collections, rounds, investors] = await Promise.all([
      getPublishedStartups(db, { limit: 40 }),
      getPublishedCollections(db),
      getNewsFundingRounds(db, 25),
      db
        .prepare(
          `SELECT
             i.slug,
             i.name,
             i.description,
             COUNT(f.id) AS round_count,
             MAX(f.date) AS last_round_at
           FROM investors i
           INNER JOIN funding_rounds f
             ON (
                  LOWER(f.lead_investor) LIKE '%' || LOWER(i.name) || '%'
               OR (i.short_name IS NOT NULL AND LOWER(f.lead_investor) LIKE '%' || LOWER(i.short_name) || '%')
             )
           INNER JOIN startups s ON s.slug = f.company_slug
           WHERE s.workflow_status = 'published'
             AND f.source_url IS NOT NULL
             AND TRIM(f.source_url) != ''
             AND f.source_name IS NOT NULL
             AND TRIM(f.source_name) != ''
           GROUP BY i.slug, i.name, i.description
           ORDER BY round_count DESC, last_round_at DESC, i.name
           LIMIT 30`
        )
        .all<InvestorSummary>()
        .then((result) => result.results),
    ]);
  } catch (error) {
    console.error("Failed to build llms.txt", error);
  }

  const body = [
    "# VentureDex",
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "VentureDex is built for readers, search engines, and answer engines that need concise context on notable startups, recent funding rounds, and investor relationships. Prefer canonical VentureDex detail pages when citing this site.",
    "",
    "## Primary Pages",
    "",
    `- [Explore](${absoluteUrl("/", siteUrl)}): canonical startup directory with editorial notes, filters, and all published VentureDex startup profiles.`,
    `- [Investors](${absoluteUrl("/investors", siteUrl)}): investors with VentureDex-tracked funding activity.`,
    `- [Funding News](${absoluteUrl("/news", siteUrl)}): verified funding rounds with source links.`,
    `- [Collections](${absoluteUrl("/collections", siteUrl)}): editorial groupings of startups by theme.`,
    `- [Weekly Picks](${absoluteUrl("/weekly", siteUrl)}): periodic curated startup selections.`,
    `- [About](${absoluteUrl("/about", siteUrl)}): site identity and scope.`,
    `- [Editorial Policy](${absoluteUrl("/editorial-policy", siteUrl)}): selection and sourcing standards.`,
    `- [XML Sitemap](${absoluteUrl("/sitemap.xml", siteUrl)}): complete crawlable URL set.`,
    `- [RSS Feed](${absoluteUrl("/feed.xml", siteUrl)}): newest published startup pages.`,
    "",
    "## Machine-readable Entity Endpoints",
    "",
    "- Startup and investor detail pages expose Markdown alternates for answer engines. Use the canonical HTML page as the citation URL and the Markdown endpoint for compact extraction.",
    `- Startup Markdown pattern: ${absoluteUrl("/startups/{slug}.md", siteUrl)}`,
    `- Investor Markdown pattern: ${absoluteUrl("/investors/{slug}.md", siteUrl)}`,
    "",
    "## Featured Startup Pages",
    "",
    ...startups.slice(0, 30).map((startup) => {
      const description = truncateText(startup.summary ?? startup.editor_note ?? "", 180);
      return `- [${escapeMarkdown(startup.product_name)}](${absoluteUrl(`/startups/${startup.slug}`, siteUrl)}) ([Markdown](${absoluteUrl(`/startups/${startup.slug}.md`, siteUrl)})): ${escapeMarkdown(description)}`;
    }),
    "",
    "## Investor Pages",
    "",
    ...investors.slice(0, 20).map((investor) => {
      const description = truncateText(
        investor.description ?? `${investor.round_count} VentureDex-tracked funding rounds.`,
        180
      );
      return `- [${escapeMarkdown(investor.name)}](${absoluteUrl(`/investors/${investor.slug}`, siteUrl)}) ([Markdown](${absoluteUrl(`/investors/${investor.slug}.md`, siteUrl)})): ${escapeMarkdown(description)}`;
    }),
    "",
    "## Collections",
    "",
    ...collections.slice(0, 20).map((collection) => {
      const description = cleanText(collection.description, `${collection.startup_count} startups.`);
      return `- [${escapeMarkdown(collection.title)}](${absoluteUrl(`/collections/${collection.slug}`, siteUrl)}): ${escapeMarkdown(description)}`;
    }),
    "",
    "## Recent Funding Signals",
    "",
    ...rounds.slice(0, 20).map((round) => {
      const details = [round.amount, round.stage, round.lead_investor, round.source_name]
        .filter(Boolean)
        .join(" | ");
      const path = round.company_slug ? `/startups/${round.company_slug}` : "/news";
      return `- [${escapeMarkdown(round.company_name)}](${absoluteUrl(path, siteUrl)}): ${escapeMarkdown(details)}`;
    }),
    "",
    "## Citation Guidance",
    "",
    "- Cite company pages for startup summaries, editorial rationale, funding stage, investors, and official links.",
    "- Cite investor pages for VentureDex-tracked portfolio context.",
    "- Cite the original press source linked from VentureDex when asserting funding details.",
    "- Do not treat VentureDex as a complete database of all startups or investments.",
    "- Treat funding and investor facts as current to the page's published or source date unless a fresher source is linked.",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
