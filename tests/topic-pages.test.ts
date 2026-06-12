import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidTopicConfigs,
  buildTopicPage,
  buildTopicPages,
  startupMatchesTopic,
  type TopicPageConfig,
} from "../src/lib/topic-pages";
import { topicPageJsonLd } from "../src/lib/seo";
import type { Startup } from "../src/lib/types";
import type { WeeklyIssueContent } from "../src/lib/weekly";

const baseStartup: Startup = {
  id: "startup-a",
  slug: "agent-a",
  domain: "agent-a.com",
  canonical_url: "https://agent-a.com",
  product_name: "Agent A",
  title: null,
  summary: "Agentic workflow automation for finance teams.",
  long_description: null,
  editor_note: null,
  research_json: null,
  editor_rating: null,
  why_featured: "Agentic workflow wedge",
  curator: "dai",
  product_type: "AI / ML",
  funding_stage: "Seed",
  funding_display: "$4M",
  founded_year: null,
  team_size: null,
  hq_location: null,
  region: "US",
  framework: null,
  runtime_status: "live",
  workflow_status: "published",
  codex_stage: "manual",
  screenshot_r2_key: "agent-a.webp",
  screenshot_status: "ready",
  og_image_r2_key: null,
  founder_name: null,
  founder_quote: null,
  founder_responded_at: null,
  first_seen_at: "2026-06-01T00:00:00Z",
  last_checked_at: null,
  published_at: "2026-06-01T00:00:00Z",
  investors: "Useful Ventures",
  links_json: null,
  tags: "AI Agents, workflow automation",
  is_featured: 0,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

const config: TopicPageConfig = {
  slug: "ai-agent-startups",
  title: "AI Agent Startups",
  kicker: "Agentic software",
  description: "A source-backed topic page.",
  intro: "Tracks agentic software with public product evidence.",
  search_intent: "Readers comparing AI agent startups.",
  match: { product_types: ["AI / ML"], tags: ["ai agents"] },
  featured_slugs: ["agent-b"],
};

const weekly: WeeklyIssueContent = {
  issue_number: 4,
  title: "Agents With Receipts",
  week_start: "2026-06-01",
  week_end: "2026-06-07",
  published_at: "2026-06-08",
  status: "published",
  editorial_intro: "Weekly intro",
  research_summary: "Weekly summary",
  evaluation_method: [],
  themes: [],
  picks: [{
    slug: "agent-a",
    why_this_week: "Visible workflow automation.",
    product_evaluation: "Strong workflow claim.",
    evidence: [],
    risks: [],
    verdict: "Track.",
  }],
};

function startup(overrides: Partial<Startup>): Startup {
  return { ...baseStartup, ...overrides };
}

test("startupMatchesTopic matches product type and tag case-insensitively", () => {
  assert.equal(startupMatchesTopic(baseStartup, ["AI / ML"], []), true);
  assert.equal(startupMatchesTopic(baseStartup, [], ["ai agents"]), true);
  assert.equal(startupMatchesTopic(baseStartup, [], ["legal ai"]), false);
});

test("buildTopicPage filters unpublished startups and puts configured featured slugs first", () => {
  const page = buildTopicPage(config, [
    baseStartup,
    startup({
      id: "startup-b",
      slug: "agent-b",
      product_name: "Agent B",
      published_at: "2026-05-01T00:00:00Z",
      tags: "enterprise ai",
    }),
    startup({
      id: "startup-draft",
      slug: "agent-draft",
      product_name: "Agent Draft",
      workflow_status: "draft",
      tags: "AI Agents",
    }),
  ], [weekly]);

  assert.deepEqual(page.startups.map((entry) => entry.slug), ["agent-b", "agent-a"]);
  assert.equal(page.latestStartups[0].slug, "agent-a");
  assert.equal(page.relatedIssues.length, 1);
  assert.deepEqual(page.relatedIssues[0].matchingPickSlugs, ["agent-a"]);
  assert.equal(page.topInvestors[0].term, "Useful Ventures");
});

test("buildTopicPages drops empty topics and rejects duplicate slugs", () => {
  const emptyConfig = { ...config, slug: "empty", match: { product_types: ["Fintech"], tags: [] } };
  assert.equal(buildTopicPages([emptyConfig], [baseStartup], []).length, 0);
  assert.throws(() => assertValidTopicConfigs([config, config]), /Duplicate topic slug/);
});

test("topicPageJsonLd exposes CollectionPage and ItemList count", () => {
  const page = buildTopicPage(config, [baseStartup], [weekly]);
  const graph = topicPageJsonLd(page, "https://venturedex.co") as { "@graph": Array<Record<string, unknown>> };
  const collection = graph["@graph"].find((node) => node["@type"] === "CollectionPage");
  const itemList = graph["@graph"].find((node) => node["@type"] === "ItemList");
  assert.ok(collection, "expected CollectionPage node");
  assert.equal(itemList?.numberOfItems, 1);
});
