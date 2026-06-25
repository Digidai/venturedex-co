import type {
  Collection,
  FundingRound,
  Investor,
  Startup,
} from "./types";
import { getCompanyBrandAsset, getInvestorBrandAsset } from "./brand-assets";
import { normalizeLinks, safeJsonParse } from "./json";
import type { TopicPage } from "./topic-pages";
import type { WeeklyIssueContent } from "./weekly";

export const DEFAULT_SITE_URL = "https://venturedex.co";
export const SITE_NAME = "VentureDex";
export const DEFAULT_SOCIAL_IMAGE = "/og-image.png";
export const SITE_DESCRIPTION =
  "A curated directory of startups worth watching, with editorial notes, funding signals, and investor context.";

export type JsonLdNode = Record<string, unknown>;

export function getSiteUrl(raw?: string | URL | null): string {
  const value = raw?.toString() ?? DEFAULT_SITE_URL;
  return value.replace(/\/+$/, "");
}

export function absoluteUrl(pathOrUrl: string | URL | null | undefined, siteUrl = DEFAULT_SITE_URL): string {
  if (!pathOrUrl) return getSiteUrl(siteUrl);

  const value = pathOrUrl.toString();
  if (/^https?:\/\//i.test(value)) return value;

  const base = getSiteUrl(siteUrl);
  return `${base}${value.startsWith("/") ? value : `/${value}`}`;
}

export function normalizeExternalUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)
    ? trimmed
    : trimmed.startsWith("//")
      ? `https:${trimmed}`
      : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function canonicalPath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";

  const normalized = pathname
    .replace(/\/index\.html$/i, "/")
    .replace(/\/index$/i, "/")
    .replace(/\.html$/i, "");

  if (!normalized || normalized === "/") return "/";
  return normalized.replace(/\/+$/, "");
}

export function cleanText(value?: string | null, fallback = ""): string {
  return (value ?? fallback).replace(/\s+/g, " ").trim();
}

export function truncateText(value: string, maxLength = 160): string {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;

  const sliced = text.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  return `${sliced.slice(0, lastSpace > 80 ? lastSpace : sliced.length).trim()}...`;
}

export function expandSeoDescription(
  value: string | null | undefined,
  context: string,
  fallback: string,
  minLength = 100
): string {
  const primary = cleanText(value, fallback);
  if (primary.length >= minLength) return truncateText(primary);
  return truncateText(`${primary} ${cleanText(context)}`);
}

export function collectionResearchSummary(collection: Collection): string {
  return cleanText([
    collection.description,
    collection.intro,
    collection.search_intent,
    collection.why_now,
  ].filter(Boolean).join(" "), "Browse related VentureDex startup profiles with funding signals, product context, and editorial notes.");
}

export function collectionSeoDescription(collection: Collection): string {
  return expandSeoDescription(
    collection.description,
    cleanText([
      collection.intro,
      collection.search_intent,
      collection.why_now,
    ].filter(Boolean).join(" ")),
    `${collection.title} on ${SITE_NAME}.`
  );
}

export function toIsoDateTime(value?: string | null): string | undefined {
  if (!value) return undefined;

  const normalized = value.includes("T")
    ? value
    : value.includes(" ")
      ? `${value.replace(" ", "T")}Z`
      : `${value}T00:00:00Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function escapeMarkdown(value: string): string {
  return cleanText(value).replace(/([\\`*_{}\[\]()#+!|>])/g, "\\$1");
}

export function splitCsv(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function buildJsonLdGraph(nodes: JsonLdNode[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@graph": nodes,
  };
}

export function siteOrganization(siteUrl = DEFAULT_SITE_URL): JsonLdNode {
  const url = getSiteUrl(siteUrl);
  return {
    "@type": "Organization",
    "@id": `${url}/#organization`,
    name: SITE_NAME,
    url,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/favicon.svg", url),
      width: 64,
      height: 64,
    },
    image: absoluteUrl(DEFAULT_SOCIAL_IMAGE, url),
    description: SITE_DESCRIPTION,
  };
}

export function siteWebSite(siteUrl = DEFAULT_SITE_URL): JsonLdNode {
  const url = getSiteUrl(siteUrl);
  return {
    "@type": "WebSite",
    "@id": `${url}/#website`,
    name: SITE_NAME,
    url,
    description: SITE_DESCRIPTION,
    inLanguage: "en",
    publisher: { "@id": `${url}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: `${url}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbList(items: { name: string; path: string }[], siteUrl = DEFAULT_SITE_URL): JsonLdNode {
  const url = absoluteUrl(items[items.length - 1]?.path ?? "/", siteUrl);

  return {
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path, siteUrl),
    })),
  };
}

export function webPageNode(input: {
  path: string;
  title: string;
  description: string;
  type?: string;
  image?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
  mainEntityId?: string;
  siteUrl?: string;
}): JsonLdNode {
  const siteUrl = getSiteUrl(input.siteUrl);
  const url = absoluteUrl(input.path, siteUrl);
  const node: JsonLdNode = {
    "@type": input.type ?? "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: input.title,
    description: input.description,
    inLanguage: "en",
    isPartOf: { "@id": `${siteUrl}/#website` },
    about: input.mainEntityId ? { "@id": input.mainEntityId } : undefined,
    mainEntity: input.mainEntityId ? { "@id": input.mainEntityId } : undefined,
    primaryImageOfPage: input.image ? { "@type": "ImageObject", url: absoluteUrl(input.image, siteUrl) } : undefined,
    publisher: { "@id": `${siteUrl}/#organization` },
    datePublished: toIsoDateTime(input.datePublished),
    dateModified: toIsoDateTime(input.dateModified),
  };

  return stripUndefined(node);
}

export function itemListNode(
  items: { name: string; path: string; description?: string | null }[],
  siteUrl = DEFAULT_SITE_URL
): JsonLdNode {
  return {
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) =>
      stripUndefined({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(item.path, siteUrl),
        name: item.name,
        description: item.description ?? undefined,
      })
    ),
  };
}

export function startupJsonLd(startup: Startup, siteUrl = DEFAULT_SITE_URL): JsonLdNode {
  const pagePath = `/startups/${startup.slug}`;
  const pageUrl = absoluteUrl(pagePath, siteUrl);
  const description = truncateText(startup.summary ?? startup.editor_note ?? `${startup.product_name} on ${SITE_NAME}`);
  const links = safeJsonParse(startup.links_json, normalizeLinks) ?? {};
  const sameAs = [links.github, links.twitter, links.linkedin, links.producthunt]
    .map(normalizeExternalUrl)
    .filter((url): url is string => Boolean(url));
  const tags = splitCsv(startup.tags);
  const investors = splitCsv(startup.investors);
  const screenshotUrl = startup.screenshot_r2_key ? `/screenshots/${startup.screenshot_r2_key}` : null;
  const logoUrl = getCompanyBrandAsset(startup.slug)?.local_path ?? null;
  const officialUrl = normalizeExternalUrl(startup.canonical_url) ?? normalizeExternalUrl(startup.domain);
  const organizationId = `${pageUrl}#organization`;

  return buildJsonLdGraph([
    siteOrganization(siteUrl),
    siteWebSite(siteUrl),
    webPageNode({
      path: pagePath,
      title: startup.product_name,
      description,
      image: screenshotUrl,
      datePublished: startup.published_at,
      dateModified: startup.updated_at,
      mainEntityId: organizationId,
      siteUrl,
    }),
    breadcrumbList(
      [
        { name: "Explore", path: "/" },
        { name: startup.product_name, path: pagePath },
      ],
      siteUrl
    ),
    stripUndefined({
      "@type": "Organization",
      "@id": organizationId,
      name: startup.product_name,
      url: officialUrl ?? pageUrl,
      description,
      mainEntityOfPage: { "@id": `${pageUrl}#webpage` },
      foundingDate: startup.founded_year ? String(startup.founded_year) : undefined,
      location: startup.hq_location ? { "@type": "Place", name: startup.hq_location } : undefined,
      image: screenshotUrl ? absoluteUrl(screenshotUrl, siteUrl) : undefined,
      logo: logoUrl ? { "@type": "ImageObject", url: absoluteUrl(logoUrl, siteUrl) } : undefined,
      founder: startup.founder_name ? { "@type": "Person", name: startup.founder_name } : undefined,
      sameAs: sameAs.length > 0 ? sameAs : undefined,
      keywords: tags.length > 0 ? tags.join(", ") : undefined,
      knowsAbout: tags.length > 0 ? tags : undefined,
      funder: investors.length > 0 ? investors.map((name) => ({ "@type": "Organization", name })) : undefined,
    }),
  ]);
}

export function investorJsonLd(
  investor: Investor,
  rounds: FundingRound[],
  siteUrl = DEFAULT_SITE_URL
): JsonLdNode {
  const pagePath = `/investors/${investor.slug}`;
  const pageUrl = absoluteUrl(pagePath, siteUrl);
  const description = expandSeoDescription(
    investor.description,
    "Browse VentureDex-tracked startup funding activity, portfolio companies, and source-backed company context.",
    `${investor.name} portfolio companies tracked by ${SITE_NAME}.`
  );
  const websiteUrl = normalizeExternalUrl(investor.website);
  const organizationId = `${pageUrl}#organization`;
  const logo = getInvestorBrandAsset(investor.slug);

  return buildJsonLdGraph([
    siteOrganization(siteUrl),
    siteWebSite(siteUrl),
    webPageNode({
      path: pagePath,
      title: investor.name,
      description,
      mainEntityId: organizationId,
      siteUrl,
    }),
    breadcrumbList(
      [
        { name: "Home", path: "/" },
        { name: "Investors", path: "/investors" },
        { name: investor.name, path: pagePath },
      ],
      siteUrl
    ),
    stripUndefined({
      "@type": "Organization",
      "@id": organizationId,
      name: investor.name,
      alternateName: investor.short_name ?? undefined,
      url: websiteUrl ?? pageUrl,
      description,
      mainEntityOfPage: { "@id": `${pageUrl}#webpage` },
      logo: logo ? { "@type": "ImageObject", url: absoluteUrl(logo.local_path, siteUrl) } : undefined,
      subjectOf: rounds.length > 0 ? rounds.slice(0, 10).map((round) => ({
        "@type": "NewsArticle",
        headline: [
          round.company_name,
          round.amount,
          round.stage,
          investor.name,
        ].filter(Boolean).join(" "),
        datePublished: toIsoDateTime(round.date),
        url: round.source_url ? absoluteUrl(round.source_url, siteUrl) : pageUrl,
        publisher: round.source_name ? { "@type": "Organization", name: round.source_name } : undefined,
        about: { "@type": "Organization", name: round.company_name },
      })) : undefined,
    }),
    itemListNode(
      rounds.slice(0, 50).map((round) => ({
        name: round.company_name,
        path: round.company_slug ? `/startups/${round.company_slug}` : pagePath,
        description: [round.amount, round.stage, round.date, round.source_name].filter(Boolean).join(" - "),
      })),
      siteUrl
    ),
  ]);
}

export function collectionJsonLd(
  collection: Collection,
  startups: Startup[],
  siteUrl = DEFAULT_SITE_URL
): JsonLdNode {
  const pagePath = `/collections/${collection.slug}`;
  const description = collectionSeoDescription(collection);

  return buildJsonLdGraph([
    siteOrganization(siteUrl),
    siteWebSite(siteUrl),
    webPageNode({
      path: pagePath,
      title: collection.title,
      description,
      type: "CollectionPage",
      siteUrl,
    }),
    breadcrumbList(
      [
        { name: "Home", path: "/" },
        { name: "Collections", path: "/collections" },
        { name: collection.title, path: pagePath },
      ],
      siteUrl
    ),
    itemListNode(
      startups.map((startup) => ({
        name: startup.product_name,
        path: `/startups/${startup.slug}`,
        description: startup.summary,
      })),
      siteUrl
    ),
  ]);
}

export function topicPageJsonLd(topic: TopicPage, siteUrl = DEFAULT_SITE_URL): JsonLdNode {
  const description = expandSeoDescription(
    topic.description,
    topic.searchIntent,
    `${topic.title} on ${SITE_NAME}.`
  );

  return buildJsonLdGraph([
    siteOrganization(siteUrl),
    siteWebSite(siteUrl),
    webPageNode({
      path: topic.path,
      title: topic.title,
      description,
      type: "CollectionPage",
      siteUrl,
    }),
    breadcrumbList(
      [
        { name: "Home", path: "/" },
        { name: "Topics", path: "/topics" },
        { name: topic.title, path: topic.path },
      ],
      siteUrl
    ),
    itemListNode(
      topic.startups.map((startup) => ({
        name: startup.product_name,
        path: `/startups/${startup.slug}`,
        description: startup.summary,
      })),
      siteUrl
    ),
  ]);
}

export function homeJsonLd(startups: Startup[], siteUrl = DEFAULT_SITE_URL): JsonLdNode {
  const url = getSiteUrl(siteUrl);
  return buildJsonLdGraph([
    siteOrganization(siteUrl),
    siteWebSite(siteUrl),
    webPageNode({
      path: "/",
      title: "Explore",
      description: "Discover curated startup profiles with editorial notes, funding signals, investor context, and canonical company links.",
      type: "CollectionPage",
      siteUrl,
    }),
    itemListNode(
      startups.slice(0, 50).map((startup) => ({
        name: startup.product_name,
        path: `/startups/${startup.slug}`,
        description: startup.summary,
      })),
      siteUrl
    ),
    stripUndefined({
      "@type": "Dataset",
      "@id": `${url}/#startup-research-dataset`,
      name: "VentureDex startup research index",
      description: "Source-backed startup profiles, editorial notes, funding signals, investor context, topic maps, and collection metadata published by VentureDex.",
      url,
      inLanguage: "en",
      isAccessibleForFree: true,
      creator: { "@id": `${url}/#organization` },
      publisher: { "@id": `${url}/#organization` },
      mainEntityOfPage: { "@id": `${url}/#webpage` },
      conditionsOfAccess: "Public editorial pages may be used for search, answer-engine retrieval, and citation. Model training permission is governed by robots.txt.",
      distribution: [
        {
          "@type": "DataDownload",
          name: "VentureDex full LLM context",
          encodingFormat: "text/markdown",
          contentUrl: absoluteUrl("/llms-full.txt", siteUrl),
        },
        {
          "@type": "DataDownload",
          name: "VentureDex structured AI index",
          encodingFormat: "application/json",
          contentUrl: absoluteUrl("/ai-index.json", siteUrl),
        },
        {
          "@type": "DataDownload",
          name: "VentureDex RSS feed",
          encodingFormat: "application/rss+xml",
          contentUrl: absoluteUrl("/feed.xml", siteUrl),
        },
      ],
    }),
  ]);
}

export function newsJsonLd(rounds: FundingRound[], siteUrl = DEFAULT_SITE_URL): JsonLdNode {
  const articleNodes = rounds.slice(0, 25).map((round) =>
    stripUndefined({
      "@type": "NewsArticle",
      "@id": `${absoluteUrl(round.company_slug ? `/startups/${round.company_slug}` : "/news", siteUrl)}#funding-${round.id}`,
      headline: [
        round.company_name,
        round.amount,
        round.stage,
        round.lead_investor ? `led by ${round.lead_investor}` : null,
      ].filter(Boolean).join(" "),
      datePublished: toIsoDateTime(round.date),
      mainEntityOfPage: { "@id": `${absoluteUrl("/news", siteUrl)}#webpage` },
      url: round.source_url ? absoluteUrl(round.source_url, siteUrl) : absoluteUrl("/news", siteUrl),
      isPartOf: { "@id": `${absoluteUrl("/news", siteUrl)}#webpage` },
      publisher: round.source_name ? { "@type": "Organization", name: round.source_name } : { "@id": `${getSiteUrl(siteUrl)}/#organization` },
      about: { "@type": "Organization", name: round.company_name },
      funder: round.lead_investor ? { "@type": "Organization", name: round.lead_investor } : undefined,
      description: [round.amount, round.stage, round.lead_investor, round.source_name].filter(Boolean).join(" - "),
    })
  );

  return buildJsonLdGraph([
    siteOrganization(siteUrl),
    siteWebSite(siteUrl),
    webPageNode({
      path: "/news",
      title: "News",
      description: "Recent funding rounds with verified press sources and official company and investor logos.",
      type: "CollectionPage",
      siteUrl,
    }),
    itemListNode(
      rounds.slice(0, 50).map((round) => ({
        name: `${round.company_name} ${round.stage}`,
        path: round.company_slug ? `/startups/${round.company_slug}` : "/news",
        description: [round.amount, round.lead_investor, round.source_name].filter(Boolean).join(" - "),
      })),
      siteUrl
    ),
    ...articleNodes,
  ]);
}

export function weeklyIndexJsonLd(issues: WeeklyIssueContent[], siteUrl = DEFAULT_SITE_URL): JsonLdNode {
  const description = "Weekly evidence-bound VentureDex research notes on startups, products, and funding context.";

  return buildJsonLdGraph([
    siteOrganization(siteUrl),
    siteWebSite(siteUrl),
    webPageNode({
      path: "/weekly",
      title: "Weekly Picks",
      description,
      type: "CollectionPage",
      siteUrl,
    }),
    itemListNode(
      issues.map((issue) => ({
        name: issue.title,
        path: `/weekly/${issue.issue_number}`,
        description: issue.research_summary || issue.editorial_intro,
      })),
      siteUrl
    ),
  ]);
}

export function weeklyIssueJsonLd(
  issue: WeeklyIssueContent,
  startups: Startup[],
  siteUrl = DEFAULT_SITE_URL
): JsonLdNode {
  const pagePath = `/weekly/${issue.issue_number}`;
  const description = truncateText(issue.research_summary || issue.editorial_intro || `${SITE_NAME} Weekly #${issue.issue_number}`);

  return buildJsonLdGraph([
    siteOrganization(siteUrl),
    siteWebSite(siteUrl),
    webPageNode({
      path: pagePath,
      title: issue.title,
      description,
      type: "Article",
      datePublished: issue.published_at,
      dateModified: issue.published_at ?? issue.week_end,
      siteUrl,
    }),
    breadcrumbList(
      [
        { name: "Home", path: "/" },
        { name: "Weekly", path: "/weekly" },
        { name: `Issue #${issue.issue_number}`, path: pagePath },
      ],
      siteUrl
    ),
    stripUndefined({
      "@type": "Article",
      "@id": `${absoluteUrl(pagePath, siteUrl)}#article`,
      headline: issue.title,
      description,
      datePublished: toIsoDateTime(issue.published_at),
      dateModified: toIsoDateTime(issue.published_at ?? issue.week_end),
      author: { "@id": `${getSiteUrl(siteUrl)}/#organization` },
      publisher: { "@id": `${getSiteUrl(siteUrl)}/#organization` },
      mainEntityOfPage: { "@id": `${absoluteUrl(pagePath, siteUrl)}#webpage` },
      about: startups.slice(0, 10).map((startup) =>
        stripUndefined({
          "@type": "Organization",
          name: startup.product_name,
          url: absoluteUrl(`/startups/${startup.slug}`, siteUrl),
          description: startup.summary ?? undefined,
        })
      ),
    }),
    itemListNode(
      startups.map((startup) => ({
        name: startup.product_name,
        path: `/startups/${startup.slug}`,
        description: startup.summary,
      })),
      siteUrl
    ),
  ]);
}

export function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }

  return value;
}
