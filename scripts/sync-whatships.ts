import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT = resolve(REPO_ROOT, "content/whatships.json");
const UPSTREAM_REPOSITORY = "dingyi/whatships.com";
const UPSTREAM_DATA_PATH = "src/data/videos.json";
const UPSTREAM_API_URL = `https://api.github.com/repos/${UPSTREAM_REPOSITORY}/commits?sha=main&path=${encodeURIComponent(UPSTREAM_DATA_PATH)}&per_page=1`;
const DEFAULT_MAX_ADDITIONS = 200;
const MIN_BOOTSTRAP_ITEMS = 500;
const MAX_BOOTSTRAP_ITEMS = 5_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_FETCH_ATTEMPTS = 3;
const ALLOWED_FETCH_HOSTS = new Set(["api.github.com", "raw.githubusercontent.com"]);

const KNOWN_CATEGORIES = new Set([
  "ai",
  "consumer",
  "design",
  "developer-tools",
  "hardware",
  "motion",
  "other",
  "productivity",
]);

export interface WhatShipsItem {
  id: string;
  tweet_id: string;
  slug: string;
  title: string;
  product: string;
  company: string;
  category: string;
  source_category?: string;
  tags: string[];
  published_at: string;
  duration_seconds: number | null;
  featured: boolean;
  video_url: string;
  original_post_url: string;
}

export interface WhatShipsSnapshot {
  schema_version: 1;
  channel: "whatships";
  title: string;
  description: string;
  source: {
    name: "whatships.com";
    homepage_url: string;
    repository_url: string;
    data_path: string;
    commit: string;
    commit_url: string;
    commit_at: string;
    raw_data_url: string;
    raw_sha256: string;
  };
  content_policy: {
    mode: "original-video-index";
    media_mirrored: false;
    video_delivery: "remote-original";
    descriptions_mirrored: false;
    attribution: string;
  };
  source_published_through: string;
  item_count: number;
  items: WhatShipsItem[];
}

interface SourceProvenance {
  commit: string;
  commitAt: string;
  commitUrl: string;
  rawDataUrl: string;
  rawSha256: string;
}

interface CliOptions {
  output: string;
  sourceFile?: string;
  sourceCommit?: string;
  sourceCommitAt?: string;
  allowRemovals: boolean;
  maxAdditions: number;
  check: boolean;
  dryRun: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) throw new Error(`${field} must not be empty`);
  if (cleaned.length > maxLength) {
    throw new Error(`${field} exceeds ${maxLength} characters`);
  }
  return cleaned;
}

function normalizeCategory(value: unknown): { category: string; sourceCategory?: string } {
  const sourceCategory = cleanText(value, "category", 64).toLowerCase();
  const aliased = sourceCategory === "devtools" ? "developer-tools" : sourceCategory;
  const category = KNOWN_CATEGORIES.has(aliased) ? aliased : "other";
  return category === sourceCategory
    ? { category }
    : { category, sourceCategory };
}

function normalizeTags(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}.tags must be an array`);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const rawTag of value) {
    const tag = cleanText(rawTag, `${label}.tags[]`, 64);
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === 12) break;
  }
  return tags;
}

function normalizePublishedAt(value: unknown, label: string): string {
  const input = cleanText(value, `${label}.publishedAt`, 64);
  const time = Date.parse(input);
  if (!Number.isFinite(time)) throw new Error(`${label}.publishedAt is not a valid date`);
  if (time > Date.now() + 48 * 60 * 60 * 1_000) {
    throw new Error(`${label}.publishedAt is more than 48 hours in the future`);
  }
  return new Date(time).toISOString();
}

function normalizeDuration(value: unknown, label: string): number | null {
  // The upstream catalog uses both null and 0 for an unknown duration.
  if (value === null || value === undefined || value === 0) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 43_200) {
    throw new Error(`${label}.durationSeconds must be null or a number from 1 to 43200`);
  }
  return Math.round(value);
}

function normalizeTweetUrl(value: unknown, tweetId: string, label: string): string {
  const input = cleanText(value, `${label}.tweetUrl`, 500);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`${label}.tweetUrl is not a valid URL`);
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.protocol !== "https:" || (host !== "x.com" && host !== "twitter.com")) {
    throw new Error(`${label}.tweetUrl must be an https x.com or twitter.com status URL`);
  }
  const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,32})\/status\/(\d+)(?:\/)?$/);
  if (!match || match[2] !== tweetId) {
    throw new Error(`${label}.tweetUrl must contain tweetId ${tweetId}`);
  }
  return `https://x.com/${match[1]}/status/${tweetId}`;
}

function normalizeVideoUrl(value: unknown, label: string): string {
  const input = cleanText(value, `${label}.videoUrl`, 2_048);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`${label}.videoUrl is not a valid URL`);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "video.twimg.com" ||
    url.username ||
    url.password ||
    url.port ||
    !/\.mp4$/i.test(url.pathname)
  ) {
    throw new Error(`${label}.videoUrl must be an https video.twimg.com MP4 URL`);
  }
  return url.toString();
}

function normalizeItem(value: unknown, index: number): WhatShipsItem | null {
  const label = `videos[${index}]`;
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  if (value.status !== "published") return null;

  const id = cleanText(value.id, `${label}.id`, 180);
  const tweetId = cleanText(value.tweetId, `${label}.tweetId`, 32);
  if (!/^\d+$/.test(tweetId)) throw new Error(`${label}.tweetId must contain only digits`);
  const slug = cleanText(value.slug, `${label}.slug`, 180);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`${label}.slug must be lowercase kebab-case`);
  }
  const { category, sourceCategory } = normalizeCategory(value.category);

  const item: WhatShipsItem = {
    id,
    tweet_id: tweetId,
    slug,
    title: cleanText(value.title, `${label}.title`, 220),
    product: cleanText(value.product, `${label}.product`, 160),
    company: cleanText(value.company, `${label}.company`, 160),
    category,
    tags: normalizeTags(value.tags, label),
    published_at: normalizePublishedAt(value.publishedAt, label),
    duration_seconds: normalizeDuration(value.durationSeconds, label),
    featured: value.featured === true,
    video_url: normalizeVideoUrl(value.videoUrl, label),
    original_post_url: normalizeTweetUrl(value.tweetUrl, tweetId, label),
  };
  if (sourceCategory) item.source_category = sourceCategory;
  return item;
}

export function normalizeUpstreamVideos(value: unknown): WhatShipsItem[] {
  if (!Array.isArray(value)) throw new Error("WhatShips videos.json must be an array");
  const items = value
    .map(normalizeItem)
    .filter((item): item is WhatShipsItem => item !== null)
    .sort((left, right) =>
      right.published_at.localeCompare(left.published_at) || left.slug.localeCompare(right.slug)
    );

  if (items.length < MIN_BOOTSTRAP_ITEMS || items.length > MAX_BOOTSTRAP_ITEMS) {
    throw new Error(
      `Published item count ${items.length} is outside the safety range ${MIN_BOOTSTRAP_ITEMS}-${MAX_BOOTSTRAP_ITEMS}`
    );
  }

  for (const [field, values] of [
    ["id", items.map((item) => item.id)],
    ["tweet_id", items.map((item) => item.tweet_id)],
    ["slug", items.map((item) => item.slug)],
  ] as const) {
    const seen = new Set<string>();
    for (const entry of values) {
      if (seen.has(entry)) throw new Error(`Duplicate ${field}: ${entry}`);
      seen.add(entry);
    }
  }
  return items;
}

export function buildSnapshot(value: unknown, source: SourceProvenance): WhatShipsSnapshot {
  const items = normalizeUpstreamVideos(value);
  return {
    schema_version: 1,
    channel: "whatships",
    title: "VentureDex Launches",
    description: "A VentureDex catalog of product launch videos, demos, and walkthroughs backed by their original posts.",
    source: {
      name: "whatships.com",
      homepage_url: "https://whatships.com/",
      repository_url: `https://github.com/${UPSTREAM_REPOSITORY}`,
      data_path: UPSTREAM_DATA_PATH,
      commit: source.commit,
      commit_url: source.commitUrl,
      commit_at: source.commitAt,
      raw_data_url: source.rawDataUrl,
      raw_sha256: source.rawSha256,
    },
    content_policy: {
      mode: "original-video-index",
      media_mirrored: false,
      video_delivery: "remote-original",
      descriptions_mirrored: false,
      attribution: "Original videos, posts, product names, and trademarks remain with their respective publishers and owners.",
    },
    source_published_through: items[0]?.published_at ?? source.commitAt,
    item_count: items.length,
    items,
  };
}

function parseOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    output: DEFAULT_OUTPUT,
    allowRemovals: false,
    maxAdditions: DEFAULT_MAX_ADDITIONS,
    check: false,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`${arg} requires a value`);
      index += 1;
      return next;
    };
    if (arg === "--output") options.output = resolve(nextValue());
    else if (arg.startsWith("--output=")) options.output = resolve(arg.slice(9));
    else if (arg === "--source-file") options.sourceFile = resolve(nextValue());
    else if (arg.startsWith("--source-file=")) options.sourceFile = resolve(arg.slice(14));
    else if (arg === "--source-commit") options.sourceCommit = nextValue();
    else if (arg.startsWith("--source-commit=")) options.sourceCommit = arg.slice(16);
    else if (arg === "--source-commit-at") options.sourceCommitAt = nextValue();
    else if (arg.startsWith("--source-commit-at=")) options.sourceCommitAt = arg.slice(19);
    else if (arg === "--max-additions") options.maxAdditions = Number(nextValue());
    else if (arg.startsWith("--max-additions=")) options.maxAdditions = Number(arg.slice(16));
    else if (arg === "--allow-removals") options.allowRemovals = true;
    else if (arg === "--check") options.check = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.maxAdditions) || options.maxAdditions < 0) {
    throw new Error("--max-additions must be a non-negative integer");
  }
  return options;
}

function requestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "VentureDex-WhatShips-Sync/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function fetchText(url: string): Promise<string> {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:" || !ALLOWED_FETCH_HOSTS.has(parsedUrl.hostname)) {
    throw new Error(`Refusing unexpected source URL: ${url}`);
  }
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: requestHeaders(),
        redirect: "error",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt === MAX_FETCH_ATTEMPTS) throw error;
      const delay = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      console.warn(`Source fetch attempt ${attempt} failed; retrying ${parsedUrl.hostname} in ${delay}ms.`);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
      continue;
    }

    if (!response.ok) {
      const remaining = response.headers.get("x-ratelimit-remaining") ?? "unknown";
      const reset = response.headers.get("x-ratelimit-reset") ?? "unknown";
      const retryAfter = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfter && /^\d+$/.test(retryAfter)
        ? Number(retryAfter)
        : null;
      const retryableServerError = response.status >= 500 && response.status <= 599;
      const retryableRateLimit = attempt === 1 && (response.status === 403 || response.status === 429) &&
        retryAfterSeconds !== null && retryAfterSeconds <= 60;
      if (attempt < MAX_FETCH_ATTEMPTS && (retryableServerError || retryableRateLimit)) {
        const delay = retryableRateLimit
          ? retryAfterSeconds! * 1_000
          : 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
        console.warn(
          `Source fetch returned HTTP ${response.status}; retrying ${parsedUrl.hostname} in ${delay}ms ` +
          `(rate remaining ${remaining}, reset ${reset}).`
        );
        await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
        continue;
      }
      throw new Error(
        `HTTP ${response.status} while fetching ${url} ` +
        `(rate remaining ${remaining}, reset ${reset}, retry-after ${retryAfter ?? "none"})`
      );
    }

    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_RESPONSE_BYTES) {
      throw new Error(`Response from ${parsedUrl.hostname} exceeds ${MAX_RESPONSE_BYTES} bytes`);
    }
    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_RESPONSE_BYTES) {
      throw new Error(`Response from ${parsedUrl.hostname} exceeds ${MAX_RESPONSE_BYTES} bytes`);
    }
    console.log(
      `Fetched ${parsedUrl.hostname} (${body.byteLength} bytes, etag ` +
      `${response.headers.get("etag") ?? "none"}, rate remaining ` +
      `${response.headers.get("x-ratelimit-remaining") ?? "unknown"}).`
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  }
  throw new Error(`Source fetch attempts exhausted for ${url}`);
}

async function loadUpstream(options: CliOptions): Promise<{ value: unknown; source: SourceProvenance }> {
  if (options.sourceFile) {
    const text = readFileSync(options.sourceFile, "utf8");
    const commit = options.sourceCommit ?? "0000000000000000000000000000000000000000";
    const commitAt = new Date(options.sourceCommitAt ?? "2026-08-15T00:00:00.000Z").toISOString();
    return {
      value: JSON.parse(text),
      source: {
        commit,
        commitAt,
        commitUrl: `https://github.com/${UPSTREAM_REPOSITORY}/commit/${commit}`,
        rawDataUrl: pathToFileURL(options.sourceFile).href,
        rawSha256: createHash("sha256").update(text).digest("hex"),
      },
    };
  }

  const commitResponse = JSON.parse(await fetchText(UPSTREAM_API_URL)) as unknown;
  if (!Array.isArray(commitResponse) || !isRecord(commitResponse[0])) {
    throw new Error("GitHub commits API returned an unexpected response");
  }
  const commit = cleanText(commitResponse[0].sha, "source commit", 40);
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("Source commit is not a full Git SHA");
  const commitNode = commitResponse[0].commit;
  if (!isRecord(commitNode)) throw new Error("Source commit metadata is missing");
  const committerNode = isRecord(commitNode.committer) ? commitNode.committer : null;
  const authorNode = isRecord(commitNode.author) ? commitNode.author : null;
  const commitAt = normalizePublishedAt(committerNode?.date ?? authorNode?.date, "source commit");
  const rawDataUrl = `https://raw.githubusercontent.com/${UPSTREAM_REPOSITORY}/${commit}/${UPSTREAM_DATA_PATH}`;
  const text = await fetchText(rawDataUrl);
  return {
    value: JSON.parse(text),
    source: {
      commit,
      commitAt,
      commitUrl: `https://github.com/${UPSTREAM_REPOSITORY}/commit/${commit}`,
      rawDataUrl,
      rawSha256: createHash("sha256").update(text).digest("hex"),
    },
  };
}

function loadExisting(output: string): WhatShipsSnapshot | null {
  if (!existsSync(output)) return null;
  const value = JSON.parse(readFileSync(output, "utf8")) as unknown;
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error(`${output} is not a valid WhatShips snapshot`);
  }
  return value as unknown as WhatShipsSnapshot;
}

export function assertSafeTransition(
  previous: WhatShipsSnapshot | null,
  next: WhatShipsSnapshot,
  options: Pick<CliOptions, "allowRemovals" | "maxAdditions">
): { additions: number; removals: number; updates: number } {
  if (!previous) return { additions: next.items.length, removals: 0, updates: 0 };
  const previousIds = new Set(previous.items.map((item) => item.tweet_id));
  const nextIds = new Set(next.items.map((item) => item.tweet_id));
  const additions = next.items.filter((item) => !previousIds.has(item.tweet_id)).length;
  const removedIds = previous.items
    .filter((item) => !nextIds.has(item.tweet_id))
    .map((item) => item.tweet_id);
  const removals = removedIds.length;
  const previousById = new Map(previous.items.map((item) => [item.tweet_id, item]));
  const updates = next.items.filter((item) => {
    const oldItem = previousById.get(item.tweet_id);
    return oldItem !== undefined && JSON.stringify(oldItem) !== JSON.stringify(item);
  }).length;
  if (removals > 0 && !options.allowRemovals) {
    const sample = removedIds.slice(0, 20).join(", ");
    const remainder = removals > 20 ? `, and ${removals - 20} more` : "";
    throw new Error(
      `Upstream removed ${removals} published items (tweet_ids: ${sample}${remainder}); ` +
      "refusing automatic deletion. Re-run only after review with --allow-removals."
    );
  }
  if (additions > options.maxAdditions) {
    throw new Error(
      `Upstream added ${additions} items, above the automatic limit of ${options.maxAdditions}`
    );
  }
  return { additions, removals, updates };
}

function samePublishedMetadata(previous: WhatShipsSnapshot | null, next: WhatShipsSnapshot): boolean {
  return Boolean(previous) && JSON.stringify(previous?.items) === JSON.stringify(next.items);
}

function writeSnapshot(output: string, snapshot: WhatShipsSnapshot): void {
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  const temporary = `${output}.tmp-${process.pid}`;
  writeFileSync(temporary, text, "utf8");
  renameSync(temporary, output);
}

function writeGithubEvidence(
  snapshot: WhatShipsSnapshot,
  transition: { additions: number; removals: number; updates: number },
  state: "changed" | "no_change",
): void {
  const outputHash = createHash("sha256")
    .update(`${JSON.stringify(snapshot, null, 2)}\n`)
    .digest("hex");
  const sourceCategoryDrift = [...new Set(
    snapshot.items.map((item) => item.source_category).filter((value): value is string => Boolean(value))
  )].sort();
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    appendFileSync(outputPath, [
      `state=${state}`,
      `item_count=${snapshot.item_count}`,
      `additions=${transition.additions}`,
      `updates=${transition.updates}`,
      `removals=${transition.removals}`,
      `source_commit=${snapshot.source.commit}`,
      `source_hash=${snapshot.source.raw_sha256}`,
      `output_hash=${outputHash}`,
      "",
    ].join("\n"));
  }
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    appendFileSync(summaryPath, [
      "## VentureDex launch discovery snapshot",
      "",
      `- State: \`${state}\``,
      `- Published items: ${snapshot.item_count}`,
      `- Changes: +${transition.additions}, ~${transition.updates}, -${transition.removals}`,
      `- Upstream commit: \`${snapshot.source.commit}\``,
      `- Raw SHA-256: \`${snapshot.source.raw_sha256}\``,
      `- Canonical output SHA-256: \`${outputHash}\``,
      `- Source category drift: ${sourceCategoryDrift.length > 0 ? sourceCategoryDrift.map((value) => `\`${value}\``).join(", ") : "none"}`,
      "- Content boundary: original X video and post URLs plus factual launch metadata; no video, avatar, poster, or source-description mirroring",
      "",
    ].join("\n"));
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const previous = loadExisting(options.output);
  const { value, source } = await loadUpstream(options);
  const snapshot = buildSnapshot(value, source);
  const transition = assertSafeTransition(previous, snapshot, options);

  if (samePublishedMetadata(previous, snapshot)) {
    writeGithubEvidence(snapshot, transition, "no_change");
    console.log(`Launch snapshot unchanged (${snapshot.item_count} published items).`);
    return;
  }

  console.log(
    `Launch snapshot: ${snapshot.item_count} published items, +${transition.additions}, ` +
    `~${transition.updates}, -${transition.removals}, source ${snapshot.source.commit.slice(0, 12)}.`
  );
  writeGithubEvidence(snapshot, transition, "changed");
  if (options.check) {
    process.exitCode = 1;
    return;
  }
  if (options.dryRun) return;
  writeSnapshot(options.output, snapshot);
  console.log(`Wrote ${options.output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
        "## Launch discovery sync blocked",
        "",
        `- State: \`failed_before_commit\``,
        `- Reason: ${message.replace(/[\r\n]+/g, " ")}`,
        "- Effect: the committed snapshot and deployed site were not changed by this job",
        "",
      ].join("\n"));
    }
    process.exitCode = 1;
  });
}
