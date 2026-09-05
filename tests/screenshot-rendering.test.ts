import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const card = readFileSync("src/components/SiteCard.astro", "utf8");
const search = readFileSync("src/pages/search.astro", "utf8");
const detail = readFileSync("src/pages/startups/[slug].astro", "utf8");

test("directory and search cards use the same complete-image frame", () => {
  for (const source of [card, search]) {
    assert.match(source, /import ["'][^"']*\/styles\/screenshots\.css["']/);
    assert.match(source, /class="[^"]*startup-screenshot-frame[^"]*"/);
    assert.doesNotMatch(source, /object-fit:\s*cover/);
    assert.doesNotMatch(source, /aspect-ratio:\s*16\s*\/\s*10/);
  }
  // A hover zoom clips pixels even when the resting image uses contain.
  assert.doesNotMatch(card, /transform:\s*scale\(/);
});

test("shared card screenshot CSS contains the whole image on every viewport", () => {
  const css = readFileSync("src/styles/screenshots.css", "utf8");
  assert.match(css, /\.startup-screenshot-frame\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/s);
  assert.match(css, /\.startup-screenshot-frame\s*>\s*img\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(css, /\.startup-screenshot-frame\s*>\s*img\s*\{[^}]*object-position:\s*center/s);
  assert.doesNotMatch(css, /object-fit:\s*cover|transform:\s*scale\(/);
  assert.doesNotMatch(css, /@media/);
});

test("detail screenshot preserves its native aspect and offers the original file", () => {
  const imageRule = detail.match(/\.detail-screenshot\s*\{([^}]*)\}/s)?.[1];
  assert.ok(imageRule);
  assert.match(imageRule, /width:\s*100%/);
  assert.match(imageRule, /height:\s*auto/);
  assert.doesNotMatch(imageRule, /max-height|object-fit:\s*cover|aspect-ratio/);
  assert.match(detail, /<a\s+href=\{screenshotUrl\}[^>]*class="detail-screenshot-link"/s);
  assert.match(detail, /View full-size screenshot/);
});

test("screenshots never claim a fabricated universal intrinsic size", () => {
  for (const source of [card, search, detail]) {
    assert.doesNotMatch(source, /width="1440"\s+height="900"/);
  }
});

test("newsletter screenshot remains uncropped at desktop and mobile widths", () => {
  const source = readFileSync("src/lib/newsletter.ts", "utf8");
  assert.match(source, /screenshotImage:\s*"[^"]*height:auto;/);
  assert.match(source, /\.vd-image\s*\{[^}]*height:\s*auto\s*!important/s);
});
