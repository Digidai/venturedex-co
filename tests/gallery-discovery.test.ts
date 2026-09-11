import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("home puts reviewed screenshots before markets and funding, with visible search", () => {
  const home = source("src/pages/index.astro");
  assert.ok(home.indexOf('aria-labelledby="latest-heading"') < home.indexOf('aria-labelledby="markets-heading"'));
  assert.ok(home.indexOf('<SiteCard') < home.indexOf('<FundingTicker'));
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

test("navigation keeps all destinations in native keyboard-accessible disclosures", () => {
  const base = source("src/layouts/Base.astro");
  assert.match(base, /<details class="nav-more"/);
  assert.match(base, /<details class="mobile-menu"/);
  for (const route of ["directory", "investors", "news", "topics", "collections", "weekly", "launches", "research"]) {
    assert.ok(base.includes(`href="/${route}"`));
  }
});

test("dark links use a readable accent while count badges retain white-on-blue contrast", () => {
  const css = source("src/styles/global.css");
  assert.equal((css.match(/--color-accent: #60A5FA;/g) ?? []).length, 2);
  assert.match(css, /--color-accent-solid: #2563EB;/);
  assert.match(source("src/components/FilterBar.astro"), /background: var\(--color-accent-solid\)/);
});
