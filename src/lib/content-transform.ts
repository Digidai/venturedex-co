import type { Collection, FundingRound, Investor, Startup } from "./types";
import { resolveInvestorSlugByName } from "./brand-assets";

/**
 * Pure content transform — the single source of the content -> Startup/Funding/
 * Collection/Investor mapping that powers prerendering.
 *
 * Extracted from content.ts so it can run without Vite's import.meta.glob: the
 * page-facing content.ts globs the JSON and feeds the records in here, while
 * tests/content-parity.test.ts feeds the same files read from disk and diffs the
 * result against the Python D1 seed (scripts/build-db.sh). Same transform, two
 * inputs — that's what keeps the prerender path and the D1 seed from drifting.
 *
 * The mapping mirrors build-db.sh's column semantics exactly; see the inline
 * notes (kept from content.ts) for the cases where empty-string vs null matters.
 */

export type JsonRecord = Record<string, unknown>;

export interface InvestorDirectoryEntry {
  name: string;
  slug: string;
  short_name?: string;
  website?: string;
  description?: string;
  aliases?: string[];
}

export interface TimestampEntry {
  published_at?: string | null;
  first_seen_at?: string | null;
}

export interface CollectionConfig {
  id: string;
  slug: string;
  title: string;
  description: string;
  match: {
    product_types?: string[];
    tags?: string[];
  };
}

export interface ContentInputs {
  records: JsonRecord[];
  timestamps: Record<string, TimestampEntry>;
  investorDirectory: Record<string, InvestorDirectoryEntry>;
  collectionConfigs: CollectionConfig[];
}

// The sidecar stores D1 datetime('now') values (UTC) as "YYYY-MM-DD HH:MM:SS".
// At build time `new Date(naiveString)` parses in the BUILD machine's local TZ,
// which would shift feed pubDates / sitemap lastmod / "Curated on" dates off the
// real instant (and even roll the day) on a non-UTC builder. Normalize to explicit
// UTC ISO so every consumer (new Date(...), toIsoDateTime) is build-TZ-independent.
function toUtcIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed.replace(" ", "T")}Z`
    : trimmed;
}

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// Stable sort by date descending: equal dates preserve original array order,
// matching the row order build-db.sh writes (and SQLite's effective ordering
// when created_at ties in a single seed).
function stableSortByDateDesc<T extends JsonRecord>(rows: T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const cmp = stringValue(b.row.date).localeCompare(stringValue(a.row.date));
      return cmp !== 0 ? cmp : a.index - b.index;
    })
    .map((entry) => entry.row);
}

/**
 * Latest funding round for a startup, mirroring build-db.sh:
 * sorted(funding, key=date, reverse=True)[0]. Uses a stable descending sort so
 * ties keep the source array order (the order build-db.sh inserts rows in).
 */
function latestFundingRound(data: JsonRecord): JsonRecord {
  const rounds = Array.isArray(data.funding) ? data.funding.filter(isRecord) : [];
  return stableSortByDateDesc(rounds)[0] ?? {};
}

// Collection tags for a startup: normalized, lowercase, trimmed, mirroring
// build-db.sh collection_tags().
function collectionTags(data: JsonRecord): string[] {
  return stringValue(data.tags)
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

// Substring match mirroring build-db.sh tag_match(): any needle contained in
// any tag.
function tagMatch(tags: string[], needles: string[]): boolean {
  return needles.some((needle) => tags.some((tag) => tag.includes(needle)));
}

function startupMatchesCollection(config: CollectionConfig, data: JsonRecord): boolean {
  const productType = stringValue(data.product_type);
  const productTypes = config.match.product_types ?? [];
  if (productType && productTypes.includes(productType)) return true;
  const tagNeedles = config.match.tags ?? [];
  return tagNeedles.length > 0 && tagMatch(collectionTags(data), tagNeedles);
}

function stableSortByDateDescFunding(rounds: FundingRound[]): FundingRound[] {
  return rounds
    .map((round, index) => ({ round, index }))
    .sort((a, b) => {
      const cmp = (b.round.date ?? "").localeCompare(a.round.date ?? "");
      return cmp !== 0 ? cmp : a.index - b.index;
    })
    .map((entry) => entry.round);
}

function toFundingRound(slug: string, data: JsonRecord, round: JsonRecord): FundingRound {
  const domain = stringValue(data.domain);
  const url = stringValue(data.url) || (domain ? `https://${domain}` : "");
  return {
    // build-db.sh derives a stable md5 id; nothing in the UI reads it, so a
    // deterministic synthetic id keyed by slug/date/stage is sufficient.
    id: `f-${slug}-${stringValue(round.date)}-${stringValue(round.stage)}`,
    company_name: stringValue(data.product_name),
    company_slug: slug,
    company_url: url || null,
    amount: stringValue(round.amount) || null,
    stage: stringValue(round.stage),
    lead_investor: stringValue(round.lead_investor) || null,
    date: stringValue(round.date),
    source_url: stringValue(round.source_url) || null,
    source_name: stringValue(round.source_name) || null,
  };
}

function toInvestor(entry: InvestorDirectoryEntry): Investor {
  return {
    id: `inv-${entry.slug}`,
    slug: entry.slug,
    name: entry.name,
    short_name: entry.short_name ?? null,
    website: entry.website ?? null,
    description: entry.description ?? null,
  };
}

function configToCollection(config: CollectionConfig): Collection {
  return {
    id: config.id,
    slug: config.slug,
    title: config.title,
    description: config.description,
    type: "editorial",
    published: 1,
  };
}

export interface ContentReaders {
  getContentStartups(): Startup[];
  getContentStartupBySlug(slug: string): Startup | null;
  getContentRelatedStartups(startup: Startup, limit?: number): Startup[];
  getContentFundingRoundsForStartup(slug: string): FundingRound[];
  getContentNewsEligibleFundingRounds(): FundingRound[];
  getContentInvestors(): Investor[];
  getContentInvestorBySlug(slug: string): { investor: Investor; rounds: FundingRound[] } | null;
  getContentCollections(): (Collection & { startup_count: number })[];
  getContentCollectionBySlug(slug: string): { collection: Collection; startups: Startup[] } | null;
}

export function createContentReaders(inputs: ContentInputs): ContentReaders {
  const { records, timestamps, investorDirectory, collectionConfigs } = inputs;

  const allStartupData = (): JsonRecord[] => records;

  /**
   * Map a content/startups/*.json record to the Startup shape EXACTLY as
   * scripts/build-db.sh seeds it into D1, so downstream code behaves identically.
   */
  function toStartup(data: JsonRecord): Startup {
    const slug = stringValue(data.slug);
    const funding = latestFundingRound(data);
    const domain = stringValue(data.domain);
    const url = stringValue(data.url) || (domain ? `https://${domain}` : "");
    const links = isRecord(data.links) ? data.links : {};
    const research = isRecord(data.research) ? data.research : null;
    const ts = timestamps[slug] ?? {};
    const publishedAt = toUtcIso(ts.published_at);
    const firstSeenAt = toUtcIso(ts.first_seen_at);

    return {
      id: `startup-${slug}`,
      slug,
      domain,
      // build-db.sh: canonical_url = url || `https://${domain}` (always set).
      canonical_url: url || null,
      product_name: stringValue(data.product_name),
      title: null,
      summary: stringValue(data.summary) || null,
      long_description: null,
      editor_note: stringValue(data.editor_note) || null,
      // build-db.sh: research_json = json.dumps(research) (or NULL when absent).
      research_json: research ? JSON.stringify(research) : null,
      editor_rating: typeof data.editor_rating === "number" ? data.editor_rating : null,
      why_featured: stringValue(data.why_featured) || null,
      // Matches the D1 schema default (curator TEXT DEFAULT 'dai'); the seed never
      // sets curator, so SSR pages render 'dai' — keep prerender output identical.
      curator: "dai",
      product_type: stringValue(data.product_type) || null,
      // Funding stage/display come from the latest round (by date desc).
      // build-db.sh seeds these as latest_round.get(...,'') (empty string when the
      // round omits them), so mirror that literal rather than coercing to null.
      funding_stage: stringValue(funding.stage),
      funding_display: stringValue(funding.amount),
      founded_year: typeof data.founded_year === "number" ? data.founded_year : null,
      team_size: stringValue(data.team_size) || null,
      hq_location: stringValue(data.hq_location) || null,
      region: stringValue(data.region) || null,
      framework: null,
      runtime_status: "live",
      workflow_status: "published",
      codex_stage: "manual",
      screenshot_r2_key: `${slug}.webp`,
      screenshot_status: "ready",
      og_image_r2_key: null,
      founder_name: null,
      founder_quote: null,
      founder_responded_at: null,
      // Authoritative dates from content/timestamps.json (fallback empty/null).
      first_seen_at: firstSeenAt ?? "",
      last_checked_at: null,
      published_at: publishedAt,
      investors: stringValue(data.investors) || null,
      links_json: Object.keys(links).length ? JSON.stringify(links) : null,
      tags: stringValue(data.tags) || null,
      is_featured: data.is_featured ? 1 : 0,
      // Content has no created_at/updated_at; the deployed D1 seeds them to the
      // seed-time now() on first insert. For deterministic prerender output we use
      // published_at, so JSON-LD dateModified and sitemap lastmod resolve to the
      // (version-controlled) publish date rather than a build-time clock.
      created_at: publishedAt ?? "",
      updated_at: publishedAt ?? "",
    };
  }

  function getContentStartups(): Startup[] {
    return allStartupData().map(toStartup);
  }

  function getContentStartupBySlug(slug: string): Startup | null {
    const data = allStartupData().find((entry) => stringValue(entry.slug) === slug);
    return data ? toStartup(data) : null;
  }

  /**
   * Mirror db.ts getRelatedStartups: published, id != self,
   * (product_type == OR region ==), ORDER BY published_at DESC, LIMIT.
   */
  function getContentRelatedStartups(startup: Startup, limit = 4): Startup[] {
    return getContentStartups()
      .filter(
        (candidate) =>
          candidate.id !== startup.id &&
          // Mirror SQL `product_type = ? OR region = ?`: NULL never equals NULL,
          // so a null facet must not match another null one.
          ((startup.product_type !== null &&
            candidate.product_type === startup.product_type) ||
            (startup.region !== null && candidate.region === startup.region))
      )
      .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
      .slice(0, limit);
  }

  /**
   * Mirror db.ts getFundingRoundsForStartup: ORDER BY date DESC, created_at DESC.
   * created_at is the seed clock (effectively constant per seed), so we fall back
   * to source array order on date ties via a stable descending sort.
   */
  function getContentFundingRoundsForStartup(slug: string): FundingRound[] {
    const data = allStartupData().find((entry) => stringValue(entry.slug) === slug);
    if (!data) return [];
    const rounds = Array.isArray(data.funding) ? data.funding.filter(isRecord) : [];
    return stableSortByDateDesc(rounds).map((round) => toFundingRound(slug, data, round));
  }

  // News-eligible rounds = published startup, non-empty source_url AND source_name.
  // Mirrors db.ts getNewsEligibleFundingRounds (ORDER BY date DESC, created_at DESC).
  function getContentNewsEligibleFundingRounds(): FundingRound[] {
    const rounds: FundingRound[] = [];
    for (const data of allStartupData()) {
      const slug = stringValue(data.slug);
      const funding = Array.isArray(data.funding) ? data.funding.filter(isRecord) : [];
      for (const round of stableSortByDateDesc(funding)) {
        const sourceUrl = stringValue(round.source_url).trim();
        const sourceName = stringValue(round.source_name).trim();
        if (!sourceUrl || !sourceName) continue;
        rounds.push(toFundingRound(slug, data, round));
      }
    }
    // Global ordering by date DESC, stable across the per-startup contributions.
    return stableSortByDateDescFunding(rounds);
  }

  // Investors ordered by name (mirrors db.ts getInvestors: ORDER BY name).
  function getContentInvestors(): Investor[] {
    return Object.values(investorDirectory)
      .map(toInvestor)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Mirror db.ts getInvestorBySlug: the investor entry plus all news-eligible
   * rounds whose lead_investor resolves (via the canonical resolver) to this slug.
   */
  function getContentInvestorBySlug(
    slug: string
  ): { investor: Investor; rounds: FundingRound[] } | null {
    const entry = Object.values(investorDirectory).find((inv) => inv.slug === slug);
    if (!entry) return null;
    const investor = toInvestor(entry);
    const rounds = getContentNewsEligibleFundingRounds().filter(
      (round) => resolveInvestorSlugByName(round.lead_investor) === investor.slug
    );
    return { investor, rounds };
  }

  // Startups in a collection, ordered pinned DESC then rank ASC, mirroring
  // db.ts getCollectionBySlug (ORDER BY cs.pinned DESC, cs.rank). rank = 5-rating
  // (else 5), pinned = is_featured, matching build-db.sh.
  function collectionStartups(config: CollectionConfig): Startup[] {
    const members = allStartupData()
      .filter((data) => startupMatchesCollection(config, data))
      .map((data) => {
        const rating = typeof data.editor_rating === "number" ? data.editor_rating : null;
        return {
          startup: toStartup(data),
          rank: rating !== null ? 5 - rating : 5,
          pinned: data.is_featured ? 1 : 0,
        };
      });

    return members
      .map((member, index) => ({ ...member, index }))
      .sort((a, b) => {
        if (b.pinned !== a.pinned) return b.pinned - a.pinned;
        if (a.rank !== b.rank) return a.rank - b.rank;
        // Stable: keep glob/insertion order for equal pinned+rank, matching the
        // seed's INSERT order under SQLite's ORDER BY pinned DESC, rank.
        return a.index - b.index;
      })
      .map((member) => member.startup);
  }

  // Published collections with startup_count, ordered by title (mirrors db.ts
  // getPublishedCollections: ORDER BY c.title).
  function getContentCollections(): (Collection & { startup_count: number })[] {
    return collectionConfigs
      .map((config) => ({
        ...configToCollection(config),
        startup_count: allStartupData().filter((data) =>
          startupMatchesCollection(config, data)
        ).length,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  function getContentCollectionBySlug(
    slug: string
  ): { collection: Collection; startups: Startup[] } | null {
    const config = collectionConfigs.find((entry) => entry.slug === slug);
    if (!config) return null;
    return { collection: configToCollection(config), startups: collectionStartups(config) };
  }

  return {
    getContentStartups,
    getContentStartupBySlug,
    getContentRelatedStartups,
    getContentFundingRoundsForStartup,
    getContentNewsEligibleFundingRounds,
    getContentInvestors,
    getContentInvestorBySlug,
    getContentCollections,
    getContentCollectionBySlug,
  };
}
