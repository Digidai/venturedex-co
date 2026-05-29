import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSort,
  readFilterState,
  filterStateToQuery,
  cardMatchesFilters,
  activeFacetCount,
  orderVisibleCards,
  type FilterableCard,
  type StartupFilterState,
} from "../src/lib/startup-filter";

const cards: FilterableCard[] = [
  { name: "Exa", type: "DevTools", stage: "Series C", region: "US", published: "2026-05-27T00:00:00Z" },
  { name: "Allo", type: "AI / ML", stage: "Seed", region: "Europe", published: "2026-05-20T00:00:00Z" },
  { name: "Cursor", type: "DevTools", stage: "Series B", region: "US", published: "2026-05-25T00:00:00Z" },
  { name: "balerion", type: "AI / ML", stage: "Seed", region: "US", published: "2026-05-26T00:00:00Z" },
];

function state(partial: Partial<StartupFilterState> = {}): StartupFilterState {
  return { type: "", stage: "", region: "", sort: "featured", ...partial };
}

test("normalizeSort accepts known values and falls back to featured", () => {
  assert.equal(normalizeSort("newest"), "newest");
  assert.equal(normalizeSort("name-az"), "name-az");
  assert.equal(normalizeSort("featured"), "featured");
  assert.equal(normalizeSort("bogus"), "featured");
  assert.equal(normalizeSort(null), "featured");
  assert.equal(normalizeSort(undefined), "featured");
  assert.equal(normalizeSort("  newest  "), "newest");
});

test("readFilterState parses params and normalizes the sort", () => {
  const s = readFilterState(new URLSearchParams("type=DevTools&stage=Seed&region=US&sort=newest"));
  assert.deepEqual(s, { type: "DevTools", stage: "Seed", region: "US", sort: "newest" });
  const bad = readFilterState(new URLSearchParams("sort=whatever"));
  assert.equal(bad.sort, "featured");
  const empty = readFilterState(new URLSearchParams(""));
  assert.deepEqual(empty, { type: "", stage: "", region: "", sort: "featured" });
});

test("filterStateToQuery omits empty facets and the default sort, round-trips", () => {
  assert.equal(filterStateToQuery(state()), "");
  assert.equal(filterStateToQuery(state({ sort: "featured" })), "");
  assert.equal(filterStateToQuery(state({ type: "DevTools" })), "type=DevTools");
  assert.equal(filterStateToQuery(state({ sort: "newest" })), "sort=newest");
  const full = state({ type: "AI / ML", stage: "Seed", region: "US", sort: "name-az" });
  assert.deepEqual(readFilterState(new URLSearchParams(filterStateToQuery(full))), full);
});

test("cardMatchesFilters ANDs the active facets; empty facet matches all", () => {
  assert.equal(cardMatchesFilters(cards[0], state()), true);
  assert.equal(cardMatchesFilters(cards[0], state({ type: "DevTools" })), true);
  assert.equal(cardMatchesFilters(cards[0], state({ type: "AI / ML" })), false);
  assert.equal(cardMatchesFilters(cards[0], state({ type: "DevTools", region: "Europe" })), false);
  assert.equal(cardMatchesFilters(cards[1], state({ type: "AI / ML", stage: "Seed", region: "Europe" })), true);
});

test("activeFacetCount counts facets but not the featured sort", () => {
  assert.equal(activeFacetCount(state()), 0);
  assert.equal(activeFacetCount(state({ sort: "featured" })), 0);
  assert.equal(activeFacetCount(state({ sort: "newest" })), 1);
  assert.equal(activeFacetCount(state({ type: "DevTools", region: "US" })), 2);
  assert.equal(activeFacetCount(state({ type: "DevTools", stage: "Seed", region: "US", sort: "name-az" })), 4);
});

test("orderVisibleCards: featured sort preserves input order of matches", () => {
  const out = orderVisibleCards(cards, state({ type: "DevTools" }));
  assert.deepEqual(out.map((c) => c.name), ["Exa", "Cursor"]);
});

test("orderVisibleCards: newest sorts by published desc", () => {
  const out = orderVisibleCards(cards, state({ sort: "newest" }));
  assert.deepEqual(out.map((c) => c.name), ["Exa", "balerion", "Cursor", "Allo"]);
});

test("orderVisibleCards: name-az sorts case-insensitively", () => {
  const out = orderVisibleCards(cards, state({ sort: "name-az" }));
  // 'balerion' lowercased sorts before 'cursor'/'exa' — proves case-insensitive
  assert.deepEqual(out.map((c) => c.name), ["Allo", "balerion", "Cursor", "Exa"]);
});

test("orderVisibleCards: filter + sort compose", () => {
  const out = orderVisibleCards(cards, state({ region: "US", sort: "newest" }));
  assert.deepEqual(out.map((c) => c.name), ["Exa", "balerion", "Cursor"]);
});
