import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { formatFundingDate, fundingPagePath, paginateFundingRounds } from "../src/lib/funding-pagination";
import { selectSitemapGroup, SITEMAP_GROUPS, sitemapGroupForPath } from "../src/lib/sitemap-groups";
import { homeJsonLd, newsJsonLd } from "../src/lib/seo";
import type { FundingRound } from "../src/lib/types";

const rounds: FundingRound[] = Array.from({ length: 123 }, (_, i) => ({
  id: String(i).padStart(3, "0"), company_name: `Company ${i}`, company_slug: `company-${i}`,
  company_url: null, amount: "$5M", stage: "Seed", lead_investor: null,
  date: i % 2 ? "2026-09-01" : "2026-09-02", source_url: "https://example.com/news", source_name: "Company announcement",
}));

test("funding pagination preserves every round once with crawlable sequential paths", () => {
  const pages = [1, 2, 3].map((page) => paginateFundingRounds(rounds, page));
  assert.deepEqual(pages.map((page) => page.rounds.length), [50, 50, 23]);
  assert.equal(new Set(pages.flatMap((page) => page.rounds.map((round) => round.id))).size, rounds.length);
  assert.equal(pages[0].path, "/news");
  assert.equal(pages[0].previous, null);
  assert.equal(pages[0].next, "/news/page/2");
  assert.equal(pages[1].previous, "/news");
  assert.equal(pages[2].next, null);
  assert.equal(rounds[0].id, "000", "pagination must not mutate its input");
  assert.throws(() => paginateFundingRounds(rounds, 0));
  assert.throws(() => paginateFundingRounds(rounds, 4));
  assert.throws(() => fundingPagePath(1.5));
  assert.equal(paginateFundingRounds([]).totalPages, 1);
});

test("funding calendar labels are stable UTC dates", () => {
  assert.equal(formatFundingDate("2026-09-08"), "Sep 8, 2026");
});

test("funding and directory schema retain their own canonical page identity", () => {
  const graph = newsJsonLd(rounds.slice(0, 5), "https://venturedex.co", "/news/page/2")["@graph"] as any[];
  const page = graph.find((node) => node["@type"] === "CollectionPage");
  assert.equal(page.url, "https://venturedex.co/news/page/2");
  assert.ok(graph.filter((node) => node["@type"] === "NewsArticle").every((node) => node.isPartOf["@id"] === `${page.url}#webpage`));
  const directory = homeJsonLd([], "https://venturedex.co", "/directory")["@graph"] as any[];
  assert.equal(directory.find((node) => node["@type"] === "CollectionPage").url, "https://venturedex.co/directory");
});

test("grouped sitemaps partition URLs exactly once without changing indexing policy", () => {
  const urls = ["/", "/directory", "/startups/shapes", "/investors", "/investors/example", "/launches", "/launches/example", "/news/page/2", "/topics/legal-ai-startups", "/ai-index.json"].map((loc) => ({ loc }));
  const partition = SITEMAP_GROUPS.flatMap((group) => selectSitemapGroup(urls, group));
  assert.deepEqual(partition.map(({ loc }) => loc).sort(), urls.map(({ loc }) => loc).sort());
  assert.equal(sitemapGroupForPath("/launches/example"), "launches");
  assert.equal(sitemapGroupForPath("/directory"), "startups");
});

test("home remains bounded while the directory retains every startup and old filters", () => {
  const home = fs.readFileSync("src/pages/index.astro", "utf8");
  const directory = fs.readFileSync("src/pages/directory.astro", "utf8");
  assert.ok(home.includes(".slice(0, 18)"));
  assert.ok(home.includes('href="/directory"'));
  assert.ok(home.includes('location.replace(`/directory${location.search}${location.hash}`)'));
  assert.ok(directory.includes("startups.map((startup, position)"));
  assert.ok(directory.includes('qs ? `/directory?${qs}` : "/directory"'));
  const base = fs.readFileSync("src/layouts/Base.astro", "utf8");
  assert.ok(base.includes('type="text/markdown" href={`${startupResourcePath}.md`}'));
});
