import assert from "node:assert/strict";
import test from "node:test";
import {
  parseIndexNowHistoryText,
  summarizeLatestIndexNow,
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
