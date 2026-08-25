import { normalizeResearch, safeJsonParse } from "./json";
import { normalizeExternalUrl, sitemapLastmodDate, splitCsv } from "./seo";
import type { Startup, StartupResearchSource } from "./types";

const SOURCE_TYPES: Array<{
  id: StartupResearchSource["type"];
  label: string;
}> = [
  { id: "official", label: "Official" },
  { id: "product", label: "Product" },
  { id: "funding", label: "Funding" },
  { id: "repository", label: "Repository" },
  { id: "social", label: "Social" },
  { id: "editorial", label: "Editorial" },
];

const FUNDING_STAGE_ORDER = ["Seed", "Series A", "Series B", "Series C", "Series D+"];

export interface EvidenceIndexInput {
  startups: Startup[];
  investorCount: number;
  launchCount: number;
  weeklyIssueCount: number;
  launchesUpdatedAt?: string | null;
}

export interface EvidenceIndexMetric {
  id: string;
  label: string;
  count: number;
}

export interface EvidenceIndex {
  asOf: string | null;
  counts: {
    startups: number;
    investors: number;
    launches: number;
    weeklyIssues: number;
    profilesWithSources: number;
    sourceRecords: number;
    uniqueSourceUrls: number;
    sourceDomains: number;
    evidenceStatements: number;
    riskNotes: number;
  };
  sourceTypes: EvidenceIndexMetric[];
  fundingStages: EvidenceIndexMetric[];
  topThemes: Array<{ label: string; count: number }>;
}

export function buildEvidenceIndex(input: EvidenceIndexInput): EvidenceIndex {
  const sourceTypeCounts = new Map(SOURCE_TYPES.map(({ id }) => [id, 0]));
  const sourceUrls = new Set<string>();
  const sourceDomains = new Set<string>();
  const fundingStageCounts = new Map<string, number>();
  const themeCounts = new Map<string, number>();
  const significantDates: string[] = [];

  let profilesWithSources = 0;
  let sourceRecords = 0;
  let evidenceStatements = 0;
  let riskNotes = 0;

  addDate(significantDates, input.launchesUpdatedAt);

  for (const startup of input.startups) {
    addDate(significantDates, startup.updated_at);
    addDate(significantDates, startup.published_at);
    addDate(significantDates, startup.first_seen_at);

    const research = safeJsonParse(startup.research_json, normalizeResearch);
    addDate(significantDates, research?.verified_at);

    let validProfileSources = 0;
    for (const source of research?.sources ?? []) {
      const url = normalizeExternalUrl(source.url);
      if (!url) continue;

      validProfileSources += 1;
      sourceRecords += 1;
      sourceTypeCounts.set(source.type, (sourceTypeCounts.get(source.type) ?? 0) + 1);
      sourceUrls.add(url);
      try {
        sourceDomains.add(new URL(url).hostname.toLowerCase().replace(/^www\./, ""));
      } catch {
        // normalizeExternalUrl already narrowed this; keep aggregation fail-safe.
      }
    }
    if (validProfileSources > 0) profilesWithSources += 1;

    evidenceStatements += research?.product_evidence.length ?? 0;
    riskNotes += research?.risks?.length ?? 0;

    const fundingStage = normalizeFundingStage(startup.funding_stage);
    if (fundingStage) {
      fundingStageCounts.set(fundingStage, (fundingStageCounts.get(fundingStage) ?? 0) + 1);
    }

    const uniqueStartupThemes = new Set(
      splitCsv(startup.tags)
        .map((tag) => tag.toLocaleLowerCase("en-US"))
        .filter(Boolean)
    );
    for (const theme of uniqueStartupThemes) {
      themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
    }
  }

  const fundingStages = [...fundingStageCounts.entries()]
    .sort(([left], [right]) => {
      const leftOrder = FUNDING_STAGE_ORDER.indexOf(left);
      const rightOrder = FUNDING_STAGE_ORDER.indexOf(right);
      if (leftOrder !== rightOrder) {
        return (leftOrder === -1 ? Number.MAX_SAFE_INTEGER : leftOrder)
          - (rightOrder === -1 ? Number.MAX_SAFE_INTEGER : rightOrder);
      }
      return left.localeCompare(right);
    })
    .map(([label, count]) => ({ id: slugify(label), label, count }));

  const topThemes = [...themeCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([label, count]) => ({ label, count }));

  return {
    asOf: significantDates.sort().at(-1) ?? null,
    counts: {
      startups: input.startups.length,
      investors: nonNegativeInteger(input.investorCount),
      launches: nonNegativeInteger(input.launchCount),
      weeklyIssues: nonNegativeInteger(input.weeklyIssueCount),
      profilesWithSources,
      sourceRecords,
      uniqueSourceUrls: sourceUrls.size,
      sourceDomains: sourceDomains.size,
      evidenceStatements,
      riskNotes,
    },
    sourceTypes: SOURCE_TYPES.map(({ id, label }) => ({
      id,
      label,
      count: sourceTypeCounts.get(id) ?? 0,
    })),
    fundingStages,
    topThemes,
  };
}

function addDate(target: string[], value: string | null | undefined): void {
  const date = sitemapLastmodDate(value);
  if (date) target.push(date);
}

function normalizeFundingStage(value: string | null | undefined): string | null {
  const stage = value?.trim();
  if (!stage) return null;
  if (/^series [d-z]$/i.test(stage)) return "Series D+";
  const known = FUNDING_STAGE_ORDER.find((item) => item.toLowerCase() === stage.toLowerCase());
  return known ?? stage;
}

function slugify(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/\+/g, "-plus")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function nonNegativeInteger(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 0;
}
