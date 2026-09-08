import briefsJson from "../../content/research-briefs.json";

export interface BriefSource {
  id: string;
  label: string;
  url: string;
  type: "official-documentation" | "vendor-product" | "company-announcement" | "original-reporting";
  checked_at: string;
}
export interface BriefCompany {
  startup_slug: string;
  name: string;
  layer: string;
  documented_workflow: string;
  evidence_unit: string;
  boundary: string;
  evaluation_question: string;
  funding_context: string;
  source_ids: string[];
}
export interface ResearchBrief {
  slug: string;
  status: "published" | "draft";
  title: string;
  description: string;
  published_at: string;
  reviewed_at: string;
  summary: string;
  scope: string;
  method: string[];
  companies: BriefCompany[];
  findings: Array<{ id: string; title: string; text: string; source_ids: string[] }>;
  checklist: string[];
  questions: Array<{ question: string; answer: string }>;
  sources: BriefSource[];
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const SOURCE_TYPES = new Set(["official-documentation", "vendor-product", "company-announcement", "original-reporting"]);

function requireText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Research brief: missing ${field}`);
}
function requireDate(value: unknown, field: string): asserts value is string {
  requireText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error(`Research brief: invalid ${field}`);
  }
}
function requireRows(value: unknown, field: string): asserts value is Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error(`Research brief: invalid ${field}`);
  }
}
function requireList(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((text) => typeof text !== "string" || !text.trim())) {
    throw new Error(`Research brief: invalid ${field}`);
  }
}

/** Authored data validation is part of static page generation, not only tests. */
export function validateResearchBriefs(value: unknown, knownSlugs?: ReadonlySet<string>): ResearchBrief[] {
  requireRows(value, "briefs");
  const slugs = new Set<string>();
  for (const brief of value) {
    for (const field of ["slug", "title", "description", "summary", "scope"]) requireText(brief[field], field);
    const slug = brief.slug as string;
    if (!SLUG.test(slug) || slugs.has(slug)) throw new Error("Research brief: invalid or duplicate slug");
    slugs.add(slug);
    if (brief.status !== "published" && brief.status !== "draft") throw new Error("Research brief: invalid status");
    requireDate(brief.published_at, "published_at");
    requireDate(brief.reviewed_at, "reviewed_at");
    if (brief.reviewed_at < brief.published_at) throw new Error("Research brief: review predates publication");
    requireList(brief.method, "method");
    requireList(brief.checklist, "checklist");
    requireRows(brief.sources, "sources");
    const sourceIds = new Set<string>();
    for (const source of brief.sources) {
      for (const field of ["id", "label", "url", "type"]) requireText(source[field], `source.${field}`);
      const id = source.id as string;
      if (!ID.test(id) || sourceIds.has(id)) throw new Error("Research brief: invalid or duplicate source id");
      sourceIds.add(id);
      const url = new URL(source.url as string);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Research brief: invalid source URL");
      if (!SOURCE_TYPES.has(source.type as string)) throw new Error("Research brief: invalid source type");
      requireDate(source.checked_at, "source.checked_at");
      if (source.checked_at > brief.reviewed_at) throw new Error("Research brief: source check after review date");
    }
    const checkReferences = (ids: unknown) => {
      requireList(ids, "source_ids");
      if (new Set(ids).size !== ids.length || ids.some((id) => !sourceIds.has(id))) throw new Error("Research brief: unresolved or duplicate source reference");
    };
    requireRows(brief.companies, "companies");
    const companySlugs = new Set<string>();
    for (const company of brief.companies) {
      for (const field of ["startup_slug", "name", "layer", "documented_workflow", "evidence_unit", "boundary", "evaluation_question", "funding_context"]) {
        requireText(company[field], `company.${field}`);
      }
      const companySlug = company.startup_slug as string;
      if (!SLUG.test(companySlug) || (knownSlugs && !knownSlugs.has(companySlug)) || companySlugs.has(companySlug)) throw new Error("Research brief: unknown or duplicate startup");
      companySlugs.add(companySlug);
      checkReferences(company.source_ids);
    }
    requireRows(brief.findings, "findings");
    const findingIds = new Set<string>();
    for (const finding of brief.findings) {
      for (const field of ["id", "title", "text"]) requireText(finding[field], `finding.${field}`);
      const id = finding.id as string;
      if (!SLUG.test(id) || findingIds.has(id)) throw new Error("Research brief: invalid or duplicate finding id");
      findingIds.add(id);
      checkReferences(finding.source_ids);
    }
    requireRows(brief.questions, "questions");
    for (const question of brief.questions) {
      requireText(question.question, "question");
      requireText(question.answer, "answer");
    }
  }
  return value as unknown as ResearchBrief[];
}

export function getResearchBriefs(knownSlugs?: ReadonlySet<string>): ResearchBrief[] {
  return validateResearchBriefs(briefsJson, knownSlugs)
    .filter((brief) => brief.status === "published")
    .sort((a, b) => b.published_at.localeCompare(a.published_at) || a.slug.localeCompare(b.slug));
}
export function researchBriefPath(brief: Pick<ResearchBrief, "slug">): string {
  return `/research/${brief.slug}`;
}
export function researchBriefResource(brief: ResearchBrief) {
  const canonical = `https://venturedex.co${researchBriefPath(brief)}`;
  return {
    schema_version: "2026-09-08",
    kind: "editorial-research",
    canonical_url: canonical,
    representations: { html: canonical, json: `${canonical}.json`, markdown: `${canonical}.md` },
    evidence_policy: "Product descriptions summarize cited public sources; boundaries, findings and evaluation questions are VentureDex editorial analysis. Source review is not an independent product benchmark or customer-outcome verification.",
    ...brief,
    findings: brief.findings.map((finding) => ({ ...finding, kind: "editorial-analysis" })),
  };
}
export function researchBriefMarkdown(brief: ResearchBrief): string {
  const resource = researchBriefResource(brief);
  const references = (ids: string[]) => ids.map((id) => {
    const source = brief.sources.find((item) => item.id === id)!;
    return `[${source.label}](${source.url})`;
  }).join("; ");
  return [
    `# ${brief.title}`, `Canonical: ${resource.canonical_url}`, `Published: ${brief.published_at} | Sources reviewed: ${brief.reviewed_at}`,
    "By VentureDex Research", brief.summary, "## Scope", brief.scope, resource.evidence_policy,
    "## Comparison: documented workflow and editorial boundaries",
    ...brief.companies.map((company) => `### ${company.name}: ${company.layer}\n\nProfile: https://venturedex.co/startups/${company.startup_slug}\n\nDocumented workflow: ${company.documented_workflow}\n\nEvidence unit (editorial classification): ${company.evidence_unit}\n\nBoundary (editorial analysis): ${company.boundary}\n\nEvaluation question (proposed, not tested): ${company.evaluation_question}\n\nFunding context: ${company.funding_context}\n\nSources: ${references(company.source_ids)}`),
    "## Findings — VentureDex editorial analysis",
    ...brief.findings.map((finding) => `### ${finding.title}\n\n${finding.text}\n\nSources: ${references(finding.source_ids)}`),
    "## Evaluation checklist — proposed, not tested", ...brief.checklist.map((item, i) => `${i + 1}. ${item}`),
    "## Questions", ...brief.questions.map((item) => `### ${item.question}\n\n${item.answer}`),
    "## Method", ...brief.method.map((item) => `- ${item}`),
    "## Sources", ...brief.sources.map((source) => `- ${source.id}: [${source.label}](${source.url}) — ${source.type}; checked ${source.checked_at}`),
    "## Follow the research", "Compare developer tools: https://venturedex.co/topics/developer-tools-startups", "Subscribe: https://venturedex.co/subscribe?source=research-brief",
    "Public access does not grant an open-data or model-training license. Cite the canonical HTML brief for editorial analysis and original sources for underlying claims.", "",
  ].join("\n\n");
}
