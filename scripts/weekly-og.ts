import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import {
  latestWeeklyIssue,
  loadPublishedWeeklyIssues,
  loadStartups,
  resolveFromRoot,
  type PromotionStartup,
  type PromotionWeeklyIssue,
} from "./promotion/content";

export const WEEKLY_OG_WIDTH = 1200;
export const WEEKLY_OG_HEIGHT = 630;

interface Options {
  all: boolean;
  latest: boolean;
  issue: number | null;
  write: boolean;
}

export interface WeeklyOgModel {
  issueNumber: number;
  title: string;
  weekLabel: string;
  summary: string;
  pickNames: string[];
  outputPath: string;
  publicPath: string;
}

export function weeklyOgPublicPath(issueNumber: number): string {
  return `/og/weekly-${issueNumber}.png`;
}

export function weeklyOgOutputPath(issueNumber: number): string {
  return resolveFromRoot("public", "og", `weekly-${issueNumber}.png`);
}

export function buildWeeklyOgModel(
  issue: PromotionWeeklyIssue,
  startups: PromotionStartup[] = loadStartups()
): WeeklyOgModel {
  const startupBySlug = new Map(startups.map((startup) => [startup.slug, startup]));
  const pickNames = (issue.picks ?? [])
    .map((pick) => typeof pick === "string" ? pick : pick.slug)
    .filter((slug): slug is string => Boolean(slug))
    .map((slug) => startupBySlug.get(slug)?.product_name ?? slug)
    .slice(0, 5);
  const weekLabel = issue.published_at
    ? `Published ${formatShortDate(issue.published_at)}`
    : `Weekly #${issue.issue_number}`;

  return {
    issueNumber: issue.issue_number,
    title: issue.title,
    weekLabel,
    summary: issue.research_summary ?? issue.editorial_intro ?? "Evidence-bound startup research from VentureDex.",
    pickNames,
    outputPath: weeklyOgOutputPath(issue.issue_number),
    publicPath: weeklyOgPublicPath(issue.issue_number),
  };
}

export function renderWeeklyOgSvg(model: WeeklyOgModel): string {
  const titleLines = wrapText(model.title, 27, 3);
  const summaryLines = wrapText(model.summary, 46, 3);
  const picks = model.pickNames.length > 0 ? model.pickNames : ["Source-backed startup research"];
  const pickLines = picks.slice(0, 5);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WEEKLY_OG_WIDTH}" height="${WEEKLY_OG_HEIGHT}" viewBox="0 0 ${WEEKLY_OG_WIDTH} ${WEEKLY_OG_HEIGHT}">
  <rect width="1200" height="630" fill="#FAFAF9"/>
  <rect x="44" y="44" width="1112" height="542" rx="8" fill="#FFFFFF" stroke="#D9D9D4"/>
  <path d="M44 172H1156" stroke="#E5E5E0"/>
  <text x="82" y="101" fill="#2563EB" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="3">VENTUREDEX WEEKLY</text>
  <text x="82" y="138" fill="#737373" font-family="Arial, Helvetica, sans-serif" font-size="23">${escapeSvg(model.weekLabel)}</text>
  ${titleLines.map((line, index) => `<text x="82" y="${244 + index * 72}" fill="#171717" font-family="Georgia, 'Times New Roman', serif" font-size="58" font-weight="700">${escapeSvg(line)}</text>`).join("\n  ")}
  ${summaryLines.map((line, index) => `<text x="84" y="${430 + index * 34}" fill="#525252" font-family="Arial, Helvetica, sans-serif" font-size="26">${escapeSvg(line)}</text>`).join("\n  ")}
  <g transform="translate(790 218)">
    <text x="0" y="0" fill="#737373" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="700" letter-spacing="2">RESEARCH PICKS</text>
    ${pickLines.map((pick, index) => `
    <g transform="translate(0 ${42 + index * 56})">
      <circle cx="9" cy="9" r="8" fill="#2563EB"/>
      <text x="32" y="17" fill="#171717" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700">${escapeSvg(truncateForLine(pick, 22))}</text>
    </g>`).join("")}
  </g>
  <text x="82" y="548" fill="#737373" font-family="Arial, Helvetica, sans-serif" font-size="22">Source-backed startup profiles, funding signals, and editorial context.</text>
  <text x="1010" y="548" fill="#171717" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700">venturedex.co</text>
</svg>`;
}

export async function writeWeeklyOgImage(model: WeeklyOgModel): Promise<void> {
  mkdirSync(dirname(model.outputPath), { recursive: true });
  const svg = renderWeeklyOgSvg(model);
  await sharp(Buffer.from(svg)).resize(WEEKLY_OG_WIDTH, WEEKLY_OG_HEIGHT).png().toFile(model.outputPath);
}

export async function generateWeeklyOgImages(options: Options): Promise<WeeklyOgModel[]> {
  const issues = loadPublishedWeeklyIssues();
  const startups = loadStartups();
  const selected = selectIssues(issues, options);
  const models = selected.map((issue) => buildWeeklyOgModel(issue, startups));

  if (options.write) {
    for (const model of models) {
      await writeWeeklyOgImage(model);
    }
  }

  return models;
}

function selectIssues(issues: PromotionWeeklyIssue[], options: Options): PromotionWeeklyIssue[] {
  if (options.issue !== null) {
    const issue = issues.find((candidate) => candidate.issue_number === options.issue);
    if (!issue) throw new Error(`Published weekly issue not found: ${options.issue}`);
    return [issue];
  }
  if (options.latest) {
    const issue = latestWeeklyIssue(issues);
    if (!issue) throw new Error("No published weekly issue found.");
    return [issue];
  }
  if (options.all || (!options.all && !options.latest)) {
    return issues;
  }
  return [];
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    all: false,
    latest: false,
    issue: null,
    write: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--all":
        options.all = true;
        break;
      case "--latest":
        options.latest = true;
        break;
      case "--issue":
        options.issue = Number(requiredValue(argv, ++index, arg));
        break;
      case "--write":
        options.write = true;
        break;
      case "-h":
      case "--help":
        console.log("Usage: tsx scripts/weekly-og.ts --all --write");
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (options.issue !== null && (!Number.isInteger(options.issue) || options.issue < 1)) {
    throw new Error("--issue must be a positive integer.");
  }
  if (!options.all && !options.latest && options.issue === null) {
    options.all = true;
  }
  return options;
}

function requiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function formatShortDate(value: string): string {
  return new Date(value.includes("T") ? value : `${value}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function wrapText(value: string, maxChars: number, maxLines: number): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = truncateForLine(lines[maxLines - 1], maxChars);
  }
  return lines.length ? lines : [""];
}

function truncateForLine(value: string, maxChars: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trim()}…`;
}

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  const models = await generateWeeklyOgImages(parseArgs(process.argv.slice(2)));
  for (const model of models) {
    console.log(`${model.publicPath} -> ${model.outputPath}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
