import topicResearchJson from "../../content/topic-research.json";
import { isRecord, normalizeResearch, safeJsonParse } from "./json";
import type { Startup } from "./types";
import type { TopicPage } from "./topic-pages";

export const TOPIC_RESEARCH_FIELDS = ["workflow", "access", "pricing", "fit", "limitations"] as const;
export type TopicResearchFieldName = typeof TOPIC_RESEARCH_FIELDS[number];

export interface TopicResearchSource {
  id: string;
  title: string;
  url: string;
  checked_at: string;
}

export interface TopicResearchClaim {
  text: string;
  source_ids: string[];
}

export type TopicResearchProductConfig = Record<TopicResearchFieldName, TopicResearchClaim> & {
  startup_slug: string;
  sources: TopicResearchSource[];
};

export interface TopicResearchConfig {
  topic_slug: string;
  checked_at: string;
  selection_note: string;
  decision_steps: Array<{ title: string; text: string; startup_slugs: string[] }>;
  products: TopicResearchProductConfig[];
}

export type ResolvedTopicResearchSource = TopicResearchSource & { number: number };
export type ResolvedTopicResearchClaim = TopicResearchClaim & { sources: ResolvedTopicResearchSource[] };
export type TopicResearchProduct = Record<TopicResearchFieldName, ResolvedTopicResearchClaim> & {
  startup: Startup;
  profileReviewedAt: string | null;
  sources: ResolvedTopicResearchSource[];
};
export type TopicResearch = Omit<TopicResearchConfig, "products"> & { products: TopicResearchProduct[] };

function dateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : null;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonempty) && new Set(value).size === value.length;
}

/** Fail the content gate instead of silently publishing a partial or unsourced comparison. */
export function assertValidTopicResearch(value: unknown): TopicResearchConfig[] {
  if (!Array.isArray(value)) throw new Error("Topic research must be an array");
  const topicSlugs = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || !nonempty(entry.topic_slug) || topicSlugs.has(entry.topic_slug)) {
      throw new Error("Topic research requires unique topic slugs");
    }
    topicSlugs.add(entry.topic_slug);
    const fail = (message: string): never => { throw new Error(`Topic research ${entry.topic_slug}: ${message}`); };
    if (!dateOnly(entry.checked_at) || !nonempty(entry.selection_note)) fail("checked_at and selection_note are required");
    if (!Array.isArray(entry.products) || entry.products.length < 4 || entry.products.length > 6) fail("select 4–6 products");
    const selectedSlugs = new Set<string>();
    for (const product of entry.products as unknown[]) {
      if (!isRecord(product) || !nonempty(product.startup_slug) || selectedSlugs.has(product.startup_slug)) {
        fail("products require unique startup slugs");
      }
      const record = product as Record<string, unknown>;
      selectedSlugs.add(record.startup_slug as string);
      if (!Array.isArray(record.sources) || record.sources.length < 1) fail("each product requires sources");
      const sourceIds = new Set<string>();
      for (const source of record.sources as unknown[]) {
        if (!isRecord(source) || !nonempty(source.id) || sourceIds.has(source.id)
          || !nonempty(source.title) || !nonempty(source.url) || !dateOnly(source.checked_at)
          || (source.checked_at as string) > (entry.checked_at as string)) fail("invalid or duplicate source");
        const ref = source as unknown as TopicResearchSource;
        let url: URL;
        try { url = new URL(ref.url); } catch { fail("source URL must be absolute HTTPS"); }
        if (url!.protocol !== "https:" || url!.username || url!.password) fail("source URL must be absolute HTTPS");
        sourceIds.add(ref.id);
      }
      for (const field of TOPIC_RESEARCH_FIELDS) {
        const claim = record[field];
        if (!isRecord(claim) || !nonempty(claim.text) || !uniqueStrings(claim.source_ids)
          || !claim.source_ids.every((id) => sourceIds.has(id))) fail(`${record.startup_slug}.${field} requires resolvable source_ids`);
      }
    }
    if (!Array.isArray(entry.decision_steps) || entry.decision_steps.length < 1) fail("decision steps are required");
    for (const step of entry.decision_steps as unknown[]) {
      if (!isRecord(step) || !nonempty(step.title) || !nonempty(step.text) || !uniqueStrings(step.startup_slugs)
        || !step.startup_slugs.every((slug) => selectedSlugs.has(slug))) fail("decision steps must reference selected products");
    }
  }
  return value as TopicResearchConfig[];
}

export function getTopicResearch(topic: TopicPage, value: unknown = topicResearchJson): TopicResearch | null {
  const config = assertValidTopicResearch(value).find((entry) => entry.topic_slug === topic.slug);
  if (!config) return null;
  return {
    ...config,
    products: config.products.map((product): TopicResearchProduct => {
      const startup = topic.startups.find((entry) => entry.slug === product.startup_slug && entry.workflow_status === "published");
      if (!startup) throw new Error(`Topic research ${topic.slug}: ${product.startup_slug} is not a published member of this topic`);
      const sources = product.sources.map((source, index) => ({ ...source, number: index + 1 }));
      const resolve = (field: TopicResearchFieldName): ResolvedTopicResearchClaim => ({
        ...product[field],
        sources: product[field].source_ids.map((id) => sources.find((source) => source.id === id)!),
      });
      const profileResearch = safeJsonParse(startup.research_json, normalizeResearch);
      return {
        startup,
        // A new comparative source check must never relabel the original profile review.
        profileReviewedAt: dateOnly(profileResearch?.verified_at),
        sources,
        workflow: resolve("workflow"),
        access: resolve("access"),
        pricing: resolve("pricing"),
        fit: resolve("fit"),
        limitations: resolve("limitations"),
      };
    }),
  };
}
