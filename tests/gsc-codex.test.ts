import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts", "gsc-codex.py");
const target = "https://venturedex.co/startups/alpha";
const header = "timestamp\tstatus\turl\tmessage\n";
const route = "https://search.google.com/search-console/inspect?resource_id=sc-domain%3Aventuredex.co&id=alpha-route";

function fixture(): { root: string; history: string; artifacts: string } {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "venturedex-codex-gsc-")));
  return { root, history: path.join(root, "history.tsv"), artifacts: path.join(root, "artifacts") };
}

type Fixture = ReturnType<typeof fixture>;

function invoke(f: Fixture, command: string, args: string[] = [], fault: false | "append-failure" | "append-zero" | "append-negative" | "replace-before-append" | "replace-after-append" | "live-check-forbidden" = false, advanceClockSeconds = 0) {
  // Only HTTP availability is mocked. All ledger, file, evidence, locking, and
  // transaction behavior runs through the real production implementation.
  const harness = [
    "import importlib.util, sys",
    "spec = importlib.util.spec_from_file_location('gsc_codex', sys.argv[1])",
    "module = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(module)",
    "module.live_check = lambda url: None",
    ...(fault === "live-check-forbidden" ? [
      "def unexpected_live_check(url): raise AssertionError('defer must never contact the target')",
      "module.live_check = unexpected_live_check",
    ] : []),
    ...(advanceClockSeconds ? [
      "original_now = module.now",
      `module.now = lambda: original_now() + module.dt.timedelta(seconds=${advanceClockSeconds})`,
    ] : []),
    ...(fault === "append-failure" ? [
      "def fail_append(*args): raise OSError('injected ledger append failure')",
      "module.os.write = fail_append",
    ] : []),
    ...(fault === "append-zero" || fault === "append-negative" ? [
      `module.os.write = lambda *args: ${fault === "append-zero" ? 0 : -1}`,
    ] : []),
    ...(fault === "replace-before-append" ? [
      "original_exclusive_write = module.exclusive_write",
      "def replace_before_append(file, data):",
      "    original_exclusive_write(file, data)",
      "    if str(file).endswith('-intent.json'):",
      `        ledger = module.Path(${JSON.stringify(f.history)})`,
      "        replacement = ledger.with_suffix('.replacement')",
      "        replacement.write_bytes(ledger.read_bytes())",
      "        module.os.replace(replacement, ledger)",
      "module.exclusive_write = replace_before_append",
    ] : []),
    ...(fault === "replace-after-append" ? [
      "original_write = module.os.write",
      "def replace_after_append(fd, data):",
      "    result = original_write(fd, data)",
      "    if b'\\trequest_click_pending\\t' in data:",
      `        ledger = module.Path(${JSON.stringify(f.history)})`,
      "        replacement = ledger.with_suffix('.replacement')",
      "        replacement.write_bytes(ledger.read_bytes()[:-len(data)])",
      "        module.os.replace(replacement, ledger)",
      "    return result",
      "module.os.write = replace_after_append",
    ] : []),
    "sys.argv = sys.argv[1:]",
    "module.main()",
  ].join("\n");
  return spawnSync("python3", [
    "-c", harness, script, command,
    "--history", f.history, "--artifact-dir", f.artifacts,
    ...args,
  ], {
    cwd: repoRoot,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    encoding: "utf8",
    timeout: 10_000,
  });
}

function proof(f: Fixture, state = "request_ready", changes: Record<string, unknown> = {}): string {
  const file = path.join(f.root, `proof-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify({
    browser: "iab",
    tab_id: "codex-test-tab",
    inspected_url: target,
    page_url: route,
    observed_at: new Date().toISOString(),
    state,
    excerpt: `${target}\n${state === "requested" ? "dialog Indexing requested" : state === "quota_exceeded" ? "dialog Quota exceeded" : "button REQUEST INDEXING"}`,
    ...changes,
  }));
  return file;
}

function begin(f: Fixture): string {
  const result = invoke(f, "begin", ["--url", target, "--evidence", proof(f)]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.click_authorized_once, true);
  return output.attempt;
}

test("Codex GSC plan is read-only and does not create ledger, lock, or artifacts", () => {
  const f = fixture();
  try {
    const before = readdirSync(f.root);
    const result = invoke(f, "plan", ["--url", target, "--expect-url", target]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).targets, [{ url: target, status: "ready" }]);
    assert.equal(JSON.parse(result.stdout).read_only, true);
    assert.deepEqual(readdirSync(f.root), before);
    assert.equal(existsSync(f.history), false);
    assert.equal(existsSync(`${f.history}.lock`), false);
    assert.equal(existsSync(f.artifacts), false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC plan skips requested URLs and rejects post-click uncertainty", () => {
  const f = fixture();
  try {
    for (const [status, expected] of [
      ["requested", "already_requested"],
      ["post_request_confirmation_unknown", "unresolved_ledger:post_request_confirmation_unknown"],
      ["request_click_pending", "unresolved_ledger:request_click_pending"],
    ]) {
      const ledger = `${header}2026-08-01 12:00:00\t${status}\t${target}\tprevious attempt\n`;
      writeFileSync(f.history, ledger);
      const planned = invoke(f, "plan", ["--url", target]);
      assert.equal(planned.status, 0, planned.stderr);
      assert.equal(JSON.parse(planned.stdout).targets[0].status, expected);
      assert.equal(readFileSync(f.history, "utf8"), ledger);
      const blocked = invoke(f, "begin", ["--url", target, "--evidence", proof(f)]);
      assert.equal(blocked.status, 2);
      assert.match(blocked.stderr, /No click allowed/);
      assert.equal(readFileSync(f.history, "utf8"), ledger);
      assert.deepEqual(readdirSync(f.artifacts), []);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC begin persists intent and ledger before authorizing exactly one click", () => {
  const f = fixture();
  try {
    const attempt = begin(f);
    const intent = JSON.parse(readFileSync(path.join(f.artifacts, `codex-${attempt}-intent.json`), "utf8"));
    assert.equal(intent.url, target);
    assert.equal(intent.evidence.browser, "iab");
    assert.equal(intent.evidence.page_url, route);
    assert.match(readFileSync(f.history, "utf8"), new RegExp(`\\trequest_click_pending\\t${target}\\tcodex-iab attempt=${attempt};`));
    assert.equal(existsSync(`${f.history}.lock`), false);
    const repeated = invoke(f, "begin", ["--url", target, "--evidence", proof(f)]);
    assert.equal(repeated.status, 2);
    assert.match(repeated.stderr, /unresolved_ledger:request_click_pending/);
    assert.equal(readdirSync(f.artifacts).filter(name => name.endsWith("-intent.json")).length, 1);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC orphan durable intent blocks retry after ledger append failure", () => {
  const f = fixture();
  try {
    const result = invoke(f, "begin", ["--url", target, "--evidence", proof(f)], "append-failure");
    assert.equal(result.status, 2);
    assert.match(result.stderr, /injected ledger append failure/);
    assert.equal(readFileSync(f.history, "utf8"), header);
    assert.equal(readdirSync(f.artifacts).filter(name => name.endsWith("-intent.json")).length, 1);
    const planned = invoke(f, "plan", ["--url", target]);
    assert.equal(planned.status, 0, planned.stderr);
    assert.match(JSON.parse(planned.stdout).targets[0].status, /^unresolved_codex_intent:/);
    const repeated = invoke(f, "begin", ["--url", target, "--evidence", proof(f)]);
    assert.equal(repeated.status, 2);
    assert.match(repeated.stderr, /unresolved_codex_intent:/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC rejects stale, wrong-browser, wrong-URL, and existing-success ready evidence", () => {
  const f = fixture();
  try {
    for (const changes of [
      { browser: "comet" },
      { inspected_url: "https://venturedex.co/startups/beta" },
      { observed_at: "2020-01-01T00:00:00Z" },
      { excerpt: `${target}\nbutton REQUEST INDEXING\ntext Indexing requested` },
      { excerpt: `${target}-other\nbutton REQUEST INDEXING` },
      { excerpt: `${target}\nhttps://venturedex.co/weekly/1\nbutton REQUEST INDEXING` },
      { excerpt: "button REQUEST INDEXING" },
      { page_url: route.replace("venturedex.co", "example.com") },
    ]) {
      const result = invoke(f, "begin", ["--url", target, "--evidence", proof(f, "request_ready", changes)]);
      assert.equal(result.status, 2);
      assert.equal(existsSync(f.history), false);
      assert.equal(existsSync(f.artifacts), false);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC finish compares actual instants across timezone offsets", () => {
  const f = fixture();
  try {
    const attempt = begin(f);
    const intent = JSON.parse(readFileSync(path.join(f.artifacts, `codex-${attempt}-intent.json`), "utf8"));
    const earlier = new Date(Date.parse(intent.created_at) - 1000 + 8 * 3600_000).toISOString().replace("Z", "+08:00");
    const stale = invoke(f, "finish", ["--attempt", attempt, "--evidence", proof(f, "requested", { observed_at: earlier })]);
    assert.equal(stale.status, 2);
    assert.match(stale.stderr, /follow intent/);
    const later = new Date(Date.now() - 7 * 3600_000).toISOString().replace("Z", "-07:00");
    const valid = invoke(f, "finish", ["--attempt", attempt, "--evidence", proof(f, "requested", { observed_at: later })]);
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(valid.stdout).status, "requested");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC completed quota denial can retry after cooldown only with its matching receipt", () => {
  const f = fixture();
  try {
    const attempt = begin(f);
    const finished = invoke(f, "finish", ["--attempt", attempt, "--evidence", proof(f, "quota_exceeded")]);
    assert.equal(finished.status, 0, finished.stderr);
    const cooldown = invoke(f, "plan", ["--url", target]);
    assert.equal(JSON.parse(cooldown.stdout).targets[0].status, "quota_cooldown_24h");
    const agedLedger = readFileSync(f.history, "utf8").replace(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?=\tquota_exceeded\t)/gm, "2020-01-01 00:00:00");
    writeFileSync(f.history, agedLedger);
    const recovered = invoke(f, "plan", ["--url", target]);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(JSON.parse(recovered.stdout).targets[0].status, "ready");
    const receiptPath = path.join(f.artifacts, `codex-${attempt}-receipt.json`);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    writeFileSync(receiptPath, JSON.stringify({ ...receipt, attempt: "0".repeat(32) }));
    const mismatched = invoke(f, "plan", ["--url", target]);
    assert.equal(mismatched.status, 0, mismatched.stderr);
    assert.match(JSON.parse(mismatched.stdout).targets[0].status, /^unresolved_codex_intent:/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC plan preserves legacy uncertainty blockers even without a ledger row", () => {
  const f = fixture();
  try {
    mkdirSync(f.artifacts);
    const name = "20260801-120000-post_request_confirmation_unknown-alpha.txt";
    writeFileSync(path.join(f.artifacts, name), [
      "timestamp: 2026-08-01 12:00:00",
      "status: post_request_confirmation_unknown",
      `url: ${target}`,
      "message: completion unresolved",
      "page_state: unknown",
      "", "--- page text ---", target, "REQUEST INDEXING", "",
    ].join("\n"));
    const planned = invoke(f, "plan", ["--url", target]);
    assert.equal(planned.status, 0, planned.stderr);
    assert.equal(JSON.parse(planned.stdout).targets[0].status, `unresolved_legacy_artifact:${name}`);
    assert.equal(existsSync(f.history), false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC blocks legacy reconciliation provenance instead of trusting retry_pending", () => {
  const f = fixture();
  try {
    for (const message of [
      "manual pre-click reconciliation; archived evidence",
      "retry after verification; artifact=prior.txt",
      "retry after verification; sha256=abc",
      "retry after verification; file_identity=1:2",
      "retry after verification; artifact_dir_identity=1:2",
      "retry after verification; resolved_dir_identity=1:2",
    ]) {
      const ledger = `${header}2026-08-01 12:00:00\tretry_pending\t${target}\t${message}\n`;
      writeFileSync(f.history, ledger);
      const planned = invoke(f, "plan", ["--url", target]);
      assert.equal(planned.status, 0, planned.stderr);
      assert.equal(JSON.parse(planned.stdout).targets[0].status, "legacy_reconciliation_requires_review");
      const blocked = invoke(f, "begin", ["--url", target, "--evidence", proof(f)]);
      assert.equal(blocked.status, 2);
      assert.match(blocked.stderr, /legacy_reconciliation_requires_review/);
      assert.equal(readFileSync(f.history, "utf8"), ledger);
      assert.deepEqual(readdirSync(f.artifacts), []);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC begin never authorizes a click if the authoritative ledger inode changes", () => {
  for (const fault of ["replace-before-append", "replace-after-append"] as const) {
    const f = fixture();
    try {
      const result = invoke(f, "begin", ["--url", target, "--evidence", proof(f)], fault);
      assert.equal(result.status, 2, `${fault}: ${result.stdout}\n${result.stderr}`);
      assert.equal(readFileSync(f.history, "utf8"), header);
      assert.doesNotMatch(result.stdout, /"click_authorized_once": true/);
      assert.equal(readdirSync(f.artifacts).filter(name => name.endsWith("-intent.json")).length, 1);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("Codex GSC finish requires an explicit success on the same inspected URL, route, and tab", () => {
  const f = fixture();
  try {
    const attempt = begin(f);
    const pending = readFileSync(f.history, "utf8");
    for (const changes of [
      { excerpt: `${target}\nbutton REQUEST INDEXING` },
      { page_url: route.replace("alpha-route", "wrong-route") },
      { tab_id: "other-tab" },
      { inspected_url: "https://venturedex.co/startups/beta" },
    ]) {
      const result = invoke(f, "finish", ["--attempt", attempt, "--evidence", proof(f, "requested", changes)]);
      assert.equal(result.status, 2);
      assert.equal(readFileSync(f.history, "utf8"), pending);
      assert.equal(existsSync(path.join(f.artifacts, `codex-${attempt}-receipt.json`)), false);
    }
    const evidence = proof(f, "requested");
    const finished = invoke(f, "finish", ["--attempt", attempt, "--evidence", evidence]);
    assert.equal(finished.status, 0, finished.stderr);
    assert.equal(JSON.parse(finished.stdout).status, "requested");
    assert.equal(JSON.parse(finished.stdout).actual_indexing_verified, false);
    assert.match(readFileSync(f.history, "utf8"), /\trequested\t/);
    const receipt = JSON.parse(readFileSync(path.join(f.artifacts, `codex-${attempt}-receipt.json`), "utf8"));
    assert.equal(receipt.evidence.state, "requested");
    const ledger = readFileSync(f.history, "utf8");
    const duplicate = invoke(f, "finish", ["--attempt", attempt, "--evidence", evidence]);
    assert.equal(duplicate.status, 2);
    assert.match(duplicate.stderr, /no longer the authoritative pending transition/);
    assert.equal(readFileSync(f.history, "utf8"), ledger);
    const planned = invoke(f, "plan", ["--url", target]);
    assert.equal(JSON.parse(planned.stdout).targets[0].status, "already_requested");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC unknown finish stays blocked and quota halts other targets", () => {
  for (const state of ["unknown", "quota_exceeded"]) {
    const f = fixture();
    try {
      const attempt = begin(f);
      const result = invoke(f, "finish", ["--attempt", attempt, "--evidence", proof(f, state)]);
      assert.equal(result.status, 0, result.stderr);
      const expected = state === "unknown" ? "post_request_confirmation_unknown" : state;
      assert.equal(JSON.parse(result.stdout).status, expected);
      const sameTarget = invoke(f, "plan", ["--url", target]);
      assert.notEqual(JSON.parse(sameTarget.stdout).targets[0].status, "ready");
      if (state === "quota_exceeded") {
        const otherTarget = invoke(f, "plan", ["--url", "https://venturedex.co/startups/beta"]);
        assert.equal(JSON.parse(otherTarget.stdout).targets[0].status, "quota_cooldown_24h");
      }
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("Codex GSC recover commits an expired durable receipt after interrupted finish without a new click", () => {
  const f = fixture();
  try {
    const attempt = begin(f);
    const evidence = proof(f, "requested");
    const interrupted = invoke(f, "finish", ["--attempt", attempt, "--evidence", evidence], "append-failure");
    assert.equal(interrupted.status, 2);
    assert.match(interrupted.stderr, /injected ledger append failure/);
    const receiptPath = path.join(f.artifacts, `codex-${attempt}-receipt.json`);
    const receipt = readFileSync(receiptPath, "utf8");
    const pending = readFileSync(f.history, "utf8");
    assert.match(pending, /\trequest_click_pending\t/);
    assert.doesNotMatch(pending, /\trequested\t/);
    const staleFinish = invoke(f, "finish", ["--attempt", attempt, "--evidence", evidence], false, 600);
    assert.equal(staleFinish.status, 2);
    assert.match(staleFinish.stderr, /fresh timestamped observation/);
    assert.equal(readFileSync(f.history, "utf8"), pending);
    const recovered = invoke(f, "recover", ["--attempt", attempt], false, 600);
    assert.equal(recovered.status, 0, recovered.stderr);
    const output = JSON.parse(recovered.stdout);
    assert.equal(output.status, "requested");
    assert.equal(output.click_authorized_once, false);
    assert.equal(output.actual_indexing_verified, false);
    assert.equal(readFileSync(receiptPath, "utf8"), receipt);
    const ledger = readFileSync(f.history, "utf8");
    assert.equal(ledger.split("\trequested\t").length - 1, 1);
    const repeated = invoke(f, "recover", ["--attempt", attempt], false, 600);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.equal(JSON.parse(repeated.stdout).already_recorded, true);
    assert.equal(JSON.parse(repeated.stdout).click_authorized_once, false);
    assert.equal(readFileSync(f.history, "utf8"), ledger);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC recover rejects absent receipts, new evidence, and receipt identity or proof mismatches", () => {
  const f = fixture();
  try {
    const attempt = begin(f);
    const pending = readFileSync(f.history, "utf8");
    const absent = invoke(f, "recover", ["--attempt", attempt]);
    assert.equal(absent.status, 2);
    assert.doesNotMatch(absent.stdout, /"click_authorized_once": true/);
    assert.equal(readFileSync(f.history, "utf8"), pending);
    const newEvidence = invoke(f, "recover", ["--attempt", attempt, "--evidence", proof(f, "requested")]);
    assert.equal(newEvidence.status, 2);
    assert.match(newEvidence.stderr, /unrecognized arguments: --evidence/);
    const interrupted = invoke(f, "finish", ["--attempt", attempt, "--evidence", proof(f, "requested")], "append-failure");
    assert.equal(interrupted.status, 2);
    const receiptPath = path.join(f.artifacts, `codex-${attempt}-receipt.json`);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    const intent = JSON.parse(readFileSync(path.join(f.artifacts, `codex-${attempt}-intent.json`), "utf8"));
    for (const changes of [
      { version: 2 },
      { attempt: "0".repeat(32) },
      { url: "https://venturedex.co/startups/beta" },
      { status: "quota_exceeded" },
      { evidence: { ...receipt.evidence, tab_id: "other-tab" } },
      { evidence: { ...receipt.evidence, page_url: route.replace("alpha-route", "other-route") } },
      { evidence: { ...receipt.evidence, excerpt: `${target}\nbutton REQUEST INDEXING` } },
      { evidence: { ...receipt.evidence, observed_at: intent.created_at } },
    ]) {
      writeFileSync(receiptPath, JSON.stringify({ ...receipt, ...changes }));
      const result = invoke(f, "recover", ["--attempt", attempt], false, 600);
      assert.equal(result.status, 2, `${JSON.stringify(changes)}: ${result.stdout}\n${result.stderr}`);
      assert.doesNotMatch(result.stdout, /"click_authorized_once": true/);
      assert.equal(readFileSync(f.history, "utf8"), pending);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC recover records durable unknown as blocked, never authorizing replay", () => {
  const f = fixture();
  try {
    const attempt = begin(f);
    const interrupted = invoke(f, "finish", ["--attempt", attempt, "--evidence", proof(f, "unknown")], "append-failure");
    assert.equal(interrupted.status, 2);
    const recovered = invoke(f, "recover", ["--attempt", attempt], false, 600);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(JSON.parse(recovered.stdout).status, "post_request_confirmation_unknown");
    assert.equal(JSON.parse(recovered.stdout).click_authorized_once, false);
    const ledger = readFileSync(f.history, "utf8");
    const planned = invoke(f, "plan", ["--url", target]);
    assert.equal(JSON.parse(planned.stdout).targets[0].status, "unresolved_ledger:post_request_confirmation_unknown");
    const repeated = invoke(f, "recover", ["--attempt", attempt], false, 600);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.equal(JSON.parse(repeated.stdout).already_recorded, true);
    assert.equal(JSON.parse(repeated.stdout).click_authorized_once, false);
    assert.equal(readFileSync(f.history, "utf8"), ledger);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC accepts URL-less result modals only on the same intent-bound tab and route", () => {
  for (const [state, excerpt, expected] of [
    ["requested", "dialog Indexing requested\nbutton Dismiss", "requested"],
    ["quota_exceeded", "dialog Quota exceeded\ntext Daily limit reached", "quota_exceeded"],
    ["unknown", "text The result could not be loaded", "post_request_confirmation_unknown"],
  ]) {
    const f = fixture();
    try {
      const attempt = begin(f);
      const pending = readFileSync(f.history, "utf8");
      for (const changes of [
        { page_url: route.replace("alpha-route", "wrong-route") },
        { tab_id: "wrong-tab" },
        { excerpt: `${excerpt}\nhttps://venturedex.co/startups/beta` },
        { excerpt: `${excerpt}\n${target}\nhttps://venturedex.co/weekly/1` },
      ]) {
        const rejected = invoke(f, "finish", ["--attempt", attempt, "--evidence", proof(f, state, { excerpt, ...changes })]);
        assert.equal(rejected.status, 2, rejected.stdout);
        assert.equal(readFileSync(f.history, "utf8"), pending);
      }
      const result = invoke(f, "finish", ["--attempt", attempt, "--evidence", proof(f, state, { excerpt })]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).status, expected);
      assert.equal(JSON.parse(result.stdout).click_authorized_once, false);
      const receipt = JSON.parse(readFileSync(path.join(f.artifacts, `codex-${attempt}-receipt.json`), "utf8"));
      assert.equal(receipt.evidence.excerpt, excerpt);
      assert.doesNotMatch(receipt.evidence.excerpt, /https:\/\//);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("Codex GSC append fails closed instead of looping when writes make no progress", () => {
  for (const fault of ["append-zero", "append-negative"] as const) {
    const f = fixture();
    try {
      const result = invoke(f, "begin", ["--url", target, "--evidence", proof(f)], fault);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /Ledger append made no progress/);
      assert.doesNotMatch(result.stdout, /"click_authorized_once": true/);
      assert.equal(readFileSync(f.history, "utf8"), header);
      assert.equal(readdirSync(f.artifacts).filter(name => name.endsWith("-intent.json")).length, 1);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("Codex GSC defer queues an unclicked URL without HTTP or browser work", () => {
  const f = fixture();
  try {
    const result = invoke(f, "defer", ["--url", target, "--reason", "Codex browser login unavailable; no click attempted"], "live-check-forbidden");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "retry_pending");
    assert.equal(JSON.parse(result.stdout).click_authorized_once, false);
    assert.match(readFileSync(f.history, "utf8"), /\tretry_pending\t.*deferred before any click/);
    assert.deepEqual(readdirSync(f.artifacts), []);
    const backlog = invoke(f, "plan", ["--retry-pending"]);
    assert.equal(backlog.status, 0, backlog.stderr);
    assert.deepEqual(JSON.parse(backlog.stdout).targets, [{ url: target, status: "ready" }]);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC defer never downgrades requested, pending, unknown, or legacy reconciliation", () => {
  const f = fixture();
  try {
    for (const [status, message] of [
      ["requested", "previous success"],
      ["request_click_pending", "previous attempt"],
      ["post_request_confirmation_unknown", "unknown result"],
      ["pre_request_success_unverified", "legacy state"],
      ["reconciliation_archive_pending", "legacy archive"],
      ["retry_pending", "manual pre-click reconciliation; prior artifact"],
    ]) {
      const ledger = `${header}2026-08-01 12:00:00\t${status}\t${target}\t${message}\n`;
      writeFileSync(f.history, ledger);
      const result = invoke(f, "defer", ["--url", target, "--reason", "Login unavailable"], "live-check-forbidden");
      assert.equal(result.status, 2);
      assert.equal(readFileSync(f.history, "utf8"), ledger);
      assert.doesNotMatch(result.stdout, /"click_authorized_once": true/);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC defer preserves orphan intent even with no pending ledger row", () => {
  const f = fixture();
  try {
    const interrupted = invoke(f, "begin", ["--url", target, "--evidence", proof(f)], "append-failure");
    assert.equal(interrupted.status, 2);
    const result = invoke(f, "defer", ["--url", target, "--reason", "Run interrupted"], "live-check-forbidden");
    assert.equal(result.status, 2);
    assert.match(result.stderr, /unresolved_codex_intent/);
    assert.equal(readFileSync(f.history, "utf8"), header);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC defer queues only untouched quota backlog, never the quota-denied attempt", () => {
  const f = fixture();
  try {
    const attempt = begin(f);
    const quota = invoke(f, "finish", ["--attempt", attempt, "--evidence", proof(f, "quota_exceeded")]);
    assert.equal(quota.status, 0, quota.stderr);
    const untouched = "https://venturedex.co/startups/beta";
    const result = invoke(f, "defer", ["--url", untouched, "--reason", "Property quota exhausted before this URL was clicked"], "live-check-forbidden");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).click_authorized_once, false);
    const backlog = invoke(f, "plan", ["--retry-pending"]);
    assert.equal(backlog.status, 0, backlog.stderr);
    assert.deepEqual(JSON.parse(backlog.stdout).targets, [{ url: untouched, status: "quota_cooldown_24h" }]);
    for (const aged of [false, true]) {
      if (aged) {
        writeFileSync(f.history, readFileSync(f.history, "utf8").replace(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?=\tquota_exceeded\t)/gm, "2020-01-01 00:00:00"));
      }
      const ledger = readFileSync(f.history, "utf8");
      const previouslyClicked = invoke(f, "defer", ["--url", target, "--reason", "Quota stopped the run"], "live-check-forbidden");
      assert.equal(previouslyClicked.status, 2);
      assert.match(previouslyClicked.stderr, /prior click or reconciliation history/);
      assert.equal(readFileSync(f.history, "utf8"), ledger);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Codex GSC defer rejects multiline, oversized, empty, or unredacted reasons before writes", () => {
  const f = fixture();
  try {
    for (const reason of ["", "   ", "x".repeat(501), "first\tsecond", "first\nsecond", "first\rsecond", "first\u2028second", "token=not-a-real-secret", "Login for account@example.com failed", "See https://example.com/login"]) {
      const result = invoke(f, "defer", ["--url", target, "--reason", reason], "live-check-forbidden");
      assert.equal(result.status, 2);
      assert.equal(existsSync(f.history), false);
      assert.equal(existsSync(f.artifacts), false);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
