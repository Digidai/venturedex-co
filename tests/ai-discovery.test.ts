import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAiDiscoveryIndex,
  renderLlmsFullText,
} from "../src/lib/ai-discovery";
import type { TopicPage } from "../src/lib/topic-pages";
import type { Collection, FundingRound, Startup } from "../src/lib/types";
import type { WeeklyIssueContent } from "../src/lib/weekly";

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
  research_json: JSON.stringify({
    verified_at: "2026-06-25",
    sources: [
      { id: "official", label: "Official product page", url: "https://example.ai/product", type: "official" },
    ],
    product_evidence: [
      { claim: "The product claims governed workflow automation for compliance teams.", source_ids: ["official"] },
    ],
    market_context: {
      primary_user: "compliance operators",
      category: "AI workflow automation",
      differentiation: "source-backed workflow execution",
      why_now: "regulated teams are adopting agent workflows cautiously",
    },
    risks: [
      { claim: "Enterprise rollout may require heavy setup.", basis: "workflow automation requires customer-specific controls" },
    ],
  }),
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
  founder_name: null,
  founder_quote: null,
  founder_responded_at: null,
  first_seen_at: "2026-06-25T10:00:00Z",
  last_checked_at: null,
  published_at: "2026-06-25T10:00:00Z",
  investors: "Useful Ventures, Example Capital",
  links_json: JSON.stringify({ docs: "https://docs.example.ai" }),
  tags: "compliance,workflow",
  is_featured: 1,
  created_at: "2026-06-25T10:00:00Z",
  updated_at: "2026-06-25T12:00:00Z",
};

const fundingRound: FundingRound = {
  id: "round-1",
  company_name: "Example AI",
  company_slug: "example-ai",
  company_url: "https://example.ai",
  amount: "$4M",
  stage: "Seed",
  lead_investor: "Useful Ventures",
  date: "2026-06-24",
  source_url: "https://example.com/funding",
  source_name: "Example News",
};

const weeklyIssue: WeeklyIssueContent = {
  issue_number: 1,
  title: "AI Enters Regulated Workflows",
  week_start: "2026-06-22",
  week_end: "2026-06-25",
  published_at: "2026-06-25T13:00:00Z",
  status: "published",
  editorial_intro: "A weekly issue about AI in regulated workflows.",
  research_summary: "Source-backed weekly research summary.",
  evaluation_method: ["official sources"],
  themes: [],
  picks: [{
    slug: "example-ai",
    why_this_week: "Fresh funding.",
    product_evaluation: "Clear workflow wedge.",
    evidence: [],
    risks: [],
    verdict: "Worth tracking.",
  }],
};

const topic: TopicPage = {
  slug: "ai-workflow-startups",
  title: "AI Workflow Startups",
  kicker: "Workflow AI",
  description: "Startups using AI inside operational workflows.",
  intro: "A source-backed map of workflow AI companies.",
  searchIntent: "Compare AI workflow startups by use case and funding signal.",
  path: "/topics/ai-workflow-startups",
  startups: [startup],
  latestStartups: [startup],
  featuredStartups: [startup],
  topTags: [],
  topInvestors: [],
  fundingStages: [],
  relatedIssues: [],
  generatedFrom: {
    productTypes: ["SaaS"],
    tags: ["workflow"],
  },
};

const collection: Collection & { startup_count: number } = {
  id: "c-ai-workflow",
  slug: "ai-workflow",
  title: "AI Workflow",
  description: "AI products with workflow evidence.",
  intro: "Source-backed workflow AI companies.",
  search_intent: "Find workflow AI startups.",
  why_now: "Teams are moving agentic systems into production.",
  type: "editorial",
  published: 1,
  startup_count: 1,
};

function buildFixtureIndex() {
  return buildAiDiscoveryIndex({
    siteUrl: SITE_URL,
    startups: [startup],
    fundingRounds: [fundingRound],
    weeklyIssues: [weeklyIssue],
    topics: [topic],
    collections: [collection],
  });
}

test("buildAiDiscoveryIndex exposes canonical AI discovery surfaces", () => {
  const index = buildFixtureIndex();

  assert.equal(index.schema_version, "2026-06-25");
  assert.equal(index.site.discovery.llms_txt, `${SITE_URL}/llms.txt`);
  assert.equal(index.site.discovery.llms_full_txt, `${SITE_URL}/llms-full.txt`);
  assert.equal(index.site.discovery.ai_index_json, `${SITE_URL}/ai-index.json`);
  assert.equal(index.counts.startups, 1);
  assert.equal(index.startups[0]?.url, `${SITE_URL}/startups/example-ai`);
  assert.equal(index.startups[0]?.official_url, "https://example.ai/");
});

test("AI index carries source trails and citation policy for retrieval apps", () => {
  const index = buildFixtureIndex();
  const entry = index.startups[0];

  assert.ok(entry.sources.some((source) => source.type === "official"));
  assert.ok(entry.sources.some((source) => source.type === "funding"));
  assert.ok(entry.sources.some((source) => source.url === "https://docs.example.ai/"));
  assert.ok(entry.sources.every((source) => /^https?:\/\//.test(source.url)));
  assert.ok(index.citation_policy.some((line) => /official company pages and funding sources/.test(line)));
  assert.ok(index.site.ai_use_policy.not_granted.includes("model training permission"));
});

test("renderLlmsFullText produces a markdown context file without undefined leaks", () => {
  const index = buildFixtureIndex();
  const body = renderLlmsFullText(index);

  assert.match(body, /^# VentureDex Full LLM Context/);
  assert.match(body, /## Complete Startup Profiles/);
  assert.match(body, /This file does not grant model training rights/);
  assert.match(body, /Startup profiles: 1/);
  assert.match(body, /Product evidence/);
  assert.doesNotMatch(body, /undefined/);
});
