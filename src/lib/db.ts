import type { Site, WeeklyIssue, Collection } from "./types";

export type SortOption = "featured" | "newest" | "name-az";

export async function getPublishedSites(
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
): Promise<Site[]> {
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
      `SELECT * FROM sites WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<Site>();

  return result.results;
}

export async function getSiteBySlug(
  db: D1Database,
  slug: string
): Promise<Site | null> {
  const result = await db
    .prepare("SELECT * FROM sites WHERE slug = ? AND workflow_status = 'published'")
    .bind(slug)
    .first<Site>();

  return result;
}

export async function getRelatedSites(
  db: D1Database,
  site: Site,
  limit = 4
): Promise<Site[]> {
  const result = await db
    .prepare(
      `SELECT * FROM sites
       WHERE workflow_status = 'published'
         AND id != ?
         AND (product_type = ? OR region = ?)
       ORDER BY published_at DESC
       LIMIT ?`
    )
    .bind(site.id, site.product_type, site.region, limit)
    .all<Site>();

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
): Promise<{ issue: WeeklyIssue; sites: Site[] } | null> {
  const issue = await db
    .prepare("SELECT * FROM weekly_issues WHERE issue_number = ? AND status = 'published'")
    .bind(issueNumber)
    .first<WeeklyIssue>();

  if (!issue) return null;

  const sites = await db
    .prepare(
      `SELECT s.* FROM sites s
       JOIN weekly_issue_sites wis ON s.id = wis.site_id
       WHERE wis.issue_id = ? AND s.workflow_status = 'published'
       ORDER BY wis.display_order`
    )
    .bind(issue.id)
    .all<Site>();

  return { issue, sites: sites.results };
}

export async function getPublishedCollections(
  db: D1Database
): Promise<Collection[]> {
  const result = await db
    .prepare("SELECT * FROM collections WHERE published = 1 ORDER BY title")
    .all<Collection>();

  return result.results;
}

export async function getCollectionBySlug(
  db: D1Database,
  slug: string
): Promise<{ collection: Collection; sites: Site[] } | null> {
  const collection = await db
    .prepare("SELECT * FROM collections WHERE slug = ? AND published = 1")
    .bind(slug)
    .first<Collection>();

  if (!collection) return null;

  const sites = await db
    .prepare(
      `SELECT s.* FROM sites s
       JOIN collection_sites cs ON s.id = cs.site_id
       WHERE cs.collection_id = ? AND s.workflow_status = 'published'
       ORDER BY cs.pinned DESC, cs.rank`
    )
    .bind(collection.id)
    .all<Site>();

  return { collection, sites: sites.results };
}

export async function searchSites(
  db: D1Database,
  query: string,
  limit = 20
): Promise<Site[]> {
  const normalized = query.toLowerCase().trim().slice(0, 200);
  if (!normalized) return [];

  const result = await db
    .prepare(
      `SELECT DISTINCT s.* FROM sites s
       JOIN search_index_terms sit ON s.id = sit.site_id
       WHERE sit.normalized_term LIKE ? AND s.workflow_status = 'published'
       ORDER BY sit.weight DESC
       LIMIT ?`
    )
    .bind(`${normalized}%`, limit)
    .all<Site>();

  return result.results;
}

export async function getRecentActivity(
  db: D1Database,
  limit = 10
): Promise<Site[]> {
  const result = await db
    .prepare(
      `SELECT * FROM sites
       WHERE workflow_status = 'published'
       ORDER BY published_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<Site>();

  return result.results;
}

export async function getSiteCount(db: D1Database): Promise<number> {
  const result = await db
    .prepare("SELECT COUNT(*) as count FROM sites WHERE workflow_status = 'published'")
    .first<{ count: number }>();

  return result?.count ?? 0;
}
