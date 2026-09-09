import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { resolveInvestorSlugByName } from "../src/lib/brand-assets";
import {
  collectStartupInvestorNames, investorIdentityCaution, investorReviewDecision, isDate, validateInvestorProfiles,
  type InvestorProfiles, type ProfileDirectoryEntry,
} from "../src/lib/investor-profiles";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const directory = read("content/investors.json") as Record<string, ProfileDirectoryEntry>;
const data: unknown = read("content/investor-profiles.json");
const args = process.argv.slice(2);
const command = args.shift();
const selected = new Set<string>();
const changed = new Set<string>();
const unresolved = new Set<string>();
const identityWarnings = new Map<string, { name: string; resolved_slug: string; reason: string }>();
let today = new Date().toISOString().slice(0, 10);
let all = false;
try {
  if (!["validate", "plan"].includes(command ?? "")) throw new Error("Use validate or plan --startup <slug> | --investor <slug> | --all [--today YYYY-MM-DD] [--changed <slug>]");
  while (args.length) {
    const flag = args.shift();
    if (flag === "--all") { all = true; continue; }
    if (!["--today", "--startup", "--investor", "--changed"].includes(flag ?? "")) throw new Error("Unknown argument: " + flag);
    const value = args.shift();
    if (!value || value.startsWith("--")) throw new Error("Missing value for " + flag);
    if (flag === "--today") { if (!isDate(value)) throw new Error("Invalid --today date"); today = value; continue; }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error("Invalid slug: " + value);
    if (flag === "--startup") {
      const startup = read("content/startups/" + value + ".json");
      for (const name of collectStartupInvestorNames(startup)) {
        const slug = resolveInvestorSlugByName(name);
        if (slug) {
          selected.add(slug);
          const reason = investorIdentityCaution(name, slug, directory[slug].name);
          if (reason) identityWarnings.set(name, { name, resolved_slug: slug, reason });
        } else unresolved.add(name);
      }
    } else {
      if (!Object.hasOwn(directory, value)) throw new Error("Unknown investor: " + value);
      selected.add(value);
      if (flag === "--changed") changed.add(value);
    }
  }
  const errors = validateInvestorProfiles(data, directory, today);
  if (errors.length) throw new Error(errors.join("\n"));
  const profiles = data as InvestorProfiles;
  if (command === "validate") {
    console.log("Investor profiles valid: " + Object.keys(profiles.profiles).length + " researched; " + profiles.legacy_unresearched.length + " legacy profiles pending.");
  } else {
    if (all) Object.keys(directory).forEach((slug) => selected.add(slug));
    if (!all && !selected.size && !unresolved.size) throw new Error("Plan requires an explicit investor/startup scope or --all.");
    console.log(JSON.stringify({
      as_of: today, review_interval_days: 90, read_only: true,
      investors: [...selected].sort().map((slug) => ({
        slug, name: directory[slug].name, website: directory[slug].website,
        ...investorReviewDecision(profiles.profiles[slug], profiles.attempts[slug], today, changed.has(slug)),
      })),
      unresolved_investors: [...unresolved].sort().map((name) => ({ name, action: "verify_identity_then_add_directory_and_profile" })),
      identity_warnings: [...identityWarnings.values()].sort((a, b) => a.name.localeCompare(b.name)),
    }, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
