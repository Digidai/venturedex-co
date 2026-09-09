import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { fundingAmountLabel, fundingStageLabel, fundingSummary, normalizeFundingStage } from "../src/lib/funding-terms";
import type { FundingRound } from "../src/lib/types";
import { createContentReaders } from "../src/lib/content-transform";
import { newsJsonLd } from "../src/lib/seo";

const root = fileURLToPath(new URL("..", import.meta.url));
function probe(expression: string, payload: unknown) {
  const result = spawnSync("python3", ["-c", `import json,sys\nfrom datetime import date\nsys.path.insert(0, 'scripts')\nimport curation as c\nimport funding_terms as f\np=json.load(sys.stdin)\nprint(json.dumps(${expression}))`], { cwd: root, input: JSON.stringify(payload), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
const review = () => ({ slug: "example", company_url: "https://example.com/", state: "evidence_pending", reason_code: "funding_evidence_gap", reason: "The source does not yet confirm the named round; retain for evidence review.", reviewed_at: "2026-09-09", next_review_at: "2026-09-10", priority: 2, sources: ["https://example.com/news"], attempts: [] });
const evaluation = () => ({ rubric: "hardware", independent: true, funding_verified: true, product_evidence: [{ url: "https://example.com/specs", note: "The official specification documents the actual operating envelope." }, { url: "https://example.com/pilot", note: "The field demonstration shows the integration and operating workflow." }], taste: { bet: { pass: true, note: "A specific architecture trades maximum speed for reliable field endurance." }, craft: { pass: true, note: "The physical integration and test protocol provide inspectable craft evidence." }, specificity: { pass: false, note: "The first paying use case remains insufficiently specific in public materials." } } });
const errors = (row: unknown, originals: unknown = {}, startups: string[] = []) => probe("c.validate_review(p['row'], p['originals'], set(p['startups']), date(2026,9,9))", { row, originals, startups }) as string[];
function manifest() {
  const candidates = Array.from({ length: 10 }, (_, i) => ({ slug: `company-${i}`, company_url: `https://company-${i}.com/`, source_url: `https://company-${i}.com/news`, source_type: "company", announced_at: "2026-09-08", region: "undisclosed", industry: "hardware", state: "evidence_pending", reason: "Product evidence is pending a documented follow-up review.", discovery_mode: "fresh" }));
  const identities = candidates.map(({ slug, company_url, source_url }) => ({ company_url, slug, source_url }));
  return { schema_version: 1, run_id: "venturedex-daily-20260909T054150Z", locked_at: "2026-09-09", pool_sha256: createHash("sha256").update(JSON.stringify(identities)).digest("hex"), source_coverage: ["company", "regional_media", "industry_media"].map(type => ({ type, query: `${type} funding announcements`, outcome: "Checked original sources; recorded candidate evidence." })), candidates };
}
const manifestErrors = (data: unknown, startups: string[] = [], reviews?: string[]) => probe("c.validate_manifest(p['data'], set(p['startups']), date(2026,9,9), set(p['reviews']))", { data, startups, reviews: reviews ?? (data as ReturnType<typeof manifest>).candidates.map(c => c.slug) }) as string[];

test("funding stage normalization agrees across Python and TypeScript, without inventing stages", () => {
  const values = ["Pre-Seed", "pre seed", "Pre-Series A", "pre series a", "Seed+", "Series A+", "Series B extension", "Series Z", "Growth", "Series AA", "Series", ""];
  assert.deepEqual(probe("[f.normalize_funding_stage(v) for v in p]", values), values.map(normalizeFundingStage));
});
test("native currency, extensions, mixed rounds and undisclosed leads are valid", () => {
  for (const amount of ["EUR 6.5M", "INR 850M", "CNY 100M", "USD 10M", "$10M", "undisclosed"]) {
    const currency = amount.startsWith("$") || amount === "undisclosed" ? "USD" : amount.slice(0, 3);
    assert.deepEqual(probe("f.validate_funding_terms(p)", { amount, currency, stage: "Series A", stage_raw: "Series A+", instrument: "mixed", date: "2026-09-08" }), []);
  }
});
test("invalid currencies, invented stage mappings, zero amounts and invalid dates fail closed", () => {
  const base = { amount: "$10M", stage: "Seed", date: "2026-09-08" };
  for (const change of [{ amount: "EUR 10M" }, { currency: "EUR" }, { amount: "XYZ 10M", currency: "XYZ" }, { amount: "$0M" }, { amount: `$${"9".repeat(500)}M` }, { stage_raw: "Series A+" }, { stage: "Growth" }, { instrument: "venture debt or equity maybe" }, { date: "2026-02-30" }, { date: "2999-01-01" }]) {
    assert.ok(probe("f.validate_funding_terms(p)", { ...base, ...change }).length, JSON.stringify(change));
  }
});
test("source amounts remain native and mixed financing is not presented as equity", () => {
  const round = { amount: "EUR 10M", currency: "EUR", stage: "Series A", stage_raw: "Series A+", instrument: "mixed", lead_investor: "undisclosed" } as FundingRound;
  assert.equal(fundingAmountLabel(round), "EUR 10M (mixed financing)");
  assert.equal(fundingStageLabel(round), "Series A+");
  assert.equal(fundingSummary(round), "EUR 10M (mixed financing) Series A+; lead investor undisclosed");
  assert.equal(fundingAmountLabel({ amount: "undisclosed", instrument: "debt" }), "Undisclosed amount (debt)");
  const structured = JSON.stringify(newsJsonLd([{ ...round, id: "test", date: "2026-09-08", company_name: "Fixture", company_slug: "fixture", source_url: "https://example.com/", source_name: "Official" }]));
  assert.doesNotMatch(structured, /"name":"undisclosed"|led by undisclosed/);
});
test("evidence gaps are valid pending decisions, with bounded non-same-day retries", () => {
  assert.deepEqual(errors(review()), []);
  assert.ok(errors({ ...review(), next_review_at: "2026-09-09" }).length);
  assert.ok(errors({ ...review(), next_review_at: "2026-11-01" }).length);
  assert.ok(errors({ ...review(), state: "access_blocked", reason_code: "page_access", next_review_at: "2026-09-17" }).length);
  assert.ok(errors({ ...review(), state: "quality_rejected", reason_code: "funding_evidence_gap", next_review_at: null }).some(e => e.includes("state/reason")));
});
test("malformed state and reason JSON cannot bypass validation or crash the validator", () => {
  for (const change of [{ state: [] }, { reason_code: {} }, { slug: [] }, { priority: true }, { sources: [{}] }, { company_url: "https://127.0.0.1/" }, { company_url: "https://name:secret@example.com/" }]) assert.ok(errors({ ...review(), ...change }).length);
});
test("old decisions require exact hash and identity; frozen legacy history stays untouched", () => {
  const originals = { example: [{ slug: "example", company_url: "https://example.com/" }, "a".repeat(64)] };
  assert.ok(errors(review(), originals).some(e => e.includes("exact original hash")));
  assert.deepEqual(errors({ ...review(), original: { ledger: "rejected.jsonl", sha256: "a".repeat(64) } }, originals), []);
  assert.ok(errors({ ...review(), original: { ledger: "rejected.jsonl", sha256: "b".repeat(64) } }, originals).some(e => e.includes("hash mismatch")));
  assert.ok(errors({ ...review(), company_url: "https://different.com/", original: { ledger: "rejected.jsonl", sha256: "a".repeat(64) } }, originals).some(e => e.includes("identity differs")));
});
test("qualification requires two evidence observations and two explicit taste passes", () => {
  const row = { ...review(), state: "qualified_pending", reason_code: "publication_capacity", evaluation: evaluation() };
  assert.deepEqual(errors(row), []);
  assert.ok(errors({ ...row, evaluation: undefined }).length);
  row.evaluation.taste.craft.pass = false;
  assert.ok(errors(row).some(e => e.includes("at least two taste")));
  row.evaluation.product_evidence = row.evaluation.product_evidence.slice(0, 1);
  assert.ok(errors(row).some(e => e.includes("two source-bound")));
});
test("acceptance needs a real startup; pending cannot silently coexist with publication", () => {
  const row = { ...review(), state: "accepted", reason_code: "all_gates_passed", next_review_at: null, evaluation: evaluation() };
  assert.ok(errors(row).some(e => e.includes("existing validated startup")));
  assert.deepEqual(errors(row, {}, ["example"]), []);
  assert.ok(errors(review(), {}, ["example"]).some(e => e.includes("unresolved")));
});
test("planner is deterministic, read-only and bounded by the shared pool", () => {
  const rows = [review(), { ...review(), slug: "priority", priority: 1 }, { ...review(), slug: "later", next_review_at: "2026-09-12" }];
  const plan = probe("c.review_plan(p, date(2026,9,10), 1)", rows);
  assert.equal(plan.due_count, 2);
  assert.equal(plan.selected[0].slug, "priority");
  assert.equal(plan.remaining_due, 1);
  assert.match(plan.authorization, /not automatic acceptance/);
});
test("fixed pools need 10-20 unique identities and complementary source attempts, never a rejection quota", () => {
  assert.deepEqual(manifestErrors(manifest()), []);
  const short = manifest(); short.candidates.pop();
  assert.ok(manifestErrors(short).some(e => e.includes("10-20")));
  const changed = manifest(); changed.candidates[0].company_url = "https://changed.com/";
  assert.ok(manifestErrors(changed).some(e => e.includes("hash mismatch")));
  const narrow = manifest(); narrow.source_coverage.forEach(s => s.type = "discovery");
  assert.ok(manifestErrors(narrow).some(e => e.includes("complementary")));
});
test("five accepted and two qualified overflow are valid with zero forced rejections", () => {
  const data = manifest();
  for (let i = 0; i < 7; i++) Object.assign(data.candidates[i], { state: i < 5 ? "accepted" : "qualified_pending", evaluation: evaluation() });
  assert.deepEqual(manifestErrors(data, data.candidates.slice(0, 5).map(c => c.slug)), []);
  data.candidates[5].state = "accepted";
  assert.ok(manifestErrors(data, data.candidates.slice(0, 6).map(c => c.slug)).some(e => e.includes("at most five")));
});
test("fresh qualified candidates need a dated in-window source; revisits need durable records", () => {
  const data = manifest(); Object.assign(data.candidates[0], { state: "qualified_pending", evaluation: evaluation(), announced_at: "2026-01-01" });
  assert.ok(manifestErrors(data).some(e => e.includes("30-day")));
  data.candidates[0].discovery_mode = "revisit";
  assert.ok(manifestErrors(data, [], []).some(e => e.includes("durable review")));
});
test("the full review overlay validates without editing the rejection ledger", () => {
  const before = readFileSync(`${root}/content/rejected.jsonl`);
  const count = probe("len(c.load_reviews())", null);
  assert.ok(count >= 57);
  assert.deepEqual(readFileSync(`${root}/content/rejected.jsonl`), before);
});

test("non-null source terms survive both the generated D1 seed and content reader", () => {
  const temp = mkdtempSync(join(tmpdir(), "vd-native-funding-"));
  try {
    const startupDir = join(temp, "startups"); mkdirSync(startupDir);
    const weeklyDir = join(temp, "weekly"); mkdirSync(weeklyDir);
    writeFileSync(join(weeklyDir, "fixture.json"), JSON.stringify({ issue_number: 1, title: "Test fixture", status: "published", published_at: "2026-09-01", startups: [] }));
    const record = JSON.parse(readFileSync(`${root}/content/startups/kodesage.json`, "utf8"));
    Object.assign(record.funding[0], { amount: "EUR 6.5M", currency: "EUR", stage: "Pre-Series A", stage_raw: "pre series a", instrument: "mixed" });
    writeFileSync(join(startupDir, "kodesage.json"), JSON.stringify(record));
    const canonical = join(temp, "canonical.json"), seed = join(temp, "seed.sql");
    execFileSync("bash", ["scripts/build-db.sh"], { cwd: root, env: { ...process.env, VENTUREDEX_STARTUPS_DIR: startupDir, VENTUREDEX_WEEKLY_DIR: weeklyDir, VENTUREDEX_SEED_OUTPUT: seed, EMIT_CANONICAL_JSON: canonical }, stdio: "pipe" });
    const pythonRound = JSON.parse(readFileSync(canonical, "utf8")).funding.kodesage[0];
    const readers = createContentReaders({ records: [record], timestamps: {}, investorDirectory: {}, collectionConfigs: [] });
    const tsRound = readers.getContentFundingRoundsForStartup("kodesage")[0];
    assert.ok(tsRound);
    for (const key of ["currency", "stage_raw", "instrument"] as const) assert.equal(tsRound[key], pythonRound[key]);
    const sql = readFileSync(seed, "utf8");
    assert.match(sql, /INSERT INTO funding_rounds \([^\n]*currency, stage_raw, instrument/);
    assert.match(sql, /'EUR', 'pre series a', 'mixed'/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("funding schema migration is additive, idempotent and rejects remote use", () => {
  const code = `import importlib.util,json,sys\ns=importlib.util.spec_from_file_location('m','scripts/migrate-funding.py')\nm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nprint(json.dumps(m.missing_columns(json.load(sys.stdin))))`;
  const run = (payload: unknown) => spawnSync("python3", ["-c", code], { cwd: root, input: JSON.stringify(payload), encoding: "utf8" });
  const base = ["id", "amount", "stage", "source_url"];
  const payload = (columns: string[], success = true) => [{ success, results: columns.map(name => ({ name })) }];
  assert.deepEqual(JSON.parse(run(payload(base)).stdout), ["currency", "stage_raw", "instrument"]);
  assert.deepEqual(JSON.parse(run(payload([...base, "currency", "stage_raw", "instrument"])).stdout), []);
  for (const bad of [[], payload([]), payload(base, false), [{ results: base.map(name => ({ name })) }]]) assert.notEqual(run(bad).status, 0);
  assert.notEqual(spawnSync("python3", ["scripts/migrate-funding.py", "--remote"], { cwd: root, encoding: "utf8" }).status, 0);
});

test("the guarded remote funding migration cannot ALTER after a failed or incomplete probe", () => {
  const manager = readFileSync(`${root}/scripts/manage.sh`, "utf8");
  const start = manager.indexOf("ensure_current_remote_schema() {");
  const end = manager.indexOf('  if ! output="$(\n    cd "$REPO_ROOT" && npx wrangler d1 execute "$DB_NAME" --remote --command \\\n      "PRAGMA table_info(startups);"', start);
  assert.ok(start > 0 && end > start);
  const fundingFunction = manager.slice(start, end) + "}\n";
  const run = (success: boolean, names: string[]) => spawnSync("bash", ["-c", `set -euo pipefail\nREPO_ROOT="$PWD"\nDB_NAME=fixture\nextract_wranger_json() { command cat; }\nnpx() { if [[ "$*" == *"PRAGMA"* ]]; then printf '%s' "$VD_PROBE"; else printf 'MUTATION %s\\n' "$*" >&2; fi; }\n${fundingFunction}\nensure_current_remote_schema`], { cwd: root, env: { ...process.env, VD_PROBE: JSON.stringify([{ success, results: names.map(name => ({ name })) }]) }, encoding: "utf8" });
  const base = ["id", "amount", "stage", "source_url"];
  for (const result of [run(false, base), run(true, [])]) { assert.notEqual(result.status, 0); assert.doesNotMatch(result.stderr, /MUTATION/); }
  const result = run(true, base);
  assert.equal(result.status, 0, result.stderr);
  assert.equal((result.stderr.match(/MUTATION/g) || []).length, 3);
  assert.doesNotMatch(result.stderr, /DROP|DELETE|UPDATE/);
  const current = run(true, [...base, "currency", "stage_raw", "instrument"]);
  assert.equal(current.status, 0, current.stderr); assert.doesNotMatch(current.stderr, /MUTATION/);
});
