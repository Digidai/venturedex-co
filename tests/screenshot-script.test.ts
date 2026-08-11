import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("screenshot overlay scoring keeps its geometry helper in the browser callback", () => {
  const script = readFileSync(path.join(repoRoot, "scripts", "screenshot.sh"), "utf8");
  const callbackStart = script.indexOf(
    "const candidates = await page.evaluate(({ focusZones, viewport }) => {",
  );
  const callbackEnd = script.indexOf("}, { focusZones, viewport });", callbackStart);

  assert.notEqual(callbackStart, -1, "overlay-scoring page.evaluate callback is missing");
  assert.notEqual(callbackEnd, -1, "overlay-scoring page.evaluate callback is unterminated");

  const callback = script.slice(callbackStart, callbackEnd);
  assert.match(
    callback,
    /const overlapArea = \(rect, zone\) => \{/,
    "helpers called by page.evaluate must be declared in its serialized browser closure",
  );
  assert.match(callback, /focusZones\.some\(zone => overlapArea\(/);
});
