import type { FundingRound } from "./types";

// A profile becomes search-eligible when published content supplies at least
// one complete, source-linked portfolio company record.
export const MIN_INDEXABLE_INVESTOR_COMPANIES = 1;

export type InvestorIndexEligibilityReason =
  | "source_linked_portfolio_evidence"
  | "no_source_linked_companies";

export interface InvestorIndexEligibility {
  indexable: boolean;
  distinctCompanyCount: number;
  reason: InvestorIndexEligibilityReason;
}

type InvestorSlugResolver = (name?: string | null) => string | null;

function sourceLinkedCompanyKey(round: FundingRound): string | null {
  const companySlug = round.company_slug?.trim().toLowerCase();
  if (
    !companySlug
    || !round.stage.trim()
    || !round.date.trim()
    || !round.source_url?.trim()
    || !round.source_name?.trim()
  ) {
    return null;
  }
  return `slug:${companySlug}`;
}

export function evaluateInvestorIndexEligibility(
  rounds: FundingRound[]
): InvestorIndexEligibility {
  const companyKeys = new Set(
    rounds
      .map(sourceLinkedCompanyKey)
      .filter((key): key is string => Boolean(key))
  );
  const distinctCompanyCount = companyKeys.size;
  const indexable = distinctCompanyCount >= MIN_INDEXABLE_INVESTOR_COMPANIES;

  return {
    indexable,
    distinctCompanyCount,
    reason: indexable
      ? "source_linked_portfolio_evidence"
      : "no_source_linked_companies",
  };
}

export function groupFundingRoundsByInvestorSlug(
  rounds: FundingRound[],
  resolveInvestorSlug: InvestorSlugResolver
): Map<string, FundingRound[]> {
  const grouped = new Map<string, FundingRound[]>();

  for (const round of rounds) {
    const slug = resolveInvestorSlug(round.lead_investor);
    if (!slug) continue;
    const rows = grouped.get(slug) ?? [];
    rows.push(round);
    grouped.set(slug, rows);
  }

  return grouped;
}

export function getIndexableInvestorSlugs(
  rounds: FundingRound[],
  resolveInvestorSlug: InvestorSlugResolver
): Set<string> {
  const grouped = groupFundingRoundsByInvestorSlug(rounds, resolveInvestorSlug);
  return new Set(
    Array.from(grouped)
      .filter(([, investorRounds]) => evaluateInvestorIndexEligibility(investorRounds).indexable)
      .map(([slug]) => slug)
  );
}
