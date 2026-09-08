import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  assertValidTopicConfigs,
  buildTopicPage,
  buildTopicAnswer,
  buildTopicPages,
  getTopicPageConfigs,
  getTopicMatchesForStartups,
  getTopicPagesForStartup,
  startupMatchesTopic,
  type TopicPageConfig,
} from "../src/lib/topic-pages";
import { topicPageJsonLd } from "../src/lib/seo";
import type { Startup } from "../src/lib/types";
import type { FundingRound } from "../src/lib/types";
import { createContentReaders } from "../src/lib/content-transform";
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
  assert.equal(startupMatchesTopic(startup({ tags: "fintech,private capital" }), [], ["api"]), false);
  assert.equal(startupMatchesTopic(startup({ tags: "api,developer tools" }), [], ["api"]), true);
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

test("intent-specific topic configs avoid broad product or enterprise tags", () => {
  const bySlug = new Map(getTopicPageConfigs().map((topic) => [topic.slug, topic]));
  assert.deepEqual(bySlug.get("ai-agent-startups")?.match.product_types ?? [], []);
  assert.deepEqual(bySlug.get("ai-infrastructure-startups")?.match.product_types ?? [], []);
  assert.deepEqual(bySlug.get("legal-ai-startups")?.match.product_types ?? [], []);
  assert.equal((bySlug.get("ai-agent-startups")?.match.tags ?? []).includes("enterprise ai"), false);
});

test("getTopicPagesForStartup returns matching topics with a stable limit", () => {
  const developerToolsConfig: TopicPageConfig = {
    ...config,
    slug: "developer-tools-startups",
    title: "Developer Tools Startups",
    match: { product_types: ["Developer Tools"], tags: ["workflow automation"] },
  };
  const fintechConfig: TopicPageConfig = {
    ...config,
    slug: "fintech-infrastructure-startups",
    title: "Fintech Infrastructure Startups",
    match: { product_types: ["Fintech"], tags: [] },
  };
  const pages = buildTopicPages([config, developerToolsConfig, fintechConfig], [baseStartup], [weekly]);

  assert.deepEqual(
    getTopicPagesForStartup(baseStartup, [baseStartup], [weekly], 1, [config, developerToolsConfig, fintechConfig]).map((topic) => topic.slug),
    [pages[0].slug]
  );
  assert.deepEqual(
    getTopicPagesForStartup(baseStartup, [baseStartup], [weekly], 10, [config, developerToolsConfig, fintechConfig]).map((topic) => topic.slug),
    ["ai-agent-startups", "developer-tools-startups"]
  );
});

test("getTopicMatchesForStartups lists only selected startups inside each topic", () => {
  const agentB = startup({
    id: "startup-b",
    slug: "agent-b",
    product_name: "Agent B",
    tags: "AI Agents",
  });
  const matched = getTopicMatchesForStartups(
    [baseStartup, baseStartup],
    [baseStartup, agentB],
    [weekly],
    3,
    [config]
  );

  assert.equal(matched.length, 1);
  assert.equal(matched[0].topic.slug, "ai-agent-startups");
  assert.deepEqual(matched[0].matchingStartups.map((entry) => entry.slug), ["agent-a"]);
});

test("topicPageJsonLd exposes CollectionPage and ItemList count", () => {
  const page = buildTopicPage(config, [baseStartup], [weekly]);
  const graph = topicPageJsonLd(page, "https://venturedex.co") as { "@graph": Array<Record<string, unknown>> };
  const collection = graph["@graph"].find((node) => node["@type"] === "CollectionPage");
  const itemList = graph["@graph"].find((node) => node["@type"] === "ItemList");
  assert.ok(collection, "expected CollectionPage node");
  assert.equal(itemList?.numberOfItems, 1);
});

test("featured entries never bypass topic matching", () => {
  const page = buildTopicPage({
    ...config,
    match: { tags: ["healthcare ai"] },
    featured_slugs: ["gridcare"],
  }, [startup({ slug: "gridcare", tags: "energy,ai infrastructure", product_type: "Climate / Sustainability" })], []);
  assert.deepEqual(page.startups, []);
  assert.deepEqual(page.featuredStartups, []);
});

test("required topic terms are additional conditions and match whole words", () => {
  const health = startup({ product_type: "HealthTech", tags: "healthcare", summary: "AI-personalized care workflows." });
  assert.equal(startupMatchesTopic(health, ["HealthTech"], [], ["ai"]), true);
  assert.equal(startupMatchesTopic({ ...health, summary: "Paid online care plans." }, ["HealthTech"], [], ["ai"]), false);
  assert.equal(startupMatchesTopic({ ...health, product_type: "DevTools", tags: "developer tools" }, ["HealthTech"], [], ["ai"]), false);
});

test("comparison answers keep funding dates separate from profile and review dates", () => {
  const reviewedStartup = startup({
    published_at: "2026-06-09T00:00:00Z",
    research_json: JSON.stringify({
      verified_at: "2026-06-08",
      sources: [
        { id: "official", label: "Official", type: "official", url: "https://agent-a.com" },
        { id: "duplicate", label: "Same source", type: "product", url: "https://agent-a.com/" },
      ],
      product_evidence: [],
    }),
  });
  const older: FundingRound = {
    id: "round-1", company_name: "Agent A", company_slug: "agent-a", company_url: null,
    amount: "$4M", stage: "Seed", date: "2025-05-01", lead_investor: null,
    source_url: "https://example.com/seed", source_name: "Company announcement",
  };
  const latest = { ...older, id: "round-2", amount: "€7M", stage: "Series A", date: "2026-04-02", source_url: "https://example.com/series-a" };
  const page = buildTopicPage(config, [reviewedStartup], []);
  const answer = buildTopicAnswer(page, [older, latest]);
  assert.equal(answer.comparisonRows[0].latestFunding?.date, "2026-04-02");
  assert.equal(answer.comparisonRows[0].latestFunding?.amount, "€7M");
  assert.equal(answer.latestProfileDate, "2026-06-09T00:00:00.000Z");
  assert.equal(answer.latestReviewDate, "2026-06-08T00:00:00.000Z");
  assert.equal(answer.comparisonRows[0].sourceCount, 1);
  assert.equal(answer.withFundingSourceCount, 1);
  assert.equal(answer.withVerificationDateCount, 1);
  assert.match(answer.questions[1].answer, /not a complete market census or a ranking/);
  assert.match(answer.questions[2].answer, /separate from funding dates/);
  const missingLatestSource = buildTopicAnswer(page, [older, { ...latest, source_url: null }]);
  assert.equal(missingLatestSource.withFundingSourceCount, 0);
  assert.equal(missingLatestSource.comparisonRows[0].fundingSourceUrl, null);
  assert.equal(missingLatestSource.comparisonRows[0].latestFunding?.date, "2026-04-02");
});

test("coverage counts all profiles while the comparison remains bounded", () => {
  const startups = Array.from({ length: 15 }, (_, index) => startup({
    slug: `agent-${index}`, product_name: `Agent ${index}`, published_at: `2026-06-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
  }));
  const answer = buildTopicAnswer(buildTopicPage(config, startups, []), []);
  assert.equal(answer.profileCount, 15);
  assert.equal(answer.comparisonRows.length, 12);
  assert.equal(answer.comparisonRows[0].startup.slug, "agent-14");
  assert.equal(answer.withFundingSourceCount, 0);
  assert.equal(answer.withVerificationDateCount, 0);
  assert.equal(answer.latestReviewDate, null);
  assert.equal(answer.comparisonRows[0].latestFunding, null);
});

test("missing review evidence and funding sources are not inferred from publication dates", () => {
  const unreviewed = startup({ research_json: "{invalid", published_at: "2026-09-08T00:00:00Z" });
  const round: FundingRound = {
    id: "unknown", company_name: "Agent A", company_slug: "agent-a", company_url: null,
    amount: null, stage: "Seed", date: "", lead_investor: null, source_url: null, source_name: null,
  };
  const answer = buildTopicAnswer(buildTopicPage(config, [unreviewed], []), [round]);
  assert.equal(answer.latestReviewDate, null);
  assert.equal(answer.withFundingSourceCount, 0);
  assert.equal(answer.comparisonRows[0].latestFunding?.date, "");
});

test("real topic definitions distinguish AI healthcare and infrastructure from broad collections", () => {
  const records = ["triomics", "subtle-medical", "enzo-health", "9amhealth", "bioscan-research", "gridcare", "lexroom", "qiz-security", "stitch", "trackk", "canals"]
    .map((slug) => JSON.parse(fs.readFileSync(new URL(`../content/startups/${slug}.json`, import.meta.url), "utf8")));
  const readers = createContentReaders({ records, timestamps: {}, investorDirectory: {}, collectionConfigs: [] });
  const topics = new Map(buildTopicPages(getTopicPageConfigs(), readers.getContentStartups(), []).map((topic) => [topic.slug, topic]));
  const healthcare = topics.get("healthcare-ai-startups")!;
  assert.deepEqual(new Set(healthcare.startups.map((entry) => entry.slug)), new Set(["triomics", "subtle-medical", "enzo-health"]));
  assert.equal(healthcare.collectionPath, "/collections/healthtech");
  assert.deepEqual(topics.get("legal-ai-startups")?.startups.map((entry) => entry.slug), ["lexroom"]);
  assert.deepEqual(topics.get("fintech-infrastructure-startups")?.startups.map((entry) => entry.slug), ["stitch"]);
  assert.equal(getTopicPageConfigs().some((topic) => topic.slug === "healthcare-ai-startups" && topic.featured_slugs?.includes("gridcare")), false);
});
