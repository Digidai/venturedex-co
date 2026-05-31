import { assertValidStartup } from "./content-schema";
import {
  createContentReaders,
  isRecord,
  type CollectionConfig,
  type InvestorDirectoryEntry,
  type JsonRecord,
  type TimestampEntry,
} from "./content-transform";
import investorsJson from "../../content/investors.json";
import timestampsJson from "../../content/timestamps.json";
import collectionsJson from "../../content/collections.json";

/**
 * Build-time content readers.
 *
 * Thin Vite layer over the pure transform in content-transform.ts: it globs the
 * version-controlled content/ JSON (eager, so detail pages can PRERENDER at build
 * time where the D1 binding is unavailable), validates each startup record, and
 * hands the raw records + sidecars to createContentReaders.
 *
 * The transform mirrors scripts/build-db.sh's seed semantics byte-for-byte, and
 * tests/content-parity.test.ts feeds the same files through the same transform to
 * diff against the Python seed — so the prerender path and the D1 seed can't drift.
 */

type JsonModule = { default: unknown } | unknown;

const startupModules = import.meta.glob("../../content/startups/*.json", { eager: true });

function moduleValue(module: JsonModule): unknown {
  if (module && typeof module === "object" && "default" in module) {
    return (module as { default: unknown }).default;
  }
  return module;
}

// Validate every startup record once at module load (build time, and worker
// startup) so a malformed file fails fast with its path, rather than silently
// rendering a broken card or diverging from the D1 seed.
const records: JsonRecord[] = Object.entries(startupModules)
  .map(([path, module]) => ({ path, value: moduleValue(module) }))
  .filter((entry): entry is { path: string; value: JsonRecord } => isRecord(entry.value))
  .map((entry) => {
    assertValidStartup(entry.value, entry.path);
    return entry.value;
  });

// Strip the __doc__ sentinel key, mirroring build-db.sh's timestamp filter.
const timestamps: Record<string, TimestampEntry> = Object.fromEntries(
  Object.entries(timestampsJson as Record<string, unknown>).filter(
    ([key]) => !key.startsWith("__")
  )
) as Record<string, TimestampEntry>;

const readers = createContentReaders({
  records,
  timestamps,
  investorDirectory: investorsJson as Record<string, InvestorDirectoryEntry>,
  collectionConfigs: collectionsJson as CollectionConfig[],
});

export const getContentStartups = readers.getContentStartups;
export const getContentStartupBySlug = readers.getContentStartupBySlug;
export const getContentStartupsPublishedBetween = readers.getContentStartupsPublishedBetween;
export const getContentRelatedStartups = readers.getContentRelatedStartups;
export const getContentFundingRoundsForStartup = readers.getContentFundingRoundsForStartup;
export const getContentNewsEligibleFundingRounds = readers.getContentNewsEligibleFundingRounds;
export const getContentInvestors = readers.getContentInvestors;
export const getContentInvestorBySlug = readers.getContentInvestorBySlug;
export const getContentCollections = readers.getContentCollections;
export const getContentCollectionBySlug = readers.getContentCollectionBySlug;
