import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceIndex } from "../src/lib/evidence-index";
import type { Startup } from "../src/lib/types";

function startup(overrides: Partial<Startup> = {}): Startup {
  return {
    id: "startup-example",
    slug: "example-ai",
    domain: "example.ai",
    canonical_url: "https://example.ai",
    product_name: "Example AI",
    title: null,
    summary: "Source-backed workflow automation.",
    long_description: null,
    editor_note: "A focused workflow product.",
    research_json: JSON.stringify({
      verified_at: "2026-08-20",
      sources: [
        { id: "official", label: "Official site", url: "https://example.ai/", type: "official" },
        { id: "product", label: "Product", url: "https://example.ai/product", type: "product" },
        { id: "duplicate", label: "Duplicate", url: "https://example.ai/product", type: "product" },
        { id: "bad", label: "Invalid", url: "ftp://example.ai/file", type: "editorial" },
      ],
      product_evidence: [
        { claim: "The product exposes an evidence trail.", source_ids: ["product"] },
        { claim: "The workflow has an audit log.", source_ids: ["product"] },
      ],
      risks: [{ claim: "Adoption is unproven.", basis: "Editorial assessment." }],
    }),
    editor_rating: 4,
    why_featured: "Evidence-rich workflow",
    curator: "dai",
    product_type: "SaaS",
    funding_stage: "Seed",
    funding_display: "$4M",
    founded_year: 2025,
    team_size: null,
    hq_location: null,
    region: "US",
    framework: null,
    runtime_status: "live",
    workflow_status: "published",
    codex_stage: "manual",
    screenshot_r2_key: null,
    screenshot_status: "ready",
    og_image_r2_key: null,
    founder_name: null,
    founder_quote: null,
    founder_responded_at: null,
    first_seen_at: "2026-08-18T00:00:00Z",
    last_checked_at: null,
    published_at: "2026-08-18T00:00:00Z",
    investors: "Example Capital",
    links_json: null,
    tags: "ai agents, compliance, AI Agents",
    is_featured: 1,
    created_at: "2026-08-18T00:00:00Z",
    updated_at: "2026-08-21T00:00:00Z",
    ...overrides,
  };
}

test("buildEvidenceIndex derives deterministic evidence and coverage metrics", () => {
  const result = buildEvidenceIndex({
    startups: [
      startup(),
      startup({
        id: "startup-second",
        slug: "second-ai",
        product_name: "Second AI",
        domain: "second.ai",
        funding_stage: "Series A",
        tags: "AI agents, developer tools",
        updated_at: "2026-08-22T00:00:00Z",
        research_json: JSON.stringify({
          verified_at: "2026-08-19",
          sources: [
            { id: "funding", label: "Funding", url: "https://news.example/funding", type: "funding" },
          ],
          product_evidence: [{ claim: "A second evidence statement.", source_ids: ["funding"] }],
          risks: [],
        }),
      }),
      startup({
        id: "startup-unnamed",
        slug: "unnamed-ai",
        product_name: "Unnamed AI",
        domain: "unnamed.ai",
        funding_stage: "Unspecified",
        tags: null,
        updated_at: "2026-08-21T00:00:00Z",
      }),
    ],
    investorCount: 3,
    launchCount: 7,
    weeklyIssueCount: 2,
    launchesUpdatedAt: "2026-08-23T12:00:00Z",
  });

  assert.equal(result.asOf, "2026-08-23");
  assert.deepEqual(result.counts, {
    startups: 3,
    investors: 3,
    launches: 7,
    weeklyIssues: 2,
    profilesWithSources: 3,
    sourceRecords: 7,
    uniqueSourceUrls: 3,
    sourceDomains: 2,
    evidenceStatements: 5,
    riskNotes: 2,
  });
  assert.deepEqual(result.sourceTypes, [
    { id: "official", label: "Official", count: 2 },
    { id: "product", label: "Product", count: 4 },
    { id: "funding", label: "Funding", count: 1 },
    { id: "repository", label: "Repository", count: 0 },
    { id: "social", label: "Social", count: 0 },
    { id: "editorial", label: "Editorial", count: 0 },
  ]);
  assert.deepEqual(result.fundingStages, [
    { id: "unspecified", label: "Stage undisclosed", count: 1 },
    { id: "seed", label: "Seed", count: 1 },
    { id: "series-a", label: "Series A", count: 1 },
  ]);
  assert.deepEqual(result.topThemes, [
    { label: "ai agents", count: 2 },
    { label: "compliance", count: 1 },
    { label: "developer tools", count: 1 },
  ]);
});

test("buildEvidenceIndex degrades malformed research to zero without undefined values", () => {
  const result = buildEvidenceIndex({
    startups: [startup({ research_json: "not-json", tags: null, funding_stage: null })],
    investorCount: 0,
    launchCount: 0,
    weeklyIssueCount: 0,
  });

  assert.equal(result.counts.profilesWithSources, 0);
  assert.equal(result.counts.sourceRecords, 0);
  assert.equal(result.counts.evidenceStatements, 0);
  assert.deepEqual(result.fundingStages, []);
  assert.deepEqual(result.topThemes, []);
  assert.doesNotMatch(JSON.stringify(result), /undefined/);
});
