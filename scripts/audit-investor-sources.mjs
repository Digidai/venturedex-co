#!/usr/bin/env node

/** Read-only live audit of every retained investor-profile source. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profiles = JSON.parse(readFileSync(path.join(root, "content", "investor-profiles.json"), "utf8"));
const timeoutMs = 12_000;
const concurrency = 16;

const strict = process.argv.includes("--strict");
const jobs = Object.entries(profiles.profiles).flatMap(([slug, profile]) =>
  profile.sources.map((source) => ({ slug, source }))
);

function normalizedHost(url) {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

function relatedHosts(leftUrl, rightUrl) {
  const left = normalizedHost(leftUrl);
  const right = normalizedHost(rightUrl);
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

async function fetchSource(job) {
  const started = Date.now();
  try {
    const response = await fetch(job.source.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    const buffer = new Uint8Array(await response.arrayBuffer());
    const sample = new TextDecoder("utf-8", { fatal: false }).decode(buffer.slice(0, 250_000));
    const text = contentType.includes("pdf")
      ? ""
      : sample.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const pdf = contentType.includes("pdf") || sample.startsWith("%PDF-");
    const substantive = pdf ? buffer.length >= 1_000 : text.length >= 100;
    const outcome = [404, 410].includes(response.status)
      ? "broken"
      : response.status >= 200 && response.status < 300 && substantive
        ? "readable"
        : response.status >= 200 && response.status < 300
          ? "application_shell"
          : [401, 403, 429].includes(response.status)
            ? "access_limited"
            : "transport_limited";
    return {
      slug: job.slug,
      source_id: job.source.id,
      url: job.source.url,
      final_url: response.url,
      status: response.status,
      content_type: contentType.split(";")[0],
      bytes: buffer.length,
      text_chars: text.length,
      substantive,
      outcome,
      elapsed_ms: Date.now() - started,
    };
  } catch (error) {
    return {
      slug: job.slug,
      source_id: job.source.id,
      url: job.source.url,
      status: 0,
      substantive: false,
      outcome: "transport_limited",
      error: error instanceof Error ? error.message : String(error),
      elapsed_ms: Date.now() - started,
    };
  }
}

async function inspect(job) {
  const first = await fetchSource(job);
  if (first.status !== 0 && first.status < 500 && first.status !== 429) return first;
  const second = await fetchSource(job);
  return { ...second, attempts: 2, first_outcome: first.outcome };
}

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const index = cursor++;
    results[index] = await inspect(jobs[index]);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));

const broken = results.filter((result) => result.outcome === "broken");
const warnings = results.filter((result) => result.outcome !== "readable" && result.outcome !== "broken");
const crossHostRedirects = results.filter((result) => result.final_url && !relatedHosts(result.url, result.final_url));
const summary = {
  checked_at: new Date().toISOString(),
  profiles: Object.keys(profiles.profiles).length,
  sources: results.length,
  readable: results.filter((result) => result.outcome === "readable").length,
  application_shell: results.filter((result) => result.outcome === "application_shell").length,
  access_limited: results.filter((result) => result.outcome === "access_limited").length,
  transport_limited: results.filter((result) => result.outcome === "transport_limited").length,
  broken: broken.length,
  broken_sources: broken,
  cross_host_redirects: crossHostRedirects,
  warnings,
};
console.log(JSON.stringify(summary, null, 2));
process.exitCode = broken.length || (strict && (warnings.length || crossHostRedirects.length)) ? 1 : 0;
