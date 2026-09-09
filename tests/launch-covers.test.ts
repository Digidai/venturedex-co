import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { COVER_RECIPE, launchCoverKey, type LaunchCoverManifest } from "../src/lib/launch-cover-key";
import { whatShipsSnapshot } from "../src/lib/whatships";
import { matchesLiveCatalog, pendingLaunchUrls, type LaunchCheckpoint } from "../scripts/launch-sync-state";
import { withHttpPolicy } from "../src/lib/http-policy";
import { fetchVideoPrefix, isBlankFrame } from "../scripts/launch-covers";
import sharp from "sharp";

test("solid video opening frames are rejected instead of becoming blank covers", async () => {
  for (const background of ["black", "white"]) {
    const frame = await sharp({ create: { width: 64, height: 36, channels: 3, background } }).png().toBuffer();
    assert.equal(await isBlankFrame(frame), true);
  }
  const pixels = Buffer.from(Array.from({ length: 64 * 36 * 3 }, (_, index) => index % 256));
  assert.equal(await isBlankFrame(await sharp(pixels, { raw: { width: 64, height: 36, channels: 3 } }).png().toBuffer()), false);
});

test("bounded thumbnail fetch stops even if a CDN ignores Range and never finishes cancelling", async () => {
  let signal: AbortSignal | undefined | null;
  const fakeFetch = (async (_url: unknown, init: RequestInit) => {
    signal = init.signal;
    assert.equal(new Headers(init.headers).get("Range"), "bytes=0-63");
    assert.equal(init.redirect, "error");
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(512).fill(7)); },
      cancel() { return new Promise(() => {}); },
    }));
  }) as typeof fetch;
  const frame = await fetchVideoPrefix("https://video.twimg.com/a.mp4", 64, fakeFetch);
  assert.equal(frame.length, 64);
  assert.equal(signal?.aborted, true);
  await assert.rejects(fetchVideoPrefix("https://video.twimg.com/a.mp4", 8 * 1024 * 1024, fakeFetch), /bounded/);
});

test("cover keys are deterministic, recipe-versioned, and restricted to original MP4s", () => {
  const url = "https://video.twimg.com/amplify_video/123/vid/demo.mp4";
  assert.match(launchCoverKey(url), /^[a-f0-9]{24}$/);
  assert.equal(launchCoverKey(url), launchCoverKey(url));
  assert.notEqual(launchCoverKey(url), launchCoverKey(`${url}?tag=1`));
  for (const bad of ["http://video.twimg.com/a.mp4", "https://video.twimg.com.evil.test/a.mp4", "https://user@video.twimg.com/a.mp4", "https://video.twimg.com:8443/a.mp4", "file:///a.mp4", "https://video.twimg.com/a.m3u8"]) {
    assert.throws(() => launchCoverKey(bad));
  }
});

test("versioned cover records point at real bounded WebP files", () => {
  const manifest: LaunchCoverManifest = JSON.parse(readFileSync("content/launch-covers.json", "utf8"));
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.recipe, COVER_RECIPE);
  const uniqueKeys = new Set(whatShipsSnapshot.items.map((item) => launchCoverKey(item.video_url)));
  const missing = [...uniqueKeys].filter((key) => !manifest.covers[key]);
  assert.ok(missing.length <= Math.max(10, Math.ceil(uniqueKeys.size * 0.02)), "cover coverage must pass the ingestion gate");
  for (const [key, cover] of Object.entries(manifest.covers)) {
    assert.match(key, /^[a-f0-9]{24}$/);
    assert.equal(cover.path, `/launch-covers/${key}.webp`);
    assert.ok(existsSync(`public${cover.path}`));
    const file = readFileSync(`public${cover.path}`);
    assert.equal(file.subarray(0, 4).toString(), "RIFF");
    assert.equal(file.subarray(8, 12).toString(), "WEBP");
    assert.equal(cover.bytes, file.length);
    assert.ok(file.length > 0 && file.length <= 150_000);
    assert.equal(cover.width, 640);
    assert.equal(cover.height, 360);
  }
});

test("failed publication/notification leaves pending URLs retryable; completed state is a no-op", () => {
  const next: LaunchCheckpoint = { schema_version: 1, snapshot: whatShipsSnapshot, covers: { schema_version: 1, recipe: COVER_RECIPE, covers: {} } };
  const initial = pendingLaunchUrls(null, next);
  assert.equal(initial.length, whatShipsSnapshot.item_count + 5);
  assert.deepEqual(pendingLaunchUrls(null, next), initial);
  assert.deepEqual(pendingLaunchUrls(next, next), []);
  const withCover = structuredClone(next);
  const item = next.snapshot.items[0];
  const key = launchCoverKey(item.video_url);
  withCover.covers.covers[key] = { path: `/launch-covers/${key}.webp`, width: 640, height: 360, bytes: 1234 };
  assert.ok(pendingLaunchUrls(next, withCover).includes(`https://venturedex.co/launches/${item.slug}`));
  assert.equal(matchesLiveCatalog({ fingerprint: "a", item_count: 2, items: [{}, {}] }, "a", 2), true);
  assert.equal(matchesLiveCatalog({ fingerprint: "b", item_count: 2, items: [{}, {}] }, "a", 2), false);
  assert.equal(matchesLiveCatalog({ fingerprint: "a", item_count: 2, items: [{}] }, "a", 2), false);
  assert.equal(matchesLiveCatalog(null, "a", 2), false);
});

test("covers cache immutably only for successful assets; inventory revalidates quickly", () => {
  const url = "https://venturedex.co/launch-covers/0123456789abcdef01234567.webp";
  assert.equal(withHttpPolicy(new Request(url), new Response("image")).headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  assert.equal(withHttpPolicy(new Request(url), new Response("missing", { status: 404 })).headers.get("Cache-Control"), null);
  assert.equal(withHttpPolicy(new Request("https://venturedex.co/launches.json"), new Response("{}")).headers.get("Cache-Control"), "public, max-age=60, s-maxage=300, must-revalidate");
});

test("list uses images without video decoding, preserves SSR nodes, and details use poster/thumbnail metadata", () => {
  const page = readFileSync("src/pages/launches.astro", "utf8");
  const card = readFileSync("src/components/LaunchCard.astro", "utf8");
  const detail = readFileSync("src/pages/launches/[slug].astro", "utf8");
  assert.doesNotMatch(page, /createElement\("video"\)|preview\.load\(/);
  assert.doesNotMatch(card, /<video/);
  assert.match(page, /currentSlugs\.join/);
  assert.match(page, /payload\.fingerprint !== root\.dataset\.launchVersion/);
  assert.match(page, /if \(!grid \|\| !indexReady\) return/);
  assert.match(page, /if \(search\) search\.disabled = true/);
  assert.match(detail, /poster=\{cover\?\.path\}/);
  assert.match(detail, /thumbnailUrl: coverUrl/);
  assert.match(detail, /ogImage=\{coverUrl\}/);
});
