import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const srcRoot = join(repoRoot, "src");

function astroFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? astroFiles(path)
      : path.endsWith(".astro")
        ? [path]
        : [];
  });
}

test("parameterized search and subscribe anchors consistently discourage crawling", () => {
  const violations: string[] = [];

  for (const path of astroFiles(srcRoot)) {
    const source = readFileSync(path, "utf8");
    const anchors = source.match(/<a\b[\s\S]*?>/g) ?? [];
    for (const anchor of anchors) {
      const isParameterizedSearch = anchor.includes("/search?q=");
      const isAttributedSubscribe = anchor.includes("href={subscribeUrl}");
      if (
        (isParameterizedSearch || isAttributedSubscribe)
        && !/\brel=(?:"[^"]*\bnofollow\b[^"]*"|'[^']*\bnofollow\b[^']*')/.test(anchor)
      ) {
        violations.push(`${path.replace(`${repoRoot}/`, "")}: ${anchor}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("attributed subscribe links preserve the source through the form boundary", () => {
  const attributedPages = astroFiles(srcRoot)
    .map((path) => ({ path, source: readFileSync(path, "utf8") }))
    .filter(({ source }) => source.includes("href={subscribeUrl}"));

  assert.ok(attributedPages.length > 0);
  for (const { path, source } of attributedPages) {
    assert.match(
      source,
      /const subscribeUrl = `\/subscribe\?source=\$\{encodeURIComponent\(`/,
      path.replace(`${repoRoot}/`, "")
    );
  }

  const subscribePage = readFileSync(join(repoRoot, "src/pages/subscribe.astro"), "utf8");
  assert.match(subscribePage, /Astro\.url\.searchParams\.get\("source"\)/);
  assert.match(subscribePage, /<input type="hidden" name="source" value=\{source\} \/>/);

  const subscribeApi = readFileSync(join(repoRoot, "src/pages/api/subscribe.ts"), "utf8");
  assert.match(
    subscribeApi,
    /source = formData\.get\("source"\)\?\.toString\(\) \?\? "website"/
  );
  assert.match(
    subscribeApi,
    /subscribeToNewsletter\(db, \{[\s\S]*?source,[\s\S]*?\}\)/
  );
});

test("clean search and subscribe navigation remains crawlable", () => {
  const base = readFileSync(join(repoRoot, "src/layouts/Base.astro"), "utf8");
  const anchors = base.match(/<a\b[\s\S]*?>/g) ?? [];
  const cleanNavigation = anchors.filter((anchor) =>
    anchor.includes('href="/search"') || anchor.includes('href="/subscribe"')
  );

  assert.ok(cleanNavigation.some((anchor) => anchor.includes('href="/search"')));
  assert.ok(cleanNavigation.some((anchor) => anchor.includes('href="/subscribe"')));
  for (const anchor of cleanNavigation) {
    assert.doesNotMatch(anchor, /\brel=(?:"[^"]*\bnofollow\b[^"]*"|'[^']*\bnofollow\b[^']*')/);
  }
});
