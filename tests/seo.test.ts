import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPath, homeJsonLd, investorJsonLd, startupJsonLd } from "../src/lib/seo";
import type { FundingRound, Investor, Startup } from "../src/lib/types";

const SITE_URL = "https://venturedex.co";

const startup: Startup = {
  id: "startup-example",
  slug: "example-ai",
  domain: "example.ai",
  canonical_url: "https://example.ai",
  product_name: "Example AI",
  title: null,
  summary: "Agent workspace for regulated operators.",
  long_description: null,
  editor_note: "Example AI turns compliance review into a daily operating workflow.",
  research_json: null,
  editor_rating: 4,
  why_featured: "Compliance workflow wedge",
  curator: "dai",
  product_type: "SaaS",
  funding_stage: "Seed",
  funding_display: "$4M",
  founded_year: 2024,
  team_size: null,
  hq_location: "San Francisco, CA",
  region: "US",
  framework: null,
  runtime_status: "live",
  workflow_status: "published",
  codex_stage: "manual",
  screenshot_r2_key: "example-ai.webp",
  screenshot_status: "ready",
  og_image_r2_key: null,
  founder_name: "Jordan Founder",
  founder_quote: null,
  founder_responded_at: null,
  first_seen_at: "2026-05-27 10:00:00",
  last_checked_at: null,
  published_at: "2026-05-27 10:00:00",
  investors: "Useful Ventures, Example Capital",
  links_json: JSON.stringify({ github: "https://github.com/example-ai", twitter: "example_ai" }),
  tags: "compliance,workflow",
  is_featured: 1,
  created_at: "2026-05-27 10:00:00",
  updated_at: "2026-05-27 12:00:00",
};

const investor: Investor = {
  id: "investor-useful",
  slug: "useful-ventures",
  name: "Useful Ventures",
  short_name: "Useful",
  website: "https://useful.vc",
  description: "Seed-stage fund backing applied AI workflow companies.",
};

const rounds: FundingRound[] = [
  {
    id: "round-1",
    company_name: "Example AI",
    company_slug: "example-ai",
    company_url: "https://example.ai",
    amount: "$4M",
    stage: "Seed",
    lead_investor: "Useful Ventures",
    date: "2026-05-26",
    source_url: "https://example.com/funding",
    source_name: "Example News",
  },
  {
    id: "round-2",
    company_name: "Other Co",
    company_slug: null,
    company_url: null,
    amount: null,
    stage: "Series A",
    lead_investor: null,
    date: "2026-05-20",
    source_url: null,
    source_name: null,
  },
];

interface JsonLdGraph {
  "@context": unknown;
  "@graph": Array<Record<string, unknown>>;
}

/** Collect every `@id` value that a node in the graph *defines*. */
function definedIds(graph: JsonLdGraph): Set<string> {
  const ids = new Set<string>();
  for (const node of graph["@graph"]) {
    const id = node["@id"];
    if (typeof id === "string") ids.add(id);
  }
  return ids;
}

/**
 * Walk the whole graph and collect every `{"@id": "..."}` *reference* — an
 * object whose only key is `@id` (i.e. a pointer to another node, not a node
 * that itself declares an @id alongside @type/other fields).
 */
function referencedIds(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) referencedIds(item, acc);
    return acc;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === "@id" && typeof obj["@id"] === "string") {
      acc.add(obj["@id"] as string);
      return acc;
    }
    for (const key of keys) referencedIds(obj[key], acc);
  }
  return acc;
}

/** Recursively assert nothing serializes to `undefined` (stripUndefined worked). */
function assertNoUndefined(value: unknown, path = "root"): void {
  if (value === undefined) {
    assert.fail(`undefined value left in JSON-LD at ${path}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUndefined(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      assertNoUndefined(child, `${path}.${key}`);
    }
  }
}

const builders: Array<{ name: string; build: () => JsonLdGraph }> = [
  { name: "startupJsonLd", build: () => startupJsonLd(startup, SITE_URL) as unknown as JsonLdGraph },
  { name: "investorJsonLd", build: () => investorJsonLd(investor, rounds, SITE_URL) as unknown as JsonLdGraph },
];

for (const { name, build } of builders) {
  test(`${name}: every @graph node has an @type`, () => {
    const graph = build();
    assert.ok(Array.isArray(graph["@graph"]), "@graph should be an array");
    assert.ok(graph["@graph"].length > 0, "@graph should not be empty");
    for (const node of graph["@graph"]) {
      assert.ok(typeof node["@type"] === "string" && node["@type"], `node missing @type: ${JSON.stringify(node)}`);
    }
  });

  test(`${name}: every @id reference resolves to a node in the graph`, () => {
    const graph = build();
    const defined = definedIds(graph);
    const referenced = referencedIds(graph["@graph"]);
    assert.ok(referenced.size > 0, "expected at least one @id reference (publisher/isPartOf/mainEntity)");
    for (const ref of referenced) {
      assert.ok(defined.has(ref), `dangling @id reference: ${ref} (defined: ${[...defined].join(", ")})`);
    }
  });

  test(`${name}: no undefined values survive JSON serialization`, () => {
    const graph = build();
    // JSON.stringify silently drops undefined; round-trip then walk to be sure
    // stripUndefined removed them at the structural level too.
    assertNoUndefined(JSON.parse(JSON.stringify(graph)));
  });

  test(`${name}: any ItemList numberOfItems matches itemListElement length`, () => {
    const graph = build();
    const itemLists = graph["@graph"].filter((node) => node["@type"] === "ItemList");
    for (const list of itemLists) {
      const elements = list.itemListElement;
      assert.ok(Array.isArray(elements), "itemListElement should be an array");
      assert.equal(
        list.numberOfItems,
        (elements as unknown[]).length,
        "numberOfItems must equal itemListElement.length"
      );
    }
  });
}

test("investorJsonLd produces an ItemList covering the funding rounds", () => {
  const graph = investorJsonLd(investor, rounds, SITE_URL) as unknown as JsonLdGraph;
  const list = graph["@graph"].find((node) => node["@type"] === "ItemList");
  assert.ok(list, "investor graph should contain an ItemList");
  assert.equal(list?.numberOfItems, rounds.length);
});

test("startupJsonLd publisher/isPartOf point at the shared site organization and website", () => {
  const graph = startupJsonLd(startup, SITE_URL) as unknown as JsonLdGraph;
  const defined = definedIds(graph);
  assert.ok(defined.has(`${SITE_URL}/#organization`), "site organization node should exist");
  assert.ok(defined.has(`${SITE_URL}/#website`), "site website node should exist");
});

test("homeJsonLd exposes the machine-readable startup dataset distributions", () => {
  const graph = homeJsonLd([startup], SITE_URL) as unknown as JsonLdGraph;
  const dataset = graph["@graph"].find((node) => node["@type"] === "Dataset");

  assert.ok(dataset, "home graph should contain a Dataset node for AI consumers");
  assert.equal(dataset?.isAccessibleForFree, true);
  assert.equal(dataset?.conditionsOfAccess, "Public editorial pages may be used for search, answer-engine retrieval, and citation. Model training permission is governed by robots.txt.");

  const distribution = dataset?.distribution;
  assert.ok(Array.isArray(distribution), "Dataset should expose DataDownload distributions");
  const contentUrls = (distribution as Array<Record<string, unknown>>).map((item) => item.contentUrl);
  assert.ok(contentUrls.includes(`${SITE_URL}/llms-full.txt`));
  assert.ok(contentUrls.includes(`${SITE_URL}/ai-index.json`));
  assert.ok(contentUrls.includes(`${SITE_URL}/feed.xml`));
});

test("canonicalPath strips prerendered .html file paths to public routes", () => {
  assert.equal(canonicalPath("/index.html"), "/");
  assert.equal(canonicalPath("/index"), "/");
  assert.equal(canonicalPath("/startups/airspeed.html"), "/startups/airspeed");
  assert.equal(canonicalPath("/collections/ai-ml.html"), "/collections/ai-ml");
  assert.equal(canonicalPath("/weekly/2/"), "/weekly/2");
});
