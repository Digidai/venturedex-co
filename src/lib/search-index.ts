import type { Startup } from "./types";

/**
 * Pure, testable search scoring for the prerendered /search page.
 *
 * Replaces the old D1 `searchStartups` LIKE query (prefix-only on a
 * search_index_terms table) with a static, client-side weighted search. It
 * mirrors the D1 field weights (name 100, domain 80, tag 50, type 30) but is
 * strictly more capable: a prefix hit scores full weight and a substring hit
 * scores half, so "base" still finds "Basata" and "code" finds "Qodo".
 *
 * The /search page emits one SearchEntry per card as a JSON index at build
 * time; the page script scores them against the query and reorders the matching
 * cards (located by data-slug). These functions hold the semantics so they can
 * be unit-tested without a DOM.
 */

export interface SearchEntry {
  slug: string;
  name: string;
  domain: string;
  type: string;
  tags: string; // comma-separated, as stored on the startup
}

const WEIGHTS = { name: 100, domain: 80, tag: 50, type: 30 } as const;

export function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().slice(0, 100);
}

function termScore(text: string, query: string, weight: number): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  if (t.startsWith(query)) return weight;
  if (t.includes(query)) return weight * 0.5;
  return 0;
}

/** Best (max) weighted match score for an entry against a normalized query. */
export function scoreSearchEntry(entry: SearchEntry, query: string): number {
  const q = normalizeQuery(query);
  if (!q) return 0;
  let score = 0;
  score = Math.max(score, termScore(entry.name, q, WEIGHTS.name));
  score = Math.max(score, termScore(entry.domain, q, WEIGHTS.domain));
  score = Math.max(score, termScore(entry.type, q, WEIGHTS.type));
  for (const tag of entry.tags.split(",")) {
    score = Math.max(score, termScore(tag.trim(), q, WEIGHTS.tag));
  }
  return score;
}

/** Matching entries, ranked by score desc then name asc, capped at `limit`. */
export function rankSearchEntries<T extends SearchEntry>(
  entries: T[],
  query: string,
  limit = 30
): T[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  return entries
    .map((entry) => ({ entry, score: scoreSearchEntry(entry, q) }))
    .filter((scored) => scored.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.entry.name.toLowerCase().localeCompare(b.entry.name.toLowerCase())
    )
    .slice(0, limit)
    .map((scored) => scored.entry);
}

/** Build the build-time search index from full Startup records. */
export function buildSearchEntries(startups: Startup[]): SearchEntry[] {
  return startups.map((startup) => ({
    slug: startup.slug,
    name: startup.product_name,
    domain: startup.domain,
    type: startup.product_type ?? "",
    tags: startup.tags ?? "",
  }));
}
