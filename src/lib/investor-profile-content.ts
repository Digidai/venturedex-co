import raw from "../../content/investor-profiles.json";
import directory from "../../content/investors.json";
import { validateInvestorProfiles, type InvestorProfiles } from "./investor-profiles";

const errors = validateInvestorProfiles(raw, directory);
if (errors.length) throw new Error("Invalid investor research:\n" + errors.join("\n"));
const data = raw as InvestorProfiles;
export function getInvestorProfile(slug: string) {
  return data.profiles[slug] ?? null;
}
