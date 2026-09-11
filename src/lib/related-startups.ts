import type { Startup } from "./types";

// Broad labels are useful navigation facets, but cannot establish product relevance.
const generic = new Set(["ai", "ai agents", "ai/ml", "ai / ml", "artificial intelligence", "machine learning", "enterprise software", "enterprise", "b2b", "b2c", "saas", "software", "automation", "platform", "cloud", "api", "other", "devtools"]);
const normalize = (text: string) => text.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
function specificTags(startup: Startup): Set<string> {
  return new Set((startup.tags ?? "").split(",").map(normalize).filter(tag => tag && !generic.has(tag)));
}
function category(startup: Startup): string {
  try {
    const value = JSON.parse(startup.research_json ?? "null")?.market_context?.category;
    const normalized = typeof value === "string" ? normalize(value) : "";
    return generic.has(normalized) ? "" : normalized;
  } catch { return ""; }
}

export function rankRelatedStartups(startup: Startup, candidates: Startup[], limit = 4): Startup[] {
  const tags = specificTags(startup);
  const market = category(startup);
  return candidates
    .filter(candidate => candidate.slug !== startup.slug && candidate.workflow_status === "published")
    .map(candidate => {
      const shared = [...specificTags(candidate)].filter(tag => tags.has(tag)).length;
      const sameMarket = Boolean(market && market === category(candidate));
      return { candidate, score: shared * 4 + (sameMarket ? 6 : 0) };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score
      || (b.candidate.published_at ?? "").localeCompare(a.candidate.published_at ?? "")
      || a.candidate.slug.localeCompare(b.candidate.slug))
    .slice(0, Math.max(0, limit))
    .map(item => item.candidate);
}
