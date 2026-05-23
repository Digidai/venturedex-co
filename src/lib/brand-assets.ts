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

export function resolveInvestorByName(name?: string | null): InvestorDirectoryEntry | null {
  if (!name) return null;

  const normalized = normalizeBrandText(name);
  const exact = investorDirectory.find((entry) => {
    return [entry.name, entry.short_name]
      .filter(Boolean)
      .some((candidate) => normalizeBrandText(candidate!) === normalized);
  });

  if (exact) return exact;

  return (
    investorDirectory.find((entry) => {
      return [entry.name, entry.short_name]
        .filter(Boolean)
        .some((candidate) => {
          const candidateNormalized = normalizeBrandText(candidate!);
          return (
            normalized.includes(candidateNormalized) ||
            candidateNormalized.includes(normalized)
          );
        });
    }) ?? null
  );
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
