import { existsSync, readFileSync, readdirSync } from "node:fs";
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

interface FetchSnapshot {
  url: string;
  status: number | null;
  ok: boolean;
  bytes: number;
  body: string;
  error?: string;
}

interface LedgerRow {
  timestamp: string;
  status: string;
  url: string;
  message: string;
}

const REPORT_TIME_ZONE = process.env.REPORT_TIME_ZONE ?? "Asia/Shanghai";

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

async function fetchText(url: string): Promise<FetchSnapshot> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "VentureDexGrowthReport/1.0" } });
    const body = await response.text();
    return { url, status: response.status, ok: response.ok, bytes: body.length, body };
  } catch (error) {
    return {
      url,
      status: null,
      ok: false,
      bytes: 0,
      body: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseLedger(): LedgerRow[] {
  const path = resolveFromRoot(".gsc_submission_history.tsv");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const [timestamp = "", status = "", url = "", message = ""] = line.split("\t");
      return { timestamp, status, url, message };
    })
    .filter((row) => row.url);
}

function latestStatus(rows: LedgerRow[], url: string): LedgerRow | null {
  return [...rows].reverse().find((row) => row.url === url) ?? null;
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
  const ledger = parseLedger();

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
    lines.push(`- sitemap.xml: ${sitemap?.status ?? "error"} / ${sitemap?.body.match(/<url>/g)?.length ?? 0} URLs`);
    lines.push(`- feed.xml: ${feed?.status ?? "error"} / ${feed?.body.match(/<item>/g)?.length ?? 0} items`);
    lines.push(`- llms.txt: ${llms?.status ?? "error"} / ${llms?.body.split("\n").length ?? 0} lines`);
    lines.push(`- robots.txt: ${robots?.status ?? "error"} / ${robots?.body.includes("Content-Signal") ? "Cloudflare content signals present" : "content signals not detected"}`);
  }
  lines.push("");

  lines.push("## Latest GSC Ledger State");
  for (const startup of dailyStartups) {
    const url = startupUrl(startup.slug);
    const row = latestStatus(ledger, url);
    lines.push(`- ${startup.product_name}: ${row ? `${row.status} (${row.timestamp})` : "no ledger row"} - ${url}`);
  }
  if (weeklyIssue) {
    const url = weeklyUrl(weeklyIssue.issue_number);
    const row = latestStatus(ledger, url);
    lines.push(`- Weekly #${weeklyIssue.issue_number}: ${row ? `${row.status} (${row.timestamp})` : "no ledger row"} - ${url}`);
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
