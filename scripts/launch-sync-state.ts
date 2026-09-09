import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildChangedLaunchUrls, type WhatShipsSnapshot } from "./sync-whatships";
import { launchCoverKey, type LaunchCoverManifest } from "../src/lib/launch-cover-key";
import { parseWhatShipsSnapshot } from "../src/lib/whatships";
import { launchCatalogFingerprint } from "../src/lib/launch-fingerprint";

export interface LaunchCheckpoint { schema_version: 1; snapshot: WhatShipsSnapshot; covers: LaunchCoverManifest }

export function pendingLaunchUrls(previous: LaunchCheckpoint | null, next: LaunchCheckpoint): string[] {
  const urls = new Set(buildChangedLaunchUrls(previous?.snapshot ?? null, next.snapshot));
  for (const item of next.snapshot.items) {
    const key = launchCoverKey(item.video_url);
    if (JSON.stringify(previous?.covers.covers[key] ?? null) !== JSON.stringify(next.covers.covers[key] ?? null)) {
      urls.add(`https://venturedex.co/launches/${item.slug}`);
      urls.add("https://venturedex.co/launches");
      urls.add("https://venturedex.co/launches.json");
    }
  }
  return [...urls].sort();
}

export function matchesLiveCatalog(value: unknown, fingerprint: string, count: number): boolean {
  const live = value as { fingerprint?: string; item_count?: number; items?: unknown[] } | null;
  return Boolean(live && live.fingerprint === fingerprint && live.item_count === count && Array.isArray(live.items) && live.items.length === count);
}

async function main() {
  const [mode, statePath, urlsPath] = process.argv.slice(2);
  if (!["plan", "verify-live", "checkpoint"].includes(mode)) throw new Error("Expected plan, verify-live, or checkpoint");
  const next: LaunchCheckpoint = {
    schema_version: 1,
    snapshot: parseWhatShipsSnapshot(JSON.parse(readFileSync("content/whatships.json", "utf8"))),
    covers: JSON.parse(readFileSync("content/launch-covers.json", "utf8")),
  };
  if (mode === "verify-live") {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(`https://venturedex.co/launches.json?verify=${launchCatalogFingerprint}`, {
        redirect: "error", headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(20_000),
      });
      if (response.ok && matchesLiveCatalog(await response.json(), launchCatalogFingerprint, next.snapshot.item_count)) {
        console.log(`Live launch inventory and covers verified: ${next.snapshot.item_count}, ${launchCatalogFingerprint}`);
        return;
      }
      if (attempt < 2) await new Promise((done) => setTimeout(done, 3_000));
    }
    throw new Error("Live catalog does not match the exact local snapshot and covers; checkpoint not advanced");
  }
  if (!statePath) throw new Error("A checkpoint path outside the repository is required");
  if (mode === "plan") {
    if (!urlsPath) throw new Error("Missing URL artifact path");
    const previous: LaunchCheckpoint | null = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;
    if (previous) {
      if (previous.schema_version !== 1 || !previous.covers?.covers) throw new Error("Invalid sync checkpoint");
      parseWhatShipsSnapshot(previous.snapshot);
    }
    const urls = pendingLaunchUrls(previous, next);
    writeFileSync(urlsPath, `${JSON.stringify(urls, null, 2)}\n`);
    console.log(`${urls.length} pending URLs since the last successful publication/notification checkpoint.`);
  } else {
    mkdirSync(dirname(resolve(statePath)), { recursive: true });
    writeFileSync(statePath, `${JSON.stringify(next)}\n`);
    console.log("Recorded completed launch publication/notification checkpoint.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
