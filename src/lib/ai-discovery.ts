import { normalizeLinks, normalizeResearch, safeJsonParse } from "./json";
import {
  DEFAULT_SITE_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  absoluteUrl,
  cleanText,
  collectionResearchSummary,
  escapeMarkdown,
  getSiteUrl,
  normalizeExternalUrl,
  splitCsv,
  truncateText,
} from "./seo";
import type { TopicPage } from "./topic-pages";
import type { Collection, FundingRound, Startup, StartupResearch } from "./types";
import type { WeeklyIssueContent } from "./weekly";

export interface AiDiscoverySource {
  label: string;
  type: string;
  url: string;
}

export interface AiDiscoveryStartup {
  name: string;
  slug: string;
  url: string;
  official_url?: string;
  domain: string;
  summary?: string;
  editorial_note?: string;
  product_type?: string;
  funding_stage?: string;
  funding_display?: string;
  latest_funding?: {
    amount?: string;
    stage: string;
    date?: string;
    lead_investor?: string;
    source_url?: string;
  };
  investors: string[];
  tags: string[];
  region?: string;
  published_at?: string;
  updated_at?: string;
  market_context?: StartupResearch["market_context"];
  evidence: string[];
  risks: string[];
  sources: AiDiscoverySource[];
}

export interface AiDiscoveryIndex {
  schema_version: "2026-06-25";
  site: {
    name: string;
    url: string;
    description: string;
    language: "en";
    canonical_policy: string;
    ai_use_policy: {
      allowed: string[];
      not_granted: string[];
    };
    discovery: {
      llms_txt: string;
      llms_full_txt: string;
      ai_index_json: string;
      sitemap_xml: string;
      rss_feed: string;
      robots_txt: string;
      editorial_policy: string;
    };
  };
  generated_from_content_at: string | null;
  counts: {
    startups: number;
    weekly_issues: number;
    topics: number;
    collections: number;
  };
  citation_policy: string[];
  routes: {
    startups: string;
    weekly: string;
    topics: string;
    collections: string;
    investors: string;
    news: string;
  };
  startups: AiDiscoveryStartup[];
  weekly_issues: Array<{
    issue_number: number;
    title: string;
    url: string;
    published_at?: string;
    summary: string;
    picks: string[];
  }>;
  topics: Array<{
    title: string;
    slug: string;
    url: string;
    description: string;
    startup_count: number;
    generated_from: {
      product_types: string[];
      tags: string[];
    };
  }>;
  collections: Array<{
    title: string;
    slug: string;
    url: string;
    description: string;
    startup_count: number;
  }>;
}

export function buildAiDiscoveryIndex(input: {
  siteUrl?: string | URL | null;
  startups: Startup[];
  fundingRounds: FundingRound[];
  weeklyIssues: WeeklyIssueContent[];
  topics: TopicPage[];
  collections: Array<Collection & { startup_count: number }>;
}): AiDiscoveryIndex {
  const siteUrl = getSiteUrl(input.siteUrl ?? DEFAULT_SITE_URL);
  const fundingBySlug = fundingRoundsByStartup(input.fundingRounds);
  const startups = input.startups
    .slice()
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "") || a.product_name.localeCompare(b.product_name))
    .map((startup) => startupEntry(startup, fundingBySlug.get(startup.slug) ?? [], siteUrl));

  return {
    schema_version: "2026-06-25",
    site: {
      name: SITE_NAME,
      url: siteUrl,
      description: SITE_DESCRIPTION,
      language: "en",
      canonical_policy: "Use https://venturedex.co canonical URLs without trailing slashes or .html suffixes.",
      ai_use_policy: {
        allowed: [
          "search indexing",
          "answer-engine retrieval",
          "user-triggered citation fetches",
          "summaries that cite the canonical VentureDex page",
        ],
        not_granted: [
          "model training permission",
          "republication of full VentureDex pages without citation",
          "treating VentureDex editorial summaries as primary sources for funding facts",
        ],
      },
      discovery: {
        llms_txt: absoluteUrl("/llms.txt", siteUrl),
        llms_full_txt: absoluteUrl("/llms-full.txt", siteUrl),
        ai_index_json: absoluteUrl("/ai-index.json", siteUrl),
        sitemap_xml: absoluteUrl("/sitemap.xml", siteUrl),
        rss_feed: absoluteUrl("/feed.xml", siteUrl),
        robots_txt: absoluteUrl("/robots.txt", siteUrl),
        editorial_policy: absoluteUrl("/editorial-policy", siteUrl),
      },
    },
    generated_from_content_at: latestContentTimestamp(input.startups, input.weeklyIssues, input.fundingRounds),
    counts: {
      startups: input.startups.length,
      weekly_issues: input.weeklyIssues.length,
      topics: input.topics.length,
      collections: input.collections.length,
    },
    citation_policy: [
      "Cite VentureDex for editorial summaries, profile organization, market context, and risk framing.",
      "Cite linked official company pages and funding sources for primary factual claims.",
      "Prefer the canonical VentureDex URL without tracking parameters, trailing slashes, or .html suffixes.",
    ],
    routes: {
      startups: absoluteUrl("/", siteUrl),
      weekly: absoluteUrl("/weekly", siteUrl),
      topics: absoluteUrl("/topics", siteUrl),
      collections: absoluteUrl("/collections", siteUrl),
      investors: absoluteUrl("/investors", siteUrl),
      news: absoluteUrl("/news", siteUrl),
    },
    startups,
    weekly_issues: input.weeklyIssues
      .slice()
      .sort((a, b) => b.issue_number - a.issue_number)
      .map((issue) => ({
        issue_number: issue.issue_number,
        title: issue.title,
        url: absoluteUrl(`/weekly/${issue.issue_number}`, siteUrl),
        published_at: issue.published_at ?? undefined,
        summary: cleanText(issue.research_summary || issue.editorial_intro || "Weekly VentureDex startup research."),
        picks: issue.picks.map((pick) => pick.slug).filter(Boolean),
      })),
    topics: input.topics
      .slice()
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((topic) => ({
        title: topic.title,
        slug: topic.slug,
        url: absoluteUrl(topic.path, siteUrl),
        description: cleanText([topic.description, topic.searchIntent].join(" ")),
        startup_count: topic.startups.length,
        generated_from: {
          product_types: topic.generatedFrom.productTypes,
          tags: topic.generatedFrom.tags,
        },
      })),
    collections: input.collections
      .slice()
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((collection) => ({
        title: collection.title,
        slug: collection.slug,
        url: absoluteUrl(`/collections/${collection.slug}`, siteUrl),
        description: collectionResearchSummary(collection),
        startup_count: collection.startup_count,
      })),
  };
}

export function renderLlmsFullText(index: AiDiscoveryIndex): string {
  const lines: string[] = [
    `# ${index.site.name} Full LLM Context`,
    "",
    `> ${index.site.description}`,
    "",
    `Canonical site: ${index.site.url}`,
    `Generated from content timestamp: ${index.generated_from_content_at ?? "unknown"}`,
    "",
    "## How To Use This File",
    "",
    "- Use this file as a compact retrieval context for VentureDex startup research.",
    "- Cite VentureDex URLs for VentureDex editorial summaries, market framing, and source organization.",
    "- Cite linked official company and funding sources for primary factual claims.",
    "- This file does not grant model training rights; see robots.txt and the editorial policy.",
    "",
    "## Discovery Files",
    "",
    `- [llms.txt](${index.site.discovery.llms_txt})`,
    `- [AI index JSON](${index.site.discovery.ai_index_json})`,
    `- [XML sitemap](${index.site.discovery.sitemap_xml})`,
    `- [RSS feed](${index.site.discovery.rss_feed})`,
    `- [Robots policy](${index.site.discovery.robots_txt})`,
    `- [Editorial policy](${index.site.discovery.editorial_policy})`,
    "",
    "## Inventory",
    "",
    `- Startup profiles: ${index.counts.startups}`,
    `- Weekly issues: ${index.counts.weekly_issues}`,
    `- Topic maps: ${index.counts.topics}`,
    `- Collections: ${index.counts.collections}`,
    "",
    "## Collections",
    "",
  ];

  for (const collection of index.collections) {
    lines.push(
      `### ${escapeMarkdown(collection.title)}`,
      "",
      `- URL: ${collection.url}`,
      `- Startup profiles: ${collection.startup_count}`,
      `- Context: ${escapeMarkdown(truncateText(collection.description, 500))}`,
      ""
    );
  }

  lines.push("## Topic Maps", "");
  for (const topic of index.topics) {
    lines.push(
      `### ${escapeMarkdown(topic.title)}`,
      "",
      `- URL: ${topic.url}`,
      `- Startup profiles: ${topic.startup_count}`,
      `- Context: ${escapeMarkdown(truncateText(topic.description, 500))}`,
      `- Generated from product types: ${topic.generated_from.product_types.map(escapeMarkdown).join(", ") || "none"}`,
      `- Generated from tags: ${topic.generated_from.tags.map(escapeMarkdown).join(", ") || "none"}`,
      ""
    );
  }

  lines.push("## Weekly Issues", "");
  for (const issue of index.weekly_issues) {
    lines.push(...compactLines(
      `### Weekly #${issue.issue_number}: ${escapeMarkdown(issue.title)}`,
      "",
      `- URL: ${issue.url}`,
      issue.published_at ? `- Published: ${issue.published_at}` : null,
      `- Summary: ${escapeMarkdown(truncateText(issue.summary, 700))}`,
      issue.picks.length > 0 ? `- Picks: ${issue.picks.map(escapeMarkdown).join(", ")}` : null,
      ""
    ));
  }

  lines.push("## Complete Startup Profiles", "");
  for (const startup of index.startups) {
    lines.push(...compactLines(
      `### ${escapeMarkdown(startup.name)}`,
      "",
      `- VentureDex URL: ${startup.url}`,
      startup.official_url ? `- Official URL: ${startup.official_url}` : null,
      `- Domain: ${escapeMarkdown(startup.domain)}`,
      startup.product_type ? `- Type: ${escapeMarkdown(startup.product_type)}` : null,
      startup.funding_stage ? `- Stage: ${escapeMarkdown(startup.funding_stage)}` : null,
      startup.funding_display ? `- Funding display: ${escapeMarkdown(startup.funding_display)}` : null,
      startup.region ? `- Region: ${escapeMarkdown(startup.region)}` : null,
      startup.published_at ? `- Published on VentureDex: ${startup.published_at}` : null,
      startup.summary ? `- Summary: ${escapeMarkdown(truncateText(startup.summary, 700))}` : null,
      startup.editorial_note ? `- Editorial note: ${escapeMarkdown(truncateText(startup.editorial_note, 900))}` : null,
      startup.latest_funding ? `- Latest funding: ${escapeMarkdown(formatFunding(startup.latest_funding))}` : null,
      startup.investors.length > 0 ? `- Investors: ${startup.investors.map(escapeMarkdown).join(", ")}` : null,
      startup.tags.length > 0 ? `- Tags: ${startup.tags.map(escapeMarkdown).join(", ")}` : null,
      startup.market_context ? `- Market context: ${escapeMarkdown(formatMarketContext(startup.market_context))}` : null
    ));

    if (startup.evidence.length > 0) {
      lines.push("- Product evidence:");
      for (const item of startup.evidence.slice(0, 6)) {
        lines.push(`  - ${escapeMarkdown(truncateText(item, 500))}`);
      }
    }

    if (startup.risks.length > 0) {
      lines.push("- Risks and open questions:");
      for (const item of startup.risks.slice(0, 4)) {
        lines.push(`  - ${escapeMarkdown(truncateText(item, 500))}`);
      }
    }

    if (startup.sources.length > 0) {
      lines.push("- Source trail:");
      for (const source of startup.sources.slice(0, 10)) {
        lines.push(`  - ${escapeMarkdown(source.label)} (${escapeMarkdown(source.type)}): ${source.url}`);
      }
    }

    lines.push("");
  }

  return `${lines.filter((line): line is string => line !== null).join("\n").trim()}\n`;
}

function startupEntry(startup: Startup, fundingRounds: FundingRound[], siteUrl: string): AiDiscoveryStartup {
  const links = safeJsonParse(startup.links_json, normalizeLinks) ?? {};
  const research = safeJsonParse(startup.research_json, normalizeResearch);
  const officialUrl = normalizeExternalUrl(startup.canonical_url) ?? normalizeExternalUrl(startup.domain) ?? undefined;
  const sources = sourceTrail(startup, fundingRounds, research);
  const latestFunding = fundingRounds.slice().sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];

  return stripEmpty({
    name: startup.product_name,
    slug: startup.slug,
    url: absoluteUrl(`/startups/${startup.slug}`, siteUrl),
    official_url: officialUrl,
    domain: startup.domain,
    summary: startup.summary ?? undefined,
    editorial_note: startup.editor_note ?? undefined,
    product_type: startup.product_type ?? undefined,
    funding_stage: startup.funding_stage || undefined,
    funding_display: startup.funding_display || undefined,
    latest_funding: latestFunding
      ? stripEmpty({
          amount: latestFunding.amount ?? undefined,
          stage: latestFunding.stage,
          date: latestFunding.date,
          lead_investor: latestFunding.lead_investor ?? undefined,
          source_url: normalizeExternalUrl(latestFunding.source_url) ?? undefined,
        })
      : undefined,
    investors: splitCsv(startup.investors),
    tags: splitCsv(startup.tags),
    region: startup.region ?? undefined,
    published_at: startup.published_at ?? undefined,
    updated_at: startup.updated_at ?? undefined,
    market_context: research?.market_context,
    evidence: research?.product_evidence.map((item) => item.claim) ?? [],
    risks: research?.risks?.map((risk) => `${risk.claim} Basis: ${risk.basis}`) ?? [],
    sources: mergeSources([
      officialUrl ? { label: "Official site", type: "official", url: officialUrl } : null,
      linkSource("GitHub", "repository", links.github),
      linkSource("LinkedIn", "social", links.linkedin),
      linkSource("Product Hunt", "social", links.producthunt),
      linkSource("Docs", "product", links.docs),
      linkSource("API", "product", links.api),
      linkSource("MCP", "product", links.mcp),
      linkSource("Pricing", "product", links.pricing),
      linkSource("Security", "product", links.security),
      ...sources,
    ]),
  });
}

function sourceTrail(
  startup: Startup,
  fundingRounds: FundingRound[],
  research: StartupResearch | null
): Array<AiDiscoverySource | null> {
  return [
    ...fundingRounds.map((round) => (
      round.source_url
        ? {
            label: round.source_name ? `${round.source_name} funding source` : `${startup.product_name} funding source`,
            type: "funding",
            url: normalizeExternalUrl(round.source_url) ?? "",
          }
        : null
    )),
    ...(research?.sources ?? []).map((source) => (
      source.url
        ? {
            label: source.label,
            type: source.type,
            url: normalizeExternalUrl(source.url) ?? "",
          }
        : null
    )),
  ];
}

function linkSource(label: string, type: string, value?: string): AiDiscoverySource | null {
  const url = normalizeExternalUrl(value);
  return url ? { label, type, url } : null;
}

function fundingRoundsByStartup(rounds: FundingRound[]): Map<string, FundingRound[]> {
  const bySlug = new Map<string, FundingRound[]>();
  for (const round of rounds) {
    if (!round.company_slug) continue;
    const entries = bySlug.get(round.company_slug) ?? [];
    entries.push(round);
    bySlug.set(round.company_slug, entries);
  }
  for (const [slug, entries] of bySlug) {
    bySlug.set(slug, entries.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")));
  }
  return bySlug;
}

function latestContentTimestamp(
  startups: Startup[],
  weeklyIssues: WeeklyIssueContent[],
  fundingRounds: FundingRound[]
): string | null {
  const values = [
    ...startups.flatMap((startup) => [startup.updated_at, startup.published_at]),
    ...weeklyIssues.flatMap((issue) => [issue.published_at, issue.week_end]),
    ...fundingRounds.map((round) => round.date),
  ].filter((value): value is string => Boolean(value));

  if (values.length === 0) return null;
  return values.sort((a, b) => toComparableTimestamp(b) - toComparableTimestamp(a))[0] ?? null;
}

function toComparableTimestamp(value: string): number {
  const normalized = value.includes("T")
    ? value
    : value.includes(" ")
      ? `${value.replace(" ", "T")}Z`
      : `${value}T00:00:00Z`;
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function mergeSources(sources: Array<AiDiscoverySource | null>): AiDiscoverySource[] {
  const seen = new Set<string>();
  const merged: AiDiscoverySource[] = [];
  for (const source of sources) {
    if (!source?.url || seen.has(source.url)) continue;
    seen.add(source.url);
    merged.push(source);
  }
  return merged;
}

function compactLines(...lines: Array<string | null | undefined>): string[] {
  return lines.filter((line): line is string => line !== null && line !== undefined);
}

function stripEmpty<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (child === undefined || child === null || child === "") {
      delete value[key];
    } else if (Array.isArray(child) && child.length === 0) {
      delete value[key];
    }
  }
  return value;
}

function formatFunding(funding: NonNullable<AiDiscoveryStartup["latest_funding"]>): string {
  return [
    funding.amount,
    funding.stage,
    funding.date,
    funding.lead_investor ? `lead investor: ${funding.lead_investor}` : null,
    funding.source_url ? `source: ${funding.source_url}` : null,
  ].filter(Boolean).join("; ");
}

function formatMarketContext(context: NonNullable<StartupResearch["market_context"]>): string {
  return [
    context.primary_user ? `primary user: ${context.primary_user}` : null,
    context.category ? `category: ${context.category}` : null,
    context.differentiation ? `differentiation: ${context.differentiation}` : null,
    context.why_now ? `why now: ${context.why_now}` : null,
  ].filter(Boolean).join("; ");
}
