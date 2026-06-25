export const prerender = true;

import type { APIRoute } from "astro";
import { DEFAULT_SITE_URL, absoluteUrl, getSiteUrl } from "../lib/seo";

const SEARCH_AND_ANSWER_CRAWLERS = [
  "Googlebot",
  "Googlebot-Image",
  "Bingbot",
  "DuckDuckBot",
  "Applebot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-SearchBot",
  "Claude-User",
];

const TRAINING_CRAWLERS = [
  "Amazonbot",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "ClaudeBot",
  "CloudflareBrowserRenderingCrawler",
  "GPTBot",
  "Google-Extended",
  "meta-externalagent",
];

export const GET: APIRoute = ({ site }) => {
  const siteUrl = getSiteUrl(site ?? DEFAULT_SITE_URL);
  const allowCrawlerGroups = SEARCH_AND_ANSWER_CRAWLERS.map(
    (crawler) => `User-agent: ${crawler}
Allow: /
Disallow: /api/`
  ).join("\n\n");
  const trainingCrawlerGroups = TRAINING_CRAWLERS.map(
    (crawler) => `User-agent: ${crawler}
Disallow: /`
  ).join("\n\n");

  const body = `# VentureDex robots policy
# Public editorial pages are open for search, answer engines, and user-triggered citation fetchers.
# Training and model-ingestion crawlers are not required for search visibility, so they are opted out.
# Private API endpoints are not useful crawl targets.
# AI-readable navigation: ${absoluteUrl("/llms.txt", siteUrl)}
# Full LLM context: ${absoluteUrl("/llms-full.txt", siteUrl)}
# Structured AI index: ${absoluteUrl("/ai-index.json", siteUrl)}

User-agent: *
Allow: /
Disallow: /api/

${allowCrawlerGroups}

${trainingCrawlerGroups}

Sitemap: ${absoluteUrl("/sitemap.xml", siteUrl)}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
