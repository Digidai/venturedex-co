export const prerender = false;

import type { APIRoute } from "astro";
import { getPublishedStartups } from "../lib/db";
import { DEFAULT_SITE_URL, absoluteUrl, escapeXml, getSiteUrl } from "../lib/seo";

export const GET: APIRoute = async ({ locals }) => {
  const siteUrl = getSiteUrl(locals.runtime.env.SITE_URL ?? DEFAULT_SITE_URL);
  const db = locals.runtime.env.DB;
  const startups = await getPublishedStartups(db, { limit: 20 });

  const items = startups
    .map(
      (startup) => `    <item>
      <title>${escapeXml(startup.product_name)}</title>
      <link>${escapeXml(absoluteUrl(`/startups/${startup.slug}`, siteUrl))}</link>
      <description>${escapeXml(startup.summary ?? startup.product_name)}</description>
      <pubDate>${new Date(startup.published_at ?? startup.created_at).toUTCString()}</pubDate>
      <guid>${escapeXml(absoluteUrl(`/startups/${startup.slug}`, siteUrl))}</guid>
    </item>`
    )
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>VentureDex</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>A curated gallery of startups worth watching.</description>
    <language>en</language>
    <atom:link href="${escapeXml(absoluteUrl("/feed.xml", siteUrl))}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
