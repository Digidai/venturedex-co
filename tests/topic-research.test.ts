import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createContentReaders } from "../src/lib/content-transform";
import { getTopicPages, type TopicPage } from "../src/lib/topic-pages";
import { assertValidTopicResearch, getTopicResearch, TOPIC_RESEARCH_FIELDS } from "../src/lib/topic-research";
import researchJson from "../content/topic-research.json";

const records = fs.readdirSync(new URL("../content/startups/", import.meta.url))
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(fs.readFileSync(new URL(`../content/startups/${name}`, import.meta.url), "utf8")));
const readers = createContentReaders({ records, timestamps: {}, investorDirectory: {}, collectionConfigs: [] });
const topics = getTopicPages(readers.getContentStartups(), []);
const topicBySlug = (slug: string): TopicPage => topics.find((topic) => topic.slug === slug)!;

test("two substantive guides use four published members each and keep all six topic routes", () => {
  assert.equal(topics.length, 6);
  const guides = topics.map((topic) => getTopicResearch(topic)).filter((guide) => guide !== null);
  assert.deepEqual(new Set(guides.map((guide) => guide.topic_slug)), new Set(["ai-agent-startups", "developer-tools-startups"]));
  for (const guide of guides) {
    assert.equal(guide.products.length, 4);
    assert.ok(guide.products.every((product) => product.startup.workflow_status === "published"));
  }
  assert.deepEqual(guides[0].products.map((product) => product.startup.slug), ["dust", "vapi", "arcade", "scaled-cognition"]);
  assert.deepEqual(guides[1].products.map((product) => product.startup.slug), ["niteshift", "meticulous", "weave", "mage"]);
});

test("every comparative field resolves to dated, directly linked public evidence", () => {
  for (const topic of topics) {
    const guide = getTopicResearch(topic);
    if (!guide) continue;
    for (const product of guide.products) {
      for (const field of TOPIC_RESEARCH_FIELDS) {
        assert.ok(product[field].text.trim());
        assert.equal(product[field].sources.length, product[field].source_ids.length);
        for (const source of product[field].sources) {
          assert.equal(source.id, product.sources[source.number - 1].id);
          assert.equal(new URL(source.url).protocol, "https:");
          assert.ok(source.checked_at <= guide.checked_at);
        }
      }
    }
  }
});

test("comparison check dates never replace absent, invalid, or older profile review dates", () => {
  const topic = structuredClone(topicBySlug("ai-agent-startups"));
  const dust = topic.startups.find((startup) => startup.slug === "dust")!;
  dust.research_json = JSON.stringify({ verified_at: "2026-01-01", sources: [] });
  let guide = getTopicResearch(topic)!;
  assert.equal(guide.checked_at, "2026-09-08");
  assert.equal(guide.products[0].profileReviewedAt, "2026-01-01");
  for (const review of [null, "{invalid", JSON.stringify({ verified_at: "2026-02-30" })]) {
    dust.research_json = review;
    guide = getTopicResearch(topic)!;
    assert.equal(guide.products[0].profileReviewedAt, null);
    assert.equal(guide.checked_at, "2026-09-08");
  }
});

test("a curated choice cannot bypass topic matching or published status", () => {
  const topic = structuredClone(topicBySlug("ai-agent-startups"));
  topic.startups = topic.startups.filter((startup) => startup.slug !== "dust");
  assert.throws(() => getTopicResearch(topic), /dust is not a published member/);
  const unpublished = structuredClone(topicBySlug("developer-tools-startups"));
  unpublished.startups.find((startup) => startup.slug === "weave")!.workflow_status = "draft";
  assert.throws(() => getTopicResearch(unpublished), /weave is not a published member/);
});

test("missing comparative dimensions and dangling citations stop publication", () => {
  const missingField = structuredClone(researchJson) as unknown as Array<{ products: Array<Record<string, unknown>> }>;
  delete missingField[0].products[0].pricing;
  assert.throws(() => assertValidTopicResearch(missingField), /dust.pricing requires resolvable source_ids/);
  const dangling = structuredClone(researchJson);
  dangling[0].products[0].workflow.source_ids = ["not-a-source"];
  assert.throws(() => assertValidTopicResearch(dangling), /workflow requires resolvable source_ids/);
  const duplicateCitation = structuredClone(researchJson);
  duplicateCitation[0].products[0].workflow.source_ids = ["agent", "agent"];
  assert.throws(() => assertValidTopicResearch(duplicateCitation), /workflow requires resolvable source_ids/);
});

test("invalid source dates, unsafe URLs, and duplicate identifiers are rejected", () => {
  for (const date of ["2026-02-30", "2026-09-09", "September 8, 2026"]) {
    const data = structuredClone(researchJson);
    data[0].products[0].sources[0].checked_at = date;
    assert.throws(() => assertValidTopicResearch(data), /invalid or duplicate source/);
  }
  for (const url of ["javascript:alert(1)", "/docs", "https://user:password@example.com/docs"]) {
    const data = structuredClone(researchJson);
    data[0].products[0].sources[0].url = url;
    assert.throws(() => assertValidTopicResearch(data), /source URL must be absolute HTTPS/);
  }
  const duplicateSource = structuredClone(researchJson);
  duplicateSource[0].products[0].sources[1].id = "agent";
  assert.throws(() => assertValidTopicResearch(duplicateSource), /invalid or duplicate source/);
  assert.throws(() => assertValidTopicResearch([researchJson[0], researchJson[0]]), /unique topic slugs/);
});

test("selection and decision links cannot silently introduce unresearched products", () => {
  const duplicateProduct = structuredClone(researchJson);
  duplicateProduct[0].products[1] = duplicateProduct[0].products[0];
  assert.throws(() => assertValidTopicResearch(duplicateProduct), /unique startup slugs/);
  const danglingStep = structuredClone(researchJson);
  danglingStep[0].decision_steps[0].startup_slugs = ["gray-swan"];
  assert.throws(() => assertValidTopicResearch(danglingStep), /decision steps must reference selected products/);
  const thinGuide = structuredClone(researchJson);
  thinGuide[0].products = thinGuide[0].products.slice(0, 3);
  assert.throws(() => assertValidTopicResearch(thinGuide), /select 4–6 products/);
});

test("commercial scope and documented evidence boundaries remain explicit", () => {
  const dev = getTopicResearch(topicBySlug("developer-tools-startups"))!;
  const ai = getTopicResearch(topicBySlug("ai-agent-startups"))!;
  assert.match(dev.products.find((product) => product.startup.slug === "meticulous")!.limitations.text, /Default recorded-response replay does not establish live-backend correctness/);
  assert.match(dev.products.find((product) => product.startup.slug === "meticulous")!.limitations.text, /Request stubbing can be configured/);
  assert.match(dev.products.find((product) => product.startup.slug === "weave")!.pricing.text, /Prompt Router separately/);
  assert.match(dev.products.find((product) => product.startup.slug === "mage")!.limitations.text, /Mage Pro, not.*open-source/);
  assert.match(ai.products.find((product) => product.startup.slug === "vapi")!.pricing.text, /excluding model-provider/);
  assert.match(ai.products.find((product) => product.startup.slug === "scaled-cognition")!.limitations.text, /vendor assertions/);
});

test("topic template exposes semantic, keyboard-scrollable comparisons and visible evidence dates", () => {
  const template = fs.readFileSync(new URL("../src/pages/topics/[slug].astro", import.meta.url), "utf8");
  assert.match(template, /const research = getTopicResearch\(topic\)/);
  assert.match(template, /id="selection" aria-labelledby="selection-heading"/);
  assert.match(template, /class="comparison-scroll" tabindex="0" role="region" aria-label="Workflow selection table/);
  assert.match(template, /<table class="selection-table">/);
  assert.match(template, /<caption>Documented workflows and purchasing questions/);
  assert.match(template, /href=\{source.url\}/);
  assert.match(template, /datetime=\{research.checked_at\}/);
  assert.match(template, /datetime=\{product.profileReviewedAt\}/);
  assert.match(template, /not a hands-on test or independent validation/);
  assert.match(template, /href="\/research\/coding-agent-verification-stack"/);
  assert.match(template, /overflow-x: auto/);
});
