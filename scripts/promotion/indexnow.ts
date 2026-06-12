import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_HOST,
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
} from "../../src/lib/indexnow";
import { getTopicPageConfigs } from "../../src/lib/topic-pages";
import {
  appendJsonLine,
  latestDailyStartups,
  latestWeeklyIssue,
  loadPublishedWeeklyIssues,
  loadStartups,
  resolveFromRoot,
  startupUrl,
  startupsForDate,
  weeklyUrl,
} from "./content";

const INDEXNOW_HOST_URL = `https://${INDEXNOW_HOST}`;

interface Options {
  dryRun: boolean;
  recordDryRun: boolean;
  skipKeyCheck: boolean;
  latestDaily: boolean;
  latestWeekly: boolean;
  topics: boolean;
  dailyDate: string | null;
  weeklyIssue: number | null;
  urls: string[];
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
  tsx scripts/promotion/indexnow.ts --daily-date 2026-06-11
  tsx scripts/promotion/indexnow.ts --url https://venturedex.co/startups/example

Options:
  --dry-run             Print payload only; do not POST.
  --record-dry-run      Write dry-run rows to docs/promotion/metrics/indexnow-history.jsonl.
  --latest-daily        Include startup detail pages from newest publish date.
  --daily-date <date>   Include startup detail pages published on YYYY-MM-DD.
  --latest-weekly       Include newest published weekly issue.
  --topics              Include configured VentureDex topic pages.
  --weekly-issue <N>    Include one weekly issue URL.
  --url <url>           Include an explicit VentureDex URL; may repeat.
  --max-urls <N>        Safety cap. Default: 100.
  --endpoint <url>      Override IndexNow endpoint.
  --skip-key-check      Skip live key-file verification before POST.
`;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    dryRun: false,
    recordDryRun: false,
    skipKeyCheck: false,
    latestDaily: false,
    latestWeekly: false,
    topics: false,
    dailyDate: null,
    weeklyIssue: null,
    urls: [],
    maxUrls: 100,
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
      case "--latest-weekly":
        options.latestWeekly = true;
        break;
      case "--topics":
        options.topics = true;
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
      case "--max-urls":
        options.maxUrls = Number(requiredValue(argv, ++index, arg));
        break;
      case "--endpoint":
        options.endpoint = requiredValue(argv, ++index, arg);
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

function collectUrls(options: Options): string[] {
  const startups = loadStartups();
  const issues = loadPublishedWeeklyIssues();
  const urls: string[] = [...options.urls];

  if (options.latestDaily) {
    urls.push(...latestDailyStartups(startups).map((startup) => startupUrl(startup.slug)));
  }
  if (options.dailyDate) {
    urls.push(...startupsForDate(options.dailyDate, startups).map((startup) => startupUrl(startup.slug)));
  }
  if (options.latestWeekly) {
    const issue = latestWeeklyIssue(issues);
    if (issue) urls.push(weeklyUrl(issue.issue_number));
  }
  if (options.topics) {
    urls.push(...getTopicPageConfigs().map((topic) => `${INDEXNOW_HOST_URL}/topics/${topic.slug}`));
  }
  if (options.weeklyIssue !== null) {
    urls.push(weeklyUrl(options.weeklyIssue));
  }

  const deduped = Array.from(new Set(urls.map((url) => url.replace(/\/+$/, ""))));
  for (const url of deduped) validateUrl(url);
  if (deduped.length === 0) {
    throw new Error(`No IndexNow URLs selected.\n\n${usage()}`);
  }
  if (deduped.length > options.maxUrls) {
    throw new Error(`Refusing to submit ${deduped.length} URLs; max is ${options.maxUrls}.`);
  }
  return deduped;
}

function validateUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.hostname !== INDEXNOW_HOST || parsed.protocol !== "https:") {
    throw new Error(`IndexNow URL must be an https://${INDEXNOW_HOST} URL: ${url}`);
  }
  if (!/^\/(startups\/[a-z0-9][a-z0-9-]*|weekly\/[0-9]+|topics\/[a-z0-9][a-z0-9-]*)$/.test(parsed.pathname)) {
    throw new Error(`IndexNow target path is outside the canonical content set: ${url}`);
  }
}

async function submitIndexNow(options: Options, urlList: string[]): Promise<void> {
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
    await assertLiveKeyFile();
  }

  const response = await fetch(options.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const responseText = await response.text().catch(() => "");

  if (!response.ok && response.status !== 202) {
    appendHistory(options, "failed", urlList, `HTTP ${response.status} ${responseText.slice(0, 240)}`);
    throw new Error(`IndexNow submission failed: HTTP ${response.status} ${responseText}`);
  }

  appendHistory(options, "submitted", urlList, `HTTP ${response.status}`);
  console.log(`IndexNow submitted ${urlList.length} URL(s): HTTP ${response.status}`);
}

async function assertLiveKeyFile(): Promise<void> {
  const response = await fetch(INDEXNOW_KEY_LOCATION, {
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const urls = collectUrls(options);
  await submitIndexNow(options, urls);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
