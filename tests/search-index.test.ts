import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeQuery,
  scoreSearchEntry,
  rankSearchEntries,
  buildSearchEntries,
  type SearchEntry,
} from "../src/lib/search-index";
import type { Startup } from "../src/lib/types";

const entries: SearchEntry[] = [
  { slug: "cursor", name: "Cursor", domain: "cursor.com", type: "DevTools", tags: "ai,editor,code" },
  { slug: "qodo", name: "Qodo", domain: "qodo.ai", type: "DevTools", tags: "ai,code review,testing" },
  { slug: "basata", name: "Basata", domain: "basata.io", type: "Fintech", tags: "payments,banking" },
  { slug: "linear", name: "Linear", domain: "linear.app", type: "SaaS", tags: "project management" },
];

test("normalizeQuery lowercases, trims, and caps length", () => {
  assert.equal(normalizeQuery("  Cursor  "), "cursor");
  assert.equal(normalizeQuery("AI"), "ai");
  assert.equal(normalizeQuery("x".repeat(200)).length, 100);
});

test("empty query scores 0 and ranks nothing", () => {
  assert.equal(scoreSearchEntry(entries[0], ""), 0);
  assert.deepEqual(rankSearchEntries(entries, "   "), []);
});

test("name prefix scores full weight (100), beats a type match", () => {
  // "cur" prefixes name "Cursor" (100); nothing else matches.
  assert.equal(scoreSearchEntry(entries[0], "cur"), 100);
  const ranked = rankSearchEntries(entries, "cur");
  assert.deepEqual(ranked.map((e) => e.slug), ["cursor"]);
});

test("substring match scores half weight; non-substring scores 0", () => {
  // "sat" is a substring of name "Basata" (ba-SAT-a), not a prefix -> 100*0.5 = 50.
  assert.equal(scoreSearchEntry(entries[2], "sat"), 50);
  // "base" is NOT a substring of "Basata" (b-a-s-a-t-a) nor anything else -> 0.
  assert.equal(scoreSearchEntry(entries[2], "base"), 0);
});

test("domain match works (weight 80)", () => {
  // "qodo.ai" exactly prefixes the domain -> full domain weight 80 (no name hit).
  assert.equal(scoreSearchEntry(entries[1], "qodo.ai"), 80);
  // "qodo" prefixes both name (100) and domain (80) -> max 100.
  assert.equal(scoreSearchEntry(entries[1], "qodo"), 100);
});

test("tag prefix scores tag weight (50)", () => {
  // "pay" prefixes tag "payments" (50); no name/domain/type hit.
  assert.equal(scoreSearchEntry(entries[2], "pay"), 50);
});

test("type query ranks all matching, ordered by score then name", () => {
  // "devtools" prefixes type for cursor & qodo (30 each) -> tie broken by name asc.
  const ranked = rankSearchEntries(entries, "devtools");
  assert.deepEqual(ranked.map((e) => e.slug), ["cursor", "qodo"]);
});

test("'ai' matches names/tags across entries and ranks by weight", () => {
  // qodo.ai domain prefix? "ai" is not a domain prefix. cursor tag "ai" -> 50,
  // qodo tag "ai" -> 50. Both 50, name asc: Cursor, Qodo.
  const ranked = rankSearchEntries(entries, "ai");
  assert.deepEqual(ranked.map((e) => e.slug), ["cursor", "qodo"]);
});

test("limit caps the number of results", () => {
  assert.equal(rankSearchEntries(entries, "o", 2).length <= 2, true);
});

test("buildSearchEntries maps Startup fields and tolerates null type/tags", () => {
  const startups = [
    { slug: "a", product_name: "Alpha", domain: "a.com", product_type: "SaaS", tags: "x,y" },
    { slug: "b", product_name: "Beta", domain: "b.com", product_type: null, tags: null },
  ] as unknown as Startup[];
  const built = buildSearchEntries(startups);
  assert.deepEqual(built[0], {
    slug: "a", name: "Alpha", domain: "a.com", type: "SaaS", tags: "x,y",
    summary: "", stage: "", region: "", whyFeatured: "",
  });
  assert.deepEqual(built[1], {
    slug: "b", name: "Beta", domain: "b.com", type: "", tags: "",
    summary: "", stage: "", region: "", whyFeatured: "",
  });
});
