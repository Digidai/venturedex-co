import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  checkLiveHtml,
  executeDiscovery,
  planDeployment,
  selectChangedUrls,
  type DiscoveryPlan,
} from "../scripts/promotion/deploy-discovery";

const ORIGIN = "https://venturedex.co";
const reader = (data: Record<string, unknown>) => (path: string) => data[path] ?? null;
const startup = { slug: "new-startup", product_name: "New startup" };
const timestamps = { "new-startup": { published_at: "2026-09-08 01:00:00" } };
const files = { "content/timestamps.json": timestamps, "content/startups/new-startup.json": startup };

test("changed startup and timestamp select one published detail plus four hubs", () => {
  const selected = selectChangedUrls(Object.keys(files), reader(files), reader({}));
  assert.deepEqual(selected.urls, [ORIGIN + "/", ORIGIN + "/directory", ORIGIN + "/news", ORIGIN + "/research", ORIGIN + "/startups/new-startup"]);
});

test("unchanged data, unpublished startups, draft weeklies and operational files do not notify", () => {
  assert.deepEqual(selectChangedUrls(Object.keys(files), reader(files), reader(files)).urls, []);
  assert.deepEqual(selectChangedUrls(["content/startups/new-startup.json"], reader({ "content/startups/new-startup.json": startup }), reader({})).urls, []);
  assert.deepEqual(selectChangedUrls(["content/weekly/14.json"], reader({ "content/weekly/14.json": { issue_number: 14, status: "draft" } }), reader({})).urls, []);
  assert.deepEqual(selectChangedUrls(["docs/run-log.md", "scripts/manage.sh", ".github/workflows/deploy.yml"], reader({}), reader({})).urls, []);
});

test("published weekly changes select exact issue; withdrawal selects hubs without the absent detail", () => {
  const path = "content/weekly/14.json";
  const published = { issue_number: 14, status: "published", title: "A new issue" };
  assert.deepEqual(selectChangedUrls([path], reader({ [path]: published }), reader({})).urls,
    [ORIGIN + "/research", ORIGIN + "/weekly", ORIGIN + "/weekly/14"]);
  assert.deepEqual(selectChangedUrls([path], reader({ [path]: { ...published, status: "draft" } }), reader({ [path]: published })).urls,
    [ORIGIN + "/research", ORIGIN + "/weekly"]);
});

test("topic and collection JSON select only changed entries while template changes cover the small hub set", () => {
  const path = "content/topic-pages.json";
  const before = [{ slug: "first", title: "First" }, { slug: "second", title: "Second" }];
  const after = [{ slug: "first", title: "Changed" }, before[1]];
  assert.deepEqual(selectChangedUrls([path], reader({ [path]: after }), reader({ [path]: before })).urls,
    [ORIGIN + "/topics", ORIGIN + "/topics/first"]);
  assert.deepEqual(selectChangedUrls(["src/pages/topics/[slug].astro"], reader({ [path]: after }), reader({})).urls,
    [ORIGIN + "/topics", ORIGIN + "/topics/first", ORIGIN + "/topics/second"]);
});

test("launch and shared templates do not trigger corpus-wide submission", () => {
  const launches = selectChangedUrls(["content/whatships.json"], reader({}), reader({}));
  assert.deepEqual(launches.urls, [ORIGIN + "/directory", ORIGIN + "/launches", ORIGIN + "/research"]);
  assert.match(launches.limitations[0], /existing WhatShips workflow/);
  const shared = selectChangedUrls(["src/pages/startups/[slug].astro"], reader(files), reader({}));
  assert.equal(shared.urls.length, 4);
  assert.ok(shared.urls.includes(ORIGIN + "/directory"));
  assert.match(shared.limitations[0], /bounded set/);
});

test("removed startup updates hubs, and oversized exact change sets fail closed", () => {
  const removal = selectChangedUrls(["content/startups/new-startup.json"], reader({}), reader(files));
  assert.deepEqual(removal.urls, [ORIGIN + "/", ORIGIN + "/directory", ORIGIN + "/news", ORIGIN + "/research"]);
  const topics = Array.from({ length: 101 }, (_, index) => ({ slug: `topic-${index}` }));
  assert.throws(() => selectChangedUrls(["content/topic-pages.json"], reader({ "content/topic-pages.json": topics }), reader({})), /exceeds 100/);
});

test("directory and funding pagination changes reach the right HTML discovery hubs", () => {
  assert.deepEqual(selectChangedUrls(["src/pages/directory.astro"], reader({}), reader({})).urls, [ORIGIN + "/directory"]);
  assert.deepEqual(selectChangedUrls(["src/pages/index.astro"], reader({}), reader({})).urls, [ORIGIN + "/", ORIGIN + "/directory"]);
  for (const file of ["src/pages/news/page/[page].astro", "src/components/FundingNewsPage.astro", "src/lib/funding-pagination.ts"]) {
    const selected = selectChangedUrls([file], reader({}), reader({}));
    assert.deepEqual(selected.urls, [ORIGIN + "/news"]);
    assert.match(selected.limitations[0], /pagination/);
  }
  assert.ok(selectChangedUrls(["src/lib/content-transform.ts"], reader({}), reader({})).urls.includes(ORIGIN + "/directory"));
});

function htmlResponse(url: string, options: { status?: number; type?: string; canonical?: string; robots?: string; xRobots?: string } = {}) {
  return new Response(`<html><head><link href='${options.canonical ?? url}' rel='canonical'><meta content='${options.robots ?? "index,follow"}' name='robots'></head></html>`, {
    status: options.status ?? 200,
    headers: { "content-type": options.type ?? "text/html; charset=utf-8", ...(options.xRobots ? { "x-robots-tag": options.xRobots } : {}) },
  });
}

test("live check requires an exact 200 HTML canonical without robots exclusion", async () => {
  const url = ORIGIN + "/startups/new-startup";
  assert.equal((await checkLiveHtml(url, async () => htmlResponse(url))).eligible, true);
  for (const canonical of [ORIGIN + "/directory", ORIGIN + "/news/page/2"]) {
    assert.equal((await checkLiveHtml(canonical, async () => htmlResponse(canonical))).eligible, true);
  }
  for (const [options, reason] of [
    [{ status: 302 }, "http-not-200"],
    [{ status: 404 }, "http-not-200"],
    [{ type: "application/json" }, "not-html"],
    [{ canonical: ORIGIN + "/" }, "canonical-mismatch"],
    [{ robots: "noindex,follow" }, "noindex"],
    [{ xRobots: "bingbot: noindex" }, "noindex"],
    [{ robots: "none" }, "noindex"],
  ] as const) {
    assert.equal((await checkLiveHtml(url, async () => htmlResponse(url, options))).reason, reason);
  }
  assert.equal((await checkLiveHtml(url, async () => { throw new Error("timeout"); })).eligible, false);
  await assert.rejects(checkLiveHtml("https://venturedex.co:444/", async () => htmlResponse(url)), /production origin/);
  await assert.rejects(checkLiveHtml(ORIGIN + "/ai-index.json", async () => htmlResponse(url)), /canonical HTML/);
});

const plan: DiscoveryPlan = { sha: "a".repeat(40), baseSha: "b".repeat(40), mode: "since-discovery", changedFiles: ["content/startups/new-startup.json"], urls: [ORIGIN + "/startups/new-startup"], limitations: [] };

test("any failed live check prevents every POST and keeps indexing unconfirmed", async () => {
  let submissions = 0;
  const receipt = await executeDiscovery(plan, { fetchFn: async () => htmlResponse(plan.urls[0], { robots: "noindex" }), submit: async () => { submissions++; } });
  assert.equal(receipt.status, "failed");
  assert.equal(submissions, 0);
  assert.equal(receipt.indexingConfirmed, false);
});

test("successful notification and dry run are distinguished from indexing", async () => {
  let submissions = 0;
  const dependencies = { fetchFn: async () => htmlResponse(plan.urls[0]), submit: async () => { submissions++; } };
  const receipt = await executeDiscovery(plan, dependencies);
  assert.equal(receipt.status, "submitted");
  assert.equal(receipt.indexingConfirmed, false);
  assert.match(receipt.message, /not proof/);
  const preview = await executeDiscovery(plan, { ...dependencies, dryRun: true });
  assert.equal(preview.status, "verified-dry-run");
  assert.equal(submissions, 1);
});

test("no-op plans make no network requests and submission failures remain failures", async () => {
  const noop = await executeDiscovery({ ...plan, urls: [] }, { fetchFn: async () => { throw new Error("must not fetch"); }, submit: async () => { throw new Error("must not submit"); } });
  assert.equal(noop.status, "noop");
  const failed = await executeDiscovery(plan, { fetchFn: async () => htmlResponse(plan.urls[0]), submit: async () => { throw new Error("HTTP 429"); } });
  assert.equal(failed.status, "failed");
  assert.match(failed.message, /marker unchanged/);
});

test("git discovery uses cached range, dedupes same SHA, and bounds the missing-base fallback", () => {
  const cwd = mkdtempSync(join(tmpdir(), "venturedex-discovery-git-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = (path: string, value: unknown) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), JSON.stringify(value));
    git("add", "--", path);
    git("-c", "user.name=Discovery Test", "-c", "user.email=discovery@example.invalid", "commit", "-m", "fixture");
    return git("rev-parse", "HEAD");
  };
  try {
    git("init");
    const first = commit("content/timestamps.json", timestamps);
    assert.equal(planDeployment(cwd, first, null).mode, "fallback-hubs");
    const second = commit("content/startups/new-startup.json", startup);
    assert.ok(planDeployment(cwd, second, null).urls.includes(ORIGIN + "/startups/new-startup"));
    const third = commit("docs/operations.md", "operational note");
    assert.deepEqual(planDeployment(cwd, third, null).urls, []);
    const state = { schemaVersion: 1 as const, completedSha: first, completedAt: "2026-09-08T00:00:00Z" };
    const accumulated = planDeployment(cwd, third, state);
    assert.equal(accumulated.mode, "since-discovery");
    assert.ok(accumulated.urls.includes(ORIGIN + "/startups/new-startup"));
    const repeated = planDeployment(cwd, third, { ...state, completedSha: third });
    assert.equal(repeated.mode, "already-completed");
    assert.deepEqual(repeated.urls, []);
    assert.equal(planDeployment(cwd, third, { ...state, completedSha: "f".repeat(40) }).mode, "current-commit");
    assert.throws(() => planDeployment(cwd, second, state), /checked-out release/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("Deploy discovery follows release without changing release serialization or protection", () => {
  const workflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
  assert.ok(workflow.indexOf("run: bash scripts/manage.sh release") < workflow.indexOf("scripts/promotion/deploy-discovery.ts"));
  assert.match(workflow, /group: venturedex-production-deploy/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /steps\.discovery\.outcome == 'success'/);
  assert.match(workflow, /actions\/cache\/restore@v4/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /if: always\(\) && steps\.discovery\.outputs\.attempted == 'true'/);
  assert.ok(workflow.indexOf('echo "attempted=true" >> "$GITHUB_OUTPUT"') < workflow.indexOf("npx tsx scripts/promotion/deploy-discovery.ts"));
  assert.doesNotMatch(workflow, /always\(\) && steps\.discovery\.outcome != 'skipped'/);
});
