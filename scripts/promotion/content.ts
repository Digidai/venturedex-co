import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const SITE_BASE_URL = (process.env.SITE_BASE_URL ?? "https://venturedex.co").replace(/\/+$/, "");

export interface RawFundingRound {
  amount?: string;
  stage?: string;
  lead_investor?: string;
  date?: string;
  source_url?: string;
  source_name?: string;
}

export interface PromotionStartup {
  slug: string;
  product_name: string;
  domain: string;
  url?: string;
  summary?: string;
  why_featured?: string;
  editor_note?: string;
  product_type?: string;
  funding?: RawFundingRound[];
  investors?: string;
  tags?: string;
  published_at: string | null;
}

export interface PromotionWeeklyIssue {
  issue_number: number;
  title: string;
  status: string;
  published_at: string | null;
  editorial_intro?: string;
  research_summary?: string;
  picks?: Array<{ slug?: string; why_this_week?: string; verdict?: string } | string>;
}

interface TimestampEntry {
  published_at?: string | null;
  first_seen_at?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function fundingRounds(value: unknown): RawFundingRound[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((round) => ({
    amount: stringValue(round.amount),
    stage: stringValue(round.stage),
    lead_investor: stringValue(round.lead_investor),
    date: stringValue(round.date),
    source_url: stringValue(round.source_url),
    source_name: stringValue(round.source_name),
  }));
}

export function startupUrl(slug: string): string {
  return `${SITE_BASE_URL}/startups/${slug}`;
}

export function weeklyUrl(issueNumber: number): string {
  return `${SITE_BASE_URL}/weekly/${issueNumber}`;
}

export function utmUrl(url: string, source: string, medium: string, campaign: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("utm_source", source);
  parsed.searchParams.set("utm_medium", medium);
  parsed.searchParams.set("utm_campaign", campaign);
  return parsed.toString();
}

export function loadStartups(): PromotionStartup[] {
  const timestamps = readJson<Record<string, TimestampEntry>>(join(ROOT_DIR, "content", "timestamps.json"));
  const startupDir = join(ROOT_DIR, "content", "startups");
  return readdirSync(startupDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson<Record<string, unknown>>(join(startupDir, file)))
    .filter((data) => typeof data.slug === "string" && typeof data.product_name === "string")
    .map((data) => {
      const slug = data.slug as string;
      return {
        slug,
        product_name: data.product_name as string,
        domain: stringValue(data.domain) ?? "",
        url: stringValue(data.url),
        summary: stringValue(data.summary),
        why_featured: stringValue(data.why_featured),
        editor_note: stringValue(data.editor_note),
        product_type: stringValue(data.product_type),
        funding: fundingRounds(data.funding),
        investors: stringValue(data.investors),
        tags: stringValue(data.tags),
        published_at: timestamps[slug]?.published_at ?? null,
      };
    });
}

export function loadPublishedWeeklyIssues(): PromotionWeeklyIssue[] {
  const weeklyDir = join(ROOT_DIR, "content", "weekly");
  if (!existsSync(weeklyDir)) return [];
  return readdirSync(weeklyDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson<Record<string, unknown>>(join(weeklyDir, file)))
    .filter((data) => typeof data.issue_number === "number")
    .map((data) => ({
      issue_number: data.issue_number as number,
      title: stringValue(data.title) ?? `VentureDex Weekly #${data.issue_number}`,
      status: stringValue(data.status) ?? "published",
      published_at: stringValue(data.published_at) ?? null,
      editorial_intro: stringValue(data.editorial_intro),
      research_summary: stringValue(data.research_summary),
      picks: Array.isArray(data.picks) ? data.picks as PromotionWeeklyIssue["picks"] : [],
    }))
    .filter((issue) => issue.status === "published")
    .sort((a, b) => b.issue_number - a.issue_number);
}

export function latestDailyDate(startups = loadStartups()): string | null {
  const dates = startups
    .map((startup) => startup.published_at?.slice(0, 10))
    .filter((date): date is string => Boolean(date));
  return dates.length ? dates.sort().at(-1)! : null;
}

export function startupsForDate(date: string, startups = loadStartups()): PromotionStartup[] {
  return startups
    .filter((startup) => startup.published_at?.slice(0, 10) === date)
    .sort((a, b) => {
      const byTime = (a.published_at ?? "").localeCompare(b.published_at ?? "");
      return byTime || a.product_name.localeCompare(b.product_name);
    });
}

export function latestDailyStartups(startups = loadStartups()): PromotionStartup[] {
  const date = latestDailyDate(startups);
  return date ? startupsForDate(date, startups) : [];
}

export function latestWeeklyIssue(issues = loadPublishedWeeklyIssues()): PromotionWeeklyIssue | null {
  return issues[0] ?? null;
}

export function latestFunding(startup: PromotionStartup): RawFundingRound | null {
  return [...(startup.funding ?? [])]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .at(0) ?? null;
}

export function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export function writeText(path: string, body: string): void {
  ensureParentDir(path);
  writeFileSync(path, body, "utf8");
}

export function appendJsonLine(path: string, value: unknown): void {
  ensureParentDir(path);
  const line = `${JSON.stringify(value)}\n`;
  writeFileSync(path, line, { encoding: "utf8", flag: "a" });
}

export function resolveFromRoot(...parts: string[]): string {
  return join(ROOT_DIR, ...parts);
}
