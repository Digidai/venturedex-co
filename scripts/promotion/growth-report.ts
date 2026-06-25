import { existsSync, readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  aiSurfaceUrls,
  latestDailyDate,
  latestDailyStartups,
  latestWeeklyIssue,
  collectionUrl,
  loadCollections,
  loadPublishedWeeklyIssues,
  loadStartups,
  resolveFromRoot,
  startupUrl,
  weeklyUrl,
  writeText,
} from "./content";
import { classifyGscStatus, latestGscStatus, readGscLedger } from "./gsc";

interface FetchSnapshot {
  url: string;
  status: number | null;
  ok: boolean;
  bytes: number;
  body: string;
  error?: string;
}

export interface IndexNowHistoryRow {
  timestamp?: string;
  status?: string;
  urls?: string[];
  message?: string;
}

export interface SitemapUrlSummary {
  total: number;
  startups: number;
  investors: number;
  topics: number;
  collections: number;
  weekly: number;
  other: number;
}

export interface RumConfig {
  accountId: string;
  apiToken: string;
  siteTag: string;
}

interface RumMetricRow {
  count?: number;
  sum?: {
    visits?: number;
  };
  avg?: {
    sampleInterval?: number;
  };
  dimensions?: {
    metric?: string;
  };
}

export interface RumSnapshot {
  status: "available" | "skipped" | "error";
  message?: string;
  generatedAt?: string;
  windows?: {
    last24h?: RumMetricRow;
    last7d?: RumMetricRow;
    last30d?: RumMetricRow;
  };
  topPaths7?: RumMetricRow[];
  topReferers7?: RumMetricRow[];
  countries7?: RumMetricRow[];
  devices7?: RumMetricRow[];
  daily7?: RumMetricRow[];
}

interface FetchRumSnapshotOptions {
  config?: RumConfig | null;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  loadEnv?: boolean;
}

const REPORT_TIME_ZONE = process.env.REPORT_TIME_ZONE ?? "Asia/Shanghai";
const LIVE_FETCH_ATTEMPTS = Number(process.env.LIVE_FETCH_ATTEMPTS ?? "3");
const DEFAULT_RUM_SITE_TAG = "89e78cd39aa549339429e3164500209c";
const CLOUDFLARE_GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

function reportDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusLabel(snapshot: FetchSnapshot | undefined): string {
  if (!snapshot) return "error";
  if (snapshot.status === null) return `error (${snapshot.error ?? "fetch failed"})`;
  return String(snapshot.status);
}

function lineCount(body: string | undefined): number {
  return body ? body.split("\n").length : 0;
}

async function fetchText(url: string): Promise<FetchSnapshot> {
  for (let attempt = 1; attempt <= LIVE_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "VentureDexGrowthReport/1.0" } });
      const body = await response.text();
      return { url, status: response.status, ok: response.ok, bytes: body.length, body };
    } catch (error) {
      if (attempt === LIVE_FETCH_ATTEMPTS) {
        return {
          url,
          status: null,
          ok: false,
          bytes: 0,
          body: "",
          error: error instanceof Error ? error.message : String(error),
        };
      }
      await sleep(250 * attempt);
    }
  }

  return { url, status: null, ok: false, bytes: 0, body: "", error: "fetch attempts exhausted" };
}

function countFiles(path: string): number {
  if (!existsSync(path)) return 0;
  return readdirSync(path).filter((file) => !file.startsWith(".")).length;
}

function loadLocalEnv(): void {
  const envPath = resolveFromRoot(".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    const value = rawValue.trim().replace(/^(['"])(.*)\1$/, "$2");
    process.env[key] = value;
  }
}

export function summarizeSitemapUrls(xml: string | undefined): SitemapUrlSummary {
  const summary: SitemapUrlSummary = {
    total: 0,
    startups: 0,
    investors: 0,
    topics: 0,
    collections: 0,
    weekly: 0,
    other: 0,
  };
  if (!xml) return summary;

  const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
  for (const match of matches) {
    summary.total += 1;
    const pathname = safePathname(match[1]);
    if (/^\/startups\/[^/]+\/?$/.test(pathname)) summary.startups += 1;
    else if (/^\/investors\/[^/]+\/?$/.test(pathname)) summary.investors += 1;
    else if (/^\/topics\/[^/]+\/?$/.test(pathname)) summary.topics += 1;
    else if (/^\/collections\/[^/]+\/?$/.test(pathname)) summary.collections += 1;
    else if (/^\/weekly\/[^/]+\/?$/.test(pathname)) summary.weekly += 1;
    else summary.other += 1;
  }

  return summary;
}

function safePathname(value: string): string {
  try {
    return new URL(value).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "";
  }
}

export function formatSitemapSummary(summary: SitemapUrlSummary): string {
  return `${summary.total} URLs (${summary.startups} startups, ${summary.investors} investors, ${summary.topics} topics, ${summary.collections} collections, ${summary.weekly} weekly, ${summary.other} other)`;
}

function resolveRumConfig(): RumConfig | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return null;

  return {
    accountId,
    apiToken,
    siteTag: process.env.CLOUDFLARE_WEB_ANALYTICS_SITE_TAG ?? DEFAULT_RUM_SITE_TAG,
  };
}

function rumFilter(siteTag: string, start: Date, end: Date): Record<string, unknown> {
  return {
    AND: [
      { datetime_geq: start.toISOString(), datetime_leq: end.toISOString() },
      { siteTag },
      { bot: 0 },
    ],
  };
}

function rumQueryPayload(config: RumConfig, now: Date): Record<string, unknown> {
  const query = `query VentureDexRumGrowthReport(
    $accountTag: string!,
    $f24: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!,
    $f7: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!,
    $f30: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!
  ) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        last24h: rumPageloadEventsAdaptiveGroups(filter: $f24, limit: 1) { count sum { visits } avg { sampleInterval } }
        last7d: rumPageloadEventsAdaptiveGroups(filter: $f7, limit: 1) { count sum { visits } avg { sampleInterval } }
        last30d: rumPageloadEventsAdaptiveGroups(filter: $f30, limit: 1) { count sum { visits } avg { sampleInterval } }
        topPaths7: rumPageloadEventsAdaptiveGroups(filter: $f7, limit: 10, orderBy: [count_DESC]) { count sum { visits } avg { sampleInterval } dimensions { metric: requestPath } }
        topReferers7: rumPageloadEventsAdaptiveGroups(filter: $f7, limit: 10, orderBy: [count_DESC]) { count sum { visits } avg { sampleInterval } dimensions { metric: refererHost } }
        countries7: rumPageloadEventsAdaptiveGroups(filter: $f7, limit: 10, orderBy: [count_DESC]) { count sum { visits } avg { sampleInterval } dimensions { metric: countryName } }
        devices7: rumPageloadEventsAdaptiveGroups(filter: $f7, limit: 10, orderBy: [count_DESC]) { count sum { visits } avg { sampleInterval } dimensions { metric: deviceType } }
        daily7: rumPageloadEventsAdaptiveGroups(filter: $f7, limit: 10, orderBy: [date_ASC]) { count sum { visits } avg { sampleInterval } dimensions { metric: date } }
      }
    }
  }`;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;

  return {
    query,
    variables: {
      accountTag: config.accountId,
      f24: rumFilter(config.siteTag, new Date(now.getTime() - dayMs), now),
      f7: rumFilter(config.siteTag, new Date(now.getTime() - sevenDaysMs), now),
      f30: rumFilter(config.siteTag, new Date(now.getTime() - 30 * dayMs), now),
    },
  };
}

export async function fetchRumSnapshot(now = new Date(), options: FetchRumSnapshotOptions = {}): Promise<RumSnapshot> {
  if (options.loadEnv !== false) loadLocalEnv();
  const config = options.config === undefined ? resolveRumConfig() : options.config;
  if (!config) {
    return {
      status: "skipped",
      message: "missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN",
    };
  }

  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(options.endpoint ?? CLOUDFLARE_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rumQueryPayload(config, now)),
    });
    const payload = await response.json() as {
      data?: {
        viewer?: {
          accounts?: Array<{
            last24h?: RumMetricRow[];
            last7d?: RumMetricRow[];
            last30d?: RumMetricRow[];
            topPaths7?: RumMetricRow[];
            topReferers7?: RumMetricRow[];
            countries7?: RumMetricRow[];
            devices7?: RumMetricRow[];
            daily7?: RumMetricRow[];
          }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };

    if (!response.ok || (payload.errors?.length ?? 0) > 0) {
      return {
        status: "error",
        message: summarizeGraphqlErrors(response.status, payload.errors),
      };
    }

    const account = payload.data?.viewer?.accounts?.[0];
    if (!account) {
      return {
        status: "error",
        message: "Cloudflare GraphQL returned no account data",
      };
    }

    return {
      status: "available",
      generatedAt: now.toISOString(),
      windows: {
        last24h: account.last24h?.[0],
        last7d: account.last7d?.[0],
        last30d: account.last30d?.[0],
      },
      topPaths7: account.topPaths7 ?? [],
      topReferers7: account.topReferers7 ?? [],
      countries7: account.countries7 ?? [],
      devices7: account.devices7 ?? [],
      daily7: account.daily7 ?? [],
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeGraphqlErrors(status: number, errors: Array<{ message?: string }> | undefined): string {
  const messages = (errors ?? [])
    .map((error) => error.message)
    .filter((message): message is string => Boolean(message))
    .slice(0, 2);
  return messages.length > 0 ? `HTTP ${status}: ${messages.join("; ")}` : `HTTP ${status}`;
}

export function formatRumMetric(row: RumMetricRow | undefined): string {
  if (!row) return "no data";
  const visits = row.sum?.visits ?? 0;
  const pageViews = row.count ?? 0;
  const sampleInterval = row.avg?.sampleInterval ?? 1;
  return `${formatCount(visits, "visit")} / ${formatCount(pageViews, "page view")} (${sampleIntervalLabel(sampleInterval)})`;
}

function sampleIntervalLabel(sampleInterval: number): string {
  return sampleInterval === 1 ? "sampleInterval=1" : `sampleInterval=${sampleInterval}, sampled/extrapolated`;
}

function formatCount(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

export function formatRumDimensionRows(rows: RumMetricRow[] | undefined, emptyLabel = "(direct / none)", limit = 5): string[] {
  return (rows ?? []).slice(0, limit).map((row) => {
    const label = row.dimensions?.metric || emptyLabel;
    const visits = row.sum?.visits ?? 0;
    const pageViews = row.count ?? 0;
    const sampleInterval = row.avg?.sampleInterval ?? 1;
    return `${label}: ${formatCount(visits, "visit")} / ${formatCount(pageViews, "page view")} (${sampleIntervalLabel(sampleInterval)})`;
  });
}

export function parseIndexNowHistoryText(text: string): IndexNowHistoryRow[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const value = JSON.parse(line) as unknown;
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const row = value as Record<string, unknown>;
        return [{
          timestamp: typeof row.timestamp === "string" ? row.timestamp : undefined,
          status: typeof row.status === "string" ? row.status : undefined,
          urls: Array.isArray(row.urls) ? row.urls.filter((url): url is string => typeof url === "string") : undefined,
          message: typeof row.message === "string" ? row.message : undefined,
        }];
      } catch {
        return [];
      }
    });
}

export function readIndexNowHistory(path: string): IndexNowHistoryRow[] {
  if (!existsSync(path)) return [];
  return parseIndexNowHistoryText(readFileSync(path, "utf8"));
}

export function summarizeLatestIndexNow(rows: IndexNowHistoryRow[]): string {
  const latest = rows.at(-1);
  if (!latest) return "none yet";

  const urlCount = new Set(latest.urls ?? []).size;
  const status = latest.status ?? "unknown";
  const timestamp = latest.timestamp ?? "unknown time";
  const message = latest.message ? ` (${latest.message})` : "";
  const label = status === "submitted"
    ? "submitted"
    : status === "dry_run"
      ? "preview only"
      : status;

  return `${label} at ${timestamp}: ${urlCount} unique URL${urlCount === 1 ? "" : "s"}${message}`;
}

export function latestSubmittedIndexNowRow(rows: IndexNowHistoryRow[], targetUrls: string[] = []): IndexNowHistoryRow | null {
  if (targetUrls.length === 0) {
    return rows.findLast((row) => row.status === "submitted") ?? null;
  }

  const targets = new Set(targetUrls);
  return rows.findLast((row) => (
    row.status === "submitted" &&
    (row.urls ?? []).some((url) => targets.has(url))
  )) ?? null;
}

export function missingFromLatestSubmittedIndexNow(rows: IndexNowHistoryRow[], urls: string[]): string[] {
  const targets = new Set(urls);
  const submittedUrls = new Set<string>();
  for (const row of rows) {
    if (row.status !== "submitted") continue;
    for (const url of row.urls ?? []) {
      if (targets.has(url)) submittedUrls.add(url);
    }
  }
  return urls.filter((url) => !submittedUrls.has(url));
}

function hubUrls(): string[] {
  return [
    "https://venturedex.co/",
    "https://venturedex.co/topics",
    "https://venturedex.co/collections",
    "https://venturedex.co/weekly",
    "https://venturedex.co/investors",
    "https://venturedex.co/news",
  ];
}

function appendIndexNowCoverage(lines: string[], label: string, rows: IndexNowHistoryRow[], urls: string[]): void {
  if (urls.length === 0) return;
  const missing = missingFromLatestSubmittedIndexNow(rows, urls);
  lines.push(`- ${label}: ${urls.length - missing.length}/${urls.length} covered by submitted history`);
  for (const url of missing) {
    lines.push(`  - pending IndexNow: ${url}`);
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const write = argv.includes("--write");
  const offline = argv.includes("--offline");
  const startups = loadStartups();
  const issues = loadPublishedWeeklyIssues();
  const collections = loadCollections();
  const dailyDate = latestDailyDate(startups);
  const dailyStartups = latestDailyStartups(startups);
  const weeklyIssue = latestWeeklyIssue(issues);
  const ledger = readGscLedger();

  const [snapshots, rumSnapshot] = offline
    ? [[], { status: "skipped", message: "offline mode" } satisfies RumSnapshot]
    : await Promise.all([
        Promise.all([
          fetchText("https://venturedex.co/sitemap.xml"),
          fetchText("https://venturedex.co/feed.xml"),
          fetchText("https://venturedex.co/llms.txt"),
          fetchText("https://venturedex.co/robots.txt"),
        ]),
        fetchRumSnapshot(),
      ]);
  const byUrl = new Map(snapshots.map((snapshot) => [snapshot.url, snapshot]));
  const sitemap = byUrl.get("https://venturedex.co/sitemap.xml");
  const sitemapSummary = summarizeSitemapUrls(sitemap?.body);
  const feed = byUrl.get("https://venturedex.co/feed.xml");
  const llms = byUrl.get("https://venturedex.co/llms.txt");
  const robots = byUrl.get("https://venturedex.co/robots.txt");
  const outboxDir = resolveFromRoot("docs", "promotion", "outbox");
  const indexNowHistory = resolveFromRoot("docs", "promotion", "metrics", "indexnow-history.jsonl");
  const indexNowRows = readIndexNowHistory(indexNowHistory);
  const latestTargetUrls = [
    ...dailyStartups.map((startup) => startupUrl(startup.slug)),
    ...(weeklyIssue ? [weeklyUrl(weeklyIssue.issue_number)] : []),
  ];
  const hubTargetUrls = hubUrls();
  const collectionTargetUrls = collections.map((collection) => collectionUrl(collection.slug));
  const aiTargetUrls = aiSurfaceUrls();
  const now = new Date().toISOString();
  const dateLabel = reportDate();
  const lines: string[] = [];

  lines.push(`# VentureDex Growth Report - ${dateLabel}`);
  lines.push("");
  lines.push(`Generated at ${now} (${REPORT_TIME_ZONE} report date: ${dateLabel}).`);
  lines.push("");
  lines.push("## Inventory");
  lines.push(`- Startup profiles in content: ${startups.length}`);
  lines.push(`- Published weekly issues: ${issues.length}`);
  lines.push(`- Latest daily publish date: ${dailyDate ?? "none"}`);
  lines.push(`- Latest daily profile count: ${dailyStartups.length}`);
  lines.push(`- Latest weekly issue: ${weeklyIssue ? `#${weeklyIssue.issue_number} ${weeklyIssue.title}` : "none"}`);
  lines.push("");

  lines.push("## Live Discovery Surfaces");
  if (offline) {
    lines.push("- Offline mode: live fetch skipped.");
  } else {
    lines.push(`- sitemap.xml: ${statusLabel(sitemap)} / ${formatSitemapSummary(sitemapSummary)}`);
    lines.push(`- feed.xml: ${statusLabel(feed)} / ${feed?.body.match(/<item>/g)?.length ?? 0} items`);
    lines.push(`- llms.txt: ${statusLabel(llms)} / ${lineCount(llms?.body)} lines`);
    lines.push(`- robots.txt: ${statusLabel(robots)} / ${robots?.body.includes("Content-Signal") ? "Cloudflare content signals present" : "content signals not detected"}`);
    if (sitemapSummary.startups > 0 && sitemapSummary.startups !== startups.length) {
      const delta = sitemapSummary.startups - startups.length;
      const deltaLabel = delta > 0 ? `+${delta}` : String(delta);
      lines.push(`- Live/local inventory delta: live sitemap has ${sitemapSummary.startups} startup URLs vs ${startups.length} local content profiles (${deltaLabel}).`);
    }
  }
  lines.push("");

  lines.push("## Cloudflare Web Analytics (RUM)");
  if (rumSnapshot.status === "available") {
    lines.push(`- Last 24h: ${formatRumMetric(rumSnapshot.windows?.last24h)}`);
    lines.push(`- Last 7d: ${formatRumMetric(rumSnapshot.windows?.last7d)}`);
    lines.push(`- Last 30d: ${formatRumMetric(rumSnapshot.windows?.last30d)}`);
    const topReferers = formatRumDimensionRows(rumSnapshot.topReferers7);
    const topPaths = formatRumDimensionRows(rumSnapshot.topPaths7, "(unknown path)");
    const countries = formatRumDimensionRows(rumSnapshot.countries7, "(unknown country)");
    const devices = formatRumDimensionRows(rumSnapshot.devices7, "(unknown device)");
    const daily = formatRumDimensionRows(rumSnapshot.daily7, "(unknown date)", 10);
    if (topReferers.length > 0) lines.push(`- Top 7d referrers: ${topReferers.join("; ")}`);
    if (topPaths.length > 0) lines.push(`- Top 7d paths: ${topPaths.join("; ")}`);
    if (countries.length > 0) lines.push(`- Top 7d countries: ${countries.join("; ")}`);
    if (devices.length > 0) lines.push(`- Top 7d devices: ${devices.join("; ")}`);
    if (daily.length > 0) lines.push(`- 7d daily trend: ${daily.join("; ")}`);
  } else {
    lines.push(`- ${rumSnapshot.status}: ${rumSnapshot.message ?? "Cloudflare Web Analytics not available"}`);
  }
  lines.push("");

  lines.push("## Latest GSC Ledger State");
  for (const startup of dailyStartups) {
    const url = startupUrl(startup.slug);
    const row = latestGscStatus(ledger, url);
    const state = classifyGscStatus(row);
    lines.push(`- ${startup.product_name}: ${state.kind} - ${state.message} - ${url}`);
  }
  if (weeklyIssue) {
    const url = weeklyUrl(weeklyIssue.issue_number);
    const row = latestGscStatus(ledger, url);
    const state = classifyGscStatus(row);
    lines.push(`- Weekly #${weeklyIssue.issue_number}: ${state.kind} - ${state.message} - ${url}`);
  }
  lines.push("");

  lines.push("## Promotion Artifacts");
  lines.push(`- Outbox files: ${countFiles(outboxDir)} (${outboxDir})`);
  lines.push(`- IndexNow history: ${existsSync(indexNowHistory) ? indexNowHistory : "none yet"}`);
  lines.push(`- Latest IndexNow: ${summarizeLatestIndexNow(indexNowRows)}`);
  appendIndexNowCoverage(lines, "Latest Daily/Weekly IndexNow coverage", indexNowRows, latestTargetUrls);
  appendIndexNowCoverage(lines, "Hub IndexNow coverage", indexNowRows, hubTargetUrls);
  appendIndexNowCoverage(lines, "Collection IndexNow coverage", indexNowRows, collectionTargetUrls);
  appendIndexNowCoverage(lines, "AI surface IndexNow coverage", indexNowRows, aiTargetUrls);
  lines.push("");

  lines.push("## Next Actions");
  lines.push("- Run `npm run promotion:pack` after each content publish and post only the strongest channel drafts.");
  lines.push("- Run `npm run seo:indexnow:latest` after new daily/weekly content is deployed and live.");
  lines.push("- Run `npm run seo:indexnow:structure` after homepage, hub, topic, or collection route changes are deployed.");
  lines.push("- Run `npm run geo:indexnow` after llms.txt, llms-full.txt, ai-index.json, or crawler policy changes are deployed.");
  lines.push("- Keep `npm run seo:gsc:latest:dry` as the manual Google queue preview before authenticated browser submission.");
  lines.push("");

  const body = `${lines.join("\n").trim()}\n`;
  if (write) {
    const outputPath = resolveFromRoot("docs", "promotion", "metrics", `${dateLabel}-growth-report.md`);
    writeText(outputPath, body);
    console.log(`Wrote ${outputPath}`);
  } else {
    console.log(body);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
