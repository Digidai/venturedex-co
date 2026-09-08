import type { FundingRound } from "./types";

export const FUNDING_PAGE_SIZE = 50;

export function fundingPagePath(page: number): string {
  if (!Number.isSafeInteger(page) || page < 1) throw new Error("Invalid funding page");
  return page === 1 ? "/news" : `/news/page/${page}`;
}

export function paginateFundingRounds(rounds: FundingRound[], page = 1) {
  const ordered = [...rounds].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const totalPages = Math.max(1, Math.ceil(ordered.length / FUNDING_PAGE_SIZE));
  if (!Number.isSafeInteger(page) || page < 1 || page > totalPages) throw new Error("Funding page out of range");
  return {
    rounds: ordered.slice((page - 1) * FUNDING_PAGE_SIZE, page * FUNDING_PAGE_SIZE),
    page,
    totalPages,
    totalRounds: ordered.length,
    path: fundingPagePath(page),
    previous: page > 1 ? fundingPagePath(page - 1) : null,
    next: page < totalPages ? fundingPagePath(page + 1) : null,
  };
}

export function formatFundingDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}
