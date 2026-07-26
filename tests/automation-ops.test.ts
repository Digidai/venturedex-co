import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
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

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeExecutable(file: string, body: string): void {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

async function waitForPath(file: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(file)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for path: ${file}`);
}

function captureChild(child: ReturnType<typeof spawn>): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}> {
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function createWeeklyFixture(openPullRequests: unknown[]): string {
  const root = tempDir("venturedex-weekly-test-");
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  mkdirSync(path.join(root, "content", "startups"), { recursive: true });
  mkdirSync(path.join(root, "content", "weekly"), { recursive: true });
  mkdirSync(path.join(root, "bin"), { recursive: true });
  cpSync(path.join(repoRoot, "scripts", "weekly.py"), path.join(root, "scripts", "weekly.py"));

  writeFileSync(
    path.join(root, "content", "weekly", "7.json"),
    JSON.stringify({
      issue_number: 7,
      status: "published",
      week_start: "2026-06-29",
      week_end: "2026-07-05",
      published_at: "2026-07-06",
      title: "Issue 7",
      picks: [],
    }),
  );

  for (let index = 1; index <= 5; index += 1) {
    const slug = `startup-${index}`;
    writeFileSync(
      path.join(root, "content", "startups", `${slug}.json`),
      JSON.stringify({
        slug,
        product_name: `Startup ${index}`,
        url: `https://example.com/${slug}`,
        editor_rating: 5,
        is_featured: false,
        funding: [],
        research: { sources: [], product_evidence: [], risks: [] },
      }),
    );
  }

  writeExecutable(
    path.join(root, "bin", "gh"),
    `#!/bin/sh
case " $* " in
  *" --search "*) echo "prefix search must not be used" >&2; exit 9 ;;
esac
printf '%s\\n' '${JSON.stringify(openPullRequests)}'
`,
  );
  return root;
}

function runWeekly(root: string, extraArgs: string[] = []) {
  return spawnSync(
    "python3",
    [
      path.join(root, "scripts", "weekly.py"),
      "draft",
      "--week-start",
      "2026-07-20",
      "--week-end",
      "2026-07-26",
      "--write",
      "--check-open-prs",
      "--repo",
      "Digidai/venturedex-co",
      ...extraArgs,
    ],
    {
      cwd: root,
      env: { ...process.env, PATH: `${path.join(root, "bin")}:${process.env.PATH}` },
      encoding: "utf8",
    },
  );
}

test("weekly draft allocates after issue numbers reserved by open pull requests", () => {
  const root = createWeeklyFixture([
    {
      number: 5,
      title: "Weekly draft for 2026-07-06 to 2026-07-12",
      headRefName: "automation/weekly-draft-2026-07-12",
      isCrossRepository: false,
      headRepositoryOwner: { login: "Digidai" },
      url: "https://github.com/Digidai/venturedex-co/pull/5",
      files: [{ path: "content/weekly/7.json" }],
    },
    {
      number: 6,
      title: "Weekly draft for 2026-07-13 to 2026-07-19",
      headRefName: "automation/weekly-draft-2026-07-19",
      isCrossRepository: false,
      headRepositoryOwner: { login: "Digidai" },
      url: "https://github.com/Digidai/venturedex-co/pull/6",
      files: [{ path: "content/weekly/8.json" }],
    },
  ]);
  try {
    const result = runWeekly(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(path.join(root, "content", "weekly", "8.json")), false);
    assert.equal(existsSync(path.join(root, "content", "weekly", "9.json")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("weekly draft is a no-op when an open pull request already owns the week", () => {
  const root = createWeeklyFixture([
    {
      number: 10,
      title: "Weekly draft for 2026-07-20 to 2026-07-26",
      headRefName: "automation/weekly-draft-2026-07-26",
      isCrossRepository: false,
      headRepositoryOwner: { login: "Digidai" },
      url: "https://github.com/Digidai/venturedex-co/pull/10",
      files: [{ path: "content/weekly/9.json" }],
    },
  ]);
  try {
    const result = runWeekly(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /open pull request already owns/);
    assert.equal(existsSync(path.join(root, "content", "weekly", "9.json")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("weekly draft refuses an explicit issue number reserved by an open pull request", () => {
  const root = createWeeklyFixture([
    {
      number: 6,
      title: "Weekly draft for 2026-07-13 to 2026-07-19",
      headRefName: "automation/weekly-draft-2026-07-19",
      isCrossRepository: false,
      headRepositoryOwner: { login: "Digidai" },
      url: "https://github.com/Digidai/venturedex-co/pull/6",
      files: [{ path: "content/weekly/8.json" }],
    },
  ]);
  try {
    const result = runWeekly(root, ["--issue-number", "8"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /reserved by open pull request/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("external and unrelated pull requests cannot reserve Weekly issues or weeks", () => {
  const root = createWeeklyFixture([
    {
      number: 20,
      title: "Weekly draft for 2026-07-20 to 2026-07-26",
      headRefName: "automation/weekly-draft-2026-07-26",
      isCrossRepository: true,
      headRepositoryOwner: { login: "external-contributor" },
      url: "https://github.com/Digidai/venturedex-co/pull/20",
      files: [{ path: "content/weekly/99.json" }],
    },
    {
      number: 21,
      title: "Weekly draft for 2026-07-20 to 2026-07-26",
      headRefName: "feature/unrelated-weekly-file",
      isCrossRepository: false,
      headRepositoryOwner: { login: "Digidai" },
      url: "https://github.com/Digidai/venturedex-co/pull/21",
      files: [{ path: "content/weekly/98.json" }],
    },
  ]);
  try {
    const result = runWeekly(root);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /open pull request already owns/);
    assert.equal(existsSync(path.join(root, "content", "weekly", "8.json")), true);
    assert.equal(existsSync(path.join(root, "content", "weekly", "99.json")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("weekly workflow serializes runs and enables the remote pull-request guard", () => {
  const workflow = readFileSync(
    path.join(repoRoot, ".github", "workflows", "weekly-draft.yml"),
    "utf8",
  );
  assert.match(workflow, /concurrency:\s*\n\s+group: weekly-draft-/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /--check-open-prs/);
  assert.match(workflow, /--repo "\$\{\{ github\.repository \}\}"/);
});

test("weekly workflow runs the full gate and removes generated outputs before creating its bot PR", () => {
  const workflow = readFileSync(
    path.join(repoRoot, ".github", "workflows", "weekly-draft.yml"),
    "utf8",
  );
  const expectedInOrder = [
    "actions/setup-node@v5",
    "run: python3 scripts/weekly.py validate",
    "run: npm ci",
    "run: npm audit --audit-level=high",
    "run: bash scripts/manage.sh validate",
    "run: git diff --check",
    "git restore --worktree -- d1/generated-seed.sql",
    "git clean -f -- public/og/weekly-*.png",
    "peter-evans/create-pull-request@v7",
  ];

  let previousIndex = -1;
  for (const step of expectedInOrder) {
    const currentIndex = workflow.indexOf(step);
    assert.notEqual(currentIndex, -1, `missing Weekly workflow step: ${step}`);
    assert.ok(
      currentIndex > previousIndex,
      `Weekly workflow step is out of order: ${step}`,
    );
    previousIndex = currentIndex;
  }

  assert.match(workflow, /node-version: 22/);
  const gateSection = workflow.slice(
    workflow.indexOf("actions/setup-node@v5"),
    workflow.indexOf("peter-evans/create-pull-request@v7"),
  );
  assert.doesNotMatch(gateSection, /continue-on-error:\s*true/);
  assert.doesNotMatch(gateSection, /\bif:\s*\$\{\{\s*always\(\)\s*\}\}/);
  assert.match(
    workflow,
    /Before this PR was created or updated, the bot branch passed `python3 scripts\/weekly\.py validate`, `npm audit --audit-level=high`, `bash scripts\/manage\.sh validate`, and `git diff --check`/,
  );
  assert.match(
    workflow,
    /after any human edit, rerun `python3 scripts\/weekly\.py validate`, `bash scripts\/manage\.sh validate`, and `git diff --check`/,
  );
});

function createGscFixture(): string {
  const root = tempDir("venturedex-gsc-test-");
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  cpSync(
    path.join(repoRoot, "scripts", "submit-gsc-direct.sh"),
    path.join(root, "scripts", "submit-gsc-direct.sh"),
  );
  return root;
}

function createGscBrowserMock(root: string): {
  browser: string;
  comet: string;
  log: string;
  counter: string;
} {
  const browser = path.join(root, "bb-browser");
  const comet = path.join(root, "Comet");
  const log = path.join(root, "browser.log");
  const counter = path.join(root, "target-match-count");
  writeExecutable(
    browser,
    `#!/bin/sh
printf '%s\\n' "$*" >> "$MOCK_BROWSER_LOG"
case "$1" in
  status)
    if [ "$MOCK_LOCK_MODE" = "hold_on_status" ] && [ ! -e "$MOCK_LOCK_HELD_MARKER" ]; then
      : > "$MOCK_LOCK_HELD_MARKER"
      while [ ! -e "$MOCK_LOCK_RELEASE_MARKER" ]; do
        sleep 0.05
      done
    fi
    echo "CDP connected: yes"
    ;;
  open)
    echo "tab: mock-tab"
    ;;
  close)
    echo "closed"
    ;;
  eval)
    js="$2"
    case "$js" in
      *input_target_match*input_target_mismatch*)
        echo "input_target_match"
        ;;
      *input_not_found*)
        echo "submitted"
        ;;
      *slice\\(0,8000\\)*)
        count=0
        if [ -f "$MOCK_TARGET_COUNTER" ]; then count=$(cat "$MOCK_TARGET_COUNTER"); fi
        count=$((count + 1))
        printf '%s\\n' "$count" > "$MOCK_TARGET_COUNTER"
        if [ "$MOCK_TARGET_MODE" = "prefix_collision" ]; then
          echo "$MOCK_TARGET_URL-other"
        elif [ "$MOCK_TARGET_MODE" = "post_prefix_collision" ] && [ "$count" -ge 2 ]; then
          echo "$MOCK_TARGET_URL-other"
        else
          echo "$MOCK_TARGET_URL"
        fi
        ;;
      *"return 'clicked'"*)
        echo "clicked"
        ;;
      *"return 'success'"*)
        if [ "$MOCK_TARGET_MODE" = "history_failure_after_request" ] && [ ! -e "$MOCK_HISTORY_FAILURE_MARKER" ]; then
          : > "$MOCK_HISTORY_FAILURE_MARKER"
          rm -f "$HISTORY_FILE"
          mkdir "$HISTORY_FILE"
        fi
        echo "success"
        ;;
      *"'quota':'ok'"*)
        echo "ok"
        ;;
      *)
        echo "none"
        ;;
    esac
    ;;
esac
`,
  );
  writeExecutable(comet, "#!/bin/sh\nexit 0\n");
  return { browser, comet, log, counter };
}

const historyHeader = "timestamp\tstatus\turl\tmessage\n";

test("GSC retry backlog selects only unresolved canonical detail URLs", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  writeFileSync(
    history,
    historyHeader +
      [
        "2026-01-01 00:00:01\tretry_pending\thttps://venturedex.co/startups/alpha\tfailed",
        "2026-01-01 00:00:02\tretry_pending\thttps://venturedex.co/startups/alpha\tfailed again",
        "2026-01-01 00:00:03\tdry_run\thttps://venturedex.co/startups/alpha\tpreview",
        "2026-01-01 00:00:04\tretry_pending\thttps://venturedex.co/startups/beta\tfailed",
        "2026-01-01 00:00:05\trequested\thttps://venturedex.co/startups/beta\trequested",
        "2026-01-01 00:00:06\trequested\thttps://venturedex.co/startups/gamma\trequested",
        "2026-01-01 00:00:07\tretry_pending\thttps://venturedex.co/startups/gamma\tfailed later",
        "2026-01-01 00:00:08\tretry_pending\thttp://venturedex.co/startups/insecure\tbad scheme",
        "2026-01-01 00:00:09\tretry_pending\thttps://example.com/startups/external\tbad host",
        "2026-01-01 00:00:10\tretry_pending\thttps://venturedex.co/weekly/4\tfailed",
        "2026-01-01 00:00:11\tretry_pending\thttps://venturedex.co/startups/trailing-\tbad slug",
      ].join("\n") +
      "\n",
  );

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--dry-run",
        "--retry-pending",
        "--skip-live-check",
        "--max-urls",
        "3",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          HISTORY_FILE: history,
          GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
        },
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /https:\/\/venturedex\.co\/startups\/alpha/);
    assert.match(result.stdout, /https:\/\/venturedex\.co\/startups\/gamma/);
    assert.match(result.stdout, /https:\/\/venturedex\.co\/weekly\/4/);
    assert.doesNotMatch(result.stdout, /startups\/beta/);
    assert.doesNotMatch(result.stdout, /startups\/insecure/);
    assert.doesNotMatch(result.stdout, /example\.com/);
    assert.doesNotMatch(result.stdout, /startups\/trailing-/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC retry backlog consumes bounded batches while explicit overflow still fails closed", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  writeFileSync(
    history,
    historyHeader +
      [
        "2026-01-01 00:00:01\tretry_pending\thttps://venturedex.co/startups/alpha\tfailed",
        "2026-01-01 00:00:02\tretry_pending\thttps://venturedex.co/startups/beta\tfailed",
      ].join("\n") +
      "\n",
  );

  try {
    const baseArgs = [
      path.join(root, "scripts", "submit-gsc-direct.sh"),
      "--dry-run",
      "--retry-pending",
      "--skip-live-check",
    ];
    const env = {
      ...process.env,
      HISTORY_FILE: history,
      GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
    };
    const bounded = spawnSync("bash", [...baseArgs, "--max-urls", "1"], {
      cwd: root,
      env,
      encoding: "utf8",
    });
    assert.equal(bounded.status, 0, bounded.stderr);
    assert.match(bounded.stdout, /GSC retry backlog: selected=1, remaining=1/);
    assert.match(bounded.stdout, /startups\/alpha/);
    assert.doesNotMatch(bounded.stdout, /^    - .*startups\/beta/m);

    const expectedSingle = spawnSync(
      "bash",
      [
        ...baseArgs,
        "--max-urls",
        "1",
        "--expect-url",
        "https://venturedex.co/startups/alpha",
      ],
      { cwd: root, env, encoding: "utf8" },
    );
    assert.equal(expectedSingle.status, 0, expectedSingle.stderr);

    const explicitOverflow = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--dry-run",
        "--skip-live-check",
        "--max-urls",
        "1",
        "--url",
        "https://venturedex.co/startups/alpha",
        "--url",
        "https://venturedex.co/startups/beta",
      ],
      { cwd: root, env, encoding: "utf8" },
    );
    assert.notEqual(explicitOverflow.status, 0);
    assert.match(explicitOverflow.stderr, /Refusing to submit 2 URLs/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC retry backlog advances deterministically from 18 to 10 then 8", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const pendingRows = Array.from(
    { length: 18 },
    (_, index) =>
      `2026-01-01 00:00:${String(index).padStart(2, "0")}\tretry_pending\thttps://venturedex.co/startups/pending-${String(index + 1).padStart(2, "0")}\tfailed`,
  );
  writeFileSync(history, historyHeader + pendingRows.join("\n") + "\n");
  const env = {
    ...process.env,
    HISTORY_FILE: history,
    GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
  };
  const args = [
    path.join(root, "scripts", "submit-gsc-direct.sh"),
    "--dry-run",
    "--retry-pending",
    "--skip-live-check",
  ];

  try {
    const first = spawnSync("bash", args, { cwd: root, env, encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /GSC retry backlog: selected=10, remaining=8/);
    const firstTargets = first.stdout
      .split("\n")
      .filter((line) => line.startsWith("    - https://venturedex.co/"))
      .map((line) => line.trim().slice(2));
    assert.equal(firstTargets.length, 10);
    assert.match(firstTargets[0], /pending-01$/);
    assert.match(firstTargets[9], /pending-10$/);

    writeFileSync(
      history,
      readFileSync(history, "utf8") +
        firstTargets
          .map(
            (url, index) =>
              `2026-01-02 00:00:${String(index).padStart(2, "0")}\trequested\t${url}\trequested`,
          )
          .join("\n") +
        "\n",
    );

    const second = spawnSync("bash", args, { cwd: root, env, encoding: "utf8" });
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /GSC retry backlog: selected=8, remaining=0/);
    const secondTargets = second.stdout
      .split("\n")
      .filter((line) => line.startsWith("    - https://venturedex.co/"));
    assert.equal(secondTargets.length, 8);
    assert.match(secondTargets[0], /pending-11$/);
    assert.match(secondTargets[7], /pending-18$/);

    writeFileSync(
      history,
      readFileSync(history, "utf8") +
        secondTargets
          .map(
            (line, index) =>
              `2026-01-03 00:00:${String(index).padStart(2, "0")}\trequested\t${line.trim().slice(2)}\trequested`,
          )
          .join("\n") +
        "\n",
    );
    const empty = spawnSync("bash", args, { cwd: root, env, encoding: "utf8" });
    assert.equal(empty.status, 0, empty.stderr);
    assert.match(empty.stdout, /selected=0, remaining=0/);
    assert.match(empty.stdout, /No unresolved GSC retry_pending targets remain/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC retry backlog fails closed when the authoritative ledger is corrupt", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  writeFileSync(history, "wrong\theader\n");

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--dry-run",
        "--retry-pending",
        "--skip-live-check",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          HISTORY_FILE: history,
          GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Invalid GSC ledger header/);
    assert.doesNotMatch(
      result.stdout,
      /No unresolved GSC retry_pending targets remain/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC explicit and latest target paths refuse a corrupt ledger before append", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  writeFileSync(history, "wrong\theader\n");

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--dry-run",
        "--url",
        "https://venturedex.co/startups/alpha",
        "--skip-live-check",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          HISTORY_FILE: history,
          GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Invalid GSC ledger header/);
    assert.equal(readFileSync(history, "utf8"), "wrong\theader\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC never records requested unless the exact inspected URL remains visible", () => {
  for (const mode of ["prefix_collision", "post_prefix_collision"]) {
    const root = createGscFixture();
    const mock = createGscBrowserMock(root);
    const history = path.join(root, "history.tsv");
    const artifactDir = path.join(root, "artifacts");
    const target = "https://venturedex.co/startups/alpha";
    writeFileSync(history, historyHeader);

    try {
      const result = spawnSync(
        "bash",
        [
          path.join(root, "scripts", "submit-gsc-direct.sh"),
          "--url",
          target,
          "--expect-url",
          target,
          "--skip-live-check",
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            HISTORY_FILE: history,
            GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
            GSC_ARTIFACT_DIR: artifactDir,
            BB_BROWSER_CMD: mock.browser,
            COMET_APP: mock.comet,
            MOCK_BROWSER_LOG: mock.log,
            MOCK_TARGET_COUNTER: mock.counter,
            MOCK_TARGET_MODE: mode,
            MOCK_TARGET_URL: target,
            NAV_WAIT_SECONDS: "0",
            INSPECT_WAIT_SECONDS: "0",
            POST_CLICK_WAIT_SECONDS: "0",
            POST_MODAL_WAIT_SECONDS: "0",
          },
          encoding: "utf8",
        },
      );

      assert.notEqual(result.status, 0, `${mode} must fail closed`);
      const ledger = readFileSync(history, "utf8");
      assert.match(ledger, /\tretry_pending\t.*\tinspected URL mismatch/);
      assert.doesNotMatch(ledger, /\trequested\t/);
      assert.match(`${result.stdout}\n${result.stderr}`, /exact inspected URL|URL mismatch/);
      if (mode === "prefix_collision") {
        assert.doesNotMatch(readFileSync(mock.log, "utf8"), /return 'clicked'/);
      } else {
        assert.match(readFileSync(mock.log, "utf8"), /return 'clicked'/);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC blocks completion and writes reconciliation evidence when the request succeeds but ledger persistence fails", () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const artifactDir = path.join(root, "artifacts");
  const failureMarker = path.join(root, "history-failure-triggered");
  const target = "https://venturedex.co/startups/alpha";
  writeFileSync(history, historyHeader);

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--url",
        target,
        "--expect-url",
        target,
        "--skip-live-check",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          HISTORY_FILE: history,
          GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
          GSC_ARTIFACT_DIR: artifactDir,
          BB_BROWSER_CMD: mock.browser,
          COMET_APP: mock.comet,
          MOCK_BROWSER_LOG: mock.log,
          MOCK_TARGET_COUNTER: mock.counter,
          MOCK_TARGET_MODE: "history_failure_after_request",
          MOCK_TARGET_URL: target,
          MOCK_HISTORY_FAILURE_MARKER: failureMarker,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(failureMarker), true);
    assert.match(readFileSync(mock.log, "utf8"), /return 'clicked'/);
    assert.match(output, /authoritative GSC ledger persistence failed/);
    assert.match(output, /Do not retry automatically or report this URL complete/);
    assert.match(output, new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(output, /Requested indexing:/);
    assert.doesNotMatch(output, /GSC submit complete:/);

    const artifactNames = readdirSync(artifactDir);
    assert.equal(artifactNames.length, 1);
    assert.match(artifactNames[0], /ledger_write_failed_after_request/);
    const artifact = readFileSync(path.join(artifactDir, artifactNames[0]), "utf8");
    assert.match(artifact, new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(artifact, /manual reconciliation required and automatic retry disabled/);

    rmSync(history, { recursive: true, force: true });
    writeFileSync(history, historyHeader);
    const clicksBeforeRetry = (
      readFileSync(mock.log, "utf8").match(/return 'clicked'/g) ?? []
    ).length;
    const automaticRetry = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--url",
        target,
        "--expect-url",
        target,
        "--skip-live-check",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          HISTORY_FILE: history,
          GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
          GSC_ARTIFACT_DIR: artifactDir,
          BB_BROWSER_CMD: mock.browser,
          COMET_APP: mock.comet,
          MOCK_BROWSER_LOG: mock.log,
          MOCK_TARGET_COUNTER: mock.counter,
          MOCK_TARGET_MODE: "history_failure_after_request",
          MOCK_TARGET_URL: target,
          MOCK_HISTORY_FAILURE_MARKER: failureMarker,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(automaticRetry.status, 0);
    assert.match(
      `${automaticRetry.stdout}\n${automaticRetry.stderr}`,
      /unresolved GSC reconciliation artifact exists/,
    );
    assert.doesNotMatch(automaticRetry.stdout, /GSC submit complete:/);
    const clicksAfterRetry = (
      readFileSync(mock.log, "utf8").match(/return 'clicked'/g) ?? []
    ).length;
    assert.equal(clicksAfterRetry, clicksBeforeRetry);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC history lock blocks same-ledger overlap, cleans normally, and permits independent ledgers", async () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const firstHistory = path.join(root, "first-history.tsv");
  const secondHistory = path.join(root, "second-history.tsv");
  const heldMarker = path.join(root, "lock-held");
  const releaseMarker = path.join(root, "release-lock");
  const target = "https://venturedex.co/startups/alpha";
  writeFileSync(firstHistory, historyHeader);
  writeFileSync(secondHistory, historyHeader);
  const canonicalFirstHistory = realpathSync(firstHistory);
  const canonicalSecondHistory = realpathSync(secondHistory);
  const firstLock = `${canonicalFirstHistory}.lock`;

  const sharedEnv = {
    ...process.env,
    HISTORY_FILE: firstHistory,
    GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
    GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
    BB_BROWSER_CMD: mock.browser,
    COMET_APP: mock.comet,
    MOCK_BROWSER_LOG: mock.log,
    MOCK_TARGET_COUNTER: mock.counter,
    MOCK_TARGET_MODE: "success",
    MOCK_TARGET_URL: target,
    MOCK_HISTORY_FAILURE_MARKER: path.join(root, "unused-history-failure"),
    MOCK_LOCK_MODE: "hold_on_status",
    MOCK_LOCK_HELD_MARKER: heldMarker,
    MOCK_LOCK_RELEASE_MARKER: releaseMarker,
    NAV_WAIT_SECONDS: "0",
    INSPECT_WAIT_SECONDS: "0",
    POST_CLICK_WAIT_SECONDS: "0",
    POST_MODAL_WAIT_SECONDS: "0",
  };
  const args = [
    path.join(root, "scripts", "submit-gsc-direct.sh"),
    "--url",
    target,
    "--expect-url",
    target,
    "--skip-live-check",
  ];
  const first = spawn("bash", args, {
    cwd: root,
    env: sharedEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const firstOutcomePromise = captureChild(first);

  try {
    await waitForPath(heldMarker);
    assert.equal(existsSync(firstLock), true);
    const owner = readFileSync(firstLock, "utf8");
    assert.match(owner, new RegExp(`^pid=${first.pid}$`, "m"));
    assert.match(owner, new RegExp(`^history_file=${canonicalFirstHistory}$`, "m"));

    const contender = spawnSync("bash", args, {
      cwd: root,
      env: sharedEnv,
      encoding: "utf8",
    });
    const contenderOutput = `${contender.stdout}\n${contender.stderr}`;
    assert.notEqual(contender.status, 0);
    assert.match(contenderOutput, /authoritative GSC history lock is already held/);
    assert.match(
      contenderOutput,
      new RegExp(firstLock.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.match(contenderOutput, new RegExp(`pid=${first.pid}`));
    assert.equal(readFileSync(firstHistory, "utf8"), historyHeader);
    assert.doesNotMatch(readFileSync(mock.log, "utf8"), /return 'clicked'/);

    const independent = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--dry-run",
        "--url",
        "https://venturedex.co/startups/beta",
        "--skip-live-check",
      ],
      {
        cwd: root,
        env: {
          ...sharedEnv,
          HISTORY_FILE: secondHistory,
        },
        encoding: "utf8",
      },
    );
    assert.equal(independent.status, 0, independent.stderr);
    assert.match(readFileSync(secondHistory, "utf8"), /\tdry_run\t/);
    assert.equal(existsSync(`${canonicalSecondHistory}.lock`), false);
    assert.equal(existsSync(firstLock), true);

    writeFileSync(releaseMarker, "release\n");
    const firstOutcome = await firstOutcomePromise;
    assert.equal(firstOutcome.code, 0, firstOutcome.stderr);
    assert.equal(firstOutcome.signal, null);
    assert.match(readFileSync(firstHistory, "utf8"), /\trequested\t/);
    assert.match(readFileSync(mock.log, "utf8"), /return 'clicked'/);
    assert.equal(existsSync(firstLock), false);
  } finally {
    writeFileSync(releaseMarker, "release\n");
    if (first.exitCode === null && first.signalCode === null) {
      first.kill("SIGTERM");
      await firstOutcomePromise;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC history lock is released on TERM without appending or clicking", async () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const heldMarker = path.join(root, "lock-held");
  const releaseMarker = path.join(root, "release-lock");
  const target = "https://venturedex.co/startups/alpha";
  writeFileSync(history, historyHeader);
  const lockPath = `${realpathSync(history)}.lock`;

  const child = spawn(
    "bash",
    [
      path.join(root, "scripts", "submit-gsc-direct.sh"),
      "--url",
      target,
      "--expect-url",
      target,
      "--skip-live-check",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        HISTORY_FILE: history,
        GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
        GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
        BB_BROWSER_CMD: mock.browser,
        COMET_APP: mock.comet,
        MOCK_BROWSER_LOG: mock.log,
        MOCK_TARGET_COUNTER: mock.counter,
        MOCK_TARGET_MODE: "success",
        MOCK_TARGET_URL: target,
        MOCK_HISTORY_FAILURE_MARKER: path.join(root, "unused-history-failure"),
        MOCK_LOCK_MODE: "hold_on_status",
        MOCK_LOCK_HELD_MARKER: heldMarker,
        MOCK_LOCK_RELEASE_MARKER: releaseMarker,
        NAV_WAIT_SECONDS: "0",
        INSPECT_WAIT_SECONDS: "0",
        POST_CLICK_WAIT_SECONDS: "0",
        POST_MODAL_WAIT_SECONDS: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const outcomePromise = captureChild(child);

  try {
    await waitForPath(heldMarker);
    assert.equal(existsSync(lockPath), true);
    child.kill("SIGTERM");
    writeFileSync(releaseMarker, "release\n");
    const outcome = await outcomePromise;
    assert.equal(outcome.code, 143, outcome.stderr);
    assert.equal(existsSync(lockPath), false);
    assert.equal(readFileSync(history, "utf8"), historyHeader);
    assert.doesNotMatch(readFileSync(mock.log, "utf8"), /return 'clicked'/);
  } finally {
    writeFileSync(releaseMarker, "release\n");
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await outcomePromise;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC never removes an unknown stale history lock", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const target = "https://venturedex.co/startups/alpha";
  writeFileSync(history, historyHeader);
  const lockPath = `${realpathSync(history)}.lock`;
  const unknownOwner =
    "token=unknown-owner\n" +
    "pid=99999999\n" +
    "started_at=2026-01-01 00:00:00\n" +
    `history_file=${realpathSync(history)}\n`;
  writeFileSync(lockPath, unknownOwner);

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--dry-run",
        "--url",
        target,
        "--skip-live-check",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          HISTORY_FILE: history,
          GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
        },
        encoding: "utf8",
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0);
    assert.match(output, /authoritative GSC history lock is already held/);
    assert.match(output, /pid=99999999/);
    assert.equal(readFileSync(lockPath, "utf8"), unknownOwner);
    assert.equal(readFileSync(history, "utf8"), historyHeader);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC explicitly migrates a legacy repo ledger into the central authority", () => {
  const root = createGscFixture();
  const codexHome = path.join(root, "codex");
  const legacy = path.join(root, "legacy.tsv");
  const central = path.join(
    codexHome,
    "automations",
    "venturedex-daily-curator",
    "gsc_submission_history.tsv",
  );
  mkdirSync(path.dirname(central), { recursive: true });
  writeFileSync(
    central,
    historyHeader +
      "2026-01-02 00:00:00\trequested\thttps://venturedex.co/startups/beta\trequested\n",
  );
  writeFileSync(
    legacy,
    historyHeader +
      [
        "2026-01-01 00:00:00\tretry_pending\thttps://venturedex.co/startups/alpha\tfailed",
        "2026-01-02 00:00:00\trequested\thttps://venturedex.co/startups/beta\trequested",
      ].join("\n") +
      "\n",
  );

  try {
    const result = spawnSync(
      "bash",
      [path.join(root, "scripts", "submit-gsc-direct.sh"), "--migrate-legacy-history"],
      {
        cwd: root,
        env: {
          ...process.env,
          CODEX_HOME: codexHome,
          GSC_LEGACY_HISTORY_FILE: legacy,
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /imported 1 unique legacy row/);
    const merged = readFileSync(central, "utf8");
    assert.equal((merged.match(/startups\/beta/g) ?? []).length, 1);
    assert.match(merged, /startups\/alpha/);
    assert.ok(merged.indexOf("startups/alpha") < merged.indexOf("startups/beta"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC legacy migration rejects malformed evidence without replacing the authoritative ledger", () => {
  const invalidRows = [
    {
      label: "three columns",
      row: "2026-01-01 00:00:00\trequested\thttps://venturedex.co/startups/alpha",
      error: /expected 4 columns; found 3/,
    },
    {
      label: "five columns",
      row: "2026-01-01 00:00:00\trequested\thttps://venturedex.co/startups/alpha\tmessage\textra",
      error: /expected 4 columns; found 5/,
    },
    {
      label: "missing timestamp",
      row: "\trequested\thttps://venturedex.co/startups/alpha\tmessage",
      error: /timestamp, status, and url are required/,
    },
    {
      label: "missing status",
      row: "2026-01-01 00:00:00\t\thttps://venturedex.co/startups/alpha\tmessage",
      error: /timestamp, status, and url are required/,
    },
    {
      label: "missing url",
      row: "2026-01-01 00:00:00\trequested\t\tmessage",
      error: /timestamp, status, and url are required/,
    },
  ];

  for (const invalid of invalidRows) {
    const root = createGscFixture();
    const codexHome = path.join(root, "codex");
    const legacy = path.join(root, "legacy.tsv");
    const central = path.join(
      codexHome,
      "automations",
      "venturedex-daily-curator",
      "gsc_submission_history.tsv",
    );
    const originalCentral =
      historyHeader +
      "2026-01-02 00:00:00\trequested\thttps://venturedex.co/startups/beta\trequested\n";
    mkdirSync(path.dirname(central), { recursive: true });
    writeFileSync(central, originalCentral);
    writeFileSync(legacy, historyHeader + invalid.row + "\n");

    try {
      const result = spawnSync(
        "bash",
        [path.join(root, "scripts", "submit-gsc-direct.sh"), "--migrate-legacy-history"],
        {
          cwd: root,
          env: {
            ...process.env,
            CODEX_HOME: codexHome,
            GSC_LEGACY_HISTORY_FILE: legacy,
          },
          encoding: "utf8",
        },
      );

      assert.notEqual(result.status, 0, invalid.label);
      assert.match(`${result.stdout}\n${result.stderr}`, invalid.error, invalid.label);
      assert.equal(readFileSync(central, "utf8"), originalCentral, invalid.label);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC failure artifacts default to the stable automation workspace", () => {
  const script = readFileSync(
    path.join(repoRoot, "scripts", "submit-gsc-direct.sh"),
    "utf8",
  );
  assert.match(
    script,
    /GSC_ARTIFACT_DIR=.*CODEX_HOME_DEFAULT.*automations\/venturedex-daily-curator\/gsc-artifacts/,
  );
  assert.doesNotMatch(
    script,
    /GSC_ARTIFACT_DIR=.*ROOT_DIR.*docs\/promotion\/gsc-artifacts/,
  );
});

function initCleanupFixture(
  targetParent = "venturedex-daily-test",
) {
  const root = tempDir("venturedex-cleanup-test-");
  const main = path.join(root, "main");
  const origin = path.join(root, "origin.git");
  const automationRoot = path.join(root, "worktrees");
  const target = path.join(automationRoot, targetParent, "venturedex.co");
  execFileSync("git", ["init", "--bare", "-q", origin]);
  mkdirSync(main, { recursive: true });
  mkdirSync(path.dirname(target), { recursive: true });
  execFileSync("git", ["init", "-q", main]);
  execFileSync("git", ["-C", main, "config", "user.email", "tests@example.com"]);
  execFileSync("git", ["-C", main, "config", "user.name", "Tests"]);
  writeFileSync(path.join(main, "README.md"), "fixture\n");
  execFileSync("git", ["-C", main, "add", "README.md"]);
  execFileSync("git", ["-C", main, "commit", "-qm", "fixture"]);
  execFileSync("git", ["-C", main, "branch", "-M", "main"]);
  execFileSync("git", [
    "-C",
    main,
    "config",
    `url.file://${origin}/.insteadOf`,
    "https://github.com/Digidai/venturedex-co.git",
  ]);
  execFileSync("git", [
    "-C",
    main,
    "remote",
    "add",
    "origin",
    "https://github.com/Digidai/venturedex-co.git",
  ]);
  execFileSync("git", ["-C", main, "push", "-qu", "origin", "main"]);
  execFileSync("git", [
    "--git-dir",
    origin,
    "symbolic-ref",
    "HEAD",
    "refs/heads/main",
  ]);
  execFileSync("git", ["-C", main, "worktree", "add", "-q", "-b", "test-worktree", target]);
  return { root, main, origin, automationRoot, target };
}

test("cleanup blocks a safe automation path with broken Git metadata", () => {
  const fixture = initCleanupFixture();
  const script = path.join(repoRoot, "scripts", "cleanup-automation-worktrees.sh");
  const broken = path.join(
    fixture.automationRoot,
    "venturedex-daily-broken",
    "venturedex.co",
  );
  mkdirSync(broken, { recursive: true });
  writeFileSync(path.join(broken, ".git"), "gitdir: /missing/venturedex-worktree-metadata\n");

  try {
    const blocked = spawnSync(
      "bash",
      [script, "--main", fixture.main, "--path", broken, "--execute"],
      {
        env: {
          ...process.env,
          VENTUREDEX_AUTOMATION_WORKTREE_ROOT: fixture.automationRoot,
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(blocked.status, 0);
    assert.match(`${blocked.stdout}\n${blocked.stderr}`, /BLOCKED: Git metadata exists/i);
    assert.equal(existsSync(path.join(broken, ".git")), true);

    rmSync(path.join(broken, ".git"));
    const plainDirectory = spawnSync(
      "bash",
      [script, "--main", fixture.main, "--path", broken, "--execute"],
      {
        env: {
          ...process.env,
          VENTUREDEX_AUTOMATION_WORKTREE_ROOT: fixture.automationRoot,
        },
        encoding: "utf8",
      },
    );
    assert.equal(plainDirectory.status, 0, plainDirectory.stderr);
    assert.match(plainDirectory.stdout, /skip: not a VentureDex Git worktree/i);
    assert.equal(existsSync(broken), true);
  } finally {
    if (existsSync(fixture.target)) {
      execFileSync("git", ["-C", fixture.main, "worktree", "remove", "--force", fixture.target]);
    }
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("cleanup recognizes the exact dated repair path without bypassing safety guards", () => {
  const fixture = initCleanupFixture("venturedex-repair-20260726");
  const script = path.join(repoRoot, "scripts", "cleanup-automation-worktrees.sh");
  const env = {
    ...process.env,
    VENTUREDEX_AUTOMATION_WORKTREE_ROOT: fixture.automationRoot,
  };
  const invalidRepairPath = path.join(
    fixture.automationRoot,
    "venturedex-repair-2026072x",
    "venturedex.co",
  );
  mkdirSync(invalidRepairPath, { recursive: true });

  try {
    const invalidPattern = spawnSync(
      "bash",
      [script, "--main", fixture.main, "--path", invalidRepairPath],
      { env, encoding: "utf8" },
    );
    assert.equal(invalidPattern.status, 0, invalidPattern.stderr);
    assert.match(invalidPattern.stdout, /outside VentureDex automation worktree patterns/);

    const classified = spawnSync(
      "bash",
      [script, "--main", fixture.main, "--path", fixture.target],
      { env, encoding: "utf8" },
    );
    assert.equal(classified.status, 0, classified.stderr);
    assert.match(classified.stdout, /worktree remove /);
    assert.doesNotMatch(classified.stdout, /outside VentureDex automation worktree patterns/);

    const dirtyFile = path.join(fixture.target, "dirty.txt");
    writeFileSync(dirtyFile, "preserve repair evidence\n");
    const dirty = spawnSync(
      "bash",
      [script, "--main", fixture.main, "--path", fixture.target, "--execute"],
      { env, encoding: "utf8" },
    );
    assert.notEqual(dirty.status, 0);
    assert.match(`${dirty.stdout}\n${dirty.stderr}`, /BLOCKED: dirty worktree/i);
    assert.equal(existsSync(fixture.target), true);

    rmSync(dirtyFile);
    const reachableRegistered = spawnSync(
      "bash",
      [script, "--main", fixture.main, "--path", fixture.target, "--execute"],
      { env, encoding: "utf8" },
    );
    assert.equal(reachableRegistered.status, 0, reachableRegistered.stderr);
    assert.match(reachableRegistered.stdout, /removed registered worktree/i);
    assert.equal(existsSync(fixture.target), false);
  } finally {
    if (existsSync(fixture.target)) {
      execFileSync("git", ["-C", fixture.main, "worktree", "remove", "--force", fixture.target]);
    }
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("cleanup dry-run only prints --force after explicit --force-dirty", () => {
  const fixture = initCleanupFixture();
  const script = path.join(repoRoot, "scripts", "cleanup-automation-worktrees.sh");
  const env = {
    ...process.env,
    VENTUREDEX_AUTOMATION_WORKTREE_ROOT: fixture.automationRoot,
  };
  try {
    const safe = spawnSync(
      "bash",
      [script, "--main", fixture.main, "--path", fixture.target],
      { env, encoding: "utf8" },
    );
    assert.equal(safe.status, 0, safe.stderr);
    assert.match(safe.stdout, /worktree remove /);
    assert.doesNotMatch(safe.stdout, /worktree remove --force/);

    const forced = spawnSync(
      "bash",
      [script, "--main", fixture.main, "--path", fixture.target, "--force-dirty"],
      { env, encoding: "utf8" },
    );
    assert.equal(forced.status, 0, forced.stderr);
    assert.match(forced.stdout, /worktree remove --force/);
  } finally {
    if (existsSync(fixture.target)) {
      execFileSync("git", ["-C", fixture.main, "worktree", "remove", "--force", fixture.target]);
    }
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("cleanup execute reports a dirty target as a nonzero blocker", () => {
  const fixture = initCleanupFixture();
  const script = path.join(repoRoot, "scripts", "cleanup-automation-worktrees.sh");
  writeFileSync(path.join(fixture.target, "dirty.txt"), "preserve me\n");

  try {
    const result = spawnSync(
      "bash",
      [script, "--main", fixture.main, "--path", fixture.target, "--execute"],
      {
        env: {
          ...process.env,
          VENTUREDEX_AUTOMATION_WORKTREE_ROOT: fixture.automationRoot,
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /BLOCKED: dirty worktree/);
    assert.equal(existsSync(path.join(fixture.target, "dirty.txt")), true);
  } finally {
    execFileSync("git", ["-C", fixture.main, "worktree", "remove", "--force", fixture.target]);
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("cleanup preserves a worktree that becomes dirty immediately before removal", () => {
  const fixture = initCleanupFixture();
  const script = path.join(repoRoot, "scripts", "cleanup-automation-worktrees.sh");
  const wrapperDir = path.join(fixture.root, "bin");
  mkdirSync(wrapperDir);
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  writeExecutable(
    path.join(wrapperDir, "git"),
    `#!/bin/sh
if [ "$3" = "worktree" ] && [ "$4" = "remove" ]; then
  printf 'arrived during cleanup\\n' > "$RACE_TARGET/race.txt"
fi
exec "$REAL_GIT" "$@"
`,
  );
  try {
    const result = spawnSync(
      "bash",
      [script, "--main", fixture.main, "--path", fixture.target, "--execute"],
      {
        env: {
          ...process.env,
          PATH: `${wrapperDir}:${process.env.PATH}`,
          REAL_GIT: realGit,
          RACE_TARGET: fixture.target,
          VENTUREDEX_AUTOMATION_WORKTREE_ROOT: fixture.automationRoot,
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(path.join(fixture.target, "race.txt")), true);
  } finally {
    execFileSync(realGit, ["-C", fixture.main, "worktree", "remove", "--force", fixture.target]);
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("cleanup preserves a clean commit created after origin reachability was checked", () => {
  const fixture = initCleanupFixture();
  const script = path.join(repoRoot, "scripts", "cleanup-automation-worktrees.sh");
  const wrapperDir = path.join(fixture.root, "bin");
  const counter = path.join(fixture.root, "head-check-count");
  mkdirSync(wrapperDir);
  const realGit = execFileSync("sh", ["-c", "command -v git"], {
    encoding: "utf8",
  }).trim();
  writeExecutable(
    path.join(wrapperDir, "git"),
    `#!/bin/sh
if [ "$1" = "-C" ] && [ "$3" = "rev-parse" ] && [ "$4" = "HEAD" ]; then
  count=0
  if [ -f "$RACE_COUNTER" ]; then
    count="$(sed -n '1p' "$RACE_COUNTER")"
  fi
  count=$((count + 1))
  printf '%s\\n' "$count" > "$RACE_COUNTER"
  if [ "$count" -eq 2 ]; then
    printf 'unique clean commit\\n' > "$RACE_TARGET/commit-race.txt"
    "$REAL_GIT" -C "$RACE_TARGET" add commit-race.txt
    "$REAL_GIT" -C "$RACE_TARGET" commit -qm "commit during cleanup"
  fi
fi
exec "$REAL_GIT" "$@"
`,
  );

  try {
    const result = spawnSync(
      "bash",
      [script, "--main", fixture.main, "--path", fixture.target, "--execute"],
      {
        env: {
          ...process.env,
          PATH: `${wrapperDir}:${process.env.PATH}`,
          REAL_GIT: realGit,
          RACE_COUNTER: counter,
          RACE_TARGET: fixture.target,
          VENTUREDEX_AUTOMATION_WORKTREE_ROOT: fixture.automationRoot,
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /HEAD changed after reachability/i);
    assert.equal(existsSync(path.join(fixture.target, "commit-race.txt")), true);
  } finally {
    if (existsSync(fixture.target)) {
      execFileSync(realGit, ["-C", fixture.main, "worktree", "remove", "--force", fixture.target]);
    }
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("cleanup refuses a clean worktree whose HEAD has no reachable origin ref", () => {
  const fixture = initCleanupFixture();
  const script = path.join(repoRoot, "scripts", "cleanup-automation-worktrees.sh");
  writeFileSync(path.join(fixture.target, "unique.txt"), "not pushed\n");
  execFileSync("git", ["-C", fixture.target, "add", "unique.txt"]);
  execFileSync("git", ["-C", fixture.target, "commit", "-qm", "unique automation commit"]);

  try {
    const result = spawnSync(
      "bash",
      [script, "--main", fixture.main, "--path", fixture.target, "--execute"],
      {
        env: {
          ...process.env,
          VENTUREDEX_AUTOMATION_WORKTREE_ROOT: fixture.automationRoot,
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /HEAD.*reachable.*origin/i);
    assert.equal(existsSync(fixture.target), true);
    assert.equal(existsSync(path.join(fixture.target, "unique.txt")), true);
  } finally {
    if (existsSync(fixture.target)) {
      execFileSync("git", ["-C", fixture.main, "worktree", "remove", "--force", fixture.target]);
    }
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("cleanup refuses an unregistered orphan even when it is clean and remotely reachable", () => {
  const fixture = initCleanupFixture();
  const script = path.join(repoRoot, "scripts", "cleanup-automation-worktrees.sh");
  const orphan = path.join(
    fixture.automationRoot,
    "venturedex-daily-orphan",
    "venturedex.co",
  );
  mkdirSync(path.dirname(orphan), { recursive: true });
  execFileSync("git", ["clone", "-q", fixture.origin, orphan]);
  execFileSync("git", [
    "-C",
    orphan,
    "remote",
    "set-url",
    "origin",
    "https://github.com/Digidai/venturedex-co.git",
  ]);

  try {
    const result = spawnSync(
      "bash",
      [script, "--main", fixture.main, "--path", orphan, "--execute"],
      {
        env: {
          ...process.env,
          VENTUREDEX_AUTOMATION_WORKTREE_ROOT: fixture.automationRoot,
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /unregistered.*refus/i);
    assert.equal(existsSync(orphan), true);
    assert.equal(existsSync(path.join(orphan, "README.md")), true);
  } finally {
    execFileSync("git", ["-C", fixture.main, "worktree", "remove", "--force", fixture.target]);
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
