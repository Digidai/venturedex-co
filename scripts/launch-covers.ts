import { execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { COVER_HEIGHT, COVER_RECIPE, COVER_WIDTH, launchCoverKey, type LaunchCoverManifest } from "../src/lib/launch-cover-key";

const run = promisify(execFile);
const manifestPath = resolve("content/launch-covers.json");

export async function isBlankFrame(bytes: Buffer): Promise<boolean> {
  const stats = await sharp(bytes).stats();
  return stats.channels.slice(0, 3).every((channel) => channel.stdev < 2);
}

export async function fetchVideoPrefix(url: string, limit: number, fetchImpl: typeof fetch = fetch): Promise<Buffer> {
  launchCoverKey(url); // Do not allow credentials, arbitrary hosts, or redirects.
  if (!Number.isInteger(limit) || limit < 1 || limit > 4 * 1024 * 1024) throw new Error("Invalid bounded video prefix size");
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetchImpl(url, {
      headers: { Range: `bytes=0-${limit - 1}` }, redirect: "error", signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error(`Original video HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const part = value.subarray(0, limit - size);
      chunks.push(part);
      size += part.length;
    }
    // Some CDNs keep a range stream open. Do not wait for cancellation to
    // drain a large response; abort the transport after the bounded prefix.
    void reader.cancel().catch(() => {});
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(deadline);
    controller.abort();
  }
}

export function decodeFrame(bytes: Buffer, seconds: number): Promise<Buffer> {
  return new Promise((accept, reject) => {
    const child = execFile("ffmpeg", [
      "-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1",
      "-protocol_whitelist", "pipe", "-f", "mp4", "-i", "pipe:0", "-ss", String(seconds),
      "-an", "-sn", "-frames:v", "1", "-vf",
      `scale=${COVER_WIDTH}:${COVER_HEIGHT}:force_original_aspect_ratio=decrease,pad=${COVER_WIDTH}:${COVER_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0x161817`,
      "-c:v", "png", "-threads", "1", "-f", "image2pipe", "pipe:1",
    ], { encoding: "buffer", timeout: 10_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!stdout.length || (error && Array.from(stdout.subarray(0, 8)).join(",") !== "137,80,78,71,13,10,26,10")) reject(new Error(`Original prefix did not contain a decodable frame: ${stderr.toString().slice(0, 500)}`));
      else accept(stdout);
    });
    child.stdin?.on("error", () => { /* Decoder may finish before consuming the entire prefix. */ });
    child.stdin?.end(bytes);
  });
}

/** This is an ingestion step, never a visitor request or a normal site build.
 * Only a single derived still is retained; original videos are not stored.
 */
async function main() {
  const check = process.argv.includes("--check");
  // Reviewed bootstrap cleanup only: never overwrite already-published covers
  // during a scheduled run. Bump the recipe for later editorial replacements.
  const repairBlank = process.argv.includes("--repair-blank");
  const remoteFallback = process.argv.includes("--remote-fallback");
  const concurrency = Number(process.argv.find((arg) => arg.startsWith("--concurrency="))?.split("=")[1] ?? 6);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) throw new Error("Cover concurrency must be 1-12");
  const snapshot = JSON.parse(readFileSync("content/whatships.json", "utf8"));
  const prior: LaunchCoverManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (prior.schema_version !== 1 || prior.recipe !== COVER_RECIPE) throw new Error("Unsupported cover manifest");
  const manifest: LaunchCoverManifest = { ...prior, covers: { ...prior.covers } };
  const unique = [...new Map<string, {video_url: string; duration_seconds: number | null}>(snapshot.items.map((item: any) => [launchCoverKey(item.video_url), item])).entries()];
  const maxUnavailable = Math.max(10, Math.ceil(unique.length * 0.02));
  const initiallyMissing = unique.filter(([key]) => !existsSync(resolve(`public/launch-covers/${key}.webp`))).length;
  let cursor = 0;
  let generated = 0;
  let failures = 0;
  let stopped = false;
  const saveManifest = () => {
    const ordered = { ...manifest, covers: Object.fromEntries(Object.entries(manifest.covers).sort(([a], [b]) => a.localeCompare(b))) };
    const text = `${JSON.stringify(ordered, null, 2)}\n`;
    if (text !== readFileSync(manifestPath, "utf8")) {
      writeFileSync(`${manifestPath}.tmp`, text);
      renameSync(`${manifestPath}.tmp`, manifestPath);
    }
  };
  if (!check) {
    await run("ffmpeg", ["-version"]);
    mkdirSync("public/launch-covers", { recursive: true });
  }
  await Promise.all(Array.from({ length: check ? 1 : concurrency }, async () => {
    while (!stopped && cursor < unique.length) {
      const [key, item] = unique[cursor++];
      const path = `/launch-covers/${key}.webp`;
      const file = resolve(`public${path}`);
      // Unreferenced files are not published covers (for example a rejected
      // bootstrap frame). Check mode must not silently adopt those files.
      if (check && !manifest.covers[key]) continue;
      let replacingBlank = false;
      try {
        replacingBlank = !check && existsSync(file) && (repairBlank || !prior.covers[key]) && await isBlankFrame(readFileSync(file));
        const needsFrame = !existsSync(file) || replacingBlank;
        if (needsFrame) {
          if (check) {
            if (manifest.covers[key]) throw new Error(`Missing recorded cover: ${key}`);
            continue; // Unavailable originals use the intentional product fallback.
          }
          let stdout: Buffer | undefined;
          // Long originals can have >1 MiB of MP4 seek metadata before any
          // frame data. One final 4 MiB prefix handles those without a download.
          for (const limit of [256 * 1024, 1024 * 1024, 4 * 1024 * 1024]) {
            try {
              const bytes = await fetchVideoPrefix(item.video_url, limit);
              for (const seconds of limit === 256 * 1024 ? [0.15] : [1, 0.15]) {
                try {
                  const frame = await decodeFrame(bytes, Math.min(seconds, (item.duration_seconds ?? 4) / 4));
                  if (!await isBlankFrame(frame)) { stdout = frame; break; }
                } catch { /* Try the alternate early timestamp in the same bytes. */ }
              }
              if (stdout) break;
            } catch { /* Try the next bounded prefix for HD/keyframes or long-file headers. */ }
          }
          // Reviewed recovery only; the scheduled wrapper never uses this flag.
          if (!stdout && remoteFallback) {
            try {
              const frame = await run("ffmpeg", [
                "-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1",
                "-rw_timeout", "10000000", "-protocol_whitelist", "https,tls,tcp",
                "-ss", String(Math.min(2, (item.duration_seconds ?? 8) / 4)), "-f", "mp4", "-i", item.video_url,
                "-an", "-sn", "-frames:v", "1", "-vf",
                `scale=${COVER_WIDTH}:${COVER_HEIGHT}:force_original_aspect_ratio=decrease,pad=${COVER_WIDTH}:${COVER_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0x161817`,
                "-c:v", "png", "-threads", "1", "-f", "image2pipe", "pipe:1",
              ], { encoding: "buffer", timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
              if (!await isBlankFrame(frame.stdout)) stdout = frame.stdout;
            } catch { /* No video file is stored; retain fallback if inaccessible. */ }
          }
          if (!stdout) throw new Error("Could not derive original frame within bounded fetch attempts");
          const frame = await sharp(stdout).webp({ quality: 72, effort: 4 }).toBuffer();
          const metadata = await sharp(frame).metadata();
          if (metadata.format !== "webp" || metadata.width !== COVER_WIDTH || metadata.height !== COVER_HEIGHT || frame.length > 150_000) {
            throw new Error("Invalid generated frame");
          }
          const temporary = `${file}.tmp-${process.pid}`;
          writeFileSync(temporary, frame);
          renameSync(temporary, file);
          generated += 1;
        }
        const bytes = readFileSync(file);
        const metadata = await sharp(bytes).metadata();
        if (metadata.format !== "webp" || metadata.width !== COVER_WIDTH || metadata.height !== COVER_HEIGHT || bytes.length > 150_000) throw new Error(`Invalid cover ${key}`);
        const cover = { path, width: COVER_WIDTH, height: COVER_HEIGHT, bytes: bytes.length };
        if (check && JSON.stringify(manifest.covers[key]) !== JSON.stringify(cover)) throw new Error(`Cover manifest mismatch: ${key}`);
        manifest.covers[key] = cover;
      } catch (error) {
        if (check || (prior.covers[key] && !replacingBlank)) throw error;
        if (replacingBlank) delete manifest.covers[key];
        failures += 1;
        // No error timestamps in Git. Missing keys are retried on the next run.
        console.warn(`Cover unavailable for ${key}; retained fallback and retry eligibility.`);
        if (failures >= 10 && generated === 0 && initiallyMissing > maxUnavailable) {
          stopped = true;
          throw new Error("Cover generation failed for the first ten originals; check CDN access and ffmpeg before retrying");
        }
      }
      if (cursor % 100 === 0) {
        if (!check) saveManifest();
        console.log(`Covers processed ${cursor}/${unique.length}; generated ${generated}; unavailable ${failures}`);
      }
    }
  }));
  manifest.covers = Object.fromEntries(Object.entries(manifest.covers).sort(([a], [b]) => a.localeCompare(b)));
  // Apply the same coverage gate in read-only CI and scheduled ingestion.
  const missing = unique.filter(([key]) => !manifest.covers[key]).length;
  if (missing > maxUnavailable) throw new Error(`Cover outage: ${missing}/${unique.length} unavailable; refusing incomplete cover publication`);
  if (!check) saveManifest();
  const message = `Launch covers: ${unique.length} unique videos, ${generated} generated, ${missing} unavailable (retry next run).`;
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
