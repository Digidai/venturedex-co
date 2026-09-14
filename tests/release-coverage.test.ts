import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/verify-release-coverage.py", import.meta.url));

test("successor coverage needs ancestry AND unchanged task paths, never just a later green CI", () => {
  const root = mkdtempSync(join(tmpdir(), "vd-release-coverage-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const commit = () => { git("add", "."); git("commit", "-qm", "fixture"); return git("rev-parse", "HEAD"); };
  const verify = (base: string, source: string, release: string) => spawnSync("python3", [script, "--base-sha", base, "--source-sha", source, "--release-sha", release], { cwd: root, encoding: "utf8" });
  try {
    git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "Fixture");
    writeFileSync(join(root, "startup with spaces.json"), "old\n");
    const base = commit();
    writeFileSync(join(root, "startup with spaces.json"), "published\n");
    const source = commit();
    writeFileSync(join(root, "unrelated.md"), "separate task\n");
    const successor = commit();
    for (const release of [source, successor]) {
      const result = verify(base, source, release);
      assert.equal(result.status, 0, result.stderr);
      const proof = JSON.parse(result.stdout);
      assert.equal(proof.covered, true);
      assert.equal(proof.read_only, true);
      assert.equal(proof.ci_deploy_live_verified, false);
      assert.deepEqual(proof.task_paths, ["startup with spaces.json"]);
    }
    writeFileSync(join(root, "startup with spaces.json"), "old\n");
    const reverted = commit();
    const conflict = verify(base, source, reverted);
    assert.notEqual(conflict.status, 0);
    assert.match(conflict.stderr, /Successor changed task paths/);
    assert.notEqual(verify(base, source, base).status, 0);
    assert.notEqual(verify(base.slice(0, 8), source, successor).status, 0);
    assert.notEqual(verify("-".repeat(40), source, successor).status, 0);
    assert.equal(git("rev-parse", "HEAD"), reverted);
    assert.equal(git("status", "--porcelain"), "");
    assert.equal(readFileSync(join(root, "startup with spaces.json"), "utf8"), "old\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
