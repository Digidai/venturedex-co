import type { Startup } from "./types";

export type CategoryDimension = "industry" | "stage" | "region";
interface CategoryDefinition {
  dimension: CategoryDimension;
  slug: string;
  label: string;
  value: string;
  intro: string;
  question: string;
}
export interface CategoryPage extends CategoryDefinition {
  path: string;
  title: string;
  scope: string;
  startups: Startup[];
  lastmod: string;
}

export const CATEGORY_CONTENT_UPDATED = "2026-09-13";
export const CATEGORY_DIMENSIONS = [
  { key: "industry", label: "Industries", description: "Start with the product category recorded in each company profile." },
  { key: "stage", label: "Funding stages", description: "Compare companies by their latest recorded funding stage, not every historical round." },
  { key: "region", label: "Regions", description: "Explore our existing regional coverage, without inferred city or country labels." },
] as const;

const industries = [
  ["ai-ml", "AI & machine learning", "AI / ML", "Explore products classified as AI or machine learning, from model infrastructure to applied workflows. Compare the actual product and intended user before treating two companies as competitors.", "What part of the workflow is automated, and which claims have product evidence?"],
  ["devtools", "Developer tools", "DevTools", "Explore tools built for software development, infrastructure, and technical teams. Use the linked profiles to compare developer adoption paths, integrations, and deployment requirements.", "Who adopts the tool, and what would make a team switch from its existing stack?"],
  ["saas", "SaaS", "SaaS", "Explore software-as-a-service companies in our research directory. This is a broad product classification; the company summaries help distinguish buyers, workflows, and business models within it.", "Which buyer owns the problem, and how does the product fit into an existing workflow?"],
  ["fintech", "Fintech", "Fintech", "Explore financial technology products with linked company and funding research. A shared category does not imply the same financial product, regulatory position, or customer segment.", "What financial activity does the product support, and what dependencies remain unverified?"],
  ["healthtech", "Health technology", "HealthTech", "Explore healthcare and life-science technology companies covered by VentureDex. Distinguish product availability, clinical claims, and research-stage work using the original sources in each profile.", "What is available today, and which clinical or operational claims still need validation?"],
  ["climate", "Climate & sustainability", "Climate / Sustainability", "Explore products classified as climate or sustainability technology. Compare the intended application, deployment conditions, and evidence behind impact claims rather than assuming a common business model.", "Which impact claim is measured, and what is required to deploy the product?"],
  ["marketplaces", "Marketplaces", "Marketplace", "Explore companies whose recorded product category is marketplace. Read the profiles to identify both sides of the market and the transaction or matching problem each product addresses.", "Who participates on each side, and what evidence supports repeat usage?"],
  ["education", "Education technology", "EdTech", "Explore education technology companies in the published directory. This cohort reflects our current research coverage, not a comprehensive list of learning products or a judgment of educational effectiveness.", "Who learns, who pays, and what evidence supports the claimed learning outcome?"],
  ["creator-tools", "Creator tools", "Creator Tools", "Explore tools classified for creators, media production, and creative workflows. Compare the concrete output, workflow integration, and intended user through the linked company research.", "Which creative task becomes easier, and where is human review still needed?"],
  ["ecommerce", "E-commerce", "E-commerce", "Explore companies classified as e-commerce technology. Use the profiles to distinguish merchant infrastructure, storefront experiences, and operational products before comparing their positioning.", "Which commerce workflow changes, and how can its operational value be verified?"],
];
const stages = [
  ["pre-seed", "Pre-seed", "Pre-Seed", "Early product and customer evidence can be limited at pre-seed. This cohort includes only companies whose latest recorded round carries that stage; funding is not proof of product-market fit."],
  ["seed", "Seed", "Seed", "Compare companies whose latest recorded funding stage is seed. Look for product availability, target users, and early adoption evidence in the profiles; the stage alone does not establish traction."],
  ["pre-series-a", "Pre-Series A", "Pre-Series A", "Explore companies with a latest recorded Pre-Series A round. Stage labels vary between sources and markets, so compare the dated funding source and product evidence rather than assuming equal maturity."],
  ["series-a", "Series A", "Series A", "Explore companies whose latest recorded round is Series A. Compare the product wedge, customer context, and open questions in each profile; a financing label is not a standardized measure of business maturity."],
  ["series-b", "Series B", "Series B", "Explore companies whose latest recorded funding stage is Series B. The linked research lets you examine what is being expanded and which product or market claims have supporting sources."],
  ["series-c", "Series C", "Series C", "Explore companies whose latest recorded funding stage is Series C. Compare the product scope and source-backed context without treating fundraising as evidence of profitability or market leadership."],
  ["series-d-plus", "Series D and later", "Series D+", "Explore companies with a latest recorded Series D or later lettered round. This broader grouping keeps later-stage coverage navigable while preserving the exact recorded stage on each company profile."],
];
const regions = [
  ["us", "United States", "US", "Explore company profiles tagged with the United States region in our directory. This is a coverage view of recorded regional classification, not a claim about every office, customer, or legal entity."],
  ["europe", "Europe", "Europe", "Explore company profiles assigned to Europe in our current research taxonomy. The regional grouping does not imply a single country or regulatory market; inspect each profile for more specific location context."],
  ["china-asia", "China / Asia", "China / Asia", "Explore profiles in our existing China / Asia regional grouping. This broad legacy classification is shown explicitly rather than being converted into unsupported country or city claims."],
  ["latin-america", "Latin America", "Latin America", "Explore our published company coverage classified as Latin America. This is a selective research cohort, not a complete regional market map; country-specific details belong to the original company sources."],
  ["africa", "Africa", "Africa", "Explore published profiles classified under Africa in our directory. The cohort reflects current coverage and should not be treated as representative of the continent's varied startup markets."],
  ["global-remote", "Global / distributed", "Global / Remote", "Explore profiles carrying our Global / Remote regional label. It denotes broad or distributed company coverage, not verified remote job availability, employment policy, or a particular headquarters."],
];
const definitions: CategoryDefinition[] = [
  ...industries.map(([slug, label, value, intro, question]) => ({dimension: "industry" as const, slug, label, value, intro, question})),
  ...stages.map(([slug, label, value, intro]) => ({dimension: "stage" as const, slug, label, value, intro, question: "What does the dated funding source establish, and which product or commercial claims remain open?"})),
  ...regions.map(([slug, label, value, intro]) => ({dimension: "region" as const, slug, label, value, intro, question: "Which markets and users does the product actually serve, and what location details are source-backed?"})),
];
const fieldFor = { industry: "product_type", stage: "funding_stage", region: "region" } as const;

export function buildCategoryPages(startups: Startup[]): CategoryPage[] {
  const unique = [...new Map(startups.filter(s => s.workflow_status === "published").map(s => [s.slug, s])).values()]
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "") || a.slug.localeCompare(b.slug));
  return definitions.flatMap(def => {
    const members = unique.filter(s => def.value === "Series D+"
      ? /^Series [D-Z](?:\+)?$/.test(s.funding_stage ?? "")
      : s[fieldFor[def.dimension]] === def.value);
    if (!members.length) return [];
    const scope = def.dimension === "stage"
      ? `Published profiles whose latest recorded funding stage is ${def.label}. Historical rounds do not determine membership; later unrecorded rounds may exist.`
      : `Published profiles with the recorded ${def.dimension === "industry" ? "product category" : "region"} “${def.value}”. No inferred locations, tag-based expansion, or unpublished companies are included.`;
    return [{...def, path: `/categories/${def.dimension}/${def.slug}`, title: `${def.label} startups`, scope, startups: members,
      lastmod: [CATEGORY_CONTENT_UPDATED, ...members.map(s => (s.updated_at || s.published_at || "").slice(0, 10))].sort().at(-1)!}];
  });
}

export function categoryBreakdown(startups: Startup[], field: "product_type" | "funding_stage" | "region") {
  const counts = new Map<string, number>();
  for (const startup of startups) {
    const label = startup[field] || "Not recorded";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => ({label, count})).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function categoryEvidence(startup: Pick<Startup, "research_json">): {reviewedAt: string | null; sources: {label: string; url: string}[]} {
  try {
    const research = JSON.parse(startup.research_json || "{}");
    const date = typeof research?.verified_at === "string" ? research.verified_at.slice(0, 10) : "";
    const parsed = new Date(`${date}T00:00:00Z`);
    const reviewedAt = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
    const sources = new Map<string, {label: string; url: string}>();
    for (const source of Array.isArray(research?.sources) ? research.sources : []) {
      if (typeof source?.url !== "string" || typeof source?.label !== "string" || !source.label.trim()) continue;
      try {
        if (!/^https?:$/.test(new URL(source.url).protocol)) continue;
        if (!sources.has(source.url)) sources.set(source.url, {label: source.label, url: source.url});
      } catch { /* A malformed source never becomes an outbound link. */ }
    }
    return {reviewedAt, sources: [...sources.values()]};
  } catch { return {reviewedAt: null, sources: []}; }
}
