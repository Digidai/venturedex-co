import type { FundingRound } from "./types";
import { isDate, isPublicHttpsUrl } from "./investor-profiles";

export const INVESTOR_ROLE_LABELS = {
  lead: "Lead investor",
  participant: "Participating investor",
  role_unspecified: "Investor · lead role not stated",
} as const;
export type InvestorRole = keyof typeof INVESTOR_ROLE_LABELS;
export interface InvestorParticipation {
  company_slug: string;
  investor_slug: string;
  round_date: string;
  round_stage: string;
  role: InvestorRole;
  source_url: string;
  source_name: string;
  verified_at: string;
}
export interface InvestorActivityRound extends FundingRound {
  investor_role: InvestorRole;
  evidence_checked_at?: string;
}

/** Add explicitly researched edges, never infer them from a CSV name or its order.
 * This sidecar enriches discovery only: it never rewrites the funding/D1 record.
 */
export function buildInvestorActivity(
  rounds: FundingRound[],
  value: unknown,
  knownInvestors: Set<string>,
  resolveSlug: (name?: string | null) => string | null,
  today = new Date().toISOString().slice(0, 10),
): Map<string, InvestorActivityRound[]> {
  if (!isDate(today) || !Array.isArray(value)) throw new Error("Invalid investor participation manifest");
  const grouped = new Map<string, InvestorActivityRound[]>();
  for (const round of rounds) {
    const slug = resolveSlug(round.lead_investor);
    if (!slug || !knownInvestors.has(slug)) continue;
    const rows = grouped.get(slug) ?? [];
    rows.push({ ...round, investor_role: "lead" });
    grouped.set(slug, rows);
  }
  const seen = new Set<string>();
  const fields = ["company_slug", "investor_slug", "round_date", "round_stage", "role", "source_url", "source_name", "verified_at"];
  for (const [index, item] of value.entries()) {
    const fail = (reason: string): never => { throw new Error(`investor-participations[${index}]: ${reason}`); };
    if (!item || typeof item !== "object" || Array.isArray(item)) fail("expected an object");
    if (Object.keys(item).some(key => !fields.includes(key))
      || fields.some(key => typeof item[key] !== "string" || !item[key].trim())) fail("invalid fields");
    const entry = item as InvestorParticipation;
    if (!knownInvestors.has(entry.investor_slug)) fail("unknown canonical investor");
    if (!Object.hasOwn(INVESTOR_ROLE_LABELS, entry.role)) fail("invalid investor role");
    if (!isPublicHttpsUrl(entry.source_url)) fail("source must be public HTTPS");
    if (!isDate(entry.round_date) || !isDate(entry.verified_at)
      || entry.verified_at > today || entry.verified_at < entry.round_date) fail("invalid verification date");
    const matches = rounds.filter(round => round.company_slug === entry.company_slug
      && round.date === entry.round_date && round.stage === entry.round_stage
      && round.source_url === entry.source_url && Boolean(round.source_name?.trim()));
    if (matches.length !== 1) fail("evidence must bind to exactly one published, source-linked round");
    const round = matches[0];
    const key = `${entry.investor_slug}:${round.id}`;
    if (seen.has(key)) fail("duplicate investor-round relationship");
    seen.add(key);
    const rows = grouped.get(entry.investor_slug) ?? [];
    const existing = rows.find(row => row.id === round.id);
    if (existing && entry.role !== "lead") fail("participation contradicts an existing lead attribution");
    if (existing) existing.evidence_checked_at = entry.verified_at;
    else rows.push({ ...round, investor_role: entry.role, source_url: entry.source_url,
      source_name: entry.source_name, evidence_checked_at: entry.verified_at });
    grouped.set(entry.investor_slug, rows);
  }
  for (const rows of grouped.values()) rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return grouped;
}
