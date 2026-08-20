import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertSafeTransition,
  buildChangedLaunchUrls,
  buildSnapshot,
  reconcileLaunchChangeTimes,
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

test("normalization keeps original X video evidence and strips source prose and tracking parameters", () => {
  const items = normalizeUpstreamVideos(bootstrap({ category: "devtools", durationSeconds: 0 }));
  const normalized = items.find((item) => item.slug === "test-launch-0");
  assert.ok(normalized);
  assert.equal(normalized.category, "developer-tools");
  assert.equal(normalized.source_category, "devtools");
  assert.equal(normalized.duration_seconds, null);
  assert.equal(normalized.video_url, "https://video.twimg.com/test.mp4");
  assert.match(normalized.original_post_url, /^https:\/\/x\.com\/tester\/status\/\d+$/);
  assert.deepEqual(normalized.tags, ["AI", "demo"]);
  for (const forbidden of ["description", "poster", "poster_url", "source_url", "videoUrl", "authorAvatar"]) {
    assert.equal(forbidden in normalized, false, `${forbidden} must not enter normalized output`);
  }
});

test("video normalization rejects arbitrary hosts and non-MP4 paths", () => {
  for (const videoUrl of [
    "https://example.com/video.mp4",
    "https://video.twimg.com/not-a-video.jpg",
    "http://video.twimg.com/test.mp4",
  ]) {
    assert.throws(
      () => normalizeUpstreamVideos(bootstrap({ videoUrl })),
      /must be an https video\.twimg\.com MP4 URL/,
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
  assert.equal(first.content_policy.video_delivery, "remote-original");
  assert.equal(first.content_policy.descriptions_mirrored, false);
});

test("launch changes retain stable change times and emit only affected canonical URLs", () => {
  const previous = buildSnapshot(bootstrap(), provenance);
  previous.items = previous.items.map((item) => ({ ...item, last_changed_at: "2026-08-14T00:00:00.000Z" }));
  const nextSource = bootstrap();
  nextSource[0] = upstreamVideo(0, { title: "A refined launch title", slug: "refined-launch" });
  const next = buildSnapshot(nextSource, { ...provenance, commitAt: "2026-08-20T01:02:03.000Z" });
  const reconciled = reconcileLaunchChangeTimes(previous, next);
  const changedTweetId = previous.items.find((item) => item.slug === "test-launch-0")!.tweet_id;
  const unchanged = reconciled.items.find((item) => item.slug === "test-launch-1")!;
  const changed = reconciled.items.find((item) => item.tweet_id === changedTweetId)!;

  assert.equal(unchanged.last_changed_at, "2026-08-14T00:00:00.000Z");
  assert.equal(changed.last_changed_at, "2026-08-20T01:02:03.000Z");
  assert.deepEqual(buildChangedLaunchUrls(previous, reconciled), [
    "https://venturedex.co/launches",
    "https://venturedex.co/launches.json",
    "https://venturedex.co/llms.txt",
    "https://venturedex.co/llms-full.txt",
    "https://venturedex.co/ai-index.json",
    "https://venturedex.co/launches/refined-launch",
    "https://venturedex.co/launches/test-launch-0",
  ]);
});

test("the generated file contains only the allowlisted item keys", () => {
  const snapshot = JSON.parse(readFileSync("content/whatships.json", "utf8")) as WhatShipsSnapshot;
  const allowed = new Set([
    "id", "tweet_id", "slug", "title", "product", "company", "category",
    "source_category", "tags", "published_at", "duration_seconds", "featured",
    "video_url", "original_post_url", "last_changed_at",
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
  assert.match(workflow, /gh run watch/);
  assert.match(workflow, /conclusion/);
  assert.match(workflow, /--urls-file/);
  assert.match(workflow, /IndexNow/);
  assert.ok(workflow.indexOf("gh run watch") < workflow.indexOf("--urls-file"));
  assert.doesNotMatch(workflow, /pull-requests: write/);
});

test("the Launches channel is discoverable without joining startup or newsletter models", () => {
  const layout = readFileSync("src/layouts/Base.astro", "utf8");
  const page = readFileSync("src/pages/launches.astro", "utf8");
  const card = readFileSync("src/components/LaunchCard.astro", "utf8");
  const detail = readFileSync("src/pages/launches/[slug].astro", "utf8");
  const api = readFileSync("src/pages/launches.json.ts", "utf8");
  const sitemap = readFileSync("src/pages/sitemap.xml.ts", "utf8");
  const llms = readFileSync("src/pages/llms.txt.ts", "utf8");
  const content = readFileSync("src/lib/content.ts", "utf8");
  const newsletter = readFileSync("src/lib/newsletter.ts", "utf8");

  assert.match(layout, /href="\/launches"[^>]*>Launches</);
  assert.match(layout, /meta name="referrer" content=\{referrerPolicy\}/);
  assert.match(page, /fetch\("\/launches\.json"/);
  assert.match(page, /referrerPolicy="no-referrer"/);
  assert.match(page, /detailPath\(item\)/);
  assert.match(card, /href=\{detailPath\}/);
  assert.match(card, /data-launch-preview/);
  assert.match(card, /item\.video_url/);
  assert.match(card, /getPublicLaunchTags\(item\)/);
  assert.match(detail, /class="launch-player__video"/);
  assert.match(detail, /referrerPolicy="no-referrer"/);
  assert.match(detail, /src=\{item\.video_url\}/);
  assert.match(detail, /item\.original_post_url/);
  assert.match(api, /url: `\/launches\/\$\{item\.slug\}`/);
  assert.match(api, /tags: getPublicLaunchTags\(item\)/);
  assert.doesNotMatch(api, /source: whatShipsSnapshot\.source/);
  assert.match(sitemap, /loc: "\/launches"/);
  assert.match(sitemap, /`\/launches\/\$\{item\.slug\}`/);
  assert.match(llms, /Product Launch Pages/);
  for (const publicSurface of [page, card, detail, api, llms]) {
    assert.doesNotMatch(publicSurface, /whatships\.com/i);
    assert.doesNotMatch(publicSurface, /href=\{item\.source_url\}/);
  }
  assert.doesNotMatch(content, /whatships/i);
  assert.doesNotMatch(newsletter, /whatships/i);
});

test("launch pages prioritize video discovery before supporting editorial content", () => {
  const page = readFileSync("src/pages/launches.astro", "utf8");
  const detail = readFileSync("src/pages/launches/[slug].astro", "utf8");

  const directoryIntro = page.indexOf('class="launch-directory__intro"');
  const controls = page.indexOf('class="launch-controls"');
  const grid = page.indexOf('class="launch-grid"');
  assert.ok(directoryIntro >= 0 && directoryIntro < controls && controls < grid);
  assert.doesNotMatch(page, /class="launch-hero"/);
  assert.doesNotMatch(page, /font-size:\s*clamp\(3rem,\s*7vw,\s*6\.4rem\)/);

  const detailHero = detail.indexOf('class="launch-detail__hero"');
  const detailHeader = detail.indexOf('class="launch-detail__header"', detailHero);
  const detailPlayer = detail.indexOf('class="launch-player"', detailHero);
  const detailBody = detail.indexOf('class="launch-detail__body"', detailHero);
  assert.ok(detailHero >= 0 && detailHeader < detailPlayer && detailPlayer < detailBody);
  assert.doesNotMatch(detail, /class="launch-detail__dek"/);
  assert.doesNotMatch(detail, /font-size:\s*clamp\(3rem,\s*8vw,\s*7\.4rem\)/);
  assert.match(detail, /font-size:\s*clamp\(2rem,\s*2\.9vw,\s*2\.75rem\)/);
  assert.match(detail, /font-size:\s*clamp\(1\.9rem,\s*8vw,\s*2\.25rem\)/);
  assert.doesNotMatch(detail, /font-size:\s*clamp\(2\.35rem,\s*4vw,\s*4rem\)/);
});
