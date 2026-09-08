import assert from "node:assert/strict";
import test from "node:test";
import cases from "../docs/growth/agent-retrieval-cases.json";
import { assessRetrieval, benchmarkOrigin, runRetrievalBenchmark } from "../scripts/promotion/agent-retrieval-benchmark";
import { buildStartupChanges } from "../src/lib/agent-resources";
import { createContentReaders } from "../src/lib/content-transform";

test("benchmark freezes 10 entity, 6 topic and 4 cross-page questions with separate human answer rubrics", () => {
  assert.equal(cases.cases.length, 20);
  assert.equal(new Set(cases.cases.map((row) => row.id)).size, 20);
  assert.equal(cases.cases.filter((row) => row.kind === "profile").length, 10);
  assert.equal(cases.cases.filter((row) => row.kind === "topic").length, 6);
  assert.ok(cases.cases.every((row) => row.question && row.answer_rubric && row.markers.length));
});
test("benchmark only permits canonical production and local preview origins", () => {
  assert.equal(benchmarkOrigin("https://venturedex.co"), "https://venturedex.co");
  assert.equal(benchmarkOrigin("http://127.0.0.1:4331"), "http://127.0.0.1:4331");
  for (const value of ["https://elsewhere.test", "http://venturedex.co", "https://venturedex.co/path", "https://u:p@venturedex.co", "https://venturedex.co:8443"]) assert.throws(() => benchmarkOrigin(value));
});
test("a marker alone cannot pass a wrong HTTP status, format or canonical", () => {
  const row = cases.cases.find((row) => row.kind === "brief-md")!;
  const body = row.markers.join(" ");
  assert.ok(assessRetrieval(row, 404, new Headers({"content-type":"text/html"}), body).length >= 3);
  assert.deepEqual(assessRetrieval(row, 200, new Headers({"content-type":"text/markdown", link:`<https://venturedex.co${row.path.slice(0, -3)}>; rel="canonical"`}), body), []);
});
test("transport failures remain failures and never become answer accuracy or AI citation results", async () => {
  let count = 0;
  const result = await runRetrievalBenchmark("http://localhost:4331", (async () => { count++; throw new Error("fixture offline"); }) as typeof fetch);
  assert.equal(count, 20);
  assert.equal(result.retrieval_ready, 0);
  assert.equal(result.answer_accuracy, null);
  assert.equal(result.external_ai_citation_rate, null);
  assert.ok(result.results.every((row) => row.answer_review === "not-run" && row.failures[0] === "fixture offline"));
});

test("HTML exclusion is recognized independently of attribute order and crawler-specific name", () => {
  const row = cases.cases.find((row) => row.kind === "topic")!;
  const body = `<link rel="canonical" href="https://venturedex.co${row.path}">${row.markers.join(" ")}`;
  for (const meta of ['<meta content="noindex" name="robots">', "<meta name='googlebot' content='noindex,follow'>", '<meta content=none name=bingbot>']) {
    assert.ok(assessRetrieval(row, 200, new Headers({"content-type":"text/html"}), body + meta).includes("HTML robots exclusion present"));
  }
  assert.ok(assessRetrieval(row, 200, new Headers({"content-type":"text/html"}), body + '<link href="https://elsewhere.test/" rel="canonical">').some((error) => error.includes("exactly one")));
});

test("profile review dates must equal the recorded baseline, not just any older date", () => {
  const row = cases.cases.find((row) => row.kind === "profile")!;
  assert.ok(row.expected_verified_at);
  const body = JSON.stringify({ canonical_url: `https://venturedex.co${row.path.slice(0, -5)}`, verified_at: "2026-01-01" });
  assert.ok(assessRetrieval(row, 200, new Headers({"content-type":"application/json"}), body).includes("Original full-review date was not preserved"));
});

test("the wave-2 change acceptance uses the actual feed builder's html field", () => {
  const slugs = cases.cases.filter((row) => row.kind === "profile").map((row) => row.path.replace("/startups/", "").replace(".json", ""));
  const readers = createContentReaders({
    records: slugs.map((slug) => ({ slug, product_name: slug, domain: `${slug}.test` })),
    timestamps: Object.fromEntries(slugs.map((slug) => [slug, { published_at: "2026-09-01 00:00:00", updated_at: "2026-09-08 08:42:02" }])),
    investorDirectory: {}, collectionConfigs: [],
  });
  const feed = buildStartupChanges(readers.getContentStartups());
  const row = cases.cases.find((row) => row.kind === "changes")!;
  assert.deepEqual(assessRetrieval(row, 200, new Headers({"content-type":"application/json"}), JSON.stringify(feed)), []);
  const missing = { ...feed, items: feed.items.filter((item) => item.type !== "updated") };
  assert.equal(assessRetrieval(row, 200, new Headers({"content-type":"application/json"}), JSON.stringify(missing)).filter((error) => error.startsWith("No bounded-feed")).length, 10);
});
