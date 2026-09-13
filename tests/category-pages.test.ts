import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createContentReaders } from "../src/lib/content-transform";
import { buildCategoryPages, categoryEvidence, categoryBreakdown } from "../src/lib/category-pages";
import type { Startup } from "../src/lib/types";

function startup(slug: string, overrides: Partial<Startup> = {}): Startup {
  return { slug, product_name: slug, workflow_status: "published", product_type: "AI / ML", funding_stage: "Seed", region: "US", published_at: "2026-09-01", updated_at: "2026-09-02", research_json: null, ...overrides } as Startup;
}

test("categories include only unique published members and omit empty destinations", () => {
  const pages = buildCategoryPages([startup("alpha"), startup("alpha"), startup("draft", {workflow_status: "draft"}), startup("archived", {workflow_status: "archived"})]);
  assert.deepEqual(pages.map(p => p.path), ["/categories/industry/ai-ml", "/categories/stage/seed", "/categories/region/us"]);
  for (const page of pages) {
    assert.deepEqual(page.startups.map(s => s.slug), ["alpha"]);
    assert.ok(page.intro.length > 80);
    assert.ok(page.question.length > 30);
    assert.equal(page.lastmod, "2026-09-13");
  }
});

test("membership uses the recorded category and latest stage, never guesses geography or tags", () => {
  const pages = buildCategoryPages([startup("late", {funding_stage: "Series G", region: "Unknown", hq_location: "London", product_type: "Other", tags: "AI"})]);
  assert.deepEqual(pages.map(p => p.path), ["/categories/stage/series-d-plus"]);
  assert.match(pages[0].scope, /latest recorded/);
});

test("cohort order and breakdowns are deterministic, with unknown values visible", () => {
  const pages = buildCategoryPages([startup("z"), startup("a", {published_at:"2026-09-02", region:null})]);
  const ai = pages.find(p => p.slug === "ai-ml")!;
  assert.deepEqual(ai.startups.map(s => s.slug), ["a", "z"]);
  assert.deepEqual(categoryBreakdown(ai.startups, "region"), [{label:"Not recorded",count:1}, {label:"US",count:1}]);
});

test("evidence counts safe distinct source URLs, keeps real review dates, and tolerates absent research", () => {
  const row = startup("a", {research_json: JSON.stringify({verified_at:"2026-09-04", sources:[{url:"https://a.test",label:"Official"},{url:"https://a.test",label:"Duplicate"},{url:"javascript:alert(1)",label:"Unsafe"}]})});
  assert.deepEqual(categoryEvidence(row), {reviewedAt:"2026-09-04",sources:[{url:"https://a.test",label:"Official"}]});
  assert.deepEqual(categoryEvidence(startup("b", {research_json:"broken"})), {reviewedAt:null,sources:[]});
  assert.equal(categoryEvidence(startup("c", {research_json:JSON.stringify({verified_at:"2026-02-31",sources:[]})})).reviewedAt, null);
});

test("category definitions cover each recorded non-Other product type without silently losing a taxonomy value", () => {
  const read = (path: string) => JSON.parse(readFileSync(new URL(`../content/${path}`, import.meta.url), "utf8"));
  const records = readdirSync(new URL("../content/startups/", import.meta.url)).filter(f => f.endsWith(".json")).map(f => read(`startups/${f}`));
  const startups = createContentReaders({records, timestamps:read("timestamps.json"), investorDirectory:read("investors.json"), collectionConfigs:read("collections.json")}).getContentStartups();
  const pages = buildCategoryPages(startups);
  const industries = pages.filter(p => p.dimension === "industry");
  for (const row of startups.filter(s => s.product_type && s.product_type !== "Other")) {
    assert.equal(industries.filter(p => p.startups.some(s => s.slug === row.slug)).length, 1, `${row.slug}: ${row.product_type}`);
  }
  assert.equal(new Set(pages.map(p => p.path)).size, pages.length);
  assert.ok(pages.every(p => p.startups.length && !p.path.includes("?") && /^\/categories\/(industry|stage|region)\/[a-z0-9-]+$/.test(p.path)));
});
