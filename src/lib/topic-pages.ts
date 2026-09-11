import topicConfigsJson from "../../content/topic-pages.json";
import type { FundingRound, Startup } from "./types";
import type { WeeklyIssueContent } from "./weekly";
import { cleanText, normalizeExternalUrl, splitCsv, truncateText } from "./seo";
import { normalizeResearch, safeJsonParse } from "./json";
import { fundingStageDisplayLabel } from "./funding-terms";

export interface TopicPageConfig {
  slug: string;
  title: string;
  kicker: string;
  description: string;
  intro: string;
  search_intent: string;
  comparison_focus?: string;
  collection_slug?: string;
  match: {
    product_types?: string[];
    tags?: string[];
    require_any_terms?: string[];
  };
  featured_slugs?: string[];
}

export interface TopicTerm {
  term: string;
  count: number;
}

export interface TopicRelatedIssue {
  issue: WeeklyIssueContent;
  matchingPickSlugs: string[];
}

export interface TopicStartupMatch {
  topic: TopicPage;
  matchingStartups: Startup[];
}

export interface TopicPage {
  slug: string;
  title: string;
  kicker: string;
  description: string;
  intro: string;
  searchIntent: string;
  comparisonFocus: string;
  collectionPath: string | null;
  path: string;
  startups: Startup[];
  latestStartups: Startup[];
  featuredStartups: Startup[];
  topTags: TopicTerm[];
  topInvestors: TopicTerm[];
  fundingStages: TopicTerm[];
  relatedIssues: TopicRelatedIssue[];
  generatedFrom: {
    productTypes: string[];
    tags: string[];
    requiredTerms?: string[];
  };
}

export interface TopicComparisonRow {
  startup: Startup;
  useCase: string;
  region: string;
  verifiedAt: string | null;
  sourceCount: number;
  latestFunding: FundingRound | null;
  fundingSourceUrl: string | null;
}

export interface TopicAnswer {
  profileCount: number;
  withFundingSourceCount: number;
  withVerificationDateCount: number;
  latestProfileDate: string | null;
  latestReviewDate: string | null;
  regions: TopicTerm[];
  comparisonRows: TopicComparisonRow[];
  questions: Array<{ question: string; answer: string }>;
}

const topicConfigs = topicConfigsJson as TopicPageConfig[];

export function getTopicPageConfigs(): TopicPageConfig[] {
  return assertValidTopicConfigs(topicConfigs);
}

export function getTopicPages(startups: Startup[], weeklyIssues: WeeklyIssueContent[]): TopicPage[] {
  return buildTopicPages(getTopicPageConfigs(), startups, weeklyIssues);
}

export function getTopicPageBySlug(
  slug: string,
  startups: Startup[],
  weeklyIssues: WeeklyIssueContent[]
): TopicPage | null {
  return getTopicPages(startups, weeklyIssues).find((topic) => topic.slug === slug) ?? null;
}

export function getTopicPagesForStartup(
  startup: Startup,
  startups: Startup[],
  weeklyIssues: WeeklyIssueContent[],
  limit = 4,
  configs = getTopicPageConfigs()
): TopicPage[] {
  return buildTopicPages(configs, startups, weeklyIssues)
    .filter((topic) => topic.startups.some((entry) => entry.slug === startup.slug))
    .slice(0, limit);
}

export function getTopicMatchesForStartups(
  targetStartups: Startup[],
  startups: Startup[],
  weeklyIssues: WeeklyIssueContent[],
  limit = 6,
  configs = getTopicPageConfigs()
): TopicStartupMatch[] {
  const targetSlugs = new Set(targetStartups.map((startup) => startup.slug));
  return buildTopicPages(configs, startups, weeklyIssues)
    .map((topic) => ({
      topic,
      matchingStartups: topic.startups.filter((startup) => targetSlugs.has(startup.slug)),
    }))
    .filter((entry) => entry.matchingStartups.length > 0)
    .slice(0, limit);
}

export function buildTopicPages(
  configs: TopicPageConfig[],
  startups: Startup[],
  weeklyIssues: WeeklyIssueContent[]
): TopicPage[] {
  const validConfigs = assertValidTopicConfigs(configs);
  return validConfigs
    .map((config) => buildTopicPage(config, startups, weeklyIssues))
    .filter((topic) => topic.startups.length > 0);
}

export function buildTopicPage(
  config: TopicPageConfig,
  startups: Startup[],
  weeklyIssues: WeeklyIssueContent[]
): TopicPage {
  const productTypes = uniqueTerms(config.match.product_types ?? []);
  const tags = uniqueTerms(config.match.tags ?? []);
  const featuredOrder = new Map((config.featured_slugs ?? []).map((slug, index) => [slug, index]));
  const matched = startups
    .filter((startup) => startup.workflow_status === "published")
    .filter((startup) => startupMatchesTopic(startup, productTypes, tags, config.match.require_any_terms))
    .sort((a, b) => compareTopicStartups(a, b, featuredOrder));
  const startupSlugSet = new Set(matched.map((startup) => startup.slug));
  const relatedIssues = weeklyIssues
    .map((issue) => ({
      issue,
      matchingPickSlugs: issue.picks.map((pick) => pick.slug).filter((slug) => startupSlugSet.has(slug)),
    }))
    .filter((entry) => entry.matchingPickSlugs.length > 0)
    .sort((a, b) => b.issue.issue_number - a.issue.issue_number)
    .slice(0, 4);

  return {
    slug: config.slug,
    title: cleanText(config.title),
    kicker: cleanText(config.kicker),
    description: truncateText(config.description, 180),
    intro: cleanText(config.intro),
    searchIntent: cleanText(config.search_intent),
    comparisonFocus: cleanText(config.comparison_focus ?? "Start with the workflow you need, then compare product evidence, integration requirements, and the date and source of each funding record."),
    collectionPath: config.collection_slug ? `/collections/${config.collection_slug}` : null,
    path: `/topics/${config.slug}`,
    startups: matched,
    latestStartups: [...matched]
      .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "") || a.product_name.localeCompare(b.product_name))
      .slice(0, 6),
    featuredStartups: matched.filter((startup) => featuredOrder.has(startup.slug)).slice(0, 5),
    topTags: countTerms(matched.flatMap((startup) => splitCsv(startup.tags))).slice(0, 10),
    topInvestors: countTerms(matched.flatMap((startup) => splitCsv(startup.investors))).slice(0, 8),
    fundingStages: countTerms(matched.map((startup) => fundingStageDisplayLabel(startup.funding_stage) ?? "").filter(Boolean)).slice(0, 6),
    relatedIssues,
    generatedFrom: { productTypes, tags, requiredTerms: uniqueTerms(config.match.require_any_terms ?? []) },
  };
}

/** A dated view of this publication's coverage, not a market-wide dataset. */
export function buildTopicAnswer(topic: TopicPage, fundingRounds: FundingRound[], comparisonLimit = 12): TopicAnswer {
  const rows = topic.startups.map((startup): TopicComparisonRow => {
    const research = safeJsonParse(startup.research_json, normalizeResearch);
    const latestFunding = fundingRounds
      .filter((round) => round.company_slug === startup.slug)
      // Undated records cannot displace a recorded funding date.
      .sort((a, b) => (validDate(b.date) ?? "").localeCompare(validDate(a.date) ?? ""))[0] ?? null;
    const sourceUrls = new Set((research?.sources ?? [])
      .map((source) => normalizeExternalUrl(source.url))
      .filter((url): url is string => Boolean(url)));
    return {
      startup,
      useCase: cleanText(startup.summary ?? "Product details are available in the company profile."),
      region: cleanText(startup.hq_location || startup.region || "Not recorded"),
      verifiedAt: validDate(research?.verified_at),
      sourceCount: sourceUrls.size,
      latestFunding,
      fundingSourceUrl: normalizeExternalUrl(latestFunding?.source_url),
    };
  });
  const latestProfileDate = latestDate(topic.startups.map((startup) => startup.published_at));
  const latestReviewDate = latestDate(rows.map((row) => row.verifiedAt));
  const comparisonRows = [...rows]
    .sort((a, b) => (validDate(b.startup.published_at) ?? "").localeCompare(validDate(a.startup.published_at) ?? "")
      || a.startup.product_name.localeCompare(b.startup.product_name))
    .slice(0, Math.max(0, comparisonLimit));

  return {
    profileCount: rows.length,
    withFundingSourceCount: rows.filter((row) => row.fundingSourceUrl).length,
    withVerificationDateCount: rows.filter((row) => row.verifiedAt).length,
    latestProfileDate,
    latestReviewDate,
    regions: countTerms(topic.startups.map((startup) => startup.region ?? "")).slice(0, 8),
    comparisonRows,
    questions: [
      {
        question: `How should I compare ${topic.title.toLowerCase()}?`,
        answer: topic.comparisonFocus ?? "Compare the product workflow, integration requirements, and the date and source of the recorded funding details.",
      },
      {
        question: "What does this list cover?",
        answer: `This page covers ${rows.length} published VentureDex ${rows.length === 1 ? "profile" : "profiles"} matching this topic. It is a selective research list, not a complete market census or a ranking. The comparison table shows the most recently added profiles; the full list appears below. Investor, region, and funding-stage counts describe this list only.`,
      },
      {
        question: "How current are the funding and product details?",
        answer: "Each funding entry shows the latest round recorded by VentureDex, its recorded date, and an attributed source when available. Profile publication and research-review dates are separate from funding dates. A research-review date records when public sources were reviewed; it does not certify company claims or confirm that a product was tested. Open the company profile for the evidence and stated risks.",
      },
    ],
  };
}

export function startupMatchesTopic(startup: Startup, productTypes: string[], tags: string[], requiredTerms: string[] = []): boolean {
  const startupTags = new Set(splitCsv(startup.tags).map((tag) => tag.toLowerCase()));
  const categoryMatches = Boolean(startup.product_type && productTypes.includes(startup.product_type))
    || tags.some((needle) => startupTags.has(needle.toLowerCase()));
  if (!categoryMatches) return false;
  if (requiredTerms.length === 0) return true;
  const description = `${startup.summary ?? ""} ${startup.tags ?? ""}`;
  return requiredTerms.some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(description);
  });
}

export function assertValidTopicConfigs(configs: TopicPageConfig[]): TopicPageConfig[] {
  const slugs = new Set<string>();
  for (const config of configs) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(config.slug)) {
      throw new Error(`Invalid topic slug: ${config.slug}`);
    }
    if (slugs.has(config.slug)) {
      throw new Error(`Duplicate topic slug: ${config.slug}`);
    }
    slugs.add(config.slug);
    for (const field of ["title", "kicker", "description", "intro", "search_intent"] as const) {
      if (!cleanText(config[field])) {
        throw new Error(`Topic ${config.slug} is missing ${field}.`);
      }
    }
    if (!(config.match.product_types?.length || config.match.tags?.length)) {
      throw new Error(`Topic ${config.slug} must declare at least one product type or tag matcher.`);
    }
  }
  return configs;
}

function compareTopicStartups(
  a: Startup,
  b: Startup,
  featuredOrder: Map<string, number>
): number {
  const aFeatured = featuredOrder.get(a.slug);
  const bFeatured = featuredOrder.get(b.slug);
  if (aFeatured !== undefined || bFeatured !== undefined) {
    if (aFeatured === undefined) return 1;
    if (bFeatured === undefined) return -1;
    return aFeatured - bFeatured;
  }
  if (b.is_featured !== a.is_featured) return b.is_featured - a.is_featured;
  return (b.published_at ?? "").localeCompare(a.published_at ?? "") || a.product_name.localeCompare(b.product_name);
}

function uniqueTerms(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean)));
}

function countTerms(values: string[]): TopicTerm[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const term = cleanText(value);
    if (!term) continue;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return Array.from(counts, ([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

function validDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T|\s|$)/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function latestDate(values: Array<string | null | undefined>): string | null {
  return values.map(validDate).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}
