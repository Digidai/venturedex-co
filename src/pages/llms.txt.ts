export const prerender = true;

import type { APIRoute } from "astro";
import {
  getContentCollections,
  getContentNewsEligibleFundingRounds,
  getContentStartups,
} from "../lib/content";
import { getPublishedWeeklyIssuesFromContent } from "../lib/weekly";
import { getTopicPages } from "../lib/topic-pages";
import {
  DEFAULT_SITE_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  absoluteUrl,
  cleanText,
  escapeMarkdown,
  getSiteUrl,
  truncateText,
} from "../lib/seo";

export const GET: APIRoute = ({ site }) => {
  const siteUrl = getSiteUrl(site ?? DEFAULT_SITE_URL);
  const link = (label: string, path: string) => `- [${label}](${absoluteUrl(path, siteUrl)})`;
  const startupLink = (label: string, path: string, description: string) =>
    `- [${escapeMarkdown(label)}](${absoluteUrl(path, siteUrl)}) - ${escapeMarkdown(description)}`;
  const rounds = getContentNewsEligibleFundingRounds();
  const latestRoundBySlug = new Map<string, (typeof rounds)[number]>();
  for (const round of rounds) {
    if (round.company_slug && !latestRoundBySlug.has(round.company_slug)) {
      latestRoundBySlug.set(round.company_slug, round);
    }
  }
  const allStartups = getContentStartups();
  const weeklyIssueData = getPublishedWeeklyIssuesFromContent(Infinity);
  const topics = getTopicPages(allStartups, weeklyIssueData)
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((topic) =>
      startupLink(
        topic.title,
        topic.path,
        `${topic.startups.length} startup profiles. ${topic.description}`
      )
    );
  const startups = allStartups
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .map((startup) => {
      const round = latestRoundBySlug.get(startup.slug);
      const details = [
        startup.product_type,
        round?.amount,
        round?.stage,
        round?.lead_investor ? `lead investor: ${round.lead_investor}` : null,
        startup.region,
      ].filter(Boolean);

      return startupLink(
        startup.product_name,
        `/startups/${startup.slug}`,
        truncateText(cleanText([startup.summary, details.join("; ")].filter(Boolean).join(" - ")), 220)
      );
    });
  const weeklyIssues = weeklyIssueData
    .sort((a, b) => b.issue_number - a.issue_number)
    .map((issue) =>
      startupLink(
        `Weekly #${issue.issue_number}: ${issue.title}`,
        `/weekly/${issue.issue_number}`,
        truncateText(cleanText(issue.research_summary || issue.editorial_intro || "Weekly startup research."), 220)
      )
    );
  const collections = getContentCollections()
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((collection) =>
      startupLink(
        collection.title,
        `/collections/${collection.slug}`,
        `${collection.startup_count} startup profiles. ${collection.description ?? ""}`
      )
    );

  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

VentureDex is an editorial startup directory focused on public product evidence, funding signals, investor context, source links, and concise company research notes.

## Key Pages

${[
    link("Explore startups", "/"),
    link("About VentureDex", "/about"),
    link("Editorial policy", "/editorial-policy"),
    link("Startup investors", "/investors"),
    link("Funding news", "/news"),
    link("Weekly startup research", "/weekly"),
    link("Collections", "/collections"),
    link("Startup topics", "/topics"),
  ].join("\n")}

## Startup Profiles

Each profile is source-backed and includes product context, funding signals, investor links, evidence notes, risk notes, source trail, canonical company URL, screenshot, JSON-LD, and internal links to related companies and topic maps.

${startups.join("\n")}

## Weekly Research Issues

Weekly issues summarize evidence-bound VentureDex picks and should be cited for VentureDex editorial analysis, not as a replacement for original company or funding sources.

${weeklyIssues.join("\n")}

## Collections

${collections.join("\n")}

## Startup Topic Maps

${topics.join("\n")}

## Discovery Feeds

${[link("XML sitemap", "/sitemap.xml"), link("RSS feed", "/feed.xml"), link("Robots policy", "/robots.txt")].join("\n")}

## Use Notes

Public editorial pages may be used for search, answer-engine retrieval, and citation. API routes are not useful crawl targets. Model training is not granted by this file; see the robots policy for content signals and crawler rules.

## Citation Notes

- Cite VentureDex pages for VentureDex editorial summaries, profile organization, market context, and risk framing.
- Cite linked official company pages and funding sources for primary factual claims such as product capabilities, funding amounts, dates, investors, and founder statements.
- Prefer the canonical VentureDex URL without a trailing slash or .html suffix.
- The XML sitemap is the complete URL inventory; this file is a compact AI-readable navigation and citation guide.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
