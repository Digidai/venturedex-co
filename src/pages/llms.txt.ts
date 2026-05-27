export const prerender = true;

import type { APIRoute } from "astro";
import { DEFAULT_SITE_URL, SITE_DESCRIPTION, SITE_NAME, absoluteUrl, getSiteUrl } from "../lib/seo";

export const GET: APIRoute = ({ site }) => {
  const siteUrl = getSiteUrl(site ?? DEFAULT_SITE_URL);
  const link = (label: string, path: string) => `- [${label}](${absoluteUrl(path, siteUrl)})`;

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
  ].join("\n")}

## Discovery Feeds

${[link("XML sitemap", "/sitemap.xml"), link("RSS feed", "/feed.xml"), link("Robots policy", "/robots.txt")].join("\n")}

## Use Notes

Public editorial pages may be used for search, answer-engine retrieval, and citation. API routes are not useful crawl targets. Model training is not granted by this file; see the robots policy for content signals and crawler rules.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
