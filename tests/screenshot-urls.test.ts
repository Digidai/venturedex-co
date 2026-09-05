import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getScreenshotMetadata, versionedScreenshotUrl } from "../src/lib/screenshots";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const first = { example: { sha256: "a".repeat(64), width: 1280, height: 720 } };

test("screenshot cache key changes with reviewed bytes but not slug or dimensions", () => {
  const second = { example: { ...first.example, sha256: "b".repeat(64) } };
  assert.equal(versionedScreenshotUrl("example.webp", first), `/screenshots/example.webp?v=${"a".repeat(16)}`);
  assert.equal(versionedScreenshotUrl("example.webp", second), `/screenshots/example.webp?v=${"b".repeat(16)}`);
  assert.notEqual(versionedScreenshotUrl("example.webp", first), versionedScreenshotUrl("example.webp", second));
  assert.deepEqual(getScreenshotMetadata("example.webp", first), first.example);
});

test("unreviewed fixtures remain unversioned and malformed keys cannot become image URLs", () => {
  assert.equal(versionedScreenshotUrl("fixture.webp", {}), "/screenshots/fixture.webp");
  assert.equal(getScreenshotMetadata("fixture.webp", {}), undefined);
  for (const key of [null, undefined, "", "../escape.webp", "https://example.test/evil.webp", "example.webp?injected=1", "example.png"]) {
    assert.equal(versionedScreenshotUrl(key, first), null);
    assert.equal(getScreenshotMetadata(key, first), undefined);
  }
  assert.equal(versionedScreenshotUrl("example.webp", { example: { ...first.example, sha256: "not-a-hash" } }), "/screenshots/example.webp");
});

test("site, SEO, sitemap, newsletter and search-index consumers all use the shared versioned URL", () => {
  for (const filename of [
    "src/components/SiteCard.astro", "src/pages/startups/[slug].astro", "src/lib/seo.ts",
    "src/lib/newsletter.ts", "src/pages/sitemap.xml.ts", "src/pages/search-index.json.ts", "scripts/promotion/share-kit.ts",
  ]) {
    const source = readFileSync(path.join(repoRoot, filename), "utf8");
    assert.match(source, /import\s*\{[^}]*versionedScreenshotUrl[^}]*\}\s*from\s*["'][^"']*\/screenshots["']/s, filename);
    assert.match(source, /versionedScreenshotUrl\(/, filename);
    assert.doesNotMatch(source, /`\/screenshots\/\$\{startup\.screenshot_r2_key\}`/, filename);
  }
  const search = readFileSync(path.join(repoRoot, "src/pages/search.astro"), "utf8");
  assert.match(search, /e\.screenshotUrl/);
  assert.doesNotMatch(search.split("<script>")[1], /from ["'][^"']*\/screenshots["']/);
  assert.doesNotMatch(readFileSync(path.join(repoRoot, "src/lib/search-index.ts"), "utf8"), /import[^\n]*(screenshots|screenshot-reviews)/);
});

test("detail and card reserve the decoded reviewed dimensions instead of assuming 1440x900", () => {
  for (const filename of ["src/pages/startups/[slug].astro", "src/components/SiteCard.astro"]) {
    const source = readFileSync(path.join(repoRoot, filename), "utf8");
    assert.match(source, /width=\{screenshotMetadata\?\.width\}/);
    assert.match(source, /height=\{screenshotMetadata\?\.height\}/);
  }
});
