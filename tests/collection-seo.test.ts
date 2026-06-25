import assert from "node:assert/strict";
import test from "node:test";
import { collectionJsonLd, collectionResearchSummary } from "../src/lib/seo";
import type { Collection } from "../src/lib/types";

const collection: Collection = {
  id: "c-ai-agents",
  slug: "ai-agents",
  title: "AI Agents",
  description: "Autonomous systems that take real action.",
  intro: "Intro marker for governed workflow execution.",
  search_intent: "Intent marker for comparing agent startups.",
  why_now: "Why-now marker for production adoption.",
  type: "editorial",
  published: 1,
};

test("collectionResearchSummary preserves intro, intent, and why-now context", () => {
  const summary = collectionResearchSummary(collection);

  assert.match(summary, /Intro marker/);
  assert.match(summary, /Intent marker/);
  assert.match(summary, /Why-now marker/);
});

test("collectionJsonLd description includes full collection research context", () => {
  const graph = collectionJsonLd(collection, [], "https://venturedex.co") as { "@graph": Array<Record<string, unknown>> };
  const page = graph["@graph"].find((node) => node["@type"] === "CollectionPage");

  assert.ok(page, "expected CollectionPage node");
  assert.match(String(page.description), /Intro marker/);
  assert.match(String(page.description), /Intent marker/);
  assert.match(String(page.description), /Why-now marker/);
});
