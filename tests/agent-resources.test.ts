import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  buildStartupAgentIndex,
  buildStartupAgentResource,
  buildStartupChanges,
  renderStartupAgentMarkdown,
} from "../src/lib/agent-resources";
import { createContentReaders, type JsonRecord, type TimestampEntry } from "../src/lib/content-transform";
import { withHttpPolicy } from "../src/lib/http-policy";
import { GET as llmsGet } from "../src/pages/llms.txt";

const SITE = "https://venturedex.co";
const record = {
  slug: "example-ai",
  product_name: "Example AI",
  domain: "example.ai",
  summary: "A directory summary.",
  editor_note: "An editorial assessment, not a company fact.",
  why_featured: "An interesting workflow.",
  product_type: "SaaS",
  tags: "agents,workflow",
  investors: "Example Capital",
  funding: [{ amount: "$4M", stage: "Seed", date: "2026-09-01", source_url: "https://news.example/funding", source_name: "Funding News" }],
  research: {
    verified_at: "2026-09-07",
    sources: [
      { id: "official_site", label: "Company", type: "official", url: "https://example.ai" },
      { id: "internal_note", label: "Editorial review", type: "editorial" },
    ],
    product_evidence: [
      { claim: "The company describes a workflow tool.", source_ids: ["official_site"] },
      { claim: "This workflow appears useful.", source_ids: ["internal_note"] },
    ],
    market_context: { category: "Workflow tools" },
    risks: [{ claim: "Adoption is unproven.", basis: "No usage evidence was recorded." }],
  },
};

function fixture(raw: JsonRecord = record) {
  const readers = createContentReaders({
    records: [raw],
    timestamps: { "example-ai": { published_at: "2026-09-02 10:00:00" } },
    investorDirectory: {},
    collectionConfigs: [],
  });
  const startup = readers.getContentStartups()[0];
  return { startup, fundingRounds: readers.getContentFundingRoundsForStartup(startup.slug) };
}

test("single-startup resources preserve source IDs and separate editorial from recorded claims", () => {
  const resource = buildStartupAgentResource(fixture());
  assert.equal(resource.id, `${SITE}/startups/example-ai#profile`);
  assert.equal(resource.canonical_url, `${SITE}/startups/example-ai`);
  assert.equal(resource.representations.json, `${SITE}/startups/example-ai.json`);
  assert.equal(resource.representations.markdown, `${SITE}/startups/example-ai.md`);
  assert.equal(resource.verified_at, "2026-09-07");
  assert.deepEqual(resource.sources.slice(0, 2).map((source) => source.id), ["official_site", "internal_note"]);
  assert.deepEqual(resource.product_evidence[0].source_ids, ["official_site"]);
  assert.equal(resource.product_evidence[0].kind, "source_linked_statement");
  assert.equal(resource.editorial.summary, record.summary);
  assert.equal(resource.editorial.note, record.editor_note);
  assert.equal(resource.editorial.risks[0].claim, record.research.risks[0].claim);
  assert.equal(resource.sources.find((source) => source.id === "internal_note")?.url, null);
  assert.equal(resource.funding_rounds[0].source_ids.length, 1);
  assert.ok(resource.sources.some((source) => source.id === resource.funding_rounds[0].source_ids[0] && source.url === "https://news.example/funding"));
  assert.match(resource.interpretation_notes.join(" "), /not independent verification/);
  assert.doesNotMatch(JSON.stringify(resource), /codex_stage|research_json|screenshot_status|first_seen_at/);
});

test("claim IDs survive source and statement reordering and change when the claim changes", () => {
  const original = buildStartupAgentResource(fixture());
  const reordered = buildStartupAgentResource(fixture({
    ...record,
    research: { ...record.research, sources: [...record.research.sources].reverse(), product_evidence: [...record.research.product_evidence].reverse() },
  }));
  for (const evidence of original.product_evidence) {
    assert.equal(reordered.product_evidence.find((item) => item.claim === evidence.claim)?.id, evidence.id);
  }
  const changed = buildStartupAgentResource(fixture({
    ...record,
    research: { ...record.research, product_evidence: [{ claim: "A changed statement.", source_ids: ["official_site"] }] },
  }));
  assert.notEqual(changed.product_evidence[0].id, original.product_evidence[0].id);
});

test("missing source references stay explicit instead of being silently dropped or invented", () => {
  const resource = buildStartupAgentResource(fixture({
    ...record,
    research: { ...record.research, product_evidence: [{ claim: "An unresolved statement.", source_ids: ["official_site", "missing_source"] }] },
  }));
  assert.deepEqual(resource.product_evidence[0].source_ids, ["official_site", "missing_source"]);
  assert.deepEqual(resource.product_evidence[0].unresolved_source_ids, ["missing_source"]);
  assert.ok(!resource.sources.some((source) => source.id === "missing_source"));
  assert.match(renderStartupAgentMarkdown(resource), /Unresolved source IDs: missing\\_source/);
});

test("Markdown includes the same evidence, sources, dates and editorial content as JSON", () => {
  const resource = buildStartupAgentResource(fixture());
  const markdown = renderStartupAgentMarkdown(resource);
  assert.match(markdown, /^# Example AI\n/);
  assert.ok(markdown.includes(resource.product_evidence[0].claim));
  assert.ok(markdown.includes(resource.product_evidence[0].id));
  assert.ok(markdown.includes(resource.editorial.note!));
  assert.ok(markdown.includes(resource.editorial.risks[0].basis));
  assert.ok(markdown.includes("official\\_site"));
  assert.ok(markdown.includes("https://news.example/funding"));
  assert.match(markdown, /Research verified at: 2026-09-07/);
  assert.match(markdown, /No distinct update recorded/);
  assert.doesNotMatch(markdown, /undefined/);
});

test("compact index is deterministic and only advertises published profiles", () => {
  const { startup } = fixture();
  const other = { ...startup, slug: "another", product_name: "Another" };
  const draft = { ...startup, slug: "draft", workflow_status: "draft" as const };
  const index = buildStartupAgentIndex([startup, draft, other]);
  assert.equal(index.item_count, 2);
  assert.deepEqual(index.items.map((item) => item.slug), ["another", "example-ai"]);
  assert.deepEqual(index, buildStartupAgentIndex([other, startup, draft]));
  assert.doesNotMatch(JSON.stringify(index), /editor_note|product_evidence|sources|funding_rounds/);
});

test("change feed does not treat a later research review or equal update timestamp as an update", () => {
  const { startup } = fixture();
  const feed = buildStartupChanges([startup]);
  assert.equal(feed.item_count, 1);
  assert.equal(feed.items[0].type, "published");
  assert.equal(feed.items[0].occurred_at, "2026-09-02T10:00:00.000Z");
  assert.equal(feed.latest_recorded_at, "2026-09-02T10:00:00.000Z");
  assert.equal(feed.complete_history, false);
  assert.equal(feed.deletions_included, false);
  assert.match(feed.scope, /not a complete change history or a deletion log/);
  assert.deepEqual(feed, buildStartupChanges([startup]));
});

test("change feed accepts only recorded timestamps and limits events with stable IDs", () => {
  const { startup } = fixture();
  const updated = { ...startup, updated_at: "2026-09-08T09:00:00Z" };
  const full = buildStartupChanges([updated]);
  assert.deepEqual(full.items.map((item) => item.type), ["updated", "published"]);
  const limited = buildStartupChanges([updated], SITE, 1);
  assert.equal(limited.items[0].id, full.items[0].id);
  assert.equal(limited.has_more, true);
  assert.equal(limited.item_count, 1);
  assert.equal(buildStartupChanges([{ ...startup, published_at: "not a date", updated_at: "2026-09-08T09:00:00Z" }]).item_count, 0);
  assert.equal(buildStartupChanges([{ ...startup, published_at: null }]).item_count, 0);
  assert.throws(() => buildStartupChanges([startup], SITE, 0));
});

test("Agent representations have content types, canonical hints, and status-safe caching", () => {
  for (const extension of ["md", "json"]) {
    const url = `${SITE}/startups/example-ai.${extension}`;
    const response = withHttpPolicy(new Request(url), new Response("content"));
    assert.equal(response.headers.get("Content-Type"), extension === "md" ? "text/markdown; charset=utf-8" : "application/json; charset=utf-8");
    assert.equal(response.headers.get("Link"), `<${SITE}/startups/example-ai>; rel="canonical"`);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    const missing = withHttpPolicy(new Request(url), new Response("not found", { status: 404 }));
    assert.equal(missing.headers.get("Cache-Control"), null);
    assert.equal(missing.headers.get("Link"), null);
  }
  for (const path of ["/startup-index.json", "/changes.json"]) {
    const response = withHttpPolicy(new Request(`${SITE}${path}`), new Response("{}"));
    assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
    assert.match(response.headers.get("Cache-Control") ?? "", /max-age=300/);
  }
  assert.equal(withHttpPolicy(new Request(`${SITE}/sitemaps/startups.xml`), new Response("xml")).headers.get("Cache-Control"), "public, max-age=3600");
});

test("root llms guide stays small and points to atomic retrieval plus existing full corpus", async () => {
  const response = await llmsGet({ site: new URL(SITE) } as Parameters<typeof llmsGet>[0]);
  const body = await response.text();
  assert.ok(Buffer.byteLength(body) < 6000);
  for (const path of ["/startup-index.json", "/changes.json", "/llms-full.txt", "/ai-index.json", "/launches.json", "/robots.txt"]) {
    assert.ok(body.includes(`${SITE}${path}`), `missing ${path}`);
  }
  assert.match(body, /Model training is not granted/);
  assert.match(body, /Product Launch Pages/);
});

test("all current startup resources retain original research sources and resolve evidence references", () => {
  const contentDir = new URL("../content/startups/", import.meta.url);
  const records = readdirSync(contentDir).filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(new URL(name, contentDir), "utf8")) as JsonRecord);
  const timestampData = JSON.parse(readFileSync(new URL("../content/timestamps.json", import.meta.url), "utf8"));
  const readers = createContentReaders({
    records,
    timestamps: Object.fromEntries(Object.entries(timestampData).filter(([key]) => !key.startsWith("__"))) as Record<string, TimestampEntry>,
    investorDirectory: {},
    collectionConfigs: [],
  });
  const startups = readers.getContentStartups();
  const index = buildStartupAgentIndex(startups);
  assert.equal(index.item_count, records.length);
  for (const startup of startups) {
    const resource = buildStartupAgentResource({ startup, fundingRounds: readers.getContentFundingRoundsForStartup(startup.slug) });
    const research = startup.research_json ? JSON.parse(startup.research_json) : null;
    assert.equal(resource.verified_at, research?.verified_at || null, startup.slug);
    for (const source of research?.sources ?? []) {
      assert.ok(resource.sources.some((item) => item.id === source.id), `${startup.slug} lost source ${source.id}`);
    }
    for (const evidence of resource.product_evidence) {
      assert.deepEqual(evidence.unresolved_source_ids, [], `${startup.slug} has unresolved source references`);
    }
    assert.doesNotMatch(renderStartupAgentMarkdown(resource), /undefined/, startup.slug);
  }
});
