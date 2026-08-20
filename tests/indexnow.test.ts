import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectUrls, parseArgs, submitIndexNow, validateUrl } from "../scripts/promotion/indexnow";
import { launchUrl, loadLaunches, loadPublishedWeeklyIssues, loadStartups, startupUrl, weeklyUrl } from "../scripts/promotion/content";
import { getTopicPageConfigs } from "../src/lib/topic-pages";

test("parseArgs accepts all-content flags and keeps the safety cap", () => {
  const options = parseArgs(["--all-startups", "--all-weekly", "--all-launches", "--topics", "--hubs", "--collections", "--ai-surfaces", "--max-urls", "300"]);
  assert.equal(parseArgs([]).maxUrls, 250);
  assert.equal(options.allStartups, true);
  assert.equal(options.allWeekly, true);
  assert.equal(options.allLaunches, true);
  assert.equal(options.topics, true);
  assert.equal(options.hubs, true);
  assert.equal(options.collections, true);
  assert.equal(options.aiSurfaces, true);
  assert.equal(options.maxUrls, 300);
});

test("collectUrls includes every canonical launch page", () => {
  const launches = loadLaunches();
  const urls = collectUrls(parseArgs(["--all-launches", "--max-urls", String(launches.length)]));

  assert.equal(urls.length, launches.length);
  assert.ok(urls.includes(launchUrl(launches[0].slug)));
});

test("collectUrls reads an exact URL change set from JSON", () => {
  const directory = mkdtempSync(join(tmpdir(), "venturedex-indexnow-"));
  const urlsFile = join(directory, "urls.json");
  writeFileSync(urlsFile, JSON.stringify([
    "https://venturedex.co/launches",
    "https://venturedex.co/launches/example-launch",
    "https://venturedex.co/launches.json",
  ]));

  const urls = collectUrls(parseArgs(["--urls-file", urlsFile]));
  assert.deepEqual(urls, [
    "https://venturedex.co/launches",
    "https://venturedex.co/launches/example-launch",
    "https://venturedex.co/launches.json",
  ]);
});

test("collectUrls includes all startup, weekly, and topic canonical URLs", () => {
  const startups = loadStartups();
  const issues = loadPublishedWeeklyIssues();
  const topicConfigs = getTopicPageConfigs();
  const expectedUrlCount = startups.length + issues.length + topicConfigs.length;
  const urls = collectUrls(parseArgs([
    "--all-startups",
    "--all-weekly",
    "--topics",
    "--max-urls",
    String(expectedUrlCount),
  ]));

  assert.equal(urls.length, expectedUrlCount);
  assert.ok(urls.includes(startupUrl(startups[0].slug)));
  assert.ok(urls.includes(weeklyUrl(issues[0].issue_number)));
  assert.ok(urls.includes(`https://venturedex.co/topics/${topicConfigs[0].slug}`));
});

test("collectUrls dedupes explicit URLs and enforces max-urls", () => {
  const urls = collectUrls(parseArgs([
    "--url",
    "https://venturedex.co/startups/dapple/",
    "--url",
    "https://venturedex.co/startups/dapple",
  ]));
  assert.deepEqual(urls, ["https://venturedex.co/startups/dapple"]);

  assert.throws(
    () => collectUrls(parseArgs(["--all-startups", "--max-urls", "1"])),
    /Refusing to submit/
  );
});

test("collectUrls supports hub pages without stripping homepage slash", () => {
  const urls = collectUrls(parseArgs(["--hubs", "--url", "https://venturedex.co/"]));

  assert.ok(urls.includes("https://venturedex.co/"));
  assert.ok(urls.includes("https://venturedex.co/topics"));
  assert.ok(urls.includes("https://venturedex.co/collections"));
  assert.equal(urls.filter((url) => url === "https://venturedex.co/").length, 1);
});

test("collectUrls supports collection detail pages", () => {
  const urls = collectUrls(parseArgs(["--collections"]));

  assert.ok(urls.includes("https://venturedex.co/collections/ai-agents"));
  assert.ok(urls.includes("https://venturedex.co/collections/developer-tools"));
  assert.ok(urls.every((url) => url.startsWith("https://venturedex.co/collections/")));
});

test("collectUrls supports AI discovery surfaces", () => {
  const urls = collectUrls(parseArgs(["--ai-surfaces", "--url", "https://venturedex.co/llms.txt/"]));

  assert.ok(urls.includes("https://venturedex.co/llms.txt"));
  assert.ok(urls.includes("https://venturedex.co/llms-full.txt"));
  assert.ok(urls.includes("https://venturedex.co/ai-index.json"));
  assert.equal(urls.filter((url) => url === "https://venturedex.co/llms.txt").length, 1);
});

test("validateUrl rejects non-canonical IndexNow targets", () => {
  for (const invalid of [
    "http://venturedex.co/startups/dapple",
    "https://example.com/startups/dapple",
    "https://venturedex.co/startups/dapple.html",
    "https://venturedex.co/startups/dapple?utm_source=test",
    "https://venturedex.co/startups/dapple#section",
    "https://venturedex.co/search",
  ]) {
    assert.throws(() => validateUrl(invalid), /IndexNow/);
  }

  assert.doesNotThrow(() => validateUrl("https://venturedex.co/"));
  assert.doesNotThrow(() => validateUrl("https://venturedex.co/collections"));
  assert.doesNotThrow(() => validateUrl("https://venturedex.co/collections/ai-agents"));
  assert.doesNotThrow(() => validateUrl("https://venturedex.co/llms.txt"));
  assert.doesNotThrow(() => validateUrl("https://venturedex.co/llms-full.txt"));
  assert.doesNotThrow(() => validateUrl("https://venturedex.co/ai-index.json"));
  assert.doesNotThrow(() => validateUrl("https://venturedex.co/launches"));
  assert.doesNotThrow(() => validateUrl("https://venturedex.co/launches/example-launch"));
  assert.doesNotThrow(() => validateUrl("https://venturedex.co/launches.json"));
  assert.doesNotThrow(() => validateUrl("https://venturedex.co/investors/a16z"));
  assert.doesNotThrow(() => validateUrl("https://venturedex.co/topics/ai-agent-startups"));
});

test("submitIndexNow retries a rate limit and records the accepted receipt", async () => {
  const directory = mkdtempSync(join(tmpdir(), "venturedex-indexnow-history-"));
  const historyFile = join(directory, "history.jsonl");
  const options = parseArgs([
    "--url", "https://venturedex.co/launches/example-launch",
    "--skip-key-check",
    "--history-file", historyFile,
  ]);
  const responses = [
    new Response("slow down", { status: 429, headers: { "Retry-After": "1" } }),
    new Response("", { status: 200 }),
  ];
  const delays: number[] = [];

  await submitIndexNow(options, ["https://venturedex.co/launches/example-launch"], {
    fetchFn: async () => responses.shift()!,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
  });

  assert.deepEqual(delays, [1_000]);
  const row = JSON.parse(readFileSync(historyFile, "utf8").trim());
  assert.equal(row.status, "submitted");
  assert.equal(row.message, "HTTP 200");
});
