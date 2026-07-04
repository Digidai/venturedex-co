export const prerender = true;

import type { APIRoute } from "astro";
import { resolveInvestorSlugByName } from "../lib/brand-assets";
import {
  getContentCollectionBySlug,
  getContentCollections,
  getContentInvestors,
  getContentNewsEligibleFundingRounds,
  getContentStartups,
} from "../lib/content";
import { DEFAULT_SITE_URL, absoluteUrl, escapeXml, getSiteUrl, latestSitemapLastmod, sitemapLastmodDate } from "../lib/seo";
import { getTopicPages } from "../lib/topic-pages";
import { getPublishedWeeklyIssuesFromContent } from "../lib/weekly";

interface SitemapUrl {
  loc: string;
  lastmod?: string | null;
  priority?: string;
  images?: SitemapImage[];
}

interface SitemapImage {
  loc: string;
  title?: string | null;
  caption?: string | null;
}

interface StartupSitemapRow {
  slug: string;
  product_name: string;
  summary: string | null;
  screenshot_r2_key: string | null;
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

export const GET: APIRoute = () => {
  // Prerendered at build time: the site URL is fixed (astro.config `site`), so
  // there's no runtime SITE_URL binding to read here.
  const siteUrl = getSiteUrl(DEFAULT_SITE_URL);
  const weeklyIssues = getPublishedWeeklyIssuesFromContent(50);
  const latestWeeklyIssue = weeklyIssues[0] ?? null;
  const allStartups = getContentStartups();
  const topics = getTopicPages(allStartups, weeklyIssues);
  const rounds = getContentNewsEligibleFundingRounds();
  const latestStartupLastmod = latestSitemapLastmod(allStartups.map((startup) => startup.updated_at || startup.published_at));
  const latestFundingLastmod = latestSitemapLastmod(rounds.map((round) => round.date));
  const latestWeeklyLastmod = latestWeeklyIssue?.published_at ?? latestWeeklyIssue?.week_end ?? null;
  const latestTopicLastmod = latestSitemapLastmod([latestStartupLastmod, latestWeeklyLastmod]);

  let urls: SitemapUrl[] = [
    { loc: "/", lastmod: latestStartupLastmod, priority: "1.0" },
    { loc: "/investors", lastmod: latestFundingLastmod, priority: "0.8" },
    { loc: "/news", lastmod: latestFundingLastmod, priority: "0.8" },
    { loc: "/weekly", lastmod: latestWeeklyIssue?.published_at ?? latestWeeklyIssue?.week_end, priority: "0.8" },
    { loc: "/collections", lastmod: latestStartupLastmod, priority: "0.7" },
    { loc: "/topics", lastmod: latestTopicLastmod, priority: "0.8" },
    { loc: "/about", priority: "0.6" },
    { loc: "/editorial-policy", priority: "0.6" },
    { loc: "/subscribe", priority: "0.4" },
    { loc: "/sponsor", priority: "0.4" },
    { loc: "/llms.txt", lastmod: latestTopicLastmod, priority: "0.5" },
    { loc: "/llms-full.txt", lastmod: latestTopicLastmod, priority: "0.5" },
    { loc: "/ai-index.json", lastmod: latestTopicLastmod, priority: "0.5" },
  ].concat(
    weeklyIssues.map((issue) => ({
      loc: `/weekly/${issue.issue_number}`,
      lastmod: issue.published_at ?? issue.week_end,
      priority: "0.8",
    }))
  );

  // Mirror the prior D1 startups query: published, ORDER BY is_featured DESC,
  // published_at DESC.
  const startups: StartupSitemapRow[] = allStartups
    .map((startup) => ({
      slug: startup.slug,
      product_name: startup.product_name,
      summary: startup.summary,
      screenshot_r2_key: startup.screenshot_r2_key,
      updated_at: startup.updated_at,
      published_at: startup.published_at,
      is_featured: startup.is_featured,
    }))
    .sort((a, b) => {
      if (b.is_featured !== a.is_featured) return b.is_featured - a.is_featured;
      return (b.published_at ?? "").localeCompare(a.published_at ?? "");
    });

  const allInvestors = getContentInvestors();
  // Collections by slug (the prior query ordered ORDER BY slug). content has no
  // authored per-collection created_at, so lastmod is derived from member
  // profile publish/update dates. Membership changes are significant content
  // updates for these collection pages.
  const collections: CollectionSitemapRow[] = getContentCollections()
    .map((collection) => {
      const collectionStartups = getContentCollectionBySlug(collection.slug)?.startups ?? [];
      return {
        slug: collection.slug,
        created_at: latestSitemapLastmod(collectionStartups.map((startup) => startup.updated_at || startup.published_at)),
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));

  // Aggregate the most-recent round date per investor slug via the canonical
  // resolver, mirroring the investors index. Only investors with ≥1 tracked
  // round get a sitemap URL (those pages are noindex when empty).
  const investorLastmod = new Map<string, string | null>();
  for (const round of rounds) {
    const slug = resolveInvestorSlugByName(round.lead_investor);
    if (!slug) continue;
    const current = investorLastmod.get(slug) ?? null;
    if (round.date && (!current || round.date > current)) {
      investorLastmod.set(slug, round.date);
    } else if (!investorLastmod.has(slug)) {
      investorLastmod.set(slug, current);
    }
  }
  const investors: InvestorSitemapRow[] = allInvestors
    .filter((investor) => investorLastmod.has(investor.slug))
    .map((investor) => ({
      slug: investor.slug,
      lastmod: investorLastmod.get(investor.slug) ?? null,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  urls = urls.concat(
    startups.map((startup) => ({
      loc: `/startups/${startup.slug}`,
      lastmod: startup.updated_at ?? startup.published_at,
      priority: startup.is_featured ? "0.9" : "0.8",
      images: startup.screenshot_r2_key
        ? [
            {
              loc: `/screenshots/${startup.screenshot_r2_key}`,
              title: `${startup.product_name} screenshot`,
              caption: startup.summary,
            },
          ]
        : undefined,
    })),
    investors.map((investor) => ({
      loc: `/investors/${investor.slug}`,
      lastmod: investor.lastmod,
      priority: "0.7",
    })),
    collections.map((collection) => ({
      loc: `/collections/${collection.slug}`,
      lastmod: collection.created_at,
      priority: "0.7",
    })),
    topics.map((topic) => ({
      loc: topic.path,
      lastmod: topic.latestStartups[0]?.published_at ?? latestWeeklyIssue?.published_at ?? latestWeeklyIssue?.week_end,
      priority: "0.8",
    }))
  );

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
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
  const images = renderImages(url.images, siteUrl);

  return `  <url>
    <loc>${escapeXml(absoluteUrl(url.loc, siteUrl))}</loc>
${lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>\n` : ""}${url.priority ? `    <priority>${url.priority}</priority>\n` : ""}${images}  </url>`;
}

function renderImages(images: SitemapImage[] | undefined, siteUrl: string): string {
  if (!images?.length) return "";

  return images
    .map((image) => {
      const title = image.title ? `      <image:title>${escapeXml(image.title)}</image:title>\n` : "";
      const caption = image.caption ? `      <image:caption>${escapeXml(image.caption)}</image:caption>\n` : "";

      return `    <image:image>
      <image:loc>${escapeXml(absoluteUrl(image.loc, siteUrl))}</image:loc>
${title}${caption}    </image:image>
`;
    })
    .join("");
}

function formatLastmod(value?: string | null): string | null {
  return sitemapLastmodDate(value);
}
