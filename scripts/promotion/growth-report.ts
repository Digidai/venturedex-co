import { existsSync, readdirSync } from "node:fs";
import {
  latestDailyDate,
  latestDailyStartups,
  latestWeeklyIssue,
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

const REPORT_TIME_ZONE = process.env.REPORT_TIME_ZONE ?? "Asia/Shanghai";
const LIVE_FETCH_ATTEMPTS = Number(process.env.LIVE_FETCH_ATTEMPTS ?? "3");

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

async function main() {
  const write = process.argv.includes("--write");
  const offline = process.argv.includes("--offline");
  const startups = loadStartups();
  const issues = loadPublishedWeeklyIssues();
  const dailyDate = latestDailyDate(startups);
  const dailyStartups = latestDailyStartups(startups);
  const weeklyIssue = latestWeeklyIssue(issues);
  const ledger = readGscLedger();

  const snapshots = offline
    ? []
    : await Promise.all([
        fetchText("https://venturedex.co/sitemap.xml"),
        fetchText("https://venturedex.co/feed.xml"),
        fetchText("https://venturedex.co/llms.txt"),
        fetchText("https://venturedex.co/robots.txt"),
      ]);
  const byUrl = new Map(snapshots.map((snapshot) => [snapshot.url, snapshot]));
  const sitemap = byUrl.get("https://venturedex.co/sitemap.xml");
  const feed = byUrl.get("https://venturedex.co/feed.xml");
  const llms = byUrl.get("https://venturedex.co/llms.txt");
  const robots = byUrl.get("https://venturedex.co/robots.txt");
  const outboxDir = resolveFromRoot("docs", "promotion", "outbox");
  const indexNowHistory = resolveFromRoot("docs", "promotion", "metrics", "indexnow-history.jsonl");
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
    lines.push(`- sitemap.xml: ${statusLabel(sitemap)} / ${sitemap?.body.match(/<url>/g)?.length ?? 0} URLs`);
    lines.push(`- feed.xml: ${statusLabel(feed)} / ${feed?.body.match(/<item>/g)?.length ?? 0} items`);
    lines.push(`- llms.txt: ${statusLabel(llms)} / ${lineCount(llms?.body)} lines`);
    lines.push(`- robots.txt: ${statusLabel(robots)} / ${robots?.body.includes("Content-Signal") ? "Cloudflare content signals present" : "content signals not detected"}`);
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
  lines.push("");

  lines.push("## Next Actions");
  lines.push("- Run `npm run promotion:pack` after each content publish and post only the strongest channel drafts.");
  lines.push("- Run `npm run seo:indexnow:latest` after the key route is deployed and live.");
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
