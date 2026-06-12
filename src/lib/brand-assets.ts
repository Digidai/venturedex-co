import brandAssetsJson from "../../content/brand-assets.json";
import investorsJson from "../../content/investors.json";

export type BrandShape = "icon" | "wordmark";
export type BrandTileBackground = "light" | "dark";

export interface BrandAsset {
  name: string;
  shape: BrandShape;
  local_path: string;
  source_page: string;
  source_url: string;
  allow_unreachable_source?: boolean;
  tile_background?: BrandTileBackground;
  note?: string;
}

interface BrandAssetManifest {
  verified_at: string;
  companies: Record<string, BrandAsset>;
  investors: Record<string, BrandAsset>;
}

interface InvestorDirectoryEntry {
  name: string;
  slug: string;
  short_name?: string;
  website?: string;
  description?: string;
  // Extra lead/investor strings (as they literally appear in
  // content/startups/*.json funding[].lead_investor or investors) that should
  // resolve to this entry under exact matching. Convention: a multi-firm lead
  // string like "A and B" is aliased to the LEAD (first) firm; scout/program
  // variants like "Sequoia Capital Scout" are aliased to the parent firm.
  aliases?: string[];
}

const manifest = brandAssetsJson as BrandAssetManifest;
const investorDirectory = Object.values(investorsJson as Record<string, InvestorDirectoryEntry>);

function normalizeBrandText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getCompanyBrandAsset(slug?: string | null): BrandAsset | null {
  if (!slug) return null;
  return manifest.companies[slug] ?? null;
}

export function getInvestorBrandAsset(slug?: string | null): BrandAsset | null {
  if (!slug) return null;
  return manifest.investors[slug] ?? null;
}

function entryCandidates(entry: InvestorDirectoryEntry): string[] {
  return [entry.name, entry.short_name, ...(entry.aliases ?? [])].filter(
    (candidate): candidate is string => Boolean(candidate)
  );
}

// Resolve a lead/investor string to a directory entry by EXACT normalized match
// against the entry's name, short_name, or any of its aliases[]. Matching is
// intentionally exact (no substring/word-sequence fallback): substring matching
// produced false positives (short names like "KP"/"GC" matching unrelated firms)
// and order-dependent mis-attribution for multi-firm strings. This keeps the
// resolver provably equivalent to the exact+alias Python resolver in
// scripts/investor_utils.py. Multi-firm lead strings (e.g. "A and B") are
// handled via an explicit alias on the lead firm in content/investors.json.
export function resolveInvestorByName(name?: string | null): InvestorDirectoryEntry | null {
  if (!name) return null;

  const normalized = normalizeBrandText(name);
  if (!normalized) return null;

  return (
    investorDirectory.find((entry) =>
      entryCandidates(entry).some((candidate) => normalizeBrandText(candidate) === normalized)
    ) ?? null
  );
}

export function resolveInvestorSlugByName(name?: string | null): string | null {
  return resolveInvestorByName(name)?.slug ?? null;
}

export function getBrandInitials(name?: string | null): string {
  if (!name) return "?";

  const normalized = name
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .trim();

  if (!normalized) return "?";

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function getBrandManifestVerifiedAt(): string {
  return manifest.verified_at;
}
