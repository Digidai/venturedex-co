import type { Startup, FundingRound } from "./types";

/**
 * Runtime D1 readers.
 *
 * The site's pages all prerender from version-controlled content (src/lib/content.ts);
 * the only code that queries D1 at request/worker time is the newsletter pipeline
 * (cron + queue), which needs the live startup row and its funding rounds to build
 * a digest. Those two readers are all that remains here — the old list/search/count
 * helpers were removed when the homepage and /search moved to static prerendering.
 */

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

// Cap on the funding rounds shown in the news list; the prerendered /news page
// reads content.ts and slices to this many.
export const NEWS_ROUNDS_LIMIT = 100;
