import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchRumSnapshot,
  formatRumDimensionRows,
  formatRumMetric,
  formatSitemapSummary,
  latestSubmittedIndexNowRow,
  missingFromLatestSubmittedIndexNow,
  parseIndexNowHistoryText,
  summarizeLatestIndexNow,
  summarizeSitemapUrls,
} from "../scripts/promotion/growth-report";

test("parseIndexNowHistoryText ignores malformed JSONL rows", () => {
  const rows = parseIndexNowHistoryText([
    "{\"timestamp\":\"2026-06-12T00:00:00.000Z\",\"status\":\"submitted\",\"urls\":[\"https://venturedex.co/startups/dapple\"],\"message\":\"HTTP 200\"}",
    "not-json",
    "{\"status\":\"dry_run\",\"urls\":[\"https://venturedex.co/topics/ai-agent-startups\"]}",
  ].join("\n"));

  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, "submitted");
  assert.equal(rows[1].status, "dry_run");
});

test("summarizeLatestIndexNow distinguishes submitted, preview, failed, and empty state", () => {
  assert.equal(summarizeLatestIndexNow([]), "none yet");

  assert.match(summarizeLatestIndexNow([{
    timestamp: "2026-06-12T00:00:00.000Z",
    status: "submitted",
    urls: [
      "https://venturedex.co/startups/dapple",
      "https://venturedex.co/startups/dapple",
      "https://venturedex.co/topics/ai-agent-startups",
    ],
    message: "HTTP 200",
  }]), /submitted at 2026-06-12T00:00:00\.000Z: 2 unique URLs \(HTTP 200\)/);

  assert.match(summarizeLatestIndexNow([{
    timestamp: "2026-06-12T00:01:00.000Z",
    status: "dry_run",
    urls: ["https://venturedex.co/topics/ai-agent-startups"],
    message: "preview only",
  }]), /preview only at 2026-06-12T00:01:00\.000Z: 1 unique URL/);

  assert.match(summarizeLatestIndexNow([{
    timestamp: "2026-06-12T00:02:00.000Z",
    status: "failed",
    urls: ["https://venturedex.co/startups/dapple"],
    message: "HTTP 403",
  }]), /failed at 2026-06-12T00:02:00\.000Z: 1 unique URL \(HTTP 403\)/);
});

test("missingFromLatestSubmittedIndexNow ignores later dry-run previews", () => {
  const rows = parseIndexNowHistoryText([
    "{\"timestamp\":\"2026-06-12T00:00:00.000Z\",\"status\":\"submitted\",\"urls\":[\"https://venturedex.co/startups/a\",\"https://venturedex.co/weekly/3\"],\"message\":\"HTTP 200\"}",
    "{\"timestamp\":\"2026-06-13T00:00:00.000Z\",\"status\":\"dry_run\",\"urls\":[\"https://venturedex.co/startups/b\"],\"message\":\"preview only\"}",
  ].join("\n"));

  assert.equal(latestSubmittedIndexNowRow(rows)?.timestamp, "2026-06-12T00:00:00.000Z");
  assert.deepEqual(
    missingFromLatestSubmittedIndexNow(rows, [
      "https://venturedex.co/startups/a",
      "https://venturedex.co/startups/b",
      "https://venturedex.co/weekly/3",
    ]),
    ["https://venturedex.co/startups/b"]
  );
});

test("missingFromLatestSubmittedIndexNow ignores later submitted rows unrelated to targets", () => {
  const rows = parseIndexNowHistoryText([
    "{\"timestamp\":\"2026-06-12T00:00:00.000Z\",\"status\":\"submitted\",\"urls\":[\"https://venturedex.co/startups/a\",\"https://venturedex.co/weekly/3\"],\"message\":\"HTTP 200\"}",
    "{\"timestamp\":\"2026-06-13T00:00:00.000Z\",\"status\":\"submitted\",\"urls\":[\"https://venturedex.co/\"],\"message\":\"HTTP 200\"}",
  ].join("\n"));
  const targets = [
    "https://venturedex.co/startups/a",
    "https://venturedex.co/weekly/3",
  ];

  assert.equal(latestSubmittedIndexNowRow(rows, targets)?.timestamp, "2026-06-12T00:00:00.000Z");
  assert.deepEqual(missingFromLatestSubmittedIndexNow(rows, targets), []);
});

test("missingFromLatestSubmittedIndexNow accumulates split submitted batches", () => {
  const rows = parseIndexNowHistoryText([
    "{\"timestamp\":\"2026-06-12T00:00:00.000Z\",\"status\":\"submitted\",\"urls\":[\"https://venturedex.co/startups/a\"],\"message\":\"HTTP 200\"}",
    "{\"timestamp\":\"2026-06-12T00:02:00.000Z\",\"status\":\"submitted\",\"urls\":[\"https://venturedex.co/weekly/3\"],\"message\":\"HTTP 200\"}",
    "{\"timestamp\":\"2026-06-12T00:03:00.000Z\",\"status\":\"submitted\",\"urls\":[\"https://venturedex.co/startups/a\"],\"message\":\"HTTP 200\"}",
  ].join("\n"));
  const targets = [
    "https://venturedex.co/startups/a",
    "https://venturedex.co/weekly/3",
    "https://venturedex.co/collections/ai-agents",
  ];

  assert.deepEqual(missingFromLatestSubmittedIndexNow(rows, targets), [
    "https://venturedex.co/collections/ai-agents",
  ]);
});

test("summarizeSitemapUrls counts canonical live surface types", () => {
  const summary = summarizeSitemapUrls([
    "<url><loc>https://venturedex.co/</loc></url>",
    "<url><loc>https://venturedex.co/startups/conduct</loc></url>",
    "<url><loc>https://venturedex.co/startups/kyber/</loc></url>",
    "<url><loc>https://venturedex.co/investors/a16z</loc></url>",
    "<url><loc>https://venturedex.co/topics/ai-agent-startups</loc></url>",
    "<url><loc>https://venturedex.co/collections/ai-agents</loc></url>",
    "<url><loc>https://venturedex.co/weekly/3</loc></url>",
    "<url><loc>not-a-url</loc></url>",
  ].join(""));

  assert.deepEqual(summary, {
    total: 8,
    startups: 2,
    investors: 1,
    topics: 1,
    collections: 1,
    weekly: 1,
    other: 2,
  });
  assert.equal(
    formatSitemapSummary(summary),
    "8 URLs (2 startups, 1 investors, 1 topics, 1 collections, 1 weekly, 2 other)"
  );
});

test("formatRumMetric reports visits, page views, and sampling", () => {
  assert.equal(formatRumMetric(undefined), "no data");
  assert.equal(
    formatRumMetric({ count: 38, sum: { visits: 36 }, avg: { sampleInterval: 1 } }),
    "36 visits / 38 page views (sampleInterval=1)"
  );
  assert.equal(
    formatRumMetric({ count: 120, sum: { visits: 60 }, avg: { sampleInterval: 12 } }),
    "60 visits / 120 page views (sampleInterval=12, sampled/extrapolated)"
  );
  assert.equal(
    formatRumMetric({ count: 1, sum: { visits: 1 }, avg: { sampleInterval: 1 } }),
    "1 visit / 1 page view (sampleInterval=1)"
  );
});

test("formatRumDimensionRows labels direct traffic and keeps sampling visible", () => {
  assert.deepEqual(
    formatRumDimensionRows([
      { count: 33, sum: { visits: 33 }, avg: { sampleInterval: 1 }, dimensions: { metric: "" } },
      { count: 2, sum: { visits: 2 }, avg: { sampleInterval: 1 }, dimensions: { metric: "github.com" } },
      { count: 10, sum: { visits: 10 }, avg: { sampleInterval: 10 }, dimensions: { metric: "/" } },
    ], "(direct / none)", 2),
    [
      "(direct / none): 33 visits / 33 page views (sampleInterval=1)",
      "github.com: 2 visits / 2 page views (sampleInterval=1)",
    ]
  );
});

test("fetchRumSnapshot skips when Cloudflare config is unavailable", async () => {
  const snapshot = await fetchRumSnapshot(new Date("2026-06-21T12:00:00Z"), {
    config: null,
    loadEnv: false,
  });

  assert.equal(snapshot.status, "skipped");
  assert.match(snapshot.message ?? "", /missing CLOUDFLARE_ACCOUNT_ID/);
});

test("fetchRumSnapshot parses Cloudflare RUM GraphQL payloads", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    data: {
      viewer: {
        accounts: [{
          last24h: [{ count: 2, sum: { visits: 2 }, avg: { sampleInterval: 1 } }],
          last7d: [{ count: 38, sum: { visits: 36 }, avg: { sampleInterval: 1 } }],
          last30d: [{ count: 120, sum: { visits: 60 }, avg: { sampleInterval: 12 } }],
          topPaths7: [{ count: 30, sum: { visits: 30 }, avg: { sampleInterval: 1 }, dimensions: { metric: "/" } }],
          topReferers7: [{ count: 33, sum: { visits: 33 }, avg: { sampleInterval: 1 }, dimensions: { metric: "" } }],
          countries7: [],
          devices7: [],
          daily7: [],
        }],
      },
    },
    errors: null,
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const snapshot = await fetchRumSnapshot(new Date("2026-06-21T12:00:00Z"), {
    config: {
      accountId: "account",
      apiToken: "token",
      siteTag: "site",
    },
    endpoint: "https://example.test/graphql",
    fetchImpl,
    loadEnv: false,
  });

  assert.equal(snapshot.status, "available");
  assert.equal(snapshot.windows?.last7d?.sum?.visits, 36);
  assert.equal(snapshot.topPaths7?.[0].dimensions?.metric, "/");
  assert.equal(snapshot.topReferers7?.[0].dimensions?.metric, "");
});

test("fetchRumSnapshot reports GraphQL errors without throwing", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    data: null,
    errors: [{ message: "permission denied" }],
  }), { status: 403, headers: { "Content-Type": "application/json" } });

  const snapshot = await fetchRumSnapshot(new Date("2026-06-21T12:00:00Z"), {
    config: {
      accountId: "account",
      apiToken: "token",
      siteTag: "site",
    },
    endpoint: "https://example.test/graphql",
    fetchImpl,
    loadEnv: false,
  });

  assert.equal(snapshot.status, "error");
  assert.match(snapshot.message ?? "", /HTTP 403: permission denied/);
});
