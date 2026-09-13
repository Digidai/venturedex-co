import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("home retains screenshot-first discovery with a compact top funding strip", () => {
  const home = source("src/pages/index.astro");
  assert.ok(home.indexOf('aria-labelledby="latest-heading"') < home.indexOf('aria-labelledby="markets-heading"'));
  assert.ok(home.indexOf('<FundingTicker') < home.indexOf('<header class="home-hero"'));
  assert.equal((home.match(/<FundingTicker/g) ?? []).length, 1);
  assert.doesNotMatch(home, /funding-section/);
  assert.match(home, /priority=\{position < 3\}/);
  assert.match(home, /action="\/directory"/);
  assert.match(home, /name="q"/);
  assert.match(home, /\.slice\(0, 18\)/);
  assert.doesNotMatch(home, /og_image|cover_url|imagegen/);
  assert.match(source("src/components/SiteCard.astro"), /-webkit-line-clamp: 2/);
});

test("directory provides visible keyword search and restores history state", () => {
  const filter = source("src/components/FilterBar.astro");
  const directory = source("src/pages/directory.astro");
  assert.ok(filter.indexOf('id="filter-query"') < filter.indexOf('id="filter-panel"'));
  assert.match(directory, /addEventListener\("popstate"/);
  assert.match(directory, /addEventListener\("pageshow"/);
  assert.match(directory, /aria-live="polite"/);
  assert.match(source("src/styles/screenshots.css"), /object-fit: contain/);
});

test("desktop navigation exposes seven direct destinations and mobile keeps native disclosure", () => {
  const base = source("src/layouts/Base.astro");
  assert.doesNotMatch(base, /<details class="nav-more"/);
  assert.match(base, /aria-current/);
  assert.equal((base.split('<div class="nav-tabs">')[1].split('</div>')[0].match(/class="nav-tab"/g) ?? []).length, 7);
  assert.match(base, /<details class="mobile-menu"/);
  for (const route of ["directory", "investors", "news", "topics", "collections", "weekly", "launches", "research"]) {
    assert.ok(base.includes(`href="/${route}"`));
  }
});

test("footer uses real category destinations and the existing source-backed investor gate", () => {
  const footer = source("src/components/SiteFooter.astro");
  assert.match(footer, /buildCategoryPages\(startups\)/);
  assert.match(footer, /eligibleInvestors\.has\(i.slug\)/);
  assert.match(footer, /getLinkedInvestorSlugs/);
  assert.match(footer, /aria-label="Explore the research directory"/);
  assert.doesNotMatch(footer, /href="\/directory\?/);
  assert.match(footer, /repeat\(5, minmax\(0, 1fr\)\)/);
});

test("ticker has an explicit pause and excludes animated copies from keyboard and accessible content", () => {
  const ticker = source("src/components/FundingTicker.astro");
  assert.match(ticker, /aria-pressed="false"/);
  assert.match(ticker, /aria-hidden=\{duplicate/);
  assert.match(ticker, /tabindex=\{duplicate \? -1/);
  assert.match(ticker, /prefers-reduced-motion: reduce/);
  assert.match(ticker, /focus-within/);
  assert.match(ticker, /addEventListener\("focusout"/);
  assert.match(ticker, /viewport.scrollLeft = 0/);
});

test("category search restores history, gives an empty state, and cannot expand server-bound membership", () => {
  const browser = source("src/components/CategoryBrowser.astro");
  assert.match(browser, /addEventListener\("popstate"/);
  assert.match(browser, /addEventListener\("pageshow"/);
  assert.match(browser, /aria-live="polite"/);
  assert.match(browser, /<noscript>/);
  assert.match(browser, /new URLSearchParams\(\{q:query.value, sort:sort.value\}\)/);
  assert.match(browser, /data-category-clear/);
});

test("dark links use a readable accent while count badges retain white-on-blue contrast", () => {
  const css = source("src/styles/global.css");
  assert.equal((css.match(/--color-accent: #60A5FA;/g) ?? []).length, 2);
  assert.match(css, /--color-accent-solid: #2563EB;/);
  assert.match(source("src/components/FilterBar.astro"), /background: var\(--color-accent-solid\)/);
});
