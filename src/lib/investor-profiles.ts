// Pure, build-time research contract. No network access, writes, or D1 changes.
import { LEGACY_INVESTOR_PROFILE_SLUGS } from "./investor-profile-legacy";
export const INVESTOR_REVIEW_DAYS = 90;
const DAY_MS = 86_400_000;
export const INVESTOR_FACT_LABELS = {
  firm_type: "Firm type",
  founded: "Founded",
  stages: "Investment stages",
  sectors: "Areas of focus",
  geographies: "Investment geography",
  offices: "Offices",
  approach: "Investment approach",
  support: "Founder support",
  entity_scope: "Entity scope",
} as const;
export type InvestorFactKey = keyof typeof INVESTOR_FACT_LABELS;
export interface SourcedText { value: string; source_ids: string[] }
export interface InvestorFact {
  key: InvestorFactKey;
  value: string | string[];
  source_ids: string[];
}
export interface InvestorSource {
  id: string;
  label: string;
  url: string;
  checked_at: string;
  source_type?: "official_firm" | "official_related_entity" | "official_portfolio_company" | "regulated_disclosure";
}
export interface InvestorProfile {
  reviewed_at: string;
  summary: SourcedText;
  facts: InvestorFact[];
  sources: InvestorSource[];
}
export interface InvestorReviewAttempt {
  attempted_at: string;
  retry_after: string;
  reason: string;
  source_urls: string[];
}
export interface InvestorProfiles {
  schema_version: 1;
  // Explicit migration exemption; never add a newly created investor here.
  legacy_unresearched: string[];
  profiles: Record<string, InvestorProfile>;
  attempts: Record<string, InvestorReviewAttempt>;
}
export interface ProfileDirectoryEntry { name: string; website?: string }
type Directory = Record<string, ProfileDirectoryEntry>;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function addDays(date: string, days: number): string {
  if (!isDate(date)) throw new Error("Invalid review date: " + date);
  return new Date(Date.parse(date + "T00:00:00Z") + days * DAY_MS).toISOString().slice(0, 10);
}
function plainText(value: unknown, max = 600): value is string {
  return typeof value === "string" && value.trim().length > 0
    && value.length <= max && !/[<>\u0000-\u001f]/.test(value);
}
export function isPublicHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && !u.username && !u.password && !u.port
      && host.includes(".") && !host.endsWith(".local") && !host.endsWith(".localhost")
      && !/^[\d.]+$/.test(host) && !host.includes(":");
  } catch { return false; }
}
function officialHost(url: string, website: string | undefined): boolean {
  if (!isPublicHttpsUrl(website)) return false;
  const host = new URL(url).hostname.replace(/^www\./, "");
  const root = new URL(website).hostname.replace(/^www\./, "");
  // The legacy a16z directory points at its portfolio subdomain. This verified
  // parent is explicit; never generally trust a parent such as github.io.
  return host === root || host.endsWith("." + root)
    || (root === "portfolio.a16z.com" && host === "a16z.com");
}

export function validateInvestorProfiles(
  value: unknown, directory: Directory, today = new Date().toISOString().slice(0, 10)
): string[] {
  const errors: string[] = [];
  const fail = (path: string, message: string) => { errors.push(path + ": " + message); };
  if (!isDate(today)) return ["today: invalid date"];
  if (!record(value) || value.schema_version !== 1 || !record(value.profiles)
    || !Array.isArray(value.legacy_unresearched) || !record(value.attempts)) {
    return ["investor-profiles: expected schema_version 1, profiles, attempts and legacy_unresearched"];
  }
  for (const key of Object.keys(value)) {
    if (!["schema_version", "legacy_unresearched", "profiles", "attempts"].includes(key)) fail(key, "unknown field");
  }
  const legacy = new Set(value.legacy_unresearched);
  if (legacy.size !== value.legacy_unresearched.length) fail("legacy_unresearched", "duplicate slug");
  for (const slug of legacy) {
    if (typeof slug !== "string" || !Object.hasOwn(directory, slug)) fail("legacy_unresearched", "unknown slug");
    if (typeof slug === "string" && !LEGACY_INVESTOR_PROFILE_SLUGS.has(slug)) fail(slug, "new investor cannot use the frozen legacy exemption");
    if (typeof slug === "string" && Object.hasOwn(value.profiles, slug)) fail(slug, "profile must leave legacy_unresearched");
  }
  for (const slug of Object.keys(directory)) {
    if (!legacy.has(slug) && !Object.hasOwn(value.profiles, slug)) fail(slug, "new investor requires a sourced profile");
  }
  for (const [slug, profile] of Object.entries(value.profiles)) {
    if (!Object.hasOwn(directory, slug)) { fail(slug, "unknown canonical investor"); continue; }
    if (!record(profile)) { fail(slug, "invalid profile"); continue; }
    for (const key of Object.keys(profile)) {
      if (!["reviewed_at", "summary", "facts", "sources"].includes(key)) fail(slug + "." + key, "unknown field");
    }
    if (!isDate(profile.reviewed_at) || profile.reviewed_at > today) fail(slug, "reviewed_at must be a real non-future date");
    const sources = Array.isArray(profile.sources) ? profile.sources : [];
    const ids = new Set<string>();
    const urls = new Set<string>();
    if (!sources.length) fail(slug, "at least one substantive official source required");
    let canonicalOfficialSources = 0;
    for (const source of sources) {
      if (!record(source)) { fail(slug, "invalid source"); continue; }
      for (const key of Object.keys(source)) {
        if (!["id", "label", "url", "checked_at", "source_type"].includes(key)) fail(slug, "unknown source field");
      }
      if (!plainText(source.id, 60) || !/^[a-z][a-z0-9_-]*$/.test(source.id) || ids.has(source.id)) {
        fail(slug, "invalid or duplicate source id");
      } else ids.add(source.id);
      if (!plainText(source.label, 160)) fail(slug, "source label required");
      const sourceType = source.source_type ?? "official_firm";
      if (!["official_firm", "official_related_entity", "official_portfolio_company", "regulated_disclosure"].includes(String(sourceType))) {
        fail(slug, "unknown source_type");
      }
      if (!isPublicHttpsUrl(source.url)) {
        fail(slug, "source must use a public HTTPS URL");
      } else if (sourceType === "official_firm" && !officialHost(source.url, directory[slug].website)) {
        fail(slug, "official_firm source must use the canonical official HTTPS host");
      } else {
        if (sourceType === "official_firm") canonicalOfficialSources += 1;
        if (urls.has(source.url)) fail(slug, "duplicate source URL");
        else urls.add(source.url);
      }
      if (!isDate(source.checked_at) || source.checked_at > today || source.checked_at !== profile.reviewed_at) {
        fail(slug, "each source must be checked on reviewed_at; failed attempts cannot refresh a profile");
      }
    }
    if (sources.length && canonicalOfficialSources === 0) {
      fail(slug, "cross-domain primary evidence must be anchored by a canonical official_firm source");
    }
    const checkRefs = (field: Record<string, unknown>, path: string) => {
      if (!Array.isArray(field.source_ids) || !field.source_ids.length
        || new Set(field.source_ids).size !== field.source_ids.length
        || field.source_ids.some((id) => typeof id !== "string" || !ids.has(id))) {
        fail(path, "source_ids must bind to unique, existing sources");
      }
    };
    if (!record(profile.summary) || !plainText(profile.summary.value) || profile.summary.value.length < 20) {
      fail(slug, "substantive summary required");
    } else checkRefs(profile.summary, slug + ".summary");
    const facts = Array.isArray(profile.facts) ? profile.facts : [];
    const keys = new Set<string>();
    if (facts.length < 2) fail(slug, "firm_type and at least one useful sourced fact required");
    for (const fact of facts) {
      if (!record(fact)) { fail(slug, "invalid fact"); continue; }
      if (typeof fact.key !== "string" || !Object.hasOwn(INVESTOR_FACT_LABELS, fact.key) || keys.has(fact.key)) {
        fail(slug, "unknown or duplicate fact key");
      } else keys.add(fact.key);
      const values = Array.isArray(fact.value) ? fact.value : [fact.value];
      if (!values.length || values.length > 20 || values.some((v) => !plainText(v))) fail(slug, "invalid fact value");
      if (fact.key === "founded" && (typeof fact.value !== "string" || !/^\d{4}$/.test(fact.value)
        || Number(fact.value) < 1600 || Number(fact.value) > Number(today.slice(0, 4)))) fail(slug, "invalid founding year");
      checkRefs(fact, slug + "." + String(fact.key));
    }
    if (!keys.has("firm_type")) fail(slug, "firm_type required");
  }
  for (const [slug, attempt] of Object.entries(value.attempts)) {
    if (!Object.hasOwn(directory, slug) || !record(attempt)) { fail(slug, "invalid attempt investor"); continue; }
    if (!isDate(attempt.attempted_at) || attempt.attempted_at > today || !isDate(attempt.retry_after)
      || attempt.retry_after <= attempt.attempted_at || attempt.retry_after > addDays(attempt.attempted_at, 7)) {
      fail(slug, "failed-attempt retry must be 1-7 days after a non-future attempt");
    }
    if (!plainText(attempt.reason) || !Array.isArray(attempt.source_urls) || !attempt.source_urls.length
      || attempt.source_urls.some((url) => !isPublicHttpsUrl(url))) fail(slug, "failed attempt needs reason and exact public HTTPS URLs");
  }
  return errors;
}

export type ReviewAction = "research" | "skip_fresh" | "retry_later";
export function investorReviewDecision(
  profile: InvestorProfile | undefined, attempt: InvestorReviewAttempt | undefined,
  today: string, changed = false
): { action: ReviewAction; reason: string; next_review_at: string } {
  if (!isDate(today)) throw new Error("Invalid planning date");
  if (profile && (!isDate(profile.reviewed_at) || profile.reviewed_at > today)) throw new Error("Invalid profile review date");
  const next = profile ? addDays(profile.reviewed_at, INVESTOR_REVIEW_DAYS) : today;
  if (changed) return { action: "research", reason: "material_change", next_review_at: today };
  if (profile && today < next) return { action: "skip_fresh", reason: "reviewed_within_90_days", next_review_at: next };
  if (attempt && attempt.retry_after > today) {
    return { action: "retry_later", reason: "previous_attempt_incomplete", next_review_at: attempt.retry_after };
  }
  return { action: "research", reason: profile ? "review_due" : "missing_profile", next_review_at: today };
}

export function collectStartupInvestorNames(startup: { investors?: unknown; funding?: unknown }): string[] {
  const values = typeof startup.investors === "string" ? startup.investors.split(",") : [];
  if (Array.isArray(startup.funding)) {
    for (const round of startup.funding) {
      if (record(round) && typeof round.lead_investor === "string") values.push(round.lead_investor);
    }
  }
  const seen = new Set<string>();
  return values.map((v) => v.trim()).filter((name) => {
    const key = name.toLowerCase();
    if (!key || key === "undisclosed" || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function investorIdentityCaution(name: string, slug: string, canonicalName: string): string | null {
  if (slug === "lightspeed" && /\b(india|lsip)\b/i.test(name)) {
    return "Historical alias points to Lightspeed; LSVP and LSIP are independent entities. Verify the exact adviser before attribution.";
  }
  if (name.trim().toLowerCase() !== canonicalName.trim().toLowerCase() && /\s(?:and|&)\s/i.test(name)) {
    return "Composite investor alias resolves to one firm. Verify each named participant separately; do not silently drop the other firm.";
  }
  return null;
}
