export const prerender = false;

import type { APIRoute } from "astro";
import { getPublishedSites } from "../lib/db";

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.runtime.env.DB;
  const sites = await getPublishedSites(db, { limit: 20 });

  const items = sites
    .map(
      (site) => `    <item>
      <title>${escapeXml(site.product_name)}</title>
      <link>https://venturedex.co/sites/${site.slug}</link>
      <description>${escapeXml(site.summary ?? site.product_name)}</description>
      <pubDate>${new Date(site.published_at ?? site.created_at).toUTCString()}</pubDate>
      <guid>https://venturedex.co/sites/${site.slug}</guid>
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
