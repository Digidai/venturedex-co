import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  addDays, collectStartupInvestorNames, investorIdentityCaution, investorReviewDecision, isPublicHttpsUrl,
  validateInvestorProfiles, type InvestorProfiles, type InvestorReviewAttempt, type ProfileDirectoryEntry,
} from "../src/lib/investor-profiles";
import { resolveInvestorSlugByName } from "../src/lib/brand-assets";

const root = fileURLToPath(new URL("..", import.meta.url));
const directory = { firm: { name: "Firm", website: "https://firm.example" }, accel: { name: "Accel", website: "https://www.accel.com" } };
const fixture = (): InvestorProfiles => ({
  schema_version: 1,
  legacy_unresearched: ["accel"],
  profiles: {
    firm: {
      reviewed_at: "2026-06-11",
      summary: { value: "A technology investor working with early-stage founders.", source_ids: ["about"] },
      facts: [
        { key: "firm_type", value: "Venture capital", source_ids: ["about"] },
        { key: "stages", value: ["Seed", "Series A"], source_ids: ["about"] },
      ],
      sources: [{ id: "about", label: "Official firm overview", url: "https://firm.example/about", checked_at: "2026-06-11" }],
    },
  },
  attempts: {},
});
const attempt: InvestorReviewAttempt = {
  attempted_at: "2026-09-09", retry_after: "2026-09-12",
  reason: "The official overview returned an access challenge.", source_urls: ["https://firm.example/about"],
};
const validate = (data: unknown, entries: Record<string, ProfileDirectoryEntry> = directory) => validateInvestorProfiles(data, entries, "2026-09-09");

test("legacy profiles remain optional, but new directory entries need sourced profiles", () => {
  assert.deepEqual(validate(fixture()), []);
  assert.match(validate(fixture(), { ...directory, newfirm: { name: "New firm", website: "https://newfirm.example" } }).join(" "), /new investor requires/);
  const bypass = fixture();
  bypass.legacy_unresearched.push("newfirm");
  assert.match(validate(bypass, { ...directory, newfirm: { name: "New firm", website: "https://newfirm.example" } }).join(" "), /cannot use the frozen legacy/);
  const data = fixture();
  data.legacy_unresearched.push("firm");
  assert.match(validate(data).join(" "), /must leave legacy/);
});

test("profile references and canonical identities fail closed", () => {
  const data = fixture();
  data.profiles.firm.facts[0].source_ids = ["missing"];
  assert.match(validate(data).join(" "), /existing sources/);
  data.profiles.unregistered = data.profiles.firm;
  assert.match(validate(data).join(" "), /unknown canonical/);
});

test("research must be substantive and source-bound, not an unverified description", () => {
  const data = fixture();
  data.profiles.firm.facts = [];
  data.profiles.firm.summary.source_ids = [];
  assert.match(validate(data).join(" "), /useful sourced fact/);
  assert.match(validate(data).join(" "), /source_ids/);
});

test("invalid and future calendar dates are rejected without throwing", () => {
  for (const date of ["2026-02-30", "2026-9-9", "2026-09-10", "bad"]) {
    const data = fixture();
    data.profiles.firm.reviewed_at = date;
    assert.ok(validate(data).length);
  }
  const data = fixture();
  data.attempts.firm = { ...attempt, attempted_at: "bad" };
  assert.ok(validate(data).length);
});

test("all retained sources must actually be rechecked on the profile review date", () => {
  const data = fixture();
  data.profiles.firm.reviewed_at = "2026-09-09";
  assert.match(validate(data).join(" "), /each source must be checked/);
});

test("duplicate source ids, duplicate fact keys and unknown fields are errors", () => {
  const data = fixture();
  data.profiles.firm.sources.push(data.profiles.firm.sources[0]);
  data.profiles.firm.facts.push(data.profiles.firm.facts[0]);
  assert.match(validate(data).join(" "), /duplicate source/);
  assert.match(validate(data).join(" "), /duplicate fact/);
  assert.match(validate({ ...fixture(), unchecked_aum: "100B" }).join(" "), /unknown field/);
});

test("URLs reject unsafe schemes, credentials, IPs and unrelated hosts", () => {
  for (const url of ["javascript:alert(1)", "http://firm.example/", "https://user:pass@firm.example/", "https://127.0.0.1/", "https://foo.local/", "https://evil.example/"]) {
    const data = fixture();
    data.profiles.firm.sources[0].url = url;
    assert.ok(validate(data).length, url);
  }
  assert.equal(isPublicHttpsUrl("https://firm.example/about"), true);
  const data = fixture();
  data.profiles.firm.sources[0].url = "https://research.firm.example/about";
  assert.deepEqual(validate(data), []);
});

test("cross-domain primary sources are explicit and remain anchored to the investor's official site", () => {
  const data = fixture();
  data.profiles.firm.sources.push({
    id: "portfolio",
    label: "Official portfolio-company financing announcement",
    url: "https://portfolio.example/funding",
    checked_at: "2026-06-11",
    source_type: "official_portfolio_company",
  });
  assert.deepEqual(validate(data), []);
  data.profiles.firm.sources[0].source_type = "official_portfolio_company";
  assert.match(validate(data).join(" "), /anchored by a canonical official_firm/);
  data.profiles.firm.sources[0].source_type = "unverified_media" as never;
  assert.match(validate(data).join(" "), /unknown source_type/);
});

test("freshness has an exact 90-day boundary, independent of a new funding reference", () => {
  const profile = fixture().profiles.firm;
  assert.equal(addDays("2026-06-11", 90), "2026-09-09");
  assert.equal(investorReviewDecision(profile, undefined, "2026-09-08").action, "skip_fresh");
  assert.deepEqual(investorReviewDecision(profile, undefined, "2026-09-09"), {
    action: "research", reason: "review_due", next_review_at: "2026-09-09",
  });
  assert.equal(investorReviewDecision(undefined, undefined, "2026-09-09").reason, "missing_profile");
});

test("shared hosting parents and unrelated ancestor domains are not official sources", () => {
  const data = fixture();
  data.profiles.firm.sources[0].url = "https://github.io/about";
  assert.ok(validate(data, { ...directory, firm: { name: "Firm", website: "https://firm.github.io" } }).length);
});

test("composite leads and the known Lightspeed entity ambiguity are surfaced", () => {
  assert.match(investorIdentityCaution("Index Ventures and Ribbit Capital", "index-ventures", "Index Ventures") ?? "", /each named participant/);
  assert.match(investorIdentityCaution("Lightspeed India Partners", "lightspeed", "Lightspeed Venture Partners") ?? "", /independent entities/);
  assert.equal(investorIdentityCaution("Accel", "accel", "Accel"), null);
});

test("material change overrides both freshness and a previous failed-attempt cooldown", () => {
  const profile = fixture().profiles.firm;
  profile.reviewed_at = "2026-09-08";
  assert.equal(investorReviewDecision(profile, attempt, "2026-09-09", true).reason, "material_change");
  assert.equal(investorReviewDecision(undefined, attempt, "2026-09-09", true).action, "research");
});

test("failed attempts back off at most seven days and never refresh old research", () => {
  const data = fixture();
  data.attempts.firm = attempt;
  assert.deepEqual(validate(data), []);
  assert.equal(investorReviewDecision(data.profiles.firm, attempt, "2026-09-09").action, "retry_later");
  assert.equal(data.profiles.firm.reviewed_at, "2026-06-11");
  assert.equal(investorReviewDecision(data.profiles.firm, attempt, "2026-09-12").action, "research");
  data.attempts.firm = { ...attempt, retry_after: "2026-09-30" };
  assert.match(validate(data).join(" "), /1-7 days/);
});

test("new and historical funding references include participants, de-duplicate and ignore undisclosed", () => {
  assert.deepEqual(collectStartupInvestorNames({
    investors: "Accel, Bessemer Venture Partners, undisclosed, accel",
    funding: [{ lead_investor: "Andreessen Horowitz" }, { lead_investor: "Accel" }],
  }), ["Accel", "Bessemer Venture Partners", "Andreessen Horowitz"]);
  assert.equal(resolveInvestorSlugByName("Accel"), "accel");
  assert.equal(resolveInvestorSlugByName("Imaginary Accel Ventures"), null);
});

test("checked-in profiles and all directory entries satisfy the contract", () => {
  const data = JSON.parse(readFileSync(root + "/content/investor-profiles.json", "utf8"));
  const entries = JSON.parse(readFileSync(root + "/content/investors.json", "utf8"));
  assert.deepEqual(validateInvestorProfiles(data, entries), []);
});

test("CLI plans are explicitly scoped, read-only, and distinguish new from fresh", () => {
  const today = new Date().toISOString().slice(0, 10);
  const current = JSON.parse(readFileSync(root + "/content/investor-profiles.json", "utf8")) as InvestorProfiles;
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/investor-research.ts", "plan", "--investor", "a16z", "--investor", "accel", "--today", today], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.read_only, true);
  for (const slug of ["a16z", "accel"]) {
    assert.equal(plan.investors.find((row: { slug: string }) => row.slug === slug).action,
      investorReviewDecision(current.profiles[slug], current.attempts[slug], today).action);
  }
  const invalid = spawnSync(process.execPath, ["--import", "tsx", "scripts/investor-research.ts", "plan", "--startup", "../escape"], { cwd: root, encoding: "utf8" });
  assert.equal(invalid.status, 1);
});

test("investor page explains tracking coverage and keeps the existing indexability gate", () => {
  const page = readFileSync(root + "/src/pages/investors/[slug].astro", "utf8");
  assert.match(page, /eligibility.indexable \? undefined : "noindex,follow"/);
  assert.match(page, /eligibility.distinctCompanyCount/);
  assert.match(page, /not this investor's contribution/);
  assert.match(page, /No source-linked funding activity tracked yet/);
  assert.match(page, /INVESTOR_ROLE_LABELS\[r.investor_role\]/);
  assert.doesNotMatch(page, /No investments tracked yet/);
  assert.match(page, /profile && <InvestorProfile/);
  const pkg = JSON.parse(readFileSync(root + "/package.json", "utf8"));
  assert.match(pkg.scripts.build, /screenshots:validate && npm run investors:validate &&/);
});
