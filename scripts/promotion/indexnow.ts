import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_HOST,
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
} from "../../src/lib/indexnow";
import { getTopicPageConfigs } from "../../src/lib/topic-pages";
import {
  appendJsonLine,
  aiSurfaceUrls,
  collectionUrl,
  latestDailyStartups,
  latestWeeklyIssue,
  launchUrl,
  loadCollections,
  loadLaunches,
  loadPublishedWeeklyIssues,
  loadStartups,
  resolveFromRoot,
  startupUrl,
  startupsForDate,
  weeklyUrl,
} from "./content";

const INDEXNOW_HOST_URL = `https://${INDEXNOW_HOST}`;

export interface Options {
  dryRun: boolean;
  recordDryRun: boolean;
  skipKeyCheck: boolean;
  latestDaily: boolean;
  latestWeekly: boolean;
  allStartups: boolean;
  allWeekly: boolean;
  allLaunches: boolean;
  topics: boolean;
  hubs: boolean;
  collections: boolean;
  aiSurfaces: boolean;
  dailyDate: string | null;
  weeklyIssue: number | null;
  urls: string[];
  urlsFiles: string[];
  maxUrls: number;
  endpoint: string;
  historyFile: string;
}

function usage(): string {
  return `VentureDex IndexNow submitter

Usage:
  tsx scripts/promotion/indexnow.ts --dry-run --latest-daily --latest-weekly
  tsx scripts/promotion/indexnow.ts --latest-daily --latest-weekly
  tsx scripts/promotion/indexnow.ts --topics
  tsx scripts/promotion/indexnow.ts --hubs
  tsx scripts/promotion/indexnow.ts --collections
  tsx scripts/promotion/indexnow.ts --ai-surfaces
  tsx scripts/promotion/indexnow.ts --all-startups --all-weekly --all-launches --topics --hubs --collections --ai-surfaces
  tsx scripts/promotion/indexnow.ts --urls-file /tmp/changed-urls.json
  tsx scripts/promotion/indexnow.ts --daily-date 2026-06-11
  tsx scripts/promotion/indexnow.ts --url https://venturedex.co/startups/example

Options:
  --dry-run             Print payload only; do not POST.
  --record-dry-run      Write dry-run rows to docs/promotion/metrics/indexnow-history.jsonl.
  --latest-daily        Include startup detail pages from newest publish date.
  --all-startups        Include every published startup detail page.
  --daily-date <date>   Include startup detail pages published on YYYY-MM-DD.
  --latest-weekly       Include newest published weekly issue.
  --all-weekly          Include every published weekly issue page.
  --all-launches        Include every VentureDex launch detail page.
  --topics              Include configured VentureDex topic pages.
  --hubs                Include homepage and primary hub pages.
  --collections         Include editorial collection detail pages.
  --ai-surfaces         Include llms.txt, llms-full.txt, and ai-index.json.
  --weekly-issue <N>    Include one weekly issue URL.
  --url <url>           Include an explicit VentureDex URL; may repeat.
  --urls-file <path>    Include a JSON array of exact VentureDex URLs; may repeat.
  --max-urls <N>        Safety cap. Default: 250.
  --endpoint <url>      Override IndexNow endpoint.
  --history-file <path> Override the JSONL receipt path.
  --skip-key-check      Skip live key-file verification before POST.
`;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    dryRun: false,
    recordDryRun: false,
    skipKeyCheck: false,
    latestDaily: false,
    latestWeekly: false,
    allStartups: false,
    allWeekly: false,
    allLaunches: false,
    topics: false,
    hubs: false,
    collections: false,
    aiSurfaces: false,
    dailyDate: null,
    weeklyIssue: null,
    urls: [],
    urlsFiles: [],
    maxUrls: 250,
    endpoint: INDEXNOW_ENDPOINT,
    historyFile: resolveFromRoot("docs", "promotion", "metrics", "indexnow-history.jsonl"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--record-dry-run":
        options.recordDryRun = true;
        break;
      case "--skip-key-check":
        options.skipKeyCheck = true;
        break;
      case "--latest-daily":
        options.latestDaily = true;
        break;
      case "--all-startups":
        options.allStartups = true;
        break;
      case "--latest-weekly":
        options.latestWeekly = true;
        break;
      case "--all-weekly":
        options.allWeekly = true;
        break;
      case "--all-launches":
        options.allLaunches = true;
        break;
      case "--topics":
        options.topics = true;
        break;
      case "--hubs":
        options.hubs = true;
        break;
      case "--collections":
        options.collections = true;
        break;
      case "--ai-surfaces":
        options.aiSurfaces = true;
        break;
      case "--daily-date":
        options.dailyDate = requiredValue(argv, ++index, arg);
        break;
      case "--weekly-issue":
        options.weeklyIssue = Number(requiredValue(argv, ++index, arg));
        break;
      case "--url":
        options.urls.push(requiredValue(argv, ++index, arg));
        break;
      case "--urls-file":
        options.urlsFiles.push(resolve(requiredValue(argv, ++index, arg)));
        break;
      case "--max-urls":
        options.maxUrls = Number(requiredValue(argv, ++index, arg));
        break;
      case "--endpoint":
        options.endpoint = requiredValue(argv, ++index, arg);
        break;
      case "--history-file":
        options.historyFile = resolve(requiredValue(argv, ++index, arg));
        break;
      case "-h":
      case "--help":
        console.log(usage());
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  if (!Number.isInteger(options.maxUrls) || options.maxUrls < 1) {
    throw new Error("--max-urls must be a positive integer.");
  }
  if (options.dailyDate && !/^\d{4}-\d{2}-\d{2}$/.test(options.dailyDate)) {
    throw new Error("--daily-date must be YYYY-MM-DD.");
  }
  if (options.weeklyIssue !== null && (!Number.isInteger(options.weeklyIssue) || options.weeklyIssue < 1)) {
    throw new Error("--weekly-issue must be a positive integer.");
  }
  return options;
}

function requiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

export function collectUrls(options: Options): string[] {
  const startups = loadStartups();
  const issues = loadPublishedWeeklyIssues();
  const urls: string[] = [
    ...options.urls,
    ...options.urlsFiles.flatMap(loadUrlsFile),
  ];

  if (options.latestDaily) {
    urls.push(...latestDailyStartups(startups).map((startup) => startupUrl(startup.slug)));
  }
  if (options.allStartups) {
    urls.push(...startups.map((startup) => startupUrl(startup.slug)));
  }
  if (options.dailyDate) {
    urls.push(...startupsForDate(options.dailyDate, startups).map((startup) => startupUrl(startup.slug)));
  }
  if (options.latestWeekly) {
    const issue = latestWeeklyIssue(issues);
    if (issue) urls.push(weeklyUrl(issue.issue_number));
  }
  if (options.allWeekly) {
    urls.push(...issues.map((issue) => weeklyUrl(issue.issue_number)));
  }
  if (options.allLaunches) {
    urls.push(...loadLaunches().map((launch) => launchUrl(launch.slug)));
  }
  if (options.topics) {
    urls.push(...getTopicPageConfigs().map((topic) => `${INDEXNOW_HOST_URL}/topics/${topic.slug}`));
  }
  if (options.hubs) {
    urls.push(
      `${INDEXNOW_HOST_URL}/`,
      `${INDEXNOW_HOST_URL}/topics`,
      `${INDEXNOW_HOST_URL}/collections`,
      `${INDEXNOW_HOST_URL}/weekly`,
      `${INDEXNOW_HOST_URL}/investors`,
      `${INDEXNOW_HOST_URL}/news`
    );
  }
  if (options.collections) {
    urls.push(...loadCollections().map((collection) => collectionUrl(collection.slug)));
  }
  if (options.aiSurfaces) {
    urls.push(...aiSurfaceUrls());
  }
  if (options.weeklyIssue !== null) {
    urls.push(weeklyUrl(options.weeklyIssue));
  }

  const deduped = Array.from(new Set(urls.map(normalizeIndexNowUrl)));
  for (const url of deduped) validateUrl(url);
  if (deduped.length === 0) {
    throw new Error(`No IndexNow URLs selected.\n\n${usage()}`);
  }
  if (deduped.length > options.maxUrls) {
    throw new Error(`Refusing to submit ${deduped.length} URLs; max is ${options.maxUrls}.`);
  }
  return deduped;
}

function loadUrlsFile(path: string): string[] {
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(value) || !value.every((url) => typeof url === "string" && url.trim())) {
    throw new Error(`IndexNow URL file must contain a JSON array of non-empty strings: ${path}`);
  }
  return value;
}

function normalizeIndexNowUrl(url: string): string {
  const trimmed = url.trim();
  const parsed = new URL(trimmed);
  if (parsed.pathname === "/") {
    return `${parsed.origin}/`;
  }
  return trimmed.replace(/\/+$/, "");
}

export function validateUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.hostname !== INDEXNOW_HOST || parsed.protocol !== "https:") {
    throw new Error(`IndexNow URL must be an https://${INDEXNOW_HOST} URL: ${url}`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`IndexNow URL must be canonical without query strings or fragments: ${url}`);
  }
  const hubPaths = new Set(["/", "/topics", "/collections", "/weekly", "/investors", "/news", "/launches"]);
  const aiSurfacePaths = new Set(["/llms.txt", "/llms-full.txt", "/ai-index.json", "/launches.json"]);
  const contentPath = /^\/(startups\/[a-z0-9][a-z0-9-]*|weekly\/[0-9]+|topics\/[a-z0-9][a-z0-9-]*|collections\/[a-z0-9][a-z0-9-]*|investors\/[a-z0-9][a-z0-9-]*|launches\/[a-z0-9][a-z0-9-]*)$/;
  if (!hubPaths.has(parsed.pathname) && !aiSurfacePaths.has(parsed.pathname) && !contentPath.test(parsed.pathname)) {
    throw new Error(`IndexNow target path is outside the canonical content set: ${url}`);
  }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface SubmitDependencies {
  fetchFn?: FetchLike;
  sleep?: (milliseconds: number) => Promise<void>;
}

export async function submitIndexNow(
  options: Options,
  urlList: string[],
  dependencies: SubmitDependencies = {},
): Promise<void> {
  const fetchFn = dependencies.fetchFn ?? fetch;
  const sleep = dependencies.sleep ?? ((milliseconds: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds)));
  const payload = {
    host: INDEXNOW_HOST,
    key: INDEXNOW_KEY,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urlList,
  };

  if (options.dryRun) {
    console.log(JSON.stringify({ dryRun: true, endpoint: options.endpoint, payload }, null, 2));
    if (options.recordDryRun) {
      appendHistory(options, "dry_run", urlList, "preview only");
    }
    return;
  }

  if (!options.skipKeyCheck) {
    await assertLiveKeyFile(fetchFn);
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetchFn(options.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (attempt < 3) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      appendHistory(options, "failed", urlList, `network error: ${message.slice(0, 240)}`);
      throw new Error(`IndexNow submission failed after 3 attempts: ${message}`);
    }
    const responseText = await response.text().catch(() => "");

    if (response.ok || response.status === 202) {
      appendHistory(options, "submitted", urlList, `HTTP ${response.status}`);
      console.log(`IndexNow submitted ${urlList.length} URL(s): HTTP ${response.status}`);
      return;
    }

    const retryable = response.status === 429 || (response.status >= 500 && response.status <= 599);
    if (retryable && attempt < 3) {
      const retryAfter = response.headers.get("retry-after");
      const delay = retryAfter && /^\d+$/.test(retryAfter)
        ? Math.min(Number(retryAfter) * 1_000, 60_000)
        : 500 * 2 ** (attempt - 1);
      console.warn(`IndexNow returned HTTP ${response.status}; retrying in ${delay}ms.`);
      await sleep(delay);
      continue;
    }

    appendHistory(options, "failed", urlList, `HTTP ${response.status} ${responseText.slice(0, 240)}`);
    throw new Error(`IndexNow submission failed: HTTP ${response.status} ${responseText}`);
  }
}

async function assertLiveKeyFile(fetchFn: FetchLike): Promise<void> {
  const response = await fetchFn(INDEXNOW_KEY_LOCATION, {
    headers: { "User-Agent": "VentureDexIndexNow/1.0" },
  });
  const body = await response.text().catch(() => "");
  if (!response.ok || body.trim() !== INDEXNOW_KEY) {
    throw new Error(
      `IndexNow key file is not live yet: ${INDEXNOW_KEY_LOCATION} returned HTTP ${response.status}. Deploy first, then retry.`
    );
  }
}

function appendHistory(options: Options, status: string, urlList: string[], message: string): void {
  appendJsonLine(options.historyFile, {
    timestamp: new Date().toISOString(),
    status,
    host: INDEXNOW_HOST,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urls: urlList,
    message,
  });
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);
  const urls = collectUrls(options);
  await submitIndexNow(options, urls);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
