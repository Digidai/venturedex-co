import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workerSource = readFileSync(new URL("../src/worker.ts", import.meta.url), "utf8");
const wranglerSource = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const scheduledStart = workerSource.indexOf("async scheduled(");
const queueStart = workerSource.indexOf("async queue(", scheduledStart);
const scheduledSource = workerSource.slice(scheduledStart, queueStart);

test("scheduled newsletter failures are logged and remain rejected", () => {
  assert.ok(scheduledStart >= 0 && queueStart > scheduledStart, "scheduled handler must be present");
  assert.match(scheduledSource, /const cycle = runNewsletterCycle/);
  assert.match(scheduledSource, /requireSuccessfulNewsletterCycle\(result\)/);
  assert.match(
    scheduledSource,
    /\.catch\(\(error\) => \{[\s\S]*newsletter_cycle_error[\s\S]*throw error;[\s\S]*\}\)/
  );
  assert.match(scheduledSource, /ctx\.waitUntil\(cycle\);[\s\S]*await cycle;/);
});

test("custom Worker entrypoint comment tracks the installed adapter major", () => {
  const header = workerSource.slice(0, 500);
  assert.match(header, /adapter v14/);
  assert.doesNotMatch(header, /adapter v13/);
});

test("Worker cron dispatch stays aligned with the deployed Wrangler triggers", () => {
  const workerCrons = [...workerSource.matchAll(/const (?:DAILY|WEEKLY)_CRON = "([^"]+)";/g)]
    .map((match) => match[1])
    .sort();
  const triggerBlock = wranglerSource.match(/\[triggers\]\s+crons\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(triggerBlock, "wrangler.toml must declare a [triggers] cron list");
  const deployedCrons = [...triggerBlock[1].matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(workerCrons, deployedCrons);
});
