import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertSafeTransition,
  buildSnapshot,
  normalizeUpstreamVideos,
  type WhatShipsSnapshot,
} from "../scripts/sync-whatships";
import {
  getWhatShipsCategoryCounts,
  parseWhatShipsSnapshot,
  whatShipsSnapshot,
} from "../src/lib/whatships";

function upstreamVideo(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const tweetId = String(2_000_000_000_000_000_000n + BigInt(index));
  return {
    id: `plv-test-${index}`,
    slug: `test-launch-${index}`,
    title: `Test launch ${index}`,
    product: `Product ${index}`,
    company: `Company ${index}`,
    description: "This long source description must never enter the VentureDex snapshot.",
    category: "ai",
    tags: ["AI", "demo", "AI"],
    tweetUrl: `https://x.com/tester/status/${tweetId}?s=20`,
    tweetId,
    authorAvatar: "https://pbs.twimg.com/avatar.jpg",
    poster: `/posters/test-launch-${index}.webp`,
    videoUrl: "https://video.twimg.com/test.mp4",
    publishedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index % 60)).toISOString(),
    durationSeconds: 30,
    featured: false,
    status: "published",
    ...overrides,
  };
}

function bootstrap(overrides: Record<string, unknown> = {}): Record<string, unknown>[] {
  return Array.from({ length: 500 }, (_, index) => upstreamVideo(index, index === 0 ? overrides : {}));
}

const provenance = {
  commit: "1".repeat(40),
  commitAt: "2026-08-15T00:00:00.000Z",
  commitUrl: `https://github.com/dingyi/whatships.com/commit/${"1".repeat(40)}`,
  rawDataUrl: `https://raw.githubusercontent.com/dingyi/whatships.com/${"1".repeat(40)}/src/data/videos.json`,
  rawSha256: "2".repeat(64),
};

test("the checked-in WhatShips snapshot is valid, unique, and newest first", () => {
  const parsed = parseWhatShipsSnapshot(whatShipsSnapshot);
  assert.ok(parsed.item_count >= 500, "published count must stay above the bootstrap safety floor");
  assert.equal(parsed.items.length, parsed.item_count);
  assert.equal(new Set(parsed.items.map((item) => item.tweet_id)).size, parsed.item_count);
  assert.equal(new Set(parsed.items.map((item) => item.slug)).size, parsed.item_count);
  assert.ok(parsed.items[0].published_at >= parsed.items.at(-1)!.published_at);
  assert.ok(getWhatShipsCategoryCounts().some((entry) => entry.id === "developer-tools"));
});

test("scheduled transitions reject removals and bulk additions", () => {
  const previous = buildSnapshot(bootstrap(), provenance);
  const withRemoval = {
    ...previous,
    item_count: previous.item_count - 1,
    items: previous.items.slice(1),
  } satisfies WhatShipsSnapshot;
  assert.throws(
    () => assertSafeTransition(previous, withRemoval, { allowRemovals: false, maxAdditions: 200 }),
    /refusing automatic deletion/,
  );

  const expanded = buildSnapshot(
    Array.from({ length: 701 }, (_, index) => upstreamVideo(index)),
    provenance,
  );
  assert.throws(
    () => assertSafeTransition(previous, expanded, { allowRemovals: false, maxAdditions: 200 }),
    /above the automatic limit of 200/,
  );
});

test("normalization keeps source-hosted posters and strips mirrored media, prose, and tracking parameters", () => {
  const items = normalizeUpstreamVideos(bootstrap({ category: "devtools", durationSeconds: 0 }));
  const normalized = items.find((item) => item.slug === "test-launch-0");
  assert.ok(normalized);
  assert.equal(normalized.category, "developer-tools");
  assert.equal(normalized.source_category, "devtools");
  assert.equal(normalized.duration_seconds, null);
  assert.equal(normalized.poster_url, "https://whatships.com/posters/test-launch-0.webp");
  assert.match(normalized.original_post_url, /^https:\/\/x\.com\/tester\/status\/\d+$/);
  assert.deepEqual(normalized.tags, ["AI", "demo"]);
  for (const forbidden of ["description", "poster", "videoUrl", "authorAvatar"]) {
    assert.equal(forbidden in normalized, false, `${forbidden} must not enter normalized output`);
  }
});

test("poster normalization rejects arbitrary hosts, traversal, and non-WebP paths", () => {
  for (const poster of [
    "https://example.com/poster.webp",
    "/posters/../secret.webp",
    "/posters/test-launch.jpg",
  ]) {
    assert.throws(
      () => normalizeUpstreamVideos(bootstrap({ poster })),
      /must be a local WhatShips WebP poster path/,
    );
  }
});

test("an unknown source category degrades to other without losing the source value", () => {
  const normalized = normalizeUpstreamVideos(bootstrap({ category: "spatial-computing" }))
    .find((item) => item.slug === "test-launch-0");
  assert.ok(normalized);
  assert.equal(normalized.category, "other");
  assert.equal(normalized.source_category, "spatial-computing");
});

test("duplicate tweet ids fail the complete import", () => {
  const values = bootstrap();
  values[1] = upstreamVideo(1, {
    tweetId: values[0].tweetId,
    tweetUrl: values[0].tweetUrl,
  });
  assert.throws(() => normalizeUpstreamVideos(values), /Duplicate tweet_id/);
});

test("duplicate upstream ids and slugs fail the complete import", () => {
  const duplicateId = bootstrap();
  duplicateId[1] = upstreamVideo(1, { id: duplicateId[0].id });
  assert.throws(() => normalizeUpstreamVideos(duplicateId), /Duplicate id/);

  const duplicateSlug = bootstrap();
  duplicateSlug[1] = upstreamVideo(1, { slug: duplicateSlug[0].slug });
  assert.throws(() => normalizeUpstreamVideos(duplicateSlug), /Duplicate slug/);
});

test("empty, partial, and non-X inputs fail before replacing the snapshot", () => {
  assert.throws(() => normalizeUpstreamVideos([]), /outside the safety range/);
  assert.throws(
    () => normalizeUpstreamVideos(bootstrap().slice(0, 499)),
    /outside the safety range/,
  );
  assert.throws(
    () => normalizeUpstreamVideos(bootstrap({ tweetUrl: "https://example.com/not-a-post" })),
    /must be an https x\.com or twitter\.com status URL/,
  );
});

test("snapshot output is deterministic and records immutable provenance", () => {
  const source = bootstrap();
  const first = buildSnapshot(source, provenance);
  const second = buildSnapshot([...source].reverse(), provenance);
  assert.deepEqual(first, second);
  assert.equal(first.source.commit, provenance.commit);
  assert.equal(first.item_count, 500);
  assert.equal(first.content_policy.media_mirrored, false);
  assert.equal(first.content_policy.poster_delivery, "remote-source");
  assert.equal(first.content_policy.descriptions_mirrored, false);
});

test("the generated file contains only the allowlisted item keys", () => {
  const snapshot = JSON.parse(readFileSync("content/whatships.json", "utf8")) as WhatShipsSnapshot;
  const allowed = new Set([
    "id", "tweet_id", "slug", "title", "product", "company", "category",
    "source_category", "tags", "published_at", "duration_seconds", "featured",
    "poster_url", "source_url", "original_post_url",
  ]);
  for (const item of snapshot.items) {
    for (const key of Object.keys(item)) assert.ok(allowed.has(key), `unexpected item key ${key}`);
  }
});

test("the scheduled workflow commits only a changed snapshot and explicitly dispatches the release", () => {
  const workflow = readFileSync(".github/workflows/sync-whatships.yml", "utf8");
  assert.match(workflow, /cron: "17 \*\/6 \* \* \*"/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /git diff --quiet -- content\/whatships\.json/);
  assert.match(workflow, /git push origin HEAD:main/);
  assert.match(workflow, /gh workflow run deploy\.yml --ref main/);
  assert.match(workflow, /--commit "\$\{\{ steps\.commit\.outputs\.pushed_sha \}\}"/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /main_pushed_dispatch_failed/);
  assert.doesNotMatch(workflow, /pull-requests: write/);
});

test("the Launches channel is discoverable without joining startup or newsletter models", () => {
  const layout = readFileSync("src/layouts/Base.astro", "utf8");
  const page = readFileSync("src/pages/launches.astro", "utf8");
  const card = readFileSync("src/components/WhatShipsCard.astro", "utf8");
  const sitemap = readFileSync("src/pages/sitemap.xml.ts", "utf8");
  const llms = readFileSync("src/pages/llms.txt.ts", "utf8");
  const content = readFileSync("src/lib/content.ts", "utf8");
  const newsletter = readFileSync("src/lib/newsletter.ts", "utf8");

  assert.match(layout, /href="\/launches"[^>]*>Launches</);
  assert.match(page, /fetch\("\/whatships\.json"/);
  assert.match(page, /Cover images load from WhatShips/);
  assert.match(card, /data-launch-poster/);
  assert.match(card, /item\.poster_url/);
  assert.match(sitemap, /loc: "\/launches"/);
  assert.match(llms, /Product Launch Index/);
  assert.doesNotMatch(content, /whatships/i);
  assert.doesNotMatch(newsletter, /whatships/i);
});
