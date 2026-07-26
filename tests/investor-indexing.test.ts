import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveInvestorSlugByName } from "../src/lib/brand-assets";
import {
  evaluateInvestorIndexEligibility,
  getIndexableInvestorSlugs,
  groupFundingRoundsByInvestorSlug,
  MIN_INDEXABLE_INVESTOR_COMPANIES,
} from "../src/lib/investor-indexing";
import {
  createContentReaders,
  type CollectionConfig,
  type InvestorDirectoryEntry,
  type JsonRecord,
  type TimestampEntry,
} from "../src/lib/content-transform";
import type { FundingRound } from "../src/lib/types";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function round(
  companySlug: string,
  overrides: Partial<FundingRound> = {}
): FundingRound {
  return {
    id: `round-${companySlug}`,
    company_name: companySlug,
    company_slug: companySlug,
    company_url: `https://${companySlug}.example`,
    amount: "$1M",
    stage: "Seed",
    lead_investor: "Useful Ventures",
    date: "2026-07-01",
    source_url: "https://example.com/funding",
    source_name: "Example",
    ...overrides,
  };
}

test("investor eligibility requires one complete source-linked company", () => {
  assert.equal(MIN_INDEXABLE_INVESTOR_COMPANIES, 1);
  assert.deepEqual(evaluateInvestorIndexEligibility([]), {
    indexable: false,
    distinctCompanyCount: 0,
    reason: "no_source_linked_companies",
  });
  assert.deepEqual(evaluateInvestorIndexEligibility([round("alpha")]), {
    indexable: true,
    distinctCompanyCount: 1,
    reason: "source_linked_portfolio_evidence",
  });
  assert.deepEqual(
    evaluateInvestorIndexEligibility([
      round("alpha"),
      round("alpha", { id: "round-alpha-2", stage: "Series A" }),
    ]),
    {
      indexable: true,
      distinctCompanyCount: 1,
      reason: "source_linked_portfolio_evidence",
    }
  );
  assert.deepEqual(evaluateInvestorIndexEligibility([round("alpha"), round("beta")]), {
    indexable: true,
    distinctCompanyCount: 2,
    reason: "source_linked_portfolio_evidence",
  });
});

test("incomplete funding evidence is excluded from investor eligibility", () => {
  const incompleteRounds = [
    round("beta", { source_url: null }),
    round("gamma", { source_name: null }),
    round("delta", { company_slug: null }),
  ];
  assert.deepEqual(evaluateInvestorIndexEligibility(incompleteRounds), {
    indexable: false,
    distinctCompanyCount: 0,
    reason: "no_source_linked_companies",
  });

  const eligibility = evaluateInvestorIndexEligibility([
    round("alpha"),
    ...incompleteRounds,
  ]);
  assert.deepEqual(eligibility, {
    indexable: true,
    distinctCompanyCount: 1,
    reason: "source_linked_portfolio_evidence",
  });
});

test("grouping and linkability use the same canonical investor resolver", () => {
  const rounds = [
    round("alpha"),
    round("beta"),
    round("gamma", { lead_investor: "Other Ventures" }),
  ];
  const resolver = (name?: string | null) =>
    name === "Useful Ventures" ? "useful-ventures"
      : name === "Other Ventures" ? "other-ventures"
        : null;

  const grouped = groupFundingRoundsByInvestorSlug(rounds, resolver);
  assert.equal(grouped.get("useful-ventures")?.length, 2);
  assert.equal(grouped.get("other-ventures")?.length, 1);
  assert.deepEqual(
    Array.from(getIndexableInvestorSlugs(rounds, resolver)),
    ["useful-ventures", "other-ventures"]
  );
});

test("current content exposes only investors with source-linked portfolio evidence", () => {
  const startupRecords: JsonRecord[] = readdirSync(join(repoRoot, "content/startups"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(join(repoRoot, "content/startups", file), "utf8")));
  const rawTimestamps = JSON.parse(
    readFileSync(join(repoRoot, "content/timestamps.json"), "utf8")
  ) as Record<string, TimestampEntry>;
  const timestamps = Object.fromEntries(
    Object.entries(rawTimestamps).filter(([key]) => !key.startsWith("__"))
  ) as Record<string, TimestampEntry>;
  const investorDirectory = JSON.parse(
    readFileSync(join(repoRoot, "content/investors.json"), "utf8")
  ) as Record<string, InvestorDirectoryEntry>;
  const collectionConfigs = JSON.parse(
    readFileSync(join(repoRoot, "content/collections.json"), "utf8")
  ) as CollectionConfig[];
  const readers = createContentReaders({
    records: startupRecords,
    timestamps,
    investorDirectory,
    collectionConfigs,
  });

  const rounds = readers.getContentNewsEligibleFundingRounds();
  const grouped = groupFundingRoundsByInvestorSlug(rounds, resolveInvestorSlugByName);
  const indexable = getIndexableInvestorSlugs(rounds, resolveInvestorSlugByName);
  const independentlyEligible = new Map<string, Set<string>>();

  for (const fundingRound of rounds) {
    const investorSlug = resolveInvestorSlugByName(fundingRound.lead_investor);
    const companySlug = fundingRound.company_slug?.trim().toLowerCase();
    if (
      !investorSlug
      || !companySlug
      || !fundingRound.stage.trim()
      || !fundingRound.date.trim()
      || !fundingRound.source_url?.trim()
      || !fundingRound.source_name?.trim()
    ) {
      continue;
    }
    const companies = independentlyEligible.get(investorSlug) ?? new Set<string>();
    companies.add(companySlug);
    independentlyEligible.set(investorSlug, companies);
  }

  const expectedSlugs = Array.from(independentlyEligible)
    .filter(([, companies]) => companies.size >= MIN_INDEXABLE_INVESTOR_COMPANIES)
    .map(([slug]) => slug)
    .sort();
  assert.ok(expectedSlugs.length > 0, "current content should expose at least one investor hub page");
  assert.deepEqual(Array.from(indexable).sort(), expectedSlugs);
  for (const slug of indexable) {
    const eligibility = evaluateInvestorIndexEligibility(grouped.get(slug) ?? []);
    assert.equal(eligibility.indexable, true, slug);
    assert.ok(
      eligibility.distinctCompanyCount >= MIN_INDEXABLE_INVESTOR_COMPANIES,
      slug
    );
  }
});
