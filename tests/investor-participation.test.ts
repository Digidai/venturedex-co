import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { buildInvestorActivity, type InvestorParticipation } from "../src/lib/investor-participation";
import type { FundingRound } from "../src/lib/types";
import { createContentReaders } from "../src/lib/content-transform";
import { resolveInvestorSlugByName } from "../src/lib/brand-assets";

const round: FundingRound = {id:"r",company_name:"Company",company_slug:"company",company_url:"https://company.example",amount:"$50M",stage:"Series A",lead_investor:"Lead",date:"2026-09-02",source_url:"https://company.example/news",source_name:"Official announcement"};
const participation: InvestorParticipation = {company_slug:"company",investor_slug:"firm",round_date:"2026-09-02",round_stage:"Series A",role:"role_unspecified",source_url:round.source_url!,source_name:"Company",verified_at:"2026-09-11"};
const build = (entries: InvestorParticipation[], rounds = [round]) => buildInvestorActivity(rounds, entries, new Set(["lead","firm"]), name => name === "Lead" ? "lead" : null, "2026-09-11");

test("participation is additive and never invents a lead or investor check size", () => {
  const map = build([participation]);
  assert.equal(map.get("lead")![0].investor_role, "lead");
  assert.equal(map.get("firm")![0].investor_role, "role_unspecified");
  assert.equal(map.get("firm")![0].amount, "$50M");
  assert.equal(round.lead_investor, "Lead");
  assert.equal((round as any).investor_role, undefined);
});

test("missing evidence, unmatched rounds, unknown identities and duplicate edges fail closed", () => {
  for (const patch of [
    {investor_slug:"unknown"}, {company_slug:"unpublished"}, {source_url:"javascript:alert(1)"},
    {source_url:"https://unbound.example/news"}, {source_name:""}, {round_date:"2026-09-01"},
    {verified_at:"2026-02-30"}, {verified_at:"2026-09-12"}, {role:"guess"},
  ]) assert.throws(() => build([{...participation,...patch} as InvestorParticipation]));
  assert.throws(() => build([participation,participation]));
});

test("a separately sourced role cannot contradict a known lead", () => {
  assert.throws(() => build([{...participation, investor_slug:"lead", role:"participant"}]));
  const map = build([{...participation, investor_slug:"lead", role:"lead"}]);
  assert.equal(map.get("lead")!.length, 1);
});

test("all public investor consumers share the source-bound activity map", () => {
  for (const path of ["src/pages/investors/index.astro", "src/pages/investors/[slug].astro", "src/pages/startups/[slug].astro", "src/pages/sitemap.xml.ts"]) {
    assert.match(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), /getInvestorActivity/);
  }
});

test("checked-in Conveo participation binds to published source evidence without inferring DST or lead roles", () => {
  // Feed disk records through the same pure transform as Vite, without relying
  // on import.meta.glob in Node's test runner.
  const read = (path: string) => JSON.parse(readFileSync(new URL(`../content/${path}`, import.meta.url), "utf8"));
  const readers = createContentReaders({
    records: readdirSync(new URL("../content/startups/", import.meta.url))
      .filter(file => file.endsWith(".json")).map(file => read(`startups/${file}`)),
    timestamps: read("timestamps.json"),
    investorDirectory: read("investors.json"),
    collectionConfigs: read("collections.json"),
  });
  const activity = buildInvestorActivity(readers.getContentNewsEligibleFundingRounds(),
    read("investor-participations.json"), new Set(readers.getContentInvestors().map(investor => investor.slug)),
    resolveInvestorSlugByName, "2026-09-11");
  for (const slug of ["balderton-capital", "visionaries-club", "6-degrees-capital", "yc"]) {
    const rows = activity.get(slug)!.filter(row => row.company_slug === "conveo");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].investor_role, "role_unspecified");
    assert.equal(rows[0].source_url, "https://conveo.ai/mediakit/series-a");
  }
  assert.equal(activity.get("dst-global")?.some(row => row.company_slug === "conveo") ?? false, false);
  assert.match(readers.getContentStartupBySlug("conveo")!.investors!, /^DST Global Partners,/);
  assert.equal(resolveInvestorSlugByName("DST Global Partners"), null);
});
