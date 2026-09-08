import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface RetrievalCase { id: string; kind: string; path: string; question: string; answer_rubric: string; markers: string[]; expected_verified_at?: string }
const definition = JSON.parse(readFileSync(new URL("../../docs/growth/agent-retrieval-cases.json", import.meta.url), "utf8")) as { version: string; purpose: string; cases: RetrievalCase[] };
const ORIGIN = "https://venturedex.co";
const UPDATED_SLUGS = ["shapes", "scaled-cognition", "antora-energy", "verse", "throne-science", "venus-aerospace", "enzo-health", "cvrd-health", "niteshift", "architect-labs"];
const attributesFor = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((match) => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4]]));

export function benchmarkOrigin(value: string): string {
  const url = new URL(value);
  const local = ["127.0.0.1", "localhost"].includes(url.hostname) && url.protocol === "http:";
  if ((!local && url.origin !== ORIGIN) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Use the production origin or an HTTP localhost preview origin only.");
  return url.origin;
}

export function assessRetrieval(item: RetrievalCase, status: number, headers: Headers, body: string): string[] {
  const failures: string[] = [];
  if (status !== 200) failures.push(`HTTP ${status}, expected 200 without redirect`);
  const mime = item.kind === "topic" ? "text/html" : item.kind === "guide" ? "text/plain" : item.kind === "brief-md" ? "text/markdown" : "application/json";
  if (!(headers.get("content-type") ?? "").startsWith(mime)) failures.push(`Expected ${mime}`);
  if (/noindex|none/i.test(headers.get("x-robots-tag") ?? "")) failures.push("Robots exclusion present");
  for (const marker of item.markers) if (!body.toLowerCase().includes(marker.toLowerCase())) failures.push(`Missing retrieval marker: ${marker}`);
  const canonical = `${ORIGIN}${item.path.replace(/\.(json|md)$/, "")}`;
  if (item.kind === "topic") {
    const links = body.match(/<link\b[^>]*>/gi) ?? [];
    const canonicals = links.map(attributesFor).filter((attributes) => /(?:^|\s)canonical(?:\s|$)/i.test(attributes.rel ?? ""));
    if (canonicals.length !== 1 || canonicals[0].href !== canonical) failures.push("Expected exactly one matching canonical HTML link");
    for (const tag of body.match(/<meta\b[^>]*>/gi) ?? []) {
      const attributes = attributesFor(tag);
      if (/^(robots|googlebot|bingbot)$/i.test(attributes.name ?? "") && /\b(noindex|none)\b/i.test(attributes.content ?? "")) failures.push("HTML robots exclusion present");
    }
  }
  if (["profile", "brief-json", "brief-md"].includes(item.kind) && headers.get("link") !== `<${canonical}>; rel="canonical"`) failures.push("Missing exact canonical response header");
  if (["profile", "brief-json", "changes"].includes(item.kind)) {
    try {
      const data = JSON.parse(body);
      if (item.kind !== "changes" && data.canonical_url !== canonical) failures.push("JSON canonical mismatch");
      if (item.kind === "profile") {
        if (!data.updated_at || !Number.isFinite(Date.parse(data.updated_at)) || data.updated_at <= data.published_at) failures.push("No distinct authored update");
        if (!item.expected_verified_at || data.verified_at !== item.expected_verified_at) failures.push("Original full-review date was not preserved");
        const ids = new Set((data.sources ?? []).map((source: { id: string }) => source.id));
        if (!(data.product_evidence?.length > 0) || data.product_evidence.some((claim: { source_ids: string[]; unresolved_source_ids: string[] }) => !claim.source_ids?.length || claim.source_ids.some((id) => !ids.has(id)) || claim.unresolved_source_ids?.length)) failures.push("Incomplete claim-to-source mapping");
      }
      if (item.kind === "brief-json") {
        if (data.companies?.length !== 3 || data.sources?.length !== 10) failures.push("Brief evidence inventory mismatch");
      }
      if (item.kind === "changes") {
        if (data.complete_history !== false || data.deletions_included !== false) failures.push("Feed completeness boundary missing");
        for (const slug of UPDATED_SLUGS) if (!data.items?.some((event: { type: string; html?: string }) => event.type === "updated" && event.html === `${ORIGIN}/startups/${slug}`)) failures.push(`No bounded-feed update for ${slug}`);
      }
    } catch { failures.push("Invalid JSON representation"); }
  }
  return failures;
}

export async function runRetrievalBenchmark(origin: string, fetcher: typeof fetch = fetch) {
  const base = benchmarkOrigin(origin);
  const results = [];
  // Twenty fixed sequential GETs, no third-party source requests, cookies, form submissions or writes.
  for (const item of definition.cases) {
    let status: number | null = null;
    let bytes = 0;
    let failures: string[];
    try {
      const response = await fetcher(`${base}${item.path}`, { redirect: "manual", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "VentureDex-ReadOnly-Retrieval-QA/1.0" } });
      status = response.status;
      const text = await response.text();
      bytes = Buffer.byteLength(text);
      failures = bytes > 4_000_000 ? ["Response exceeds the 4 MB inspection budget"] : assessRetrieval(item, status, response.headers, text);
    } catch (error) { failures = [error instanceof Error ? error.message : String(error)]; }
    results.push({ id: item.id, question: item.question, path: item.path, status, bytes, retrieval_ready: failures.length === 0, failures, answer_review: "not-run" });
  }
  return { schema_version: definition.version, checked_at: new Date().toISOString(), origin: base, purpose: definition.purpose, retrieval_ready: results.filter((result) => result.retrieval_ready).length, total: results.length, answer_accuracy: null, external_ai_citation_rate: null, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length > 2) throw new Error("Usage: tsx scripts/promotion/agent-retrieval-benchmark.ts <origin> [new-result.json]");
  const result = await runRetrievalBenchmark(args[0] || ORIGIN);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (args[1]) writeFileSync(resolve(args[1]), serialized, { flag: "wx" });
  console.log(serialized);
  if (result.retrieval_ready !== result.total) process.exitCode = 1;
}
