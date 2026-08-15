import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  linkSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helper = path.join(repoRoot, "scripts", "automation-run-state.py");

function temporaryAutomationDir(): string {
  return mkdtempSync(path.join(tmpdir(), "venturedex-run-state-"));
}

function environment(owner?: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CODEX_HOME;
  delete env.CODEX_THREAD_ID;
  if (owner !== undefined) {
    env.CODEX_THREAD_ID = owner;
  }
  return env;
}

function invoke(
  directory: string,
  owner: string | undefined,
  args: string[],
): ReturnType<typeof spawnSync> {
  return spawnSync(
    "python3",
    [helper, ...args, "--automation-dir", directory],
    {
      cwd: repoRoot,
      env: environment(owner),
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
    },
  );
}

function outputJson(result: ReturnType<typeof spawnSync>): Record<string, unknown> {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

function capture(child: ReturnType<typeof spawn>): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function readManagedCheckpoint(directory: string): Record<string, unknown> {
  const text = readFileSync(path.join(directory, "run-state.md"), "utf8");
  const match = text.match(/```json\s*\n(\{[\s\S]*\})\s*\n```/);
  assert.ok(match, text);
  return JSON.parse(match[1]);
}

test("concurrent scheduled threads acquire exactly one lease and the winner can renew", async () => {
  const directory = temporaryAutomationDir();
  const argumentsFor = (runId: string) => [
    helper,
    "acquire",
    "--run-id",
    runId,
    "--automation-dir",
    directory,
  ];
  const first = spawn("python3", argumentsFor("run-a"), {
    cwd: repoRoot,
    env: environment("thread-a"),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const second = spawn("python3", argumentsFor("run-b"), {
    cwd: repoRoot,
    env: environment("thread-b"),
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const outcomes = await Promise.all([capture(first), capture(second)]);
    assert.deepEqual(
      outcomes.map((outcome) => outcome.code).sort((left, right) => (left ?? 999) - (right ?? 999)),
      [0, 73],
    );
    const winnerIndex = outcomes.findIndex((outcome) => outcome.code === 0);
    const winnerOwner = winnerIndex === 0 ? "thread-a" : "thread-b";
    const winnerRun = winnerIndex === 0 ? "run-a" : "run-b";
    assert.match(outcomes[1 - winnerIndex].stderr, /active run lease conflict/i);

    const acquired = JSON.parse(outcomes[winnerIndex].stdout.trim());
    assert.equal(acquired.action, "acquired");
    assert.equal(acquired.epoch, 1);
    const renewed = outputJson(
      invoke(directory, winnerOwner, ["acquire", "--run-id", winnerRun]),
    );
    assert.equal(renewed.action, "renewed");
    assert.equal(renewed.epoch, 1);
    const lease = JSON.parse(readFileSync(path.join(directory, "run-state.lease.json"), "utf8"));
    assert.equal(lease.stale_after_seconds, 6 * 60 * 60);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a different thread can take over only a stale lease at the expected epoch", () => {
  const directory = temporaryAutomationDir();
  try {
    const first = outputJson(
      invoke(directory, "thread-old", [
        "acquire",
        "--run-id",
        "run-old",
        "--stale-after-seconds",
        "1",
      ]),
    );
    assert.equal(first.epoch, 1);

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_150);
    const missingCas = invoke(directory, "thread-new", [
      "acquire",
      "--run-id",
      "run-old",
    ]);
    assert.equal(missingCas.status, 73);
    assert.match(missingCas.stderr, /requires --expected-epoch 1/i);

    const differentRun = invoke(directory, "thread-new", [
      "acquire",
      "--run-id",
      "run-new",
      "--expected-epoch",
      "1",
    ]);
    assert.equal(differentRun.status, 73);
    assert.match(differentRun.stderr, /stale takeover cannot start a different run/i);

    const takeover = outputJson(
      invoke(directory, "thread-new", [
        "acquire",
        "--run-id",
        "run-old",
        "--expected-epoch",
        "1",
      ]),
    );
    assert.equal(takeover.action, "stale_takeover");
    assert.equal(takeover.epoch, 2);

    const staleOwner = invoke(directory, "thread-old", [
      "checkpoint",
      "--run-id",
      "run-old",
      "--epoch",
      "1",
      "--expected-revision",
      "0",
      "--status",
      "active",
      "--phase",
      "discovery",
    ]);
    assert.equal(staleOwner.status, 73);
    assert.match(staleOwner.stderr, /lease CAS failed/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("checkpoint and release enforce owner, epoch, revision, and terminal state CAS", () => {
  const directory = temporaryAutomationDir();
  try {
    outputJson(invoke(directory, "thread-owner", ["acquire", "--run-id", "run-1"]));

    const wrongOwner = invoke(directory, "thread-other", [
      "checkpoint",
      "--run-id",
      "run-1",
      "--epoch",
      "1",
      "--expected-revision",
      "0",
      "--status",
      "active",
      "--phase",
      "preflight",
    ]);
    assert.equal(wrongOwner.status, 73);
    assert.match(wrongOwner.stderr, /owner or epoch changed/i);

    const firstCheckpoint = outputJson(
      invoke(directory, "thread-owner", [
        "checkpoint",
        "--run-id",
        "run-1",
        "--epoch",
        "1",
        "--expected-revision",
        "0",
        "--status",
        "active",
        "--phase",
        "preflight",
      ]),
    );
    assert.equal(firstCheckpoint.checkpoint_revision, 1);

    const staleRevision = invoke(directory, "thread-owner", [
      "checkpoint",
      "--run-id",
      "run-1",
      "--epoch",
      "1",
      "--expected-revision",
      "0",
      "--status",
      "complete",
      "--phase",
      "closeout",
    ]);
    assert.equal(staleRevision.status, 73);
    assert.match(staleRevision.stderr, /expected revision 0, found 1/i);

    const earlyRelease = invoke(directory, "thread-owner", [
      "release",
      "--run-id",
      "run-1",
      "--epoch",
      "1",
      "--expected-revision",
      "1",
      "--expected-status",
      "complete",
    ]);
    assert.equal(earlyRelease.status, 73);
    assert.match(earlyRelease.stderr, /expected complete, found active/i);

    const terminal = outputJson(
      invoke(directory, "thread-owner", [
        "checkpoint",
        "--run-id",
        "run-1",
        "--epoch",
        "1",
        "--expected-revision",
        "1",
        "--status",
        "complete",
        "--phase",
        "closeout",
      ]),
    );
    assert.equal(terminal.checkpoint_revision, 2);
    const released = outputJson(
      invoke(directory, "thread-owner", [
        "release",
        "--run-id",
        "run-1",
        "--epoch",
        "1",
        "--expected-revision",
        "2",
        "--expected-status",
        "complete",
      ]),
    );
    assert.equal(released.action, "released");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("checkpoint replacement is atomic and never exposes the thread identity", () => {
  const directory = temporaryAutomationDir();
  try {
    outputJson(invoke(directory, "thread-private-value", ["acquire", "--run-id", "run-atomic"]));
    outputJson(
      invoke(directory, "thread-private-value", [
        "checkpoint",
        "--run-id",
        "run-atomic",
        "--epoch",
        "1",
        "--expected-revision",
        "0",
        "--status",
        "active",
        "--phase",
        "preflight",
        "--blocker",
        "first",
      ]),
    );
    const checkpointPath = path.join(directory, "run-state.md");
    const firstInode = statSync(checkpointPath).ino;

    outputJson(
      invoke(directory, "thread-private-value", [
        "checkpoint",
        "--run-id",
        "run-atomic",
        "--epoch",
        "1",
        "--expected-revision",
        "1",
        "--status",
        "active",
        "--phase",
        "content_prepared",
        "--accepted-slugs",
        "alpha,beta",
        "--blocker",
        "x".repeat(3_900),
      ]),
    );
    const secondInode = statSync(checkpointPath).ino;
    assert.notEqual(secondInode, firstInode, "checkpoint must be replaced, not rewritten in place");
    const checkpoint = readManagedCheckpoint(directory);
    assert.equal(checkpoint.checkpoint_revision, 2);
    assert.equal(checkpoint.phase, "content_prepared");
    assert.deepEqual(checkpoint.accepted_slugs, ["alpha", "beta"]);
    assert.equal(
      readdirSync(directory).filter((name) => name.startsWith(".run-state.md.")).length,
      0,
    );
    assert.doesNotMatch(readFileSync(checkpointPath, "utf8"), /thread-private-value/);
    assert.doesNotMatch(
      readFileSync(path.join(directory, "run-state.lease.json"), "utf8"),
      /thread-private-value/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("missing CODEX_THREAD_ID requires an explicit owner fallback", () => {
  const directory = temporaryAutomationDir();
  try {
    const missingOwner = invoke(directory, undefined, ["acquire", "--run-id", "run-fallback"]);
    assert.equal(missingOwner.status, 78);
    assert.match(missingOwner.stderr, /pass an explicit --owner/i);

    const explicit = outputJson(
      invoke(directory, undefined, [
        "acquire",
        "--run-id",
        "run-fallback",
        "--owner",
        "explicit-owner",
      ]),
    );
    assert.equal(explicit.action, "acquired");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("malformed and hard-linked authority files fail closed", () => {
  const malformedDirectory = temporaryAutomationDir();
  const hardlinkDirectory = temporaryAutomationDir();
  try {
    outputJson(invoke(malformedDirectory, "thread-owner", ["acquire", "--run-id", "run-1"]));
    writeFileSync(path.join(malformedDirectory, "run-state.lease.json"), "{not-json\n");
    const malformed = invoke(malformedDirectory, "thread-owner", [
      "acquire",
      "--run-id",
      "run-1",
    ]);
    assert.equal(malformed.status, 65);
    assert.match(malformed.stderr, /malformed authority file/i);

    outputJson(invoke(hardlinkDirectory, "thread-owner", ["acquire", "--run-id", "run-2"]));
    linkSync(
      path.join(hardlinkDirectory, "run-state.lease.json"),
      path.join(hardlinkDirectory, "lease-alias.json"),
    );
    const hardlinked = invoke(hardlinkDirectory, "thread-owner", [
      "acquire",
      "--run-id",
      "run-2",
    ]);
    assert.equal(hardlinked.status, 65);
    assert.match(hardlinked.stderr, /multiply linked authority file/i);
  } finally {
    rmSync(malformedDirectory, { recursive: true, force: true });
    rmSync(hardlinkDirectory, { recursive: true, force: true });
  }
});

test("checkpoint rejects fence injection before writing state", () => {
  const directory = temporaryAutomationDir();
  try {
    outputJson(invoke(directory, "thread-owner", ["acquire", "--run-id", "run-fence"]));
    const injected = invoke(directory, "thread-owner", [
      "checkpoint",
      "--run-id",
      "run-fence",
      "--epoch",
      "1",
      "--expected-revision",
      "0",
      "--status",
      "active",
      "--phase",
      "preflight",
      "--blocker",
      "unsafe ``` fence",
    ]);
    assert.equal(injected.status, 65);
    assert.match(injected.stderr, /no controls or Markdown fences/i);

    const lineSeparator = invoke(directory, "thread-owner", [
      "checkpoint",
      "--run-id",
      "run-fence",
      "--epoch",
      "1",
      "--expected-revision",
      "0",
      "--status",
      "active",
      "--phase",
      "preflight",
      "--blocker",
      "unsafe\u2028separator",
    ]);
    assert.equal(lineSeparator.status, 65);
    assert.match(lineSeparator.stderr, /no controls or Markdown fences/i);
    assert.equal(readdirSync(directory).includes("run-state.md"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("released lease with a non-terminal checkpoint fails closed", () => {
  const directory = temporaryAutomationDir();
  try {
    outputJson(invoke(directory, "thread-owner", ["acquire", "--run-id", "run-closed"]));
    outputJson(
      invoke(directory, "thread-owner", [
        "checkpoint",
        "--run-id",
        "run-closed",
        "--epoch",
        "1",
        "--expected-revision",
        "0",
        "--status",
        "complete",
        "--phase",
        "closeout",
      ]),
    );
    outputJson(
      invoke(directory, "thread-owner", [
        "release",
        "--run-id",
        "run-closed",
        "--epoch",
        "1",
        "--expected-revision",
        "1",
        "--expected-status",
        "complete",
      ]),
    );
    const checkpointPath = path.join(directory, "run-state.md");
    writeFileSync(
      checkpointPath,
      readFileSync(checkpointPath, "utf8").replace('"status": "complete"', '"status": "active"'),
    );

    const inconsistent = invoke(directory, "thread-new", [
      "acquire",
      "--run-id",
      "run-new",
    ]);
    assert.equal(inconsistent.status, 73);
    assert.match(inconsistent.stderr, /released lease is inconsistent.*active/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a new lease cannot release against the previous run checkpoint", () => {
  const directory = temporaryAutomationDir();
  try {
    outputJson(invoke(directory, "thread-first", ["acquire", "--run-id", "run-first"]));
    outputJson(
      invoke(directory, "thread-first", [
        "checkpoint",
        "--run-id",
        "run-first",
        "--epoch",
        "1",
        "--expected-revision",
        "0",
        "--status",
        "complete",
        "--phase",
        "closeout",
        "--started-at",
        "2026-01-01T00:00:00Z",
      ]),
    );
    outputJson(
      invoke(directory, "thread-first", [
        "release",
        "--run-id",
        "run-first",
        "--epoch",
        "1",
        "--expected-revision",
        "1",
        "--expected-status",
        "complete",
      ]),
    );

    const second = outputJson(
      invoke(directory, "thread-second", ["acquire", "--run-id", "run-second"]),
    );
    assert.equal(second.epoch, 2);
    assert.equal(second.checkpoint_revision, 1);
    const wrongTerminal = invoke(directory, "thread-second", [
      "release",
      "--run-id",
      "run-second",
      "--epoch",
      "2",
      "--expected-revision",
      "1",
      "--expected-status",
      "complete",
    ]);
    assert.equal(wrongTerminal.status, 73);
    assert.match(wrongTerminal.stderr, /checkpoint identity does not match/i);

    outputJson(
      invoke(directory, "thread-second", [
        "checkpoint",
        "--run-id",
        "run-second",
        "--epoch",
        "2",
        "--expected-revision",
        "1",
        "--status",
        "active",
        "--phase",
        "preflight",
      ]),
    );
    assert.notEqual(readManagedCheckpoint(directory).started_at, "2026-01-01T00:00:00Z");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
