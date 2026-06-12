import topicConfigsJson from "../../content/topic-pages.json";
import type { Startup } from "./types";
import type { WeeklyIssueContent } from "./weekly";
import { cleanText, splitCsv, truncateText } from "./seo";

export interface TopicPageConfig {
  slug: string;
  title: string;
  kicker: string;
  description: string;
  intro: string;
  search_intent: string;
  match: {
    product_types?: string[];
    tags?: string[];
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
  };
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
    .filter((startup) => startupMatchesTopic(startup, productTypes, tags))
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
    path: `/topics/${config.slug}`,
    startups: matched,
    latestStartups: [...matched]
      .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "") || a.product_name.localeCompare(b.product_name))
      .slice(0, 6),
    featuredStartups: matched.filter((startup) => featuredOrder.has(startup.slug)).slice(0, 5),
    topTags: countTerms(matched.flatMap((startup) => splitCsv(startup.tags))).slice(0, 10),
    topInvestors: countTerms(matched.flatMap((startup) => splitCsv(startup.investors))).slice(0, 8),
    fundingStages: countTerms(matched.map((startup) => startup.funding_stage ?? "").filter(Boolean)).slice(0, 6),
    relatedIssues,
    generatedFrom: { productTypes, tags },
  };
}

export function startupMatchesTopic(startup: Startup, productTypes: string[], tags: string[]): boolean {
  if (startup.product_type && productTypes.includes(startup.product_type)) return true;
  if (tags.length === 0) return false;
  const startupTags = new Set(splitCsv(startup.tags).map((tag) => tag.toLowerCase()));
  return tags.some((needle) => startupTags.has(needle.toLowerCase()));
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
