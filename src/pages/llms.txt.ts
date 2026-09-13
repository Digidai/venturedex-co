export const prerender = true;

import type { APIRoute } from "astro";
import { DEFAULT_SITE_URL, SITE_DESCRIPTION, SITE_NAME, absoluteUrl, getSiteUrl } from "../lib/seo";
import { getResearchBriefs, researchBriefPath } from "../lib/research-briefs";

export const GET: APIRoute = ({ site }) => {
  const siteUrl = getSiteUrl(site ?? DEFAULT_SITE_URL);
  const link = (label: string, path: string) => `- [${label}](${absoluteUrl(path, siteUrl)})`;
  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

VentureDex organizes public product evidence, funding signals, investor context, source links, and editorial startup research. This file is a navigation guide, not the full corpus.

## Retrieve a Startup

${link("Compact startup resource index", "/startup-index.json")}
${link("Recent startup publication and update feed", "/changes.json")}

Find a company in the startup index, then fetch its json or markdown URL. Each resource links to the canonical HTML profile and preserves research source IDs, statement-to-source mappings, and the recorded review date. Metadata, source-linked statements, and VentureDex editorial assessments are distinguished. Cite the HTML profile; cite original sources for factual claims.

The changes feed contains the latest 50 recorded publication or distinct update events for current profiles. It is not a complete history or deletion log. Use the startup index to reconcile inventory after a gap. A research review date is not evidence of a new publication or update.

## Research and Discovery

${[
    link("Explore startups", "/"),
    link("Complete filterable startup directory", "/directory"),
    link("Startup categories by industry, funding stage, and region", "/categories"),
    link("Startup topic maps", "/topics"),
    link("Collections", "/collections"),
    link("Startup investors", "/investors"),
    link("Funding news", "/news"),
    link("Weekly startup research", "/weekly"),
    link("Research methodology", "/research"),
  ].join("\n")}

## Original Research Briefs

${getResearchBriefs().map((brief) => link(brief.title, researchBriefPath(brief))).join("\n")}

Append .json or .md to a brief URL for a single-document representation with the same source ledger. Findings and proposed evaluation questions are editorial analysis, not independently measured product outcomes. Brief review dates do not reset company-profile review dates.

## Product Launch Pages

${link("Product launch directory", "/launches")}
${link("Structured product launch index", "/launches.json")}

Launch inclusion is a product signal, not a VentureDex endorsement, funding claim, or adoption claim.

## Full Corpus and Site Policies

${[
    link("Full LLM context (large Markdown corpus)", "/llms-full.txt"),
    link("Structured AI index (large cross-site corpus)", "/ai-index.json"),
    link("XML sitemap", "/sitemap.xml"),
    link("RSS feed", "/feed.xml"),
    link("Editorial policy", "/editorial-policy"),
    link("About VentureDex", "/about"),
    link("Robots policy", "/robots.txt"),
  ].join("\n")}

## Use and Citation Notes

- Public editorial pages may be used for search, answer-engine retrieval, and citation. API routes are not useful crawl targets. Model training is not granted by this file; see the robots policy for content signals and crawler rules.
- Cite VentureDex pages for VentureDex editorial summaries, profile organization, market context, and risk framing.
- Cite linked official company pages and funding sources for primary factual claims such as product capabilities, funding amounts, dates, investors, and founder statements.
- Prefer the canonical VentureDex HTML URL without a trailing slash or .html suffix.
- Single-startup resources are the smallest retrieval unit. The full-context and cross-site index files remain available for applications that need the entire corpus.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
