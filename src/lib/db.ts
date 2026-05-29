import type { Startup, StartupCard, FundingRound } from "./types";

export type SortOption = "featured" | "newest" | "name-az";

// Columns the list/card UI (SiteCard) renders. List queries select only these so
// heavy columns (research_json, long_description, editor_note, ...) aren't pulled
// into D1 reads for pages that never use them. Detail pages read content.ts, not D1.
const CARD_COLUMNS =
  "slug, domain, product_name, product_type, summary, why_featured, funding_stage, region, screenshot_r2_key";

export async function getPublishedStartups(
  db: D1Database,
  opts?: {
    productType?: string;
    fundingStage?: string;
    region?: string;
    limit?: number;
    offset?: number;
    featured?: boolean;
    sort?: SortOption;
  }
): Promise<StartupCard[]> {
  const conditions = ["workflow_status = 'published'"];
  const params: unknown[] = [];

  if (opts?.productType) {
    conditions.push("product_type = ?");
    params.push(opts.productType);
  }
  if (opts?.fundingStage) {
    conditions.push("funding_stage = ?");
    params.push(opts.fundingStage);
  }
  if (opts?.region) {
    conditions.push("region = ?");
    params.push(opts.region);
  }
  if (opts?.featured) {
    conditions.push("is_featured = 1");
  }

  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const where = conditions.join(" AND ");

  let orderBy: string;
  switch (opts?.sort) {
    case "newest":
      orderBy = "published_at DESC";
      break;
    case "name-az":
      orderBy = "product_name ASC";
      break;
    case "featured":
    default:
      orderBy = "is_featured DESC, published_at DESC";
      break;
  }

  const result = await db
    .prepare(
      `SELECT ${CARD_COLUMNS} FROM startups WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<StartupCard>();

  return result.results;
}

// Used at runtime by the newsletter digest builder (src/lib/newsletter.ts).
export async function getStartupBySlug(
  db: D1Database,
  slug: string
): Promise<Startup | null> {
  const result = await db
    .prepare("SELECT * FROM startups WHERE slug = ? AND workflow_status = 'published'")
    .bind(slug)
    .first<Startup>();

  return result;
}

// Used at runtime by the newsletter digest builder (src/lib/newsletter.ts).
export async function getFundingRoundsForStartup(
  db: D1Database,
  slug: string
): Promise<FundingRound[]> {
  const result = await db
    .prepare(
      `SELECT * FROM funding_rounds
       WHERE company_slug = ?
       ORDER BY date DESC, created_at DESC`
    )
    .bind(slug)
    .all<FundingRound>();

  return result.results;
}

export async function searchStartups(
  db: D1Database,
  query: string,
  limit = 20
): Promise<StartupCard[]> {
  const normalized = query.toLowerCase().trim().slice(0, 200);
  if (!normalized) return [];

  // Escape LIKE wildcards so a query of "_" or "%" can't match everything.
  const likePattern = normalized.replace(/[\\%_]/g, "\\$&") + "%";

  const result = await db
    .prepare(
      `SELECT DISTINCT s.slug, s.domain, s.product_name, s.product_type, s.summary,
              s.why_featured, s.funding_stage, s.region, s.screenshot_r2_key
       FROM startups s
       JOIN search_index_terms sit ON s.id = sit.startup_id
       WHERE sit.normalized_term LIKE ? ESCAPE '\\' AND s.workflow_status = 'published'
       ORDER BY sit.weight DESC
       LIMIT ?`
    )
    .bind(likePattern, limit)
    .all<StartupCard>();

  return result.results;
}

export const NEWS_ROUNDS_LIMIT = 100;

// Recent funding rounds with verified press sources, for the homepage ticker
// (SSR). The prerendered /news page reads the equivalent content.ts helper.
export async function getNewsFundingRounds(
  db: D1Database,
  limit = NEWS_ROUNDS_LIMIT
): Promise<FundingRound[]> {
  const result = await db
    .prepare(
      `SELECT f.*
       FROM funding_rounds f
       INNER JOIN startups s ON s.slug = f.company_slug
       WHERE s.workflow_status = 'published'
         AND f.company_slug IS NOT NULL
         AND f.source_url IS NOT NULL
         AND TRIM(f.source_url) != ''
         AND f.source_name IS NOT NULL
         AND TRIM(f.source_name) != ''
       ORDER BY f.date DESC, f.created_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<FundingRound>();

  return result.results;
}

export async function getStartupCount(
  db: D1Database,
  opts?: {
    productType?: string;
    fundingStage?: string;
    region?: string;
  }
): Promise<number> {
  const conditions = ["workflow_status = 'published'"];
  const params: unknown[] = [];

  if (opts?.productType) {
    conditions.push("product_type = ?");
    params.push(opts.productType);
  }
  if (opts?.fundingStage) {
    conditions.push("funding_stage = ?");
    params.push(opts.fundingStage);
  }
  if (opts?.region) {
    conditions.push("region = ?");
    params.push(opts.region);
  }

  const result = await db
    .prepare(`SELECT COUNT(*) as count FROM startups WHERE ${conditions.join(" AND ")}`)
    .bind(...params)
    .first<{ count: number }>();

  return result?.count ?? 0;
}
