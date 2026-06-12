import assert from "node:assert/strict";
import test from "node:test";
import { collectUrls, parseArgs, validateUrl } from "../scripts/promotion/indexnow";
import { loadPublishedWeeklyIssues, loadStartups, startupUrl, weeklyUrl } from "../scripts/promotion/content";
import { getTopicPageConfigs } from "../src/lib/topic-pages";

test("parseArgs accepts all-content flags and keeps the safety cap", () => {
  const options = parseArgs(["--all-startups", "--all-weekly", "--topics", "--max-urls", "300"]);
  assert.equal(options.allStartups, true);
  assert.equal(options.allWeekly, true);
  assert.equal(options.topics, true);
  assert.equal(options.maxUrls, 300);
});

test("collectUrls includes all startup, weekly, and topic canonical URLs", () => {
  const startups = loadStartups();
  const issues = loadPublishedWeeklyIssues();
  const topicConfigs = getTopicPageConfigs();
  const urls = collectUrls(parseArgs(["--all-startups", "--all-weekly", "--topics"]));

  assert.equal(urls.length, startups.length + issues.length + topicConfigs.length);
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

  assert.doesNotThrow(() => validateUrl("https://venturedex.co/topics/ai-agent-startups"));
});
