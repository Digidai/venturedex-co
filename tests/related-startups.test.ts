import assert from "node:assert/strict";
import test from "node:test";
import { rankRelatedStartups } from "../src/lib/related-startups";
import type { Startup } from "../src/lib/types";

const company = (slug: string, tags: string | null, rest: Partial<Startup> = {}): Startup => ({
  slug, id: slug, workflow_status: "published", product_type: "SaaS", region: "US", tags,
  research_json: null, published_at: "2026-09-01", ...rest,
} as Startup);

test("shared geography, SaaS and generic AI tags cannot manufacture relevance", () => {
  const origin = company("conveo", "market research,video interviews,AI agents,enterprise software");
  const candidates = [origin, company("drone", "AI agents,enterprise software", {product_type:"Other"}), company("cells", "cell therapy")];
  assert.deepEqual(rankRelatedStartups(origin, candidates), []);
});

test("specific shared tags rank before recency, exclude self and drafts, never mutate", () => {
  const origin = company("conveo", "market research,video interviews,enterprise software");
  const close = company("close", "video interviews,market research", {region:"Europe",published_at:"2025-01-01"});
  const broad = company("broad", "market research", {published_at:"2026-09-10"});
  const candidates = [broad, origin, close, company("draft", close.tags, {workflow_status:"draft"})];
  assert.deepEqual(rankRelatedStartups(origin, candidates).map(s => s.slug), ["close", "broad"]);
  assert.equal(candidates[0], broad);
  assert.deepEqual(rankRelatedStartups(origin, candidates, 1).map(s => s.slug), ["close"]);
});

test("exact researched categories work with malformed and absent research safely", () => {
  const research_json = JSON.stringify({market_context:{category:"AI-moderated qualitative research"}});
  const origin = company("origin", null, {research_json});
  assert.deepEqual(rankRelatedStartups(origin, [company("match", null, {research_json}), company("bad", null, {research_json:"{"})]).map(s => s.slug), ["match"]);
  assert.deepEqual(rankRelatedStartups(company("empty", null), [company("also-empty", null)]), []);
});
