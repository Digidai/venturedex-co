import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
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
 * Parity guard for the two content transforms that must never diverge:
 *   - scripts/build-db.sh (Python)  -> d1/generated-seed.sql  -> D1 (runtime)
 *   - src/lib/content-transform.ts  -> Startup objects         -> prerender
 *
 * build-db.sh emits a canonical JSON view of the seed when EMIT_CANONICAL_JSON is
 * set (additive; the SQL is unchanged). This test feeds the same content/ files
 * through the TS transform and diffs the two. If they drift, this fails.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

interface Canonical {
  startups: Record<string, Record<string, unknown>>;
  funding: Record<string, Array<Record<string, unknown>>>;
  collection_members: Record<string, string[]>;
  collections: Array<{ id: string; slug: string; title: string; description: string }>;
}

let canonical: Canonical;
let readers: ContentReaders;

before(() => {
  // Python side: regenerate the seed and dump the canonical JSON to a temp file.
  const out = join(mkdtempSync(join(tmpdir(), "vd-parity-")), "canonical.json");
  execFileSync("bash", [join(repoRoot, "scripts/build-db.sh")], {
    env: { ...process.env, EMIT_CANONICAL_JSON: out },
    stdio: "ignore",
  });
  canonical = JSON.parse(readFileSync(out, "utf8"));

  // TS side: read the same content files from disk and run the shared transform.
  const startupsDir = join(repoRoot, "content/startups");
  const records: JsonRecord[] = readdirSync(startupsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(startupsDir, f), "utf8")));

  const rawTimestamps = JSON.parse(readFileSync(join(repoRoot, "content/timestamps.json"), "utf8"));
  const timestamps: Record<string, TimestampEntry> = Object.fromEntries(
    Object.entries(rawTimestamps).filter(([k]) => !k.startsWith("__"))
  ) as Record<string, TimestampEntry>;

  readers = createContentReaders({
    records,
    timestamps,
    investorDirectory: JSON.parse(
      readFileSync(join(repoRoot, "content/investors.json"), "utf8")
    ) as Record<string, InvestorDirectoryEntry>,
    collectionConfigs: JSON.parse(
      readFileSync(join(repoRoot, "content/collections.json"), "utf8")
    ) as CollectionConfig[],
  });
});

// Empty string and null are equivalent for nullable content fields.
const nn = (v: unknown): unknown => (v === "" || v === null || v === undefined ? null : v);

// Normalize a D1 datetime ("YYYY-MM-DD HH:MM:SS") or ISO string to an epoch, so
// the seed's naive UTC form and content.ts's explicit-UTC ISO compare equal.
function epoch(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const s = String(v);
  const iso = s.includes("T") ? s : `${s.replace(" ", "T")}Z`;
  const withZone = /(?:Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`;
  const t = Date.parse(withZone);
  return Number.isNaN(t) ? null : t;
}

test("same set of startup slugs", () => {
  const pySlugs = Object.keys(canonical.startups).sort();
  const tsSlugs = readers.getContentStartups().map((s) => s.slug).sort();
  assert.deepEqual(tsSlugs, pySlugs);
});

test("per-startup facets match the seed", () => {
  const bySlug = new Map(readers.getContentStartups().map((s) => [s.slug, s]));
  for (const [slug, py] of Object.entries(canonical.startups)) {
    const ts = bySlug.get(slug);
    assert.ok(ts, `content.ts is missing startup ${slug}`);
    const ctx = `startup ${slug}`;
    assert.equal(nn(ts.product_type), nn(py.product_type), `${ctx} product_type`);
    assert.equal(nn(ts.funding_stage), nn(py.funding_stage), `${ctx} funding_stage`);
    assert.equal(nn(ts.funding_display), nn(py.funding_display), `${ctx} funding_display`);
    assert.equal(nn(ts.region), nn(py.region), `${ctx} region`);
    assert.equal(ts.is_featured, py.is_featured, `${ctx} is_featured`);
    assert.equal(nn(ts.editor_rating), nn(py.editor_rating), `${ctx} editor_rating`);
    assert.equal(nn(ts.founded_year), nn(py.founded_year), `${ctx} founded_year`);
    assert.equal(nn(ts.canonical_url), nn(py.canonical_url), `${ctx} canonical_url`);
    assert.equal(nn(ts.summary), nn(py.summary), `${ctx} summary`);
    assert.equal(nn(ts.why_featured), nn(py.why_featured), `${ctx} why_featured`);
    assert.equal(nn(ts.tags), nn(py.tags), `${ctx} tags`);
    assert.equal(nn(ts.investors), nn(py.investors), `${ctx} investors`);
    assert.equal(nn(ts.team_size), nn(py.team_size), `${ctx} team_size`);
    assert.equal(nn(ts.hq_location), nn(py.hq_location), `${ctx} hq_location`);
    assert.equal(epoch(ts.published_at), epoch(py.published_at), `${ctx} published_at`);
    assert.equal(epoch(ts.first_seen_at), epoch(py.first_seen_at), `${ctx} first_seen_at`);
  }
});

test("per-startup funding rounds match the seed (as multisets)", () => {
  const roundKey = (r: Record<string, unknown>) =>
    JSON.stringify([nn(r.amount), nn(r.stage), nn(r.lead_investor), nn(r.date), nn(r.source_url), nn(r.source_name)]);
  for (const [slug, pyRounds] of Object.entries(canonical.funding)) {
    const tsRounds = readers.getContentFundingRoundsForStartup(slug);
    assert.deepEqual(
      tsRounds.map((r) => roundKey(r as unknown as Record<string, unknown>)).sort(),
      pyRounds.map(roundKey).sort(),
      `funding rounds for ${slug}`
    );
  }
});

test("collection set matches the seed", () => {
  const pySlugs = canonical.collections.map((c) => c.slug).sort();
  const tsSlugs = readers.getContentCollections().map((c) => c.slug).sort();
  assert.deepEqual(tsSlugs, pySlugs);
});

test("collection membership matches the seed (per collection)", () => {
  const idToSlug = new Map(canonical.collections.map((c) => [c.id, c.slug]));
  for (const [collectionId, pyMembers] of Object.entries(canonical.collection_members)) {
    const collectionSlug = idToSlug.get(collectionId);
    assert.ok(collectionSlug, `unknown collection id ${collectionId}`);
    const result = readers.getContentCollectionBySlug(collectionSlug!);
    assert.ok(result, `content.ts is missing collection ${collectionSlug}`);
    const tsMembers = result!.startups.map((s) => s.slug).sort();
    assert.deepEqual(tsMembers, [...pyMembers].sort(), `members of ${collectionSlug}`);
  }
});

test("news-eligible funding rounds match the seed (as a set)", () => {
  // Python: news-eligible = rounds with non-empty source_url AND source_name.
  const pySet = new Set<string>();
  for (const [slug, rounds] of Object.entries(canonical.funding)) {
    for (const r of rounds) {
      if (String(r.source_url ?? "").trim() && String(r.source_name ?? "").trim()) {
        pySet.add(JSON.stringify([slug, nn(r.date), nn(r.stage), nn(r.amount), nn(r.source_url), nn(r.source_name)]));
      }
    }
  }
  const tsSet = new Set(
    readers
      .getContentNewsEligibleFundingRounds()
      .map((r) => JSON.stringify([r.company_slug, nn(r.date), nn(r.stage), nn(r.amount), nn(r.source_url), nn(r.source_name)]))
  );
  assert.deepEqual([...tsSet].sort(), [...pySet].sort());
});
