export const prerender = false;

import type { APIRoute } from "astro";
import { DEFAULT_SITE_URL, absoluteUrl, escapeXml, getSiteUrl } from "../lib/seo";

interface SitemapUrl {
  loc: string;
  lastmod?: string | null;
  priority?: string;
}

interface StartupSitemapRow {
  slug: string;
  updated_at: string | null;
  published_at: string | null;
  is_featured: number;
}

interface InvestorSitemapRow {
  slug: string;
  lastmod: string | null;
}

interface CollectionSitemapRow {
  slug: string;
  created_at: string | null;
}

interface WeeklySitemapRow {
  issue_number: number;
  published_at: string | null;
}

export const GET: APIRoute = async ({ locals }) => {
  const siteUrl = getSiteUrl(locals.runtime.env.SITE_URL ?? DEFAULT_SITE_URL);
  const db = locals.runtime.env.DB;

  let urls: SitemapUrl[] = [
    { loc: "/", priority: "1.0" },
    { loc: "/startups", priority: "0.8" },
    { loc: "/investors", priority: "0.8" },
    { loc: "/news", priority: "0.8" },
    { loc: "/collections", priority: "0.7" },
    { loc: "/weekly", priority: "0.7" },
    { loc: "/about", priority: "0.6" },
    { loc: "/editorial-policy", priority: "0.6" },
    { loc: "/subscribe", priority: "0.4" },
    { loc: "/sponsor", priority: "0.4" },
  ];

  try {
    const [startups, investors, collections, issues] = await Promise.all([
      db
        .prepare(
          `SELECT slug, updated_at, published_at, is_featured
           FROM startups
           WHERE workflow_status = 'published'
           ORDER BY is_featured DESC, published_at DESC`
        )
        .all<StartupSitemapRow>(),
      db
        .prepare(
          `SELECT i.slug, MAX(f.date) AS lastmod
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
           GROUP BY i.slug
           ORDER BY i.slug`
        )
        .all<InvestorSitemapRow>(),
      db
        .prepare(
          `SELECT slug, created_at
           FROM collections
           WHERE published = 1
           ORDER BY slug`
        )
        .all<CollectionSitemapRow>(),
      db
        .prepare(
          `SELECT issue_number, published_at
           FROM weekly_issues
           WHERE status = 'published'
           ORDER BY issue_number DESC`
        )
        .all<WeeklySitemapRow>(),
    ]);

    urls = urls.concat(
      startups.results.map((startup) => ({
        loc: `/startups/${startup.slug}`,
        lastmod: startup.updated_at ?? startup.published_at,
        priority: startup.is_featured ? "0.9" : "0.8",
      })),
      investors.results.map((investor) => ({
        loc: `/investors/${investor.slug}`,
        lastmod: investor.lastmod,
        priority: "0.7",
      })),
      collections.results.map((collection) => ({
        loc: `/collections/${collection.slug}`,
        lastmod: collection.created_at,
        priority: "0.7",
      })),
      issues.results.map((issue) => ({
        loc: `/weekly/${issue.issue_number}`,
        lastmod: issue.published_at,
        priority: "0.6",
      }))
    );
  } catch (error) {
    console.error("Failed to build sitemap from D1", error);
    return new Response("Failed to build sitemap from live content.", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => renderUrl(url, siteUrl)).join("\n")}
</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};

function renderUrl(url: SitemapUrl, siteUrl: string): string {
  const lastmod = formatLastmod(url.lastmod);

  return `  <url>
    <loc>${escapeXml(absoluteUrl(url.loc, siteUrl))}</loc>
${lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>\n` : ""}${url.priority ? `    <priority>${url.priority}</priority>\n` : ""}  </url>`;
}

function formatLastmod(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.includes("T")
    ? value
    : value.includes(" ")
      ? `${value.replace(" ", "T")}Z`
      : `${value}T00:00:00Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
