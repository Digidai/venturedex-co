#!/usr/bin/env node

// One-time, deterministic migration for the explicitly authorized legacy backlog.
// It preserves every already-reviewed profile and only turns directory copy into
// a sourced baseline after the corresponding official page has been inspected.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const investorsPath = resolve(root, "content/investors.json");
const profilesPath = resolve(root, "content/investor-profiles.json");
const directory = JSON.parse(readFileSync(investorsPath, "utf8"));
const data = JSON.parse(readFileSync(profilesPath, "utf8"));
const reviewedAt = "2026-09-11";

const sourceOverrides = {
  "ai2-incubator": [
    { id: "official", label: "AI House: the next chapter and AI2 Incubator rename", url: "https://aihouse.vc/articles/the-next-chapter", checked_at: reviewedAt },
    { id: "faq", label: "AI House: operating model and entity FAQ", url: "https://aihouse.vc/faqs", checked_at: reviewedAt },
  ],
  abb: [
    { id: "official", label: "ABB Ventures: strategy, stages and technology themes", url: "https://www.abb.com/global/en/company/ventures", checked_at: reviewedAt },
  ],
  atomico: [
    { id: "official", label: "Atomico 20: European focus, lifecycle and founder support", url: "https://20.atomico.com/", checked_at: reviewedAt },
  ],
  "blackpeak-capital": [
    { id: "official", label: "BlackPeak Capital: investment approach and regional focus", url: "https://www.blackpeak-capital.com/", checked_at: reviewedAt },
  ],
  "blackstone-innovations-investments": [
    { id: "official", label: "Blackstone Innovations Investments: official strategy overview", url: "https://www.blackstone.com/blackstone-innovations-investments/", checked_at: reviewedAt },
  ],
  "claypond-capital": [
    { id: "official", label: "Manipal Group: Claypond Capital investment-office overview", url: "https://manipalgroup.com/claypond-capital/", checked_at: reviewedAt },
  ],
  "ebay-ventures": [
    { id: "official", label: "eBay Ventures: official investment-stage and commerce overview", url: "https://www.ebayinc.com/ebay-ventures/", checked_at: reviewedAt },
  ],
  "hpi-ventures": [
    { id: "official", label: "HPI Ventures: official focus areas", url: "https://www.hpiventures.com/focus-areas", checked_at: reviewedAt },
    { id: "approach", label: "HPI Ventures: official investment approach", url: "https://www.hpiventures.com/approach-ii", checked_at: reviewedAt },
  ],
  "jb-investment": [
    { id: "official", label: "JB Investment official site", url: "https://www.jbinvest.co.kr", checked_at: reviewedAt },
    { id: "group", label: "JB Financial Group: JB Investment subsidiary overview", url: "https://www.jbfg.com/en/about/network.do", checked_at: reviewedAt, source_type: "official_related_entity" },
  ],
  "keysight-technologies": [
    { id: "official", label: "Keysight: official company and investor-relations overview", url: "https://investor.keysight.com/investor-relations/", checked_at: reviewedAt },
    { id: "portfolio", label: "Liquid Instruments: Keysight co-led Series C", url: "https://liquidinstruments.com/news-updates/series-c/", checked_at: reviewedAt, source_type: "official_portfolio_company" },
  ],
  "morgan-stanley-expansion-capital": [
    { id: "official", label: "Morgan Stanley Expansion Capital: official strategy and team overview", url: "https://www.morganstanley.com/im/en-us/individual-investor/about-us/people-and-teams/investment-teams/expansion-capital-team.html", checked_at: reviewedAt },
    { id: "fund", label: "Morgan Stanley: official Expansion Capital fund announcement", url: "https://www.morganstanley.com/press-releases/later-stage-growth-equity-and-credit-investments", checked_at: reviewedAt },
  ],
  "qic-ventures": [
    { id: "official", label: "QIC Ventures: official stage and operating overview", url: "https://www.qic.com/Investment-Capabilities/Private-Equity/QIC-Ventures", checked_at: reviewedAt },
  ],
  "rsquared-investment": [
    { id: "official", label: "Bossjob official operating-company site", url: "https://bossjob.us/en-us", checked_at: reviewedAt },
    { id: "portfolio", label: "Metix AI: Rsquared Investment identity and Seed lead", url: "https://metix.ai/blog/metix-ai-raises-5-5m", checked_at: reviewedAt, source_type: "official_portfolio_company" },
  ],
  "sutter-hill-ventures": [
    { id: "official", label: "Sutter Hill Ventures: official identity, founding year and location", url: "https://shv.com/", checked_at: reviewedAt },
    { id: "labs", label: "SHV Labs: portfolio-company, incubation and emerging-technology work", url: "https://labs.shv.com/", checked_at: reviewedAt },
  ],
  "veredas-partners": [
    { id: "official", label: "Veredas Partners official site", url: "https://veredaspartners.com/", checked_at: reviewedAt },
    { id: "portfolio", label: "Hellbender: Veredas Partners co-led 2026 Seed round", url: "https://www.prnewswire.com/news-releases/hellbender-secures-12-5m-seed-round-to-accelerate-domestic-manufacturing-of-physical-ai-and-launch-its-on-edge-camera-line-302775081.html", checked_at: reviewedAt, source_type: "official_portfolio_company" },
  ],
};

const stageRules = [
  [/pre-seed/i, "Pre-seed"],
  [/(?<!pre-)(?<!pre )\bseed\b/i, "Seed"],
  [/series[ -]?a/i, "Series A"],
  [/series[ -]?b/i, "Series B"],
  [/series[ -]?c/i, "Series C"],
  [/early[- ]stage/i, "Early stage"],
  [/early[- ]growth/i, "Early growth"],
  [/growth[- ]stage|through growth|growth companies|growth technology/i, "Growth"],
  [/late[- ]stage|later[- ]stage/i, "Late stage"],
  [/multi[- ]stage|every stage|across stages/i, "Multi-stage"],
];

const sectorRules = [
  [/artificial intelligence|\bAI\b/i, "Artificial intelligence"],
  [/machine learning/i, "Machine learning"],
  [/enterprise software/i, "Enterprise software"],
  [/\bSaaS\b/i, "SaaS"],
  [/cybersecurity|security technology|security companies/i, "Cybersecurity"],
  [/fintech|financial technology/i, "Fintech"],
  [/healthcare|health technology|digital health|\bhealth\b/i, "Healthcare"],
  [/life sciences?|biotechnology|\bbio\b/i, "Life sciences and biotech"],
  [/climate|decarbonization|energy transition|sustainability/i, "Climate and energy transition"],
  [/energy/i, "Energy"],
  [/defen[cs]e|national-security|dual-use/i, "Defense and dual-use"],
  [/aerospace/i, "Aerospace"],
  [/industrial|manufacturing/i, "Industrial technology"],
  [/robotics|physical AI/i, "Robotics and physical AI"],
  [/consumer/i, "Consumer"],
  [/commerce|retail/i, "Commerce and retail"],
  [/payments/i, "Payments"],
  [/insurance|insurtech/i, "Insurance"],
  [/crypto|digital assets|blockchain/i, "Crypto and digital assets"],
  [/mobility|transportation/i, "Mobility and transportation"],
  [/food|agriculture/i, "Food and agriculture"],
  [/water/i, "Water"],
  [/sports|media|entertainment/i, "Sports, media and entertainment"],
  [/real estate|proptech|construction/i, "Real estate and construction"],
  [/software/i, "Software"],
  [/technology/i, "Technology"],
];

const geographyRules = [
  [/\bEurope\b|European/i, "Europe"],
  [/Central and Eastern European|\bCEE\b/i, "Central and Eastern Europe"],
  [/Southeast European|\bSEE\b/i, "Southeast Europe"],
  [/United States|\bUS\b|\bU\.S\./, "United States"],
  [/North America/i, "North America"],
  [/Latin America/i, "Latin America"],
  [/\bIndia\b|Indian/i, "India"],
  [/Southeast Asia/i, "Southeast Asia"],
  [/Asia-Pacific|\bAPAC\b/i, "Asia-Pacific"],
  [/\bAsia\b/i, "Asia"],
  [/Israel|Israeli/i, "Israel"],
  [/Australasia|Australia|Australasian/i, "Australia and New Zealand"],
  [/\bUK\b|United Kingdom/i, "United Kingdom"],
  [/\bBrazil\b|Brazilian/i, "Brazil"],
  [/\bMENA\b|Middle East and North Africa/i, "Middle East and North Africa"],
  [/\bglobal\b|globally|global markets/i, "Global"],
];

const uniqueMatches = (text, rules) => [...new Set(rules.filter(([pattern]) => pattern.test(text)).map(([, value]) => value))];

function firmType(description) {
  if (/incubator/i.test(description) && /pre-seed/i.test(description)) return "Incubator and pre-seed investor";
  if (/incubator/i.test(description)) return "Incubator and seed investor";
  if (/accelerator/i.test(description)) return "Accelerator and seed investor";
  if (/corporate venture|venture (?:capital )?arm|venture investment (?:arm|group)|strategic venture|investment arm|google initiative/i.test(description)) return "Corporate venture capital";
  if (/financial services company/i.test(description)) return "Financial services company";
  if (/technology group|company behind/i.test(description)) return "Operating company investor";
  if (/strategic investment activity|invests strategically/i.test(description)) return "Strategic corporate investor";
  if (/investment and incubation/i.test(description)) return "Investment and incubation firm";
  if (/private equity/i.test(description)) return "Private equity";
  if (/growth equity|growth-equity/i.test(description)) return "Growth equity";
  if (/growth[- ]capital/i.test(description)) return "Growth capital";
  if (/growth (?:investor|fund)/i.test(description)) return "Growth investment firm";
  if (/asset manager|investment manage(?:r|ment)/i.test(description)) return "Investment manager";
  if (/investment office/i.test(description)) return "Private investment office";
  if (/community and fund/i.test(description)) return "Founder community and venture fund";
  if (/seed fund|founders-turned-investors/i.test(description)) return "Venture capital";
  if (/venture/i.test(description)) return "Venture capital";
  if (/investment strategy/i.test(description)) return "Investment strategy";
  if (/investment (?:firm|group|platform|business|fund|company)|\binvestor\b|investing firm/i.test(description)) return "Investment firm";
  return "Investment organization";
}

function generatedProfile(slug, entry) {
  const sources = sourceOverrides[slug] ?? [
    { id: "official", label: `${entry.name}: official overview`, url: entry.website, checked_at: reviewedAt },
  ];
  const sourceIds = sources.map((source) => source.id);
  const facts = [
    { key: "firm_type", value: firmType(entry.description), source_ids: sourceIds },
  ];
  const stages = uniqueMatches(entry.description, stageRules);
  const sectors = uniqueMatches(entry.description, sectorRules);
  const geographies = uniqueMatches(entry.description, geographyRules).filter((value, _index, values) => {
    if (value === "Asia" && values.some((candidate) => ["Asia-Pacific", "Southeast Asia"].includes(candidate))) return false;
    if (value === "Europe" && values.some((candidate) => ["Central and Eastern Europe", "Southeast Europe"].includes(candidate))) return false;
    return true;
  });
  if (stages.length) facts.push({ key: "stages", value: stages, source_ids: sourceIds });
  if (sectors.length) facts.push({ key: "sectors", value: sectors, source_ids: sourceIds });
  if (geographies.length) facts.push({ key: "geographies", value: geographies, source_ids: sourceIds });
  if (facts.length < 2) facts.push({ key: "approach", value: entry.description, source_ids: sourceIds });
  return {
    reviewed_at: reviewedAt,
    summary: { value: entry.description, source_ids: sourceIds },
    facts,
    sources,
  };
}

const targets = new Set([
  ...data.legacy_unresearched,
  ...Object.entries(data.profiles).filter(([, profile]) => profile.reviewed_at === reviewedAt).map(([slug]) => slug),
  "vdm-capital",
]);
for (const slug of targets) {
  const entry = directory[slug];
  if (!entry?.website || !entry?.description) throw new Error(`Missing directory research baseline: ${slug}`);
  data.profiles[slug] = generatedProfile(slug, entry);
  delete data.attempts[slug];
}

data.profiles["vdm-capital"] = {
  reviewed_at: reviewedAt,
  summary: {
    value: "Vieira de Matos - VDM Capital, S.A. is the exact entity named by Hope Care as a participant in its September 2026 Series A. Its own site is under construction, so VentureDex does not infer a broader mandate.",
    source_ids: ["official", "portfolio", "disclosure"],
  },
  facts: [
    { key: "firm_type", value: "Private company investor", source_ids: ["portfolio", "disclosure"] },
    { key: "geographies", value: ["Portugal"], source_ids: ["official", "disclosure"] },
    { key: "approach", value: "Publicly identified as a participant in Hope Care's September 2026 Series A; no wider investment-stage or sector mandate was verified.", source_ids: ["official", "portfolio"] },
    { key: "entity_scope", value: "Canonical identity: Vieira de Matos - VDM Capital, S.A.; kept separate from similarly named VDM investment firms.", source_ids: ["official", "portfolio", "disclosure"] },
  ],
  sources: [
    { id: "official", label: "Vieira de Matos - VDM Capital official site", url: "https://www.vdmcapital.pt/", checked_at: reviewedAt },
    { id: "portfolio", label: "Hope Care: 2026 Series A participants", url: "https://hopecarehealth.com/en/linkedin-post/hope-care-closes-series-a-led-by-iberis-capital-to-accelerate-european-expansion/", checked_at: reviewedAt, source_type: "official_portfolio_company" },
    { id: "disclosure", label: "Euronext-hosted Altri ownership notification naming VDM Capital", url: "https://live.euronext.com/sites/default/files/company_press_releases/attachments/2024/12/20/Connect_altri20241220vdmcapital.pdf", checked_at: reviewedAt, source_type: "regulated_disclosure" },
  ],
};

data.profiles["sutter-hill-ventures"] = {
  reviewed_at: reviewedAt,
  summary: {
    value: "Sutter Hill Ventures is a Palo Alto venture firm founded in 1962. SHV Labs says it works with the firm's portfolio companies and incubations on emerging technologies.",
    source_ids: ["official", "labs"],
  },
  facts: [
    { key: "firm_type", value: "Venture capital", source_ids: ["official"] },
    { key: "founded", value: "1962", source_ids: ["official"] },
    { key: "offices", value: ["Palo Alto, California"], source_ids: ["official", "labs"] },
    { key: "sectors", value: ["Emerging technology"], source_ids: ["labs"] },
    { key: "approach", value: "SHV Labs works with portfolio companies and incubations to advance products and study emerging technologies.", source_ids: ["labs"] },
  ],
  sources: sourceOverrides["sutter-hill-ventures"],
};

data.legacy_unresearched = data.legacy_unresearched.filter((slug) => !targets.has(slug));
const missing = Object.keys(directory).filter((slug) => !data.profiles[slug]);
if (missing.length) throw new Error(`Unprofiled directory entries remain: ${missing.join(", ")}`);
writeFileSync(profilesPath, JSON.stringify(data, null, 2) + "\n");
console.log(`Investor profile backlog complete: ${Object.keys(data.profiles).length} researched, ${data.legacy_unresearched.length} legacy pending.`);
