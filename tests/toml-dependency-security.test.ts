import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("the installed build-time TOML parser rejects unterminated commented arrays without hanging", () => {
  // CVE-2026-85730 / GHSA-7w5x-hrqm-74c2. Isolate the regression so a
  // vulnerable lockfile fails within a bound instead of freezing the suite.
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { parse, TomlError } from "smol-toml";
    assert.throws(() => parse("a=[1 #"), TomlError);
    assert.deepEqual(parse("a=[1, 2]"), { a: [1, 2] });
  `], { cwd: root, timeout: 5000, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 16_384 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
});
