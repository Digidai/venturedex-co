import participations from "../../content/investor-participations.json";
import { getContentInvestors, getContentNewsEligibleFundingRounds } from "./content";
import { resolveInvestorSlugByName } from "./brand-assets";
import { buildInvestorActivity } from "./investor-participation";
import { evaluateInvestorIndexEligibility } from "./investor-indexing";

let activity: ReturnType<typeof buildInvestorActivity> | undefined;
export function getInvestorActivity() {
  return activity ??= buildInvestorActivity(getContentNewsEligibleFundingRounds(), participations,
    new Set(getContentInvestors().map(investor => investor.slug)), resolveInvestorSlugByName);
}
export function getLinkedInvestorSlugs(): Set<string> {
  return new Set([...getInvestorActivity()].filter(([, rounds]) => evaluateInvestorIndexEligibility(rounds).indexable).map(([slug]) => slug));
}
