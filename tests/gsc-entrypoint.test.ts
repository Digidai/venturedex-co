import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entrypoint = path.join(repoRoot, "scripts", "submit-gsc-direct.sh");

test("GSC production entrypoint fails closed for all direct submissions", () => {
  for (const args of [[], ["--latest-daily"], ["--url", "https://venturedex.co/startups/alpha"], ["--force"]]) {
    const result = spawnSync("bash", [entrypoint, ...args], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Codex in-app browser/);
    assert.match(result.stderr, /plan, begin, and finish/);
    assert.match(result.stderr, /No browser was launched/);
  }
});

test("GSC dry-run compatibility delegates target arguments to the Codex planner", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "venturedex-gsc-entrypoint-"));
  const scripts = path.join(root, "scripts");
  mkdirSync(scripts);
  cpSync(entrypoint, path.join(scripts, "submit-gsc-direct.sh"));
  writeFileSync(
    path.join(scripts, "gsc-codex.py"),
    "import json, sys\nprint(json.dumps(sys.argv[1:]))\n",
  );
  try {
    for (const args of [[], ["--latest-daily", "--url", "https://venturedex.co/startups/alpha", "--max-urls", "3"]]) {
      const result = spawnSync("bash", [path.join(scripts, "submit-gsc-direct.sh"), "--dry-run", ...args], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), ["plan", ...args]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC production no longer includes the injected legacy browser runtime", () => {
  const source = readFileSync(entrypoint, "utf8");
  assert.doesNotMatch(source, /bb-browser|COMET|CDP|gsc-browser-runtime|tests\/fixtures/);
  assert.equal(existsSync(path.join(repoRoot, "scripts", "gsc-browser-runtime.js")), false);
  const fixture = path.join(repoRoot, "tests", "fixtures", "gsc-legacy-submit.sh");
  const result = spawnSync("bash", [fixture, "--latest-daily"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Retired GSC test fixture/);
});

test("GSC npm planning aliases use Codex while submit aliases remain fail-closed", () => {
  const { scripts } = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assert.equal(scripts["seo:gsc:plan"], "python3 scripts/gsc-codex.py plan");
  for (const kind of ["daily", "weekly", "latest"]) {
    assert.match(scripts[`seo:gsc:${kind}:dry`], /^python3 scripts\/gsc-codex\.py plan /);
    assert.match(scripts[`seo:gsc:${kind}:submit`], /^bash scripts\/submit-gsc-direct\.sh /);
  }
});
