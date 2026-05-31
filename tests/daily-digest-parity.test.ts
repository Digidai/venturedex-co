import { test, before } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createContentReaders,
  type ContentReaders,
  type JsonRecord,
  type TimestampEntry,
  type InvestorDirectoryEntry,
  type CollectionConfig,
} from "../src/lib/content-transform";

/**
 * Equivalence proof for moving the newsletter daily digest off D1 onto content.ts.
 *
 * Loads the schema + generated seed into an in-memory SQLite, runs the EXACT daily
 * digest query the newsletter used, and asserts that
 * getContentStartupsPublishedBetween returns the identical slugs in the identical
 * order across several windows (including exclusive-start / inclusive-end
 * boundaries). If these match, the content path is a drop-in for the D1 path.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const DAILY_QUERY = `SELECT slug FROM startups
  WHERE workflow_status = 'published'
    AND published_at IS NOT NULL
    AND published_at > ?
    AND published_at <= ?
  ORDER BY published_at ASC, product_name ASC`;

let raw: Database.Database;
let readers: ContentReaders;

before(() => {
  raw = new Database(":memory:");
  raw.exec(readFileSync(join(repoRoot, "d1/schema.sql"), "utf8"));
  raw.exec(readFileSync(join(repoRoot, "d1/generated-seed.sql"), "utf8"));

  const startupsDir = join(repoRoot, "content/startups");
  const records: JsonRecord[] = readdirSync(startupsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(startupsDir, f), "utf8")));
  const rawTs = JSON.parse(readFileSync(join(repoRoot, "content/timestamps.json"), "utf8"));
  const timestamps: Record<string, TimestampEntry> = Object.fromEntries(
    Object.entries(rawTs).filter(([k]) => !k.startsWith("__"))
  ) as Record<string, TimestampEntry>;

  readers = createContentReaders({
    records,
    timestamps,
    investorDirectory: JSON.parse(readFileSync(join(repoRoot, "content/investors.json"), "utf8")) as Record<string, InvestorDirectoryEntry>,
    collectionConfigs: JSON.parse(readFileSync(join(repoRoot, "content/collections.json"), "utf8")) as CollectionConfig[],
  });
});

function d1Slugs(start: string, end: string): string[] {
  return (raw.prepare(DAILY_QUERY).all(start, end) as { slug: string }[]).map((r) => r.slug);
}
function contentSlugs(start: string, end: string): string[] {
  return readers.getContentStartupsPublishedBetween(start, end).map((s) => s.slug);
}

test("every published startup has a content timestamp (no seed-time 'now' drift)", () => {
  // If a startup lacked a timestamp, the seed would stamp it datetime('now') (and
  // the D1 query would include it) while content yields null (excluded) — a
  // divergence. Assert full coverage so the two paths can't differ on this.
  const seeded = (raw.prepare("SELECT COUNT(*) AS n FROM startups WHERE published_at IS NOT NULL").get() as { n: number }).n;
  const withContentDate = readers.getContentStartups().filter((s) => s.published_at).length;
  assert.equal(withContentDate, seeded, "content published_at coverage must match the seed");
});

test("daily window: full range matches D1", () => {
  const [s, e] = ["2026-01-01 00:00:00", "2026-12-31 23:59:59"];
  assert.deepEqual(contentSlugs(s, e), d1Slugs(s, e));
});

test("daily window: recent subset matches D1", () => {
  const [s, e] = ["2026-05-20 00:00:00", "2026-05-27 23:59:59"];
  assert.deepEqual(contentSlugs(s, e), d1Slugs(s, e));
});

test("daily window: exclusive start / inclusive end boundary matches D1", () => {
  // Pick an actual published_at as the start (must be excluded) and end (included).
  const dates = (raw.prepare("SELECT DISTINCT published_at FROM startups WHERE published_at IS NOT NULL ORDER BY published_at").all() as { published_at: string }[]).map((r) => r.published_at);
  const start = dates[Math.floor(dates.length / 2)];
  const end = dates[dates.length - 1];
  assert.deepEqual(contentSlugs(start, end), d1Slugs(start, end));
});

test("daily window: empty window matches D1 (both empty)", () => {
  const [s, e] = ["2020-01-01 00:00:00", "2020-01-02 00:00:00"];
  assert.deepEqual(contentSlugs(s, e), []);
  assert.deepEqual(d1Slugs(s, e), []);
});
