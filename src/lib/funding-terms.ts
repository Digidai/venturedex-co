import type { FundingRound } from "./types";

export type FundingInstrument = "equity" | "debt" | "mixed" | "grant" | "undisclosed";

/** Source labels are preserved for display; only explicit named extensions group together. */
export function normalizeFundingStage(value: string | null | undefined): string | null {
  if (!value) return null;
  const stage = value.trim();
  if (/^pre[- ]seed$/i.test(stage)) return "Pre-Seed";
  if (/^pre[- ]series a$/i.test(stage)) return "Pre-Series A";
  if (/^seed(?:\+| extension)?$/i.test(stage)) return "Seed";
  if (/^unspecified$/i.test(stage)) return "Unspecified";
  const series = /^series ([a-z])(?:\+| extension)?$/i.exec(stage);
  return series ? `Series ${series[1].toUpperCase()}` : null;
}

export function fundingStageDisplayLabel(value: string | null | undefined): string | null {
  const stage = value?.trim();
  if (!stage) return null;
  return normalizeFundingStage(stage) === "Unspecified" ? "Stage undisclosed" : stage;
}

export function fundingStageLabel(round: Pick<FundingRound, "stage" | "stage_raw">): string {
  return round.stage_raw || fundingStageDisplayLabel(round.stage) || round.stage;
}

export function fundingInstrumentLabel(value: string | null | undefined): string | null {
  return ({ equity: "Equity", debt: "Debt", mixed: "Mixed financing", grant: "Grant" } as Record<string, string>)[value ?? ""] ?? null;
}

/** Do not convert amounts or imply that a mixed/debt/grant total is equity. */
export function fundingAmountLabel(round: Pick<FundingRound, "amount" | "instrument">): string {
  const amount = !round.amount || round.amount === "undisclosed" ? "Undisclosed amount" : round.amount;
  const instrument = fundingInstrumentLabel(round.instrument);
  return instrument && round.instrument !== "equity" ? `${amount} (${instrument.toLowerCase()})` : amount;
}

export function fundingLeadName(round: Pick<FundingRound, "lead_investor">): string | null {
  const name = round.lead_investor?.trim();
  return name && name.toLowerCase() !== "undisclosed" ? name : null;
}

export function fundingSummary(round: FundingRound): string {
  const name = fundingLeadName(round);
  const lead = name ? ` led by ${name}` : "; lead investor undisclosed";
  return `${fundingAmountLabel(round)} ${fundingStageLabel(round)}${lead}`;
}
