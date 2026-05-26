import type { Startup, WeeklyIssue, Collection, FundingRound, Investor } from "./types";

export type SortOption = "featured" | "newest" | "name-az";

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
): Promise<Startup[]> {
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
      `SELECT * FROM startups WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<Startup>();

  return result.results;
}

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

export async function getRelatedStartups(
  db: D1Database,
  startup: Startup,
  limit = 4
): Promise<Startup[]> {
  const result = await db
    .prepare(
      `SELECT * FROM startups
       WHERE workflow_status = 'published'
         AND id != ?
         AND (product_type = ? OR region = ?)
       ORDER BY published_at DESC
       LIMIT ?`
    )
    .bind(startup.id, startup.product_type, startup.region, limit)
    .all<Startup>();

  return result.results;
}

export async function getPublishedWeeklyIssues(
  db: D1Database,
  limit = 20
): Promise<WeeklyIssue[]> {
  const result = await db
    .prepare(
      "SELECT * FROM weekly_issues WHERE status = 'published' ORDER BY issue_number DESC LIMIT ?"
    )
    .bind(limit)
    .all<WeeklyIssue>();

  return result.results;
}

export async function getWeeklyIssueByNumber(
  db: D1Database,
  issueNumber: number
): Promise<{ issue: WeeklyIssue; startups: Startup[] } | null> {
  const issue = await db
    .prepare("SELECT * FROM weekly_issues WHERE issue_number = ? AND status = 'published'")
    .bind(issueNumber)
    .first<WeeklyIssue>();

  if (!issue) return null;

  const startups = await db
    .prepare(
      `SELECT s.* FROM startups s
       JOIN weekly_issue_startups wis ON s.id = wis.startup_id
       WHERE wis.issue_id = ? AND s.workflow_status = 'published'
       ORDER BY wis.display_order`
    )
    .bind(issue.id)
    .all<Startup>();

  return { issue, startups: startups.results };
}

export async function getPublishedCollections(
  db: D1Database
): Promise<(Collection & { startup_count: number })[]> {
  const result = await db
    .prepare(
      `SELECT c.*, COUNT(s.id) as startup_count
       FROM collections c
       LEFT JOIN collection_startups cs ON c.id = cs.collection_id
       LEFT JOIN startups s ON s.id = cs.startup_id
        AND s.workflow_status = 'published'
       WHERE c.published = 1
       GROUP BY c.id
       ORDER BY c.title`
    )
    .all<Collection & { startup_count: number }>();

  return result.results;
}

export async function getCollectionBySlug(
  db: D1Database,
  slug: string
): Promise<{ collection: Collection; startups: Startup[] } | null> {
  const collection = await db
    .prepare("SELECT * FROM collections WHERE slug = ? AND published = 1")
    .bind(slug)
    .first<Collection>();

  if (!collection) return null;

  const startups = await db
    .prepare(
      `SELECT s.* FROM startups s
       JOIN collection_startups cs ON s.id = cs.startup_id
       WHERE cs.collection_id = ? AND s.workflow_status = 'published'
       ORDER BY cs.pinned DESC, cs.rank`
    )
    .bind(collection.id)
    .all<Startup>();

  return { collection, startups: startups.results };
}

export async function searchStartups(
  db: D1Database,
  query: string,
  limit = 20
): Promise<Startup[]> {
  const normalized = query.toLowerCase().trim().slice(0, 200);
  if (!normalized) return [];

  const result = await db
    .prepare(
      `SELECT DISTINCT s.* FROM startups s
       JOIN search_index_terms sit ON s.id = sit.startup_id
       WHERE sit.normalized_term LIKE ? AND s.workflow_status = 'published'
       ORDER BY sit.weight DESC
       LIMIT ?`
    )
    .bind(`${normalized}%`, limit)
    .all<Startup>();

  return result.results;
}

export async function getRecentStartups(
  db: D1Database,
  limit = 10
): Promise<Startup[]> {
  const result = await db
    .prepare(
      `SELECT * FROM startups
       WHERE workflow_status = 'published'
       ORDER BY published_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<Startup>();

  return result.results;
}

export async function getFundingRounds(
  db: D1Database,
  limit = 50
): Promise<FundingRound[]> {
  const result = await db
    .prepare("SELECT * FROM funding_rounds ORDER BY date DESC, created_at DESC LIMIT ?")
    .bind(limit)
    .all<FundingRound>();

  return result.results;
}

export const NEWS_ROUNDS_LIMIT = 100;

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

export async function getInvestors(db: D1Database): Promise<Investor[]> {
  const result = await db
    .prepare("SELECT * FROM investors ORDER BY name")
    .all<Investor>();
  return result.results;
}

export async function getInvestorBySlug(
  db: D1Database,
  slug: string
): Promise<{ investor: Investor; rounds: FundingRound[] } | null> {
  const investor = await db
    .prepare("SELECT * FROM investors WHERE slug = ?")
    .bind(slug)
    .first<Investor>();

  if (!investor) return null;

  // Match by both name and short_name
  const namePattern = `%${investor.name}%`;
  const shortPattern = investor.short_name ? `%${investor.short_name}%` : namePattern;

  const rounds = await db
    .prepare(
      `SELECT f.*
       FROM funding_rounds f
       INNER JOIN startups s ON f.company_slug = s.slug
       WHERE (
             LOWER(f.lead_investor) LIKE LOWER(?)
          OR LOWER(f.lead_investor) LIKE LOWER(?)
       )
         AND s.workflow_status = 'published'
         AND f.source_url IS NOT NULL
         AND TRIM(f.source_url) != ''
         AND f.source_name IS NOT NULL
         AND TRIM(f.source_name) != ''
       ORDER BY f.date DESC`
    )
    .bind(namePattern, shortPattern)
    .all<FundingRound>();

  return { investor, rounds: rounds.results };
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
