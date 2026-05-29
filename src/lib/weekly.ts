// Re-export the build-time Startup reader from content.ts so weekly/[issue].astro
// (and any other importer) keeps a single, authoritative implementation that
// reads version-controlled timestamps. Kept here for import-path compatibility.
export { getContentStartupBySlug } from "./content";

export interface WeeklyEvidence {
  label: string;
  source: string;
  url?: string;
}

export interface WeeklyTheme {
  title: string;
  summary: string;
}

export interface WeeklyPick {
  slug: string;
  why_this_week: string;
  product_evaluation: string;
  evidence: WeeklyEvidence[];
  risks: string[];
  verdict: string;
}

export interface WeeklyIssueContent {
  issue_number: number;
  title: string;
  week_start: string | null;
  week_end: string | null;
  published_at: string | null;
  status: "draft" | "published" | "archived";
  editorial_intro: string;
  research_summary: string;
  evaluation_method: string[];
  themes: WeeklyTheme[];
  picks: WeeklyPick[];
}

type JsonRecord = Record<string, unknown>;
type JsonModule = { default: unknown } | unknown;

const weeklyModules = import.meta.glob("../../content/weekly/*.json", { eager: true });

function moduleValue(module: JsonModule): unknown {
  if (module && typeof module === "object" && "default" in module) {
    return (module as { default: unknown }).default;
  }
  return module;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function evidenceArray(value: unknown): WeeklyEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    label: stringValue(item.label),
    source: stringValue(item.source),
    url: typeof item.url === "string" && item.url ? item.url : undefined,
  })).filter((item) => item.label && item.source);
}

function themeArray(value: unknown): WeeklyTheme[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    title: stringValue(item.title),
    summary: stringValue(item.summary),
  })).filter((item) => item.title && item.summary);
}

function normalizePick(value: unknown): WeeklyPick | null {
  if (typeof value === "string") {
    return {
      slug: value,
      why_this_week: "",
      product_evaluation: "",
      evidence: [],
      risks: [],
      verdict: "",
    };
  }

  if (!isRecord(value)) return null;

  return {
    slug: stringValue(value.slug),
    why_this_week: stringValue(value.why_this_week),
    product_evaluation: stringValue(value.product_evaluation),
    evidence: evidenceArray(value.evidence),
    risks: stringArray(value.risks),
    verdict: stringValue(value.verdict),
  };
}

function normalizeIssue(value: unknown): WeeklyIssueContent | null {
  if (!isRecord(value)) return null;

  const picks = Array.isArray(value.picks)
    ? value.picks.map(normalizePick).filter((pick): pick is WeeklyPick => Boolean(pick))
    : [];

  return {
    issue_number: numberValue(value.issue_number),
    title: stringValue(value.title),
    week_start: typeof value.week_start === "string" ? value.week_start : null,
    week_end: typeof value.week_end === "string" ? value.week_end : null,
    published_at: typeof value.published_at === "string" ? value.published_at : null,
    status: value.status === "draft" || value.status === "archived" ? value.status : "published",
    editorial_intro: stringValue(value.editorial_intro),
    research_summary: stringValue(value.research_summary),
    evaluation_method: stringArray(value.evaluation_method),
    themes: themeArray(value.themes),
    picks,
  };
}

function allWeeklyIssues(): WeeklyIssueContent[] {
  return Object.values(weeklyModules)
    .map((module) => normalizeIssue(moduleValue(module)))
    .filter((issue): issue is WeeklyIssueContent => Boolean(issue))
    .sort((a, b) => b.issue_number - a.issue_number);
}

export function getPublishedWeeklyIssuesFromContent(limit = 20): WeeklyIssueContent[] {
  return allWeeklyIssues()
    .filter((issue) => issue.status === "published")
    .slice(0, limit);
}

export function getWeeklyIssueByNumberFromContent(issueNumber: number): WeeklyIssueContent | null {
  return allWeeklyIssues().find((issue) => issue.issue_number === issueNumber && issue.status === "published") ?? null;
}
