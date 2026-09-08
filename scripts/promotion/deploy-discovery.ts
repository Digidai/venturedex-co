import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { INDEXNOW_HOST, INDEXNOW_KEY } from "../../src/lib/indexnow";
import { ROOT_DIR } from "./content";
import { parseArgs as indexNowOptions, submitIndexNow, validateUrl } from "./indexnow";

const ORIGIN = `https://${INDEXNOW_HOST}`;
const FALLBACK_PATHS = ["/", "/directory", "/news", "/research"];
const MAX_URLS = 100;
const SHA = /^[0-9a-f]{40}$/;

type JsonReader = (path: string) => unknown;
type FetchLike = typeof fetch;

function validateHtmlUrl(url: string): void {
  validateUrl(url);
  const parsed = new URL(url);
  if (parsed.origin !== ORIGIN || parsed.username || parsed.password || /\.(json|txt)$/.test(parsed.pathname)) {
    throw new Error("Discovery accepts only canonical HTML URLs on the production origin.");
  }
}

export interface DiscoveryPlan {
  sha: string;
  baseSha: string | null;
  mode: "since-discovery" | "current-commit" | "fallback-hubs" | "already-completed" | "explicit-urls";
  changedFiles: string[];
  urls: string[];
  limitations: string[];
}

export interface DiscoveryState {
  schemaVersion: 1;
  completedSha: string;
  completedAt: string;
}

export interface LiveCheck {
  url: string;
  status: number | null;
  canonical: string | null;
  eligible: boolean;
  reason: string;
}

export interface DiscoveryReceipt extends DiscoveryPlan {
  timestamp: string;
  status: "noop" | "verified-dry-run" | "submitted" | "failed";
  checks: LiveCheck[];
  message: string;
  indexingConfirmed: false;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function changedEntries(current: unknown, previous: unknown, key = "slug"): Record<string, unknown>[] {
  const before = new Map((Array.isArray(previous) ? previous : []).flatMap((entry) => {
    const row = record(entry);
    return row && typeof row[key] === "string" ? [[row[key], JSON.stringify(row)] as const] : [];
  }));
  return (Array.isArray(current) ? current : []).flatMap((entry) => {
    const row = record(entry);
    return row && typeof row[key] === "string" && before.get(row[key]) !== JSON.stringify(row) ? [row] : [];
  });
}

/** Select changed, published HTML records, never the entire startup/launch corpus.
 * Shared templates and aggregate source changes notify their discovery hubs;
 * they do not pretend to enumerate every derived detail page.
 */
export function selectChangedUrls(files: string[], current: JsonReader, previous: JsonReader): { urls: string[]; limitations: string[] } {
  const paths = new Set<string>();
  const limitations = new Set<string>();
  const timestamps = record(current("content/timestamps.json")) ?? {};
  const addStartup = (slug: string) => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return;
    const data = record(current(`content/startups/${slug}.json`));
    const stamp = record(timestamps[slug]);
    if (data?.slug !== slug || !stamp?.published_at) return;
    paths.add(`/startups/${slug}`);
    FALLBACK_PATHS.forEach((path) => paths.add(path));
  };
  for (const file of files) {
    const startup = file.match(/^content\/startups\/([a-z0-9][a-z0-9-]*)\.json$/);
    const weekly = file.match(/^content\/weekly\/(\d+)\.json$/);
    if (startup) {
      if (JSON.stringify(current(file)) !== JSON.stringify(previous(file))) {
        addStartup(startup[1]);
        if (!current(file) && previous(file)) {
          FALLBACK_PATHS.forEach((path) => paths.add(path));
          limitations.add("Removed pages are not submitted by this live-200 HTML pass; updated discovery hubs are checked instead.");
        }
      }
    } else if (file === "content/timestamps.json") {
      const before = record(previous(file)) ?? {};
      for (const [slug, stamp] of Object.entries(timestamps)) {
        if (JSON.stringify(stamp) !== JSON.stringify(before[slug])) addStartup(slug);
      }
    } else if (weekly) {
      const issue = record(current(file));
      const before = record(previous(file));
      const published = issue && (issue.status ?? "published") === "published";
      const wasPublished = before && (before.status ?? "published") === "published";
      if ((published || wasPublished) && JSON.stringify(issue) !== JSON.stringify(before)) {
        if (published && issue.issue_number === Number(weekly[1])) paths.add(`/weekly/${weekly[1]}`);
        paths.add("/weekly");
        paths.add("/research");
      }
    } else if (file === "content/research-briefs.json") {
      if (JSON.stringify(current(file)) !== JSON.stringify(previous(file))) {
        paths.add("/research");
        for (const row of changedEntries(current(file), previous(file))) {
          if (row.status === "published") paths.add(`/research/${row.slug}`);
        }
      }
    } else if (file.startsWith("src/pages/research/") || file === "src/lib/research-briefs.ts") {
      paths.add("/research");
      for (const row of changedEntries(current("content/research-briefs.json"), [])) {
        if (row.status === "published") paths.add(`/research/${row.slug}`);
      }
    } else if (file === "content/topic-research.json") {
      if (JSON.stringify(current(file)) !== JSON.stringify(previous(file))) {
        paths.add("/topics");
        // Removing a guide also changes its still-existing topic HTML page.
        const changed = [...changedEntries(current(file), previous(file), "topic_slug"), ...changedEntries(previous(file), current(file), "topic_slug")];
        const known = new Set(changedEntries(current("content/topic-pages.json"), []).map((row) => row.slug));
        for (const row of changed) if (known.has(row.topic_slug)) paths.add(`/topics/${row.topic_slug}`);
      }
    } else if (file === "src/lib/topic-research.ts") {
      paths.add("/topics");
      for (const row of changedEntries(current("content/topic-pages.json"), [])) paths.add(`/topics/${row.slug}`);
    } else if (file === "content/topic-pages.json" || file === "content/collections.json") {
      const prefix = file === "content/topic-pages.json" ? "/topics" : "/collections";
      for (const row of changedEntries(current(file), previous(file))) paths.add(`${prefix}/${row.slug}`);
      if (JSON.stringify(current(file)) !== JSON.stringify(previous(file))) paths.add(prefix);
    } else if (file === "content/whatships.json" || file === "src/pages/launches.astro" || file.startsWith("src/pages/launches/") || file === "src/lib/whatships.ts") {
      paths.add("/launches");
      paths.add("/research");
      paths.add("/directory");
      limitations.add("Launch catalog changes notify hubs only; the existing WhatShips workflow owns exact changed launch submissions.");
    } else if (file.startsWith("src/pages/topics/") || file === "src/lib/topic-pages.ts") {
      paths.add("/topics");
      for (const row of changedEntries(current("content/topic-pages.json"), [])) paths.add(`/topics/${row.slug}`);
    } else if (file.startsWith("src/pages/collections/")) {
      paths.add("/collections");
      for (const row of changedEntries(current("content/collections.json"), [])) paths.add(`/collections/${row.slug}`);
    } else if (file === "content/investors.json" || file.startsWith("src/pages/investors/")) {
      paths.add("/investors");
      paths.add("/directory");
      limitations.add("Investor catalog changes notify the investor hub; eligibility-filtered detail pages are not batch-submitted.");
    } else if (file.startsWith("src/pages/news/page/") || file === "src/components/FundingNewsPage.astro" || file === "src/lib/funding-pagination.ts") {
      paths.add("/news");
      limitations.add("Funding pagination changes notify the news hub; canonical older pages remain discoverable through pagination links.");
    } else if (/^src\/pages\/(index|directory|news|research|weekly|topics|collections|investors)\.astro$/.test(file)) {
      const name = file.split("/").at(-1)!.replace(/\.astro$/, "");
      paths.add(name === "index" ? "/" : `/${name}`);
      if (name === "index") paths.add("/directory");
    } else if (file.startsWith("src/pages/weekly/")) {
      paths.add("/weekly");
      limitations.add("Weekly template changes notify the archive, not every historical issue.");
    } else if (file.startsWith("src/pages/startups/") || /^src\/(layouts|components|styles)\//.test(file) ||
        /^src\/lib\/(seo|content|content-transform|agent-resources|evidence-index)\.ts$/.test(file) ||
        /^src\/pages\/(llms.*|ai-index|startup-index|changes)\./.test(file)) {
      FALLBACK_PATHS.forEach((path) => paths.add(path));
      limitations.add("Shared template/data changes notify a bounded set of HTML hubs, not every derived page or machine-readable file.");
    }
  }
  const urls = [...paths].sort().map((path) => `${ORIGIN}${path}`);
  urls.forEach(validateHtmlUrl);
  if (urls.length > MAX_URLS) throw new Error(`Changed URL set exceeds ${MAX_URLS}; use a reviewed explicit batch. The discovery marker was not advanced.`);
  return { urls, limitations: [...limitations] };
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function readGitJson(cwd: string, sha: string | null, path: string): unknown {
  if (!sha) return null;
  try {
    return JSON.parse(git(["show", `${sha}:${path}`], cwd));
  } catch {
    return null;
  }
}

export function planDeployment(cwd: string, sha: string, state: DiscoveryState | null): DiscoveryPlan {
  if (!SHA.test(sha) || git(["rev-parse", "HEAD"], cwd) !== sha) throw new Error("Discovery SHA must equal the checked-out release commit.");
  if (state?.schemaVersion === 1 && state.completedSha === sha) {
    return { sha, baseSha: sha, mode: "already-completed", changedFiles: [], urls: [], limitations: [] };
  }
  let baseSha: string | null = null;
  let mode: DiscoveryPlan["mode"] = "current-commit";
  const limitations: string[] = [];
  if (state?.schemaVersion === 1 && SHA.test(state.completedSha)) {
    try {
      git(["merge-base", "--is-ancestor", state.completedSha, sha], cwd);
      baseSha = state.completedSha;
      mode = "since-discovery";
    } catch {
      limitations.push("Cached discovery SHA is unavailable or not an ancestor; using only the current commit.");
    }
  }
  if (!baseSha) {
    try {
      baseSha = git(["rev-parse", `${sha}^`], cwd);
      limitations.push("No usable prior discovery marker: only this commit is covered, not every change since the previous deployment.");
    } catch {
      return { sha, baseSha: null, mode: "fallback-hubs", changedFiles: [], urls: FALLBACK_PATHS.map((path) => `${ORIGIN}${path}`),
        limitations: ["No usable git base: only four HTML discovery hubs are selected."] };
    }
  }
  const changedFiles = git(["diff", "--name-only", "--diff-filter=ACDMRT", baseSha, sha, "--"], cwd).split("\n").filter(Boolean);
  const selected = selectChangedUrls(changedFiles, (path) => readGitJson(cwd, sha, path), (path) => readGitJson(cwd, baseSha, path));
  return { sha, baseSha, mode, changedFiles, urls: selected.urls, limitations: [...limitations, ...selected.limitations] };
}

function attributes(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/\s([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)]
    .map((match) => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4]]));
}

export async function checkLiveHtml(url: string, fetchFn: FetchLike = fetch): Promise<LiveCheck> {
  validateHtmlUrl(url);
  const check: LiveCheck = { url, status: null, canonical: null, eligible: false, reason: "request-failed" };
  try {
    const response = await fetchFn(url, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "VentureDexDeployDiscovery/1.0" } });
    check.status = response.status;
    if (response.status !== 200) return { ...check, reason: "http-not-200" };
    if (!/^text\/html(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) return { ...check, reason: "not-html" };
    const html = await response.text();
    const canonicals = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]))
      .filter((attrs) => attrs.rel?.toLowerCase().split(/\s+/).includes("canonical"));
    check.canonical = canonicals[0]?.href ?? null;
    if (canonicals.length !== 1 || check.canonical !== url) return { ...check, reason: "canonical-mismatch" };
    const directives = [response.headers.get("x-robots-tag") ?? "", ...[...html.matchAll(/<meta\b[^>]*>/gi)]
      .map((match) => attributes(match[0])).filter((attrs) => /^(robots|googlebot|bingbot)$/i.test(attrs.name ?? ""))
      .map((attrs) => attrs.content ?? "")].join(",");
    if (/\b(noindex|none)\b/i.test(directives)) return { ...check, reason: "noindex" };
    return { ...check, eligible: true, reason: "live-canonical-html" };
  } catch {
    return check;
  }
}

export async function executeDiscovery(plan: DiscoveryPlan, dependencies: {
  fetchFn?: FetchLike;
  submit: (urls: string[]) => Promise<void>;
  dryRun?: boolean;
}): Promise<DiscoveryReceipt> {
  const receipt: DiscoveryReceipt = { ...plan, timestamp: new Date().toISOString(), status: "noop", checks: [], message: "No changed canonical HTML URLs; no submission.", indexingConfirmed: false };
  if (!plan.urls.length) return receipt;
  if (plan.urls.length > MAX_URLS) return { ...receipt, status: "failed", message: `Refusing more than ${MAX_URLS} URLs.` };
  // Four concurrent read-only requests bound load and prevent a long sequential sweep.
  for (let offset = 0; offset < plan.urls.length; offset += 4) {
    receipt.checks.push(...await Promise.all(plan.urls.slice(offset, offset + 4).map((url) => checkLiveHtml(url, dependencies.fetchFn))));
  }
  if (receipt.checks.some((check) => !check.eligible)) {
    return { ...receipt, status: "failed", message: "At least one live URL failed HTTP/HTML/canonical/robots checks. Nothing was submitted; discovery marker unchanged." };
  }
  if (dependencies.dryRun) return { ...receipt, status: "verified-dry-run", message: "Live HTML checks passed; preview only, no IndexNow POST and no marker change." };
  try {
    await dependencies.submit(plan.urls);
    return { ...receipt, status: "submitted", message: "IndexNow accepted the discovery notification. HTTP 200/202 is not proof of crawling, indexing, rankings, or traffic." };
  } catch (error) {
    return { ...receipt, status: "failed", message: `IndexNow notification failed; discovery marker unchanged. ${redact(error instanceof Error ? error.message : String(error))}` };
  }
}

function redact(text: string): string {
  return text.replaceAll(INDEXNOW_KEY, "[redacted-indexnow-key]").slice(0, 1_000);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  let stateFile = resolve(ROOT_DIR, ".cache/deploy-discovery/state.json");
  let outputDir = resolve(ROOT_DIR, ".cache/deploy-discovery/receipts");
  let urlsFile: string | null = null;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--dry-run") dryRun = true;
    else if (["--state-file", "--output-dir", "--urls-file"].includes(flag)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${flag} requires a path.`);
      if (flag === "--state-file") stateFile = resolve(value);
      if (flag === "--output-dir") outputDir = resolve(value);
      if (flag === "--urls-file") urlsFile = resolve(value);
    } else throw new Error(`Unknown option: ${flag}`);
  }
  const sha = process.env.VENTUREDEX_RELEASE_SHA || git(["rev-parse", "HEAD"], ROOT_DIR);
  let state: DiscoveryState | null = null;
  try { if (existsSync(stateFile)) state = JSON.parse(readFileSync(stateFile, "utf8")) as DiscoveryState; } catch { /* Missing/corrupt cache uses the bounded fallback. */ }
  let receipt: DiscoveryReceipt;
  try {
    let plan: DiscoveryPlan;
    if (urlsFile) {
      const urls: unknown = JSON.parse(readFileSync(urlsFile, "utf8"));
      if (!Array.isArray(urls) || !urls.every((url) => typeof url === "string")) throw new Error("Explicit URLs must be a JSON string array.");
      const selected = [...new Set(urls as string[])];
      selected.forEach(validateHtmlUrl);
      plan = { sha, baseSha: null, mode: "explicit-urls", changedFiles: [], urls: selected, limitations: ["Manual exact-URL batch; automatic discovery marker is not read or advanced."] };
    } else plan = planDeployment(ROOT_DIR, sha, state);
    writeJson(resolve(outputDir, "selected-urls.json"), plan.urls);
    const historyFile = resolve(outputDir, "indexnow-history.jsonl");
    receipt = await executeDiscovery(plan, {
      dryRun,
      submit: async (urls) => {
        try {
          await submitIndexNow(indexNowOptions(["--history-file", historyFile]), urls, {
            fetchFn: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }),
          });
        } finally {
          // The existing submitter writes a public key-location URL. Receipts do
          // not need its token, or a response body that might echo the key.
          if (existsSync(historyFile)) writeFileSync(historyFile, readFileSync(historyFile, "utf8").replaceAll(INDEXNOW_KEY, "[redacted-indexnow-key]"));
        }
      },
    });
    if (!dryRun && !urlsFile && (receipt.status === "submitted" || receipt.status === "noop")) {
      writeJson(stateFile, { schemaVersion: 1, completedSha: sha, completedAt: receipt.timestamp } satisfies DiscoveryState);
    }
  } catch (error) {
    receipt = { sha, baseSha: null, mode: "fallback-hubs", changedFiles: [], urls: [], limitations: [], timestamp: new Date().toISOString(),
      status: "failed", checks: [], message: redact(error instanceof Error ? error.message : String(error)), indexingConfirmed: false };
  }
  writeJson(resolve(outputDir, "receipt.json"), receipt);
  console.log(`Deploy discovery: ${receipt.status}; ${receipt.urls.length} selected URL(s). ${receipt.message}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY,
      `\n## Post-deploy discovery\n\n- Status: ${receipt.status}\n- Commit: ${receipt.sha}\n- Selection: ${receipt.mode}; ${receipt.urls.length} canonical HTML URLs\n- ${receipt.message}\n- Evidence: deploy-discovery artifact; acceptance is not indexing proof.\n`, { flag: "a" });
  }
  if (receipt.status === "failed") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("Deploy discovery could not write its receipt."); process.exitCode = 1; });
}
