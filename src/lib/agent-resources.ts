import { createHash } from "node:crypto";
import { normalizeLinks, normalizeResearch, safeJsonParse } from "./json";
import {
  DEFAULT_SITE_URL,
  absoluteUrl,
  escapeMarkdown,
  getSiteUrl,
  normalizeExternalUrl,
  splitCsv,
} from "./seo";
import type { FundingRound, Startup } from "./types";

const SCHEMA_VERSION = "2026-09-08";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function recordedTimestamp(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : null;
}

export function startupResourceUrls(slug: string, siteUrl = DEFAULT_SITE_URL) {
  const html = absoluteUrl(`/startups/${slug}`, getSiteUrl(siteUrl));
  return { html, json: `${html}.json`, markdown: `${html}.md` };
}

function datesForStartup(startup: Startup) {
  const publishedAt = recordedTimestamp(startup.published_at);
  const updatedAt = recordedTimestamp(startup.updated_at);
  return {
    published_at: publishedAt,
    // Without an authored update the build-time reader falls back to publication.
    // An equal timestamp or build time is not evidence of a separate update.
    updated_at: publishedAt && updatedAt && updatedAt > publishedAt ? updatedAt : null,
  };
}

export function buildStartupAgentResource(input: {
  startup: Startup;
  fundingRounds: FundingRound[];
  siteUrl?: string;
}) {
  const { startup } = input;
  const representations = startupResourceUrls(startup.slug, input.siteUrl);
  const research = safeJsonParse(startup.research_json, normalizeResearch);
  const sources = (research?.sources ?? []).map((source) => ({
    id: source.id,
    label: source.label,
    type: source.type,
    url: normalizeExternalUrl(source.url),
  }));
  const fundingRounds = input.fundingRounds
    .filter((round) => round.company_slug === startup.slug)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .map((round) => {
      const sourceUrl = normalizeExternalUrl(round.source_url);
      let sourceIds = sourceUrl ? sources.filter((source) => source.url === sourceUrl).map((source) => source.id) : [];
      if (sourceUrl && sourceIds.length === 0) {
        let id = `funding-${digest(sourceUrl)}`;
        while (sources.some((source) => source.id === id)) id = `${id}-funding`;
        sources.push({ id, label: round.source_name || "Funding source", type: "funding", url: sourceUrl });
        sourceIds = [id];
      }
      return {
        id: `${representations.html}#funding-${digest(round.id)}`,
        amount: round.amount,
        stage: round.stage,
        date: round.date || null,
        lead_investor: round.lead_investor,
        source_ids: sourceIds,
      };
    });
  const sourceIds = new Set(sources.map((source) => source.id));
  const links = safeJsonParse(startup.links_json, normalizeLinks) ?? {};

  return {
    schema_version: SCHEMA_VERSION,
    type: "startup_profile" as const,
    id: `${representations.html}#profile`,
    canonical_url: representations.html,
    representations,
    ...datesForStartup(startup),
    verified_at: research?.verified_at || null,
    identity: {
      name: startup.product_name,
      slug: startup.slug,
      domain: startup.domain,
      official_url: normalizeExternalUrl(startup.canonical_url) ?? normalizeExternalUrl(startup.domain),
    },
    profile_metadata: {
      product_type: startup.product_type,
      region: startup.region,
      hq_location: startup.hq_location,
      founded_year: startup.founded_year,
      team_size: startup.team_size,
      investors: splitCsv(startup.investors),
      tags: splitCsv(startup.tags),
      links: Object.fromEntries(Object.entries(links).flatMap(([key, value]) => {
        const url = normalizeExternalUrl(value);
        return url ? [[key, url]] : [];
      })),
    },
    funding_rounds: fundingRounds,
    product_evidence: (research?.product_evidence ?? []).map((evidence) => ({
      id: `${representations.html}#claim-${digest(evidence.claim)}`,
      kind: "source_linked_statement" as const,
      claim: evidence.claim,
      source_ids: [...evidence.source_ids],
      unresolved_source_ids: evidence.source_ids.filter((id) => !sourceIds.has(id)),
    })),
    editorial: {
      summary: startup.summary,
      note: startup.editor_note,
      why_featured: startup.why_featured,
      market_context: research?.market_context ?? null,
      risks: (research?.risks ?? []).map((risk) => ({
        id: `${representations.html}#risk-${digest(risk.claim)}`,
        claim: risk.claim,
        basis: risk.basis,
      })),
      breakout_exception: research?.breakout_exception ?? null,
    },
    sources,
    interpretation_notes: [
      "Profile metadata is recorded directory information; field-level source mappings are not inferred.",
      "Product evidence preserves the research statements and their original source IDs. Source linkage is not independent verification and may include company claims or editorial interpretation.",
      "verified_at is the recorded research review date, not a guarantee that a source or claim is current today.",
      "published_at is the recorded profile publication time. updated_at is present only for a distinct later recorded update; neither is generated from build time.",
    ],
    citation_policy: [
      "Cite the canonical VentureDex HTML page for editorial summaries, market context, risk framing, and source organization.",
      "Cite the linked original sources for factual product and funding claims. Source IDs are local to this profile.",
      "Resource, claim, and funding IDs are identifiers, not a promise that every fragment is an HTML anchor.",
    ],
  };
}

export type StartupAgentResource = ReturnType<typeof buildStartupAgentResource>;

export function renderStartupAgentMarkdown(resource: StartupAgentResource): string {
  const text = (value: string | null) => value ? escapeMarkdown(value) : "Not recorded";
  const lines = [
    `# ${escapeMarkdown(resource.identity.name)}`,
    "",
    `Canonical profile: ${resource.canonical_url}`,
    `JSON resource: ${resource.representations.json}`,
    `Stable resource ID: ${resource.id}`,
    `Published at: ${resource.published_at ?? "Not recorded"}`,
    `Updated at: ${resource.updated_at ?? "No distinct update recorded"}`,
    `Research verified at: ${resource.verified_at ?? "Not recorded"}`,
    "",
    "## Profile metadata",
    "",
    `- Official website: ${resource.identity.official_url ?? "Not recorded"}`,
    `- Domain: ${text(resource.identity.domain)}`,
    `- Category: ${text(resource.profile_metadata.product_type)}`,
    `- Region: ${text(resource.profile_metadata.region)}`,
    `- Headquarters: ${text(resource.profile_metadata.hq_location)}`,
    `- Founded: ${resource.profile_metadata.founded_year ?? "Not recorded"}`,
    `- Team size: ${text(resource.profile_metadata.team_size)}`,
    `- Investors: ${text(resource.profile_metadata.investors.join(", "))}`,
    `- Tags: ${text(resource.profile_metadata.tags.join(", "))}`,
    ...Object.entries(resource.profile_metadata.links).map(([label, url]) => `- ${escapeMarkdown(label)}: ${url}`),
    "",
    "## Recorded funding rounds",
    "",
  ];
  for (const round of resource.funding_rounds) {
    lines.push(
      `- ${text(round.amount)}; ${text(round.stage)}; ${text(round.date)}; lead investor: ${text(round.lead_investor)}`,
      `  - ID: ${round.id}`,
      `  - Source IDs: ${round.source_ids.map(escapeMarkdown).join(", ") || "Not recorded"}`,
    );
  }
  if (resource.funding_rounds.length === 0) lines.push("No funding rounds recorded.");
  lines.push("", "## Source-linked product statements", "");
  for (const evidence of resource.product_evidence) {
    lines.push(
      `- ${escapeMarkdown(evidence.claim)}`,
      `  - Claim ID: ${evidence.id}`,
      `  - Source IDs: ${evidence.source_ids.map(escapeMarkdown).join(", ") || "Not recorded"}`,
    );
    if (evidence.unresolved_source_ids.length > 0) {
      lines.push(`  - Unresolved source IDs: ${evidence.unresolved_source_ids.map(escapeMarkdown).join(", ")}`);
    }
  }
  if (resource.product_evidence.length === 0) lines.push("No source-linked statements recorded.");
  lines.push(
    "", "## VentureDex editorial assessment", "",
    `Summary: ${text(resource.editorial.summary)}`,
    "", `Editorial note: ${text(resource.editorial.note)}`,
    "", `Why featured: ${text(resource.editorial.why_featured)}`,
  );
  for (const [key, value] of Object.entries(resource.editorial.market_context ?? {})) {
    lines.push("", `${escapeMarkdown(key.replace(/_/g, " "))}: ${text(value ?? null)}`);
  }
  for (const risk of resource.editorial.risks) {
    lines.push("", `- Risk: ${escapeMarkdown(risk.claim)}`, `  - Basis: ${text(risk.basis)}`, `  - ID: ${risk.id}`);
  }
  if (resource.editorial.breakout_exception) {
    lines.push(
      "", `Selection exception: ${escapeMarkdown(resource.editorial.breakout_exception.reason)}`,
      `Source IDs: ${resource.editorial.breakout_exception.source_ids.map(escapeMarkdown).join(", ")}`,
    );
  }
  lines.push("", "## Source registry", "");
  for (const source of resource.sources) {
    lines.push(`- ${escapeMarkdown(source.id)} | ${escapeMarkdown(source.type)} | ${escapeMarkdown(source.label)} | ${source.url ?? "URL not recorded"}`);
  }
  lines.push(
    "", "## Interpretation and citation", "",
    ...[...resource.interpretation_notes, ...resource.citation_policy].map((note) => `- ${note}`),
    "",
  );
  return lines.join("\n");
}

export function buildStartupAgentIndex(startups: Startup[], siteUrl = DEFAULT_SITE_URL) {
  const items = startups.filter((startup) => startup.workflow_status === "published")
    .slice().sort((a, b) => a.slug.localeCompare(b.slug))
    .map((startup) => {
      const representations = startupResourceUrls(startup.slug, siteUrl);
      const research = safeJsonParse(startup.research_json, normalizeResearch);
      return {
        id: `${representations.html}#profile`,
        name: startup.product_name,
        slug: startup.slug,
        product_type: startup.product_type,
        ...representations,
        ...datesForStartup(startup),
        verified_at: research?.verified_at || null,
      };
    });
  return {
    schema_version: SCHEMA_VERSION,
    type: "startup_resource_index" as const,
    url: absoluteUrl("/startup-index.json", getSiteUrl(siteUrl)),
    changes_url: absoluteUrl("/changes.json", getSiteUrl(siteUrl)),
    item_count: items.length,
    usage: "Find a startup here, then fetch its JSON or Markdown resource. Use its HTML URL for citations.",
    items,
  };
}

export function buildStartupChanges(startups: Startup[], siteUrl = DEFAULT_SITE_URL, limit = 50) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Change feed limit must be a positive integer");
  const events = startups.filter((startup) => startup.workflow_status === "published").flatMap((startup) => {
    const dates = datesForStartup(startup);
    const representations = startupResourceUrls(startup.slug, siteUrl);
    return (["published", "updated"] as const).flatMap((type) => {
      const occurredAt = dates[type === "published" ? "published_at" : "updated_at"];
      return occurredAt ? [{
        id: `${representations.html}#${type}-${digest(occurredAt)}`,
        type,
        occurred_at: occurredAt,
        resource_id: `${representations.html}#profile`,
        name: startup.product_name,
        ...representations,
      }] : [];
    });
  }).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || a.id.localeCompare(b.id));
  return {
    schema_version: SCHEMA_VERSION,
    type: "recent_startup_changes" as const,
    url: absoluteUrl("/changes.json", getSiteUrl(siteUrl)),
    index_url: absoluteUrl("/startup-index.json", getSiteUrl(siteUrl)),
    latest_recorded_at: events[0]?.occurred_at ?? null,
    scope: "Recent recorded publication and distinct update events for current published startup profiles. This is a bounded snapshot, not a complete change history or a deletion log. Reconcile against the startup index after a gap.",
    timestamp_basis: "Content publication and update timestamps only. Research verified_at and build time do not generate update events.",
    complete_history: false,
    deletions_included: false,
    limit,
    has_more: events.length > limit,
    item_count: Math.min(events.length, limit),
    items: events.slice(0, limit),
  };
}
