import type {
  StartupLinks,
  StartupResearch,
  StartupResearchEvidence,
  StartupResearchRisk,
  StartupResearchSource,
} from "./types";

/**
 * Reusable defensive JSON helpers.
 *
 * DB-sourced JSON columns (research_json, links_json, ...) are stored as opaque
 * strings. `JSON.parse(value) as T` only guards against invalid JSON syntax — a
 * structurally malformed-but-valid payload (e.g. an array where an object is
 * expected, or a number where a string is expected) would silently produce a
 * value that crashes a page at render time or pollutes downstream output. These
 * helpers parse and then *narrow* the result so callers always get a value of
 * the shape they expect, degrading to empty/null on anything unexpected.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** A trimmed string, or undefined when the value is missing/empty/non-string. */
export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Parse `value` as JSON and narrow it with `narrow`. Returns null when the input
 * is empty, the JSON is invalid, or narrowing throws.
 */
export function safeJsonParse<T>(
  value: string | null | undefined,
  narrow: (value: unknown) => T
): T | null {
  if (!value) return null;
  try {
    return narrow(JSON.parse(value));
  } catch {
    return null;
  }
}

/**
 * Narrow an arbitrary value into StartupLinks, copying only the known string
 * fields. Unknown keys and non-string values are dropped.
 */
export function normalizeLinks(value: unknown): StartupLinks {
  if (!isRecord(value)) return {};

  const links: StartupLinks = {};
  const github = optionalString(value.github);
  const twitter = optionalString(value.twitter);
  const linkedin = optionalString(value.linkedin);
  const producthunt = optionalString(value.producthunt);

  if (github) links.github = github;
  if (twitter) links.twitter = twitter;
  if (linkedin) links.linkedin = linkedin;
  if (producthunt) links.producthunt = producthunt;

  return links;
}

const RESEARCH_SOURCE_TYPES: ReadonlySet<StartupResearchSource["type"]> = new Set([
  "official",
  "funding",
  "product",
  "repository",
  "social",
  "editorial",
]);

function normalizeResearchSource(value: unknown): StartupResearchSource | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  if (!id) return null;
  const type = value.type;
  return {
    id,
    label: stringValue(value.label),
    url: optionalString(value.url),
    type:
      typeof type === "string" && RESEARCH_SOURCE_TYPES.has(type as StartupResearchSource["type"])
        ? (type as StartupResearchSource["type"])
        : "editorial",
  };
}

function normalizeResearchEvidence(value: unknown): StartupResearchEvidence | null {
  if (!isRecord(value)) return null;
  const claim = stringValue(value.claim);
  if (!claim) return null;
  return {
    claim,
    source_ids: stringArray(value.source_ids),
  };
}

function normalizeResearchRisk(value: unknown): StartupResearchRisk | null {
  if (!isRecord(value)) return null;
  const claim = stringValue(value.claim);
  if (!claim) return null;
  return {
    claim,
    basis: stringValue(value.basis),
  };
}

function normalizeMarketContext(value: unknown): StartupResearch["market_context"] {
  if (!isRecord(value)) return undefined;
  const context: NonNullable<StartupResearch["market_context"]> = {};
  const primaryUser = optionalString(value.primary_user);
  const category = optionalString(value.category);
  const differentiation = optionalString(value.differentiation);
  const whyNow = optionalString(value.why_now);

  if (primaryUser) context.primary_user = primaryUser;
  if (category) context.category = category;
  if (differentiation) context.differentiation = differentiation;
  if (whyNow) context.why_now = whyNow;

  return Object.keys(context).length > 0 ? context : undefined;
}

/**
 * Narrow an arbitrary value into StartupResearch, defensively narrowing the
 * sources / product_evidence / risks arrays and dropping malformed entries.
 * Returns null when the value is not an object.
 */
export function normalizeResearch(value: unknown): StartupResearch | null {
  if (!isRecord(value)) return null;

  const sources = Array.isArray(value.sources)
    ? value.sources
        .map(normalizeResearchSource)
        .filter((source): source is StartupResearchSource => Boolean(source))
    : [];

  const productEvidence = Array.isArray(value.product_evidence)
    ? value.product_evidence
        .map(normalizeResearchEvidence)
        .filter((item): item is StartupResearchEvidence => Boolean(item))
    : [];

  const risks = Array.isArray(value.risks)
    ? value.risks
        .map(normalizeResearchRisk)
        .filter((risk): risk is StartupResearchRisk => Boolean(risk))
    : [];

  const research: StartupResearch = {
    verified_at: stringValue(value.verified_at),
    sources,
    product_evidence: productEvidence,
  };

  const marketContext = normalizeMarketContext(value.market_context);
  if (marketContext) research.market_context = marketContext;
  if (risks.length > 0) research.risks = risks;

  return research;
}
