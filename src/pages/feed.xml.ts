export const prerender = true;

import type { APIRoute } from "astro";
import { getContentStartups } from "../lib/content";

export const GET: APIRoute = () => {
  // Mirror getPublishedStartups(sort: "newest", limit: 30): published startups
  // ordered by published_at DESC.
  const startups = getContentStartups()
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .slice(0, 30);

  const lastBuildDate = (
    startups.length
      ? new Date(startups[0].published_at ?? startups[0].created_at)
      : new Date()
  ).toUTCString();

  const items = startups
    .map(
      (startup) => `    <item>
      <title>${escapeXml(startup.product_name)}</title>
      <link>https://venturedex.co/startups/${startup.slug}</link>
      <description>${escapeXml(startup.summary ?? startup.product_name)}</description>
      <pubDate>${new Date(startup.published_at ?? startup.created_at).toUTCString()}</pubDate>
      <guid>https://venturedex.co/startups/${startup.slug}</guid>
    </item>`
    )
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>VentureDex</title>
    <link>https://venturedex.co</link>
    <description>A curated gallery of startups worth watching.</description>
    <language>en</language>
    <atom:link href="https://venturedex.co/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
