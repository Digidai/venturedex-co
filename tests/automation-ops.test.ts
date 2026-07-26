import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const realPython3 = execFileSync("sh", ["-c", "command -v python3"], {
  encoding: "utf8",
}).trim();

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
  const submitterPath = path.join(root, "scripts", "submit-gsc-direct.sh");
  cpSync(
    path.join(repoRoot, "scripts", "submit-gsc-direct.sh"),
    submitterPath,
  );
  const productionArtifactDefault =
    'GSC_ARTIFACT_DIR="${GSC_ARTIFACT_DIR:-${CODEX_HOME_DEFAULT}/automations/venturedex-daily-curator/gsc-artifacts}"';
  const fixtureArtifactDefault =
    `GSC_ARTIFACT_DIR="\${GSC_ARTIFACT_DIR:-${path.join(root, "artifacts")}}"`;
  const submitter = readFileSync(submitterPath, "utf8");
  assert.match(submitter, new RegExp(
    productionArtifactDefault.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ));
  writeFileSync(
    submitterPath,
    submitter.replace(productionArtifactDefault, fixtureArtifactDefault),
  );
  cpSync(
    path.join(repoRoot, "scripts", "gsc-browser-runtime.js"),
    path.join(root, "scripts", "gsc-browser-runtime.js"),
  );
  return root;
}

function createGscBrowserMock(root: string): {
  browser: string;
  comet: string;
  log: string;
  counter: string;
  stateCounter: string;
  clickCounter: string;
  submitCounter: string;
  quotaCounter: string;
} {
  const browser = path.join(root, "bb-browser");
  const comet = path.join(root, "Comet");
  const log = path.join(root, "browser.log");
  const counter = path.join(root, "target-match-count");
  const stateCounter = path.join(root, "request-state-count");
  const clickCounter = path.join(root, "request-click-count");
  const submitCounter = path.join(root, "inspection-submit-count");
  const quotaCounter = path.join(root, "quota-check-count");
  writeExecutable(
    browser,
    `#!/bin/sh
MOCK_TARGET_COUNTER="\${MOCK_TARGET_COUNTER:-${counter}}"
MOCK_REQUEST_STATE_COUNTER="\${MOCK_REQUEST_STATE_COUNTER:-${stateCounter}}"
MOCK_CLICK_COUNTER="\${MOCK_CLICK_COUNTER:-${clickCounter}}"
MOCK_SUBMIT_COUNTER="\${MOCK_SUBMIT_COUNTER:-${submitCounter}}"
MOCK_QUOTA_COUNTER="\${MOCK_QUOTA_COUNTER:-${quotaCounter}}"
printf '%s\\n' "$*" >> "$MOCK_BROWSER_LOG"
case "$1" in
  status)
    if [ "$MOCK_LOCK_MODE" = "hold_on_status" ] && [ ! -e "$MOCK_LOCK_HELD_MARKER" ]; then
      : > "$MOCK_LOCK_HELD_MARKER"
      while [ ! -e "$MOCK_LOCK_RELEASE_MARKER" ]; do
        sleep 0.05
      done
    fi
    if [ "$MOCK_CDP_MODE" = "disconnected" ]; then
      echo "CDP connected: no"
    else
      echo "CDP connected: yes"
    fi
    ;;
  open)
    if [ "$MOCK_OPEN_MODE" = "exit_failure" ]; then
      echo "mock open failed" >&2
      exit 8
    elif [ "$MOCK_OPEN_MODE" = "missing_tab_id" ]; then
      echo "opened without tab metadata"
    else
      echo "tab: mock-tab"
    fi
    ;;
  close)
    echo "closed"
    ;;
  eval)
    js="$2"
    case "$js" in
      *VENTUREDEX_CALL:inspection_surface*)
        if [ "$MOCK_SURFACE_MODE" = "auth_redirect" ]; then
          echo "gsc_auth_session_blocker|||https://accounts.google.com/v3/signin/identifier"
        elif [ "$MOCK_SURFACE_MODE" = "wrong_property" ]; then
          echo "gsc_inspection_surface_blocker|||https://search.google.com/search-console/inspect"
        else
          echo "inspection_surface_ready"
        fi
        ;;
      *VENTUREDEX_CALL:inspect_target*)
        count=0
        if [ -f "$MOCK_TARGET_COUNTER" ]; then count=$(cat "$MOCK_TARGET_COUNTER"); fi
        count=$((count + 1))
        printf '%s\\n' "$count" > "$MOCK_TARGET_COUNTER"
        if [ "$MOCK_SURFACE_MODE" = "auth_after_input" ]; then
          echo "gsc_auth_session_blocker|||https://accounts.google.com/v3/signin/identifier"
        elif [ "$MOCK_INPUT_MODE" = "mismatch" ]; then
          echo "inspection_input_mismatch"
        elif [ "$MOCK_TARGET_MODE" = "prefix_collision" ]; then
          echo "inspection_header_url_mismatch"
        elif [ "$MOCK_TARGET_MODE" = "post_prefix_collision" ] && [ "$count" -ge 2 ]; then
          echo "inspection_header_url_mismatch"
        elif [ "$MOCK_TARGET_MODE" = "wrong_current_with_target_elsewhere" ] ||
             [ "$MOCK_TARGET_MODE" = "hidden_stale_target_visible_wrong" ]; then
          echo "inspection_header_url_mismatch"
        elif [ "$MOCK_TARGET_MODE" = "active_root_ambiguous" ]; then
          echo "inspection_active_root_ambiguous"
        elif [ "$MOCK_TARGET_MODE" = "route_id_missing" ]; then
          echo "inspection_route_id_missing"
        elif [ "$MOCK_TARGET_MODE" = "header_missing" ]; then
          echo "inspection_header_missing"
        else
          echo "inspection_target_match|||mock-route-id"
        fi
        ;;
      *VENTUREDEX_CALL:submit_input*)
        submits=0
        if [ -f "$MOCK_SUBMIT_COUNTER" ]; then submits=$(cat "$MOCK_SUBMIT_COUNTER"); fi
        submits=$((submits + 1))
        printf '%s\\n' "$submits" > "$MOCK_SUBMIT_COUNTER"
        if [ "$MOCK_SURFACE_MODE" = "atomic_redirect" ]; then
          echo "gsc_auth_session_blocker|||https://accounts.google.com/v3/signin/identifier"
        else
          echo "submitted"
        fi
        ;;
      *VENTUREDEX_SAFE_PAGE_CAPTURE:inspection_surface_ready*)
        if [ "$MOCK_TARGET_MODE" = "after_click_auth" ]; then
          echo "Page text capture suppressed outside authenticated VentureDex Search Console inspection surface; observed https://accounts.google.com/v3/signin/identifier"
        elif [ "$MOCK_TARGET_MODE" = "after_click_same_url_auth_overlay" ]; then
          echo "Page text capture suppressed because the authenticated VentureDex Search Console inspection surface was not ready; observed https://search.google.com/search-console/inspect"
        elif [ "$MOCK_TARGET_MODE" = "prefix_collision" ]; then
          echo "$MOCK_TARGET_URL-other"
        elif [ "$MOCK_TARGET_MODE" = "post_prefix_collision" ]; then
          echo "$MOCK_TARGET_URL-other"
        elif [ "$MOCK_TARGET_MODE" = "wrong_current_with_target_elsewhere" ]; then
          printf '%s\\n%s\\n' "\${MOCK_WRONG_TARGET_URL:-https://venturedex.co/startups/wrong}" "$MOCK_TARGET_URL"
        else
          echo "$MOCK_TARGET_URL"
        fi
        ;;
      *VENTUREDEX_SAFE_PAGE_CAPTURE*)
        if [ "$MOCK_TARGET_MODE" = "after_click_auth" ] ||
           [ "$MOCK_TARGET_MODE" = "after_click_same_url_auth_overlay" ]; then
          echo "LOGIN_SENTINEL private@example.com Consent for Dai Example"
        else
          echo "$MOCK_TARGET_URL"
        fi
        ;;
      *slice\\(0,8000\\)*)
        if [ "$MOCK_TARGET_MODE" = "after_click_auth" ]; then
          echo "LOGIN_SENTINEL private@example.com"
        elif [ "$MOCK_TARGET_MODE" = "prefix_collision" ]; then
          echo "$MOCK_TARGET_URL-other"
        elif [ "$MOCK_TARGET_MODE" = "post_prefix_collision" ]; then
          echo "$MOCK_TARGET_URL-other"
        elif [ "$MOCK_TARGET_MODE" = "wrong_current_with_target_elsewhere" ]; then
          printf '%s\\n%s\\n' "\${MOCK_WRONG_TARGET_URL:-https://venturedex.co/startups/wrong}" "$MOCK_TARGET_URL"
        else
          echo "$MOCK_TARGET_URL"
        fi
        ;;
      *VENTUREDEX_CALL:click_target*)
        if [ "$MOCK_SURFACE_MODE" = "auth_before_click" ]; then
          echo "gsc_auth_session_blocker|||https://accounts.google.com/v3/signin/identifier"
        elif [ "$MOCK_TARGET_MODE" = "click_route_flip" ]; then
          echo "inspection_route_id_changed"
        elif [ "$MOCK_TARGET_MODE" = "atomic_terminal_success_static" ]; then
          if printf '%s' "$js" | grep -Fq ",true,'"; then
            clicks=0
            if [ -f "$MOCK_CLICK_COUNTER" ]; then clicks=$(cat "$MOCK_CLICK_COUNTER"); fi
            clicks=$((clicks + 1))
            printf '%s\\n' "$clicks" > "$MOCK_CLICK_COUNTER"
            echo "clicked"
          else
            echo "preclick_terminal|||success_static"
          fi
        elif [ "$MOCK_TARGET_MODE" = "atomic_terminal_quota" ]; then
          echo "preclick_terminal|||quota"
        elif [ "$MOCK_TARGET_MODE" = "atomic_terminal_conflict" ]; then
          echo "preclick_terminal|||conflict"
        elif [ "$MOCK_TARGET_MODE" = "atomic_terminal_failed" ]; then
          echo "preclick_terminal|||failed"
        else
          clicks=0
          if [ -f "$MOCK_CLICK_COUNTER" ]; then clicks=$(cat "$MOCK_CLICK_COUNTER"); fi
          clicks=$((clicks + 1))
          printf '%s\\n' "$clicks" > "$MOCK_CLICK_COUNTER"
          if [ "$MOCK_TARGET_MODE" = "click_output_lost" ]; then
            exit 70
          fi
          echo "clicked"
        fi
        ;;
      *VENTUREDEX_CALL:request_state*)
        state_count=0
        if [ -f "$MOCK_REQUEST_STATE_COUNTER" ]; then
          state_count=$(cat "$MOCK_REQUEST_STATE_COUNTER")
        fi
        state_count=$((state_count + 1))
        printf '%s\\n' "$state_count" > "$MOCK_REQUEST_STATE_COUNTER"
        if [ "$MOCK_TARGET_MODE" = "pre_click_state_transport_failure" ] &&
           [ "$state_count" -eq 1 ]; then
          exit 71
        fi
        if [ "$MOCK_TARGET_MODE" = "history_failure_after_request" ] &&
           [ "$state_count" -ge 2 ] &&
           [ ! -e "$MOCK_HISTORY_FAILURE_MARKER" ]; then
          : > "$MOCK_HISTORY_FAILURE_MARKER"
          rm -f "$HISTORY_FILE"
          mkdir "$HISTORY_FILE"
        fi
        if [ "$MOCK_TARGET_MODE" = "preexisting_failed_retry" ]; then
          if [ "$state_count" -eq 1 ]; then echo "failed"; else echo "success"; fi
        elif [ "$MOCK_TARGET_MODE" = "preexisting_failed_then_failed" ]; then
          if [ "$state_count" -eq 1 ]; then
            echo "failed"
          elif [ "$state_count" -eq 2 ]; then
            echo "unknown"
          else
            echo "failed"
          fi
        elif [ "$MOCK_TARGET_MODE" = "after_click_auth" ] && [ "$state_count" -ge 2 ]; then
          echo "gsc_auth_session_blocker|||https://accounts.google.com/v3/signin/identifier"
        elif [ "$MOCK_TARGET_MODE" = "after_click_same_url_auth_overlay" ] && [ "$state_count" -ge 2 ]; then
          echo "gsc_inspection_surface_blocker|||https://search.google.com/search-console/inspect"
        elif [ "$MOCK_TARGET_MODE" = "confirmation_unknown" ]; then
          echo "unknown"
        elif [ "$MOCK_TARGET_MODE" = "stale_success_current_failure" ]; then
          if [ "$state_count" -eq 1 ]; then echo "success_static"; else echo "failed"; fi
        elif [ "$MOCK_TARGET_MODE" = "conflicting_terminal" ]; then
          if [ "$state_count" -eq 1 ]; then echo "unknown"; else echo "conflict"; fi
        elif [ "$MOCK_TARGET_MODE" = "unchanged_dialog_success" ]; then
          echo "success"
        elif [ "$MOCK_TARGET_MODE" = "pre_click_conflict" ] ||
             [ "$MOCK_TARGET_MODE" = "pre_click_success_quota" ]; then
          echo "conflict"
        elif [ "$MOCK_TARGET_MODE" = "batch_second_quota" ]; then
          submits=0
          if [ -f "$MOCK_SUBMIT_COUNTER" ]; then submits=$(cat "$MOCK_SUBMIT_COUNTER"); fi
          if [ "$submits" -ge 2 ]; then
            echo "unknown"
          elif [ "$state_count" -eq 1 ]; then
            echo "unknown"
          else
            echo "success"
          fi
        elif [ "$MOCK_TARGET_MODE" = "static_success_then_dialog" ]; then
          if [ "$state_count" -eq 1 ]; then echo "success_static"; else echo "success"; fi
        else
          if [ "$state_count" -eq 1 ]; then echo "unknown"; else echo "success"; fi
        fi
        ;;
      *"'quota':'ok'"*)
        submits=0
        if [ -f "$MOCK_SUBMIT_COUNTER" ]; then submits=$(cat "$MOCK_SUBMIT_COUNTER"); fi
        quota_checks=0
        if [ -f "$MOCK_QUOTA_COUNTER" ]; then quota_checks=$(cat "$MOCK_QUOTA_COUNTER"); fi
        quota_checks=$((quota_checks + 1))
        printf '%s\\n' "$quota_checks" > "$MOCK_QUOTA_COUNTER"
        if [ "$MOCK_TARGET_MODE" = "quota_probe_transport_failure" ]; then
          exit 72
        elif [ "$MOCK_TARGET_MODE" = "batch_second_quota" ] && [ "$submits" -ge 2 ]; then
          echo "quota"
        elif [ "$MOCK_TARGET_MODE" = "success_then_quota" ] && [ "$quota_checks" -ge 2 ]; then
          echo "quota"
        else
          echo "ok"
        fi
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
  return {
    browser,
    comet,
    log,
    counter,
    stateCounter,
    clickCounter,
    submitCounter,
    quotaCounter,
  };
}

function gscClickCount(mock: ReturnType<typeof createGscBrowserMock>): number {
  return existsSync(mock.clickCounter)
    ? Number.parseInt(readFileSync(mock.clickCounter, "utf8").trim(), 10)
    : 0;
}

const historyHeader = "timestamp\tstatus\turl\tmessage\n";

function gscArtifactTargetKeyForTest(url: string): string {
  const normalized = url.replace(/\/+$/, "");
  const readable = normalized
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "unknown";
  const digest = createHash("sha256")
    .update(normalized, "utf8")
    .digest("hex")
    .slice(0, 12);
  return `${readable}--sha256-${digest}`;
}

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
        "2026-01-01 00:00:10\tretry_pending\thttps://venturedex.co/weekly/4\tfailed",
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
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC retry backlog honors the latest non-dry-run blocker state", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  writeFileSync(
    history,
    historyHeader +
      [
        "2026-01-01 00:00:01\tretry_pending\thttps://venturedex.co/startups/alpha\tfailed",
        "2026-01-01 00:00:02\tquota_exceeded\thttps://venturedex.co/startups/alpha\tquota",
        "2026-01-01 00:00:03\tdry_run\thttps://venturedex.co/startups/alpha\tpreview",
        "2026-01-01 00:00:04\tretry_pending\thttps://venturedex.co/startups/beta\tfailed",
        "2026-01-01 00:00:05\tlive_check_failed\thttps://venturedex.co/startups/beta\tlive",
        "2026-01-01 00:00:06\tretry_pending\thttps://venturedex.co/startups/gamma\tfailed",
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
    assert.match(result.stdout, /startups\/gamma/);
    assert.doesNotMatch(result.stdout, /^    - .*startups\/alpha/m);
    assert.doesNotMatch(result.stdout, /^    - .*startups\/beta/m);
    const ledger = readFileSync(history, "utf8");
    assert.equal((ledger.match(/\tdry_run\thttps:\/\/venturedex\.co\/startups\/alpha/g) ?? []).length, 1);
    assert.equal((ledger.match(/\tdry_run\thttps:\/\/venturedex\.co\/startups\/beta/g) ?? []).length, 0);
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

test("GSC rejects FIFO, directory, and symlink ledger authorities without blocking", () => {
  for (const kind of ["fifo", "directory", "symlink", "broken-symlink"]) {
    const root = createGscFixture();
    const history = path.join(root, "history.tsv");
    const regular = path.join(root, "regular.tsv");
    writeFileSync(regular, historyHeader);
    if (kind === "fifo") {
      execFileSync("mkfifo", [history]);
    } else if (kind === "directory") {
      mkdirSync(history);
    } else if (kind === "symlink") {
      symlinkSync(regular, history);
    } else {
      symlinkSync(path.join(root, "missing.tsv"), history);
    }

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
          timeout: 2_000,
        },
      );

      assert.equal(result.error, undefined, `${kind} must not time out`);
      assert.notEqual(result.status, 0, kind);
      assert.match(
        `${result.stdout}\n${result.stderr}`,
        /regular, non-symlink file/,
        kind,
      );
      assert.equal(readFileSync(regular, "utf8"), historyHeader);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC shell ledger authority rejects ambiguous TSV, outer whitespace, and noncanonical URLs", () => {
  const invalidRows = [
    "2026-01-01 00:00:00\trequested\thttps://venturedex.co/startups/alpha\t\"message\twith tab\"",
    "2026-01-01 00:00:00\t requested \thttps://venturedex.co/startups/alpha\tmessage",
    "2026-01-01 00:00:00\trequsted\thttps://venturedex.co/startups/alpha\tmessage",
    "2026-01-01 00:00:00\talready_requested\thttps://venturedex.co/startups/alpha\tmessage",
    "not-a-timestamp\trequested\thttps://venturedex.co/startups/alpha\tmessage",
    "2026-01-01 00:00:00\trequested\thttps://venturedex.co/startups/alpha/\tmessage",
    "2026-01-01 00:00:00\trequested\thttps://venturedex.co/startups/alpha.html\tmessage",
  ];

  for (const invalidRow of invalidRows) {
    const root = createGscFixture();
    const history = path.join(root, "history.tsv");
    const original = `${historyHeader}${invalidRow}\n`;
    writeFileSync(history, original);
    try {
      const result = spawnSync(
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
            ...process.env,
            HISTORY_FILE: history,
            GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
          },
          encoding: "utf8",
        },
      );

      assert.notEqual(result.status, 0, invalidRow);
      assert.match(`${result.stdout}\n${result.stderr}`, /Invalid GSC ledger row/);
      assert.equal(readFileSync(history, "utf8"), original);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC shell ledger authority rejects bare CR and ambiguous Unicode control separators", () => {
  const validRow =
    "2026-01-01 00:00:00\trequested\thttps://venturedex.co/startups/alpha\tmessage";
  for (const separator of ["\r", "\u001f", "\ufeff", "\u2028"]) {
    const root = createGscFixture();
    const history = path.join(root, "history.tsv");
    const original =
      `timestamp\tstatus\turl\tmessage${separator}${validRow}\n`;
    writeFileSync(history, original);
    try {
      const result = spawnSync(
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
            ...process.env,
            HISTORY_FILE: history,
            GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
          },
          encoding: "utf8",
        },
      );

      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}\n${result.stderr}`, /Invalid GSC ledger line separator/);
      assert.equal(readFileSync(history, "utf8"), original);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC validates target and expected URLs before any ledger append", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const validTarget = "https://venturedex.co/startups/alpha";
  const invalidTarget = `${validTarget}\tcorrupt-column`;
  writeFileSync(history, historyHeader);

  try {
    const invalid = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--dry-run",
        "--url",
        invalidTarget,
        "--expect-url",
        validTarget,
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

    assert.notEqual(invalid.status, 0);
    assert.match(`${invalid.stdout}\n${invalid.stderr}`, /Invalid VentureDex detail URL/);
    assert.equal(readFileSync(history, "utf8"), historyHeader);

    const valid = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--dry-run",
        "--url",
        validTarget,
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
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(readFileSync(history, "utf8"), /\tdry_run\t/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC precheck failure queues every unattempted target on both sides without downgrading requested", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const binDir = path.join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const requested = "https://venturedex.co/startups/already";
  const beforeFailure = "https://venturedex.co/startups/alpha";
  const failing = "https://venturedex.co/startups/beta";
  const afterFailure = "https://venturedex.co/startups/gamma";
  writeFileSync(
    history,
    historyHeader +
      `2026-01-01 00:00:00\trequested\t${requested}\trequested\n`,
  );
  writeExecutable(
    path.join(binDir, "curl"),
    `#!/bin/sh
case "$*" in
  *"/startups/beta"*) exit 22 ;;
  *) exit 0 ;;
esac
`,
  );

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--url",
        requested,
        "--url",
        beforeFailure,
        "--url",
        failing,
        "--url",
        afterFailure,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          HISTORY_FILE: history,
          GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
          GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    const ledger = readFileSync(history, "utf8");
    assert.doesNotMatch(ledger, new RegExp(`\\tretry_pending\\t${requested}`));
    assert.match(
      ledger,
      new RegExp(`\\tretry_pending\\t${beforeFailure}\\tbatch stopped during precheck`),
    );
    assert.match(
      ledger,
      new RegExp(`\\tlive_check_failed\\t${failing}\\ttarget URL did not return`),
    );
    assert.doesNotMatch(ledger, new RegExp(`\\tretry_pending\\t${failing}`));
    assert.match(
      ledger,
      new RegExp(`\\tretry_pending\\t${afterFailure}\\tbatch stopped during precheck`),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC precheck reconciliation blocker queues every other unattempted target", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const targets = [
    "https://venturedex.co/startups/alpha",
    "https://venturedex.co/startups/beta",
    "https://venturedex.co/startups/gamma",
    "https://venturedex.co/startups/delta",
  ];
  writeFileSync(
    history,
    historyHeader +
      `2026-01-01 00:00:00\tpost_request_confirmation_unknown\t${targets[1]}\tmanual reconciliation required\n` +
      `2026-01-01 00:01:00\trequest_click_pending\t${targets[2]}\trequest click acceptance unknown\n`,
  );

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--dry-run",
        "--url",
        targets[0],
        "--url",
        targets[1],
        "--url",
        targets[2],
        "--url",
        targets[3],
        "--skip-live-check",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          HISTORY_FILE: history,
          GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
          GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    const ledger = readFileSync(history, "utf8");
    assert.match(
      ledger,
      new RegExp(`\\tretry_pending\\t${targets[0]}\\tbatch stopped during precheck after reconciliation blocker`),
    );
    assert.match(
      ledger,
      new RegExp(`\\tpost_request_confirmation_unknown\\t${targets[1]}\\t`),
    );
    assert.doesNotMatch(ledger, new RegExp(`\\tretry_pending\\t${targets[1]}`));
    assert.match(
      ledger,
      new RegExp(`\\trequest_click_pending\\t${targets[2]}\\t`),
    );
    assert.doesNotMatch(ledger, new RegExp(`\\tretry_pending\\t${targets[2]}`));
    assert.match(
      ledger,
      new RegExp(`\\tretry_pending\\t${targets[3]}\\tbatch stopped during precheck after reconciliation blocker`),
    );
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
      assert.doesNotMatch(ledger, /\trequested\t/);
      assert.match(`${result.stdout}\n${result.stderr}`, /exact inspected URL|URL mismatch/);
      if (mode === "prefix_collision") {
        assert.match(ledger, /\tretry_pending\t.*\tinspected URL mismatch/);
        assert.equal(gscClickCount(mock), 0);
      } else {
        assert.match(ledger, /\tpost_request_target_unverified\t/);
        assert.doesNotMatch(ledger, /\tretry_pending\t/);
        assert.equal(gscClickCount(mock), 1);
        assert.equal(
          readdirSync(artifactDir).filter((name) =>
            name.includes("post_request_target_unverified"),
          ).length,
          1,
        );
        const retry = spawnSync(
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
              MOCK_TARGET_MODE: "exact",
              MOCK_TARGET_URL: target,
              NAV_WAIT_SECONDS: "0",
              INSPECT_WAIT_SECONDS: "0",
              POST_CLICK_WAIT_SECONDS: "0",
              POST_MODAL_WAIT_SECONDS: "0",
            },
            encoding: "utf8",
          },
        );
        assert.notEqual(retry.status, 0);
        assert.match(
          `${retry.stdout}\n${retry.stderr}`,
          /unresolved GSC reconciliation state/,
        );
        assert.equal(gscClickCount(mock), 1);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC atomically revalidates the route-bound target before clicking", () => {
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
          MOCK_TARGET_MODE: "click_route_flip",
          MOCK_TARGET_URL: target,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    const ledger = readFileSync(history, "utf8");
    assert.notEqual(result.status, 0);
    assert.equal(gscClickCount(mock), 0);
    assert.match(
      ledger,
      /\tretry_pending\t.*\tinspected target changed before request click/,
    );
    assert.doesNotMatch(ledger, /\trequested\t/);
    assert.match(readFileSync(mock.log, "utf8"), /VENTUREDEX_CALL:click_target/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC uses the route-bound header when the input is match, cleared, or unavailable", () => {
  for (const inputMode of ["match", "cleared", "unavailable", "mismatch"]) {
    const root = createGscFixture();
    const mock = createGscBrowserMock(root);
    const history = path.join(root, "history.tsv");
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
            GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
            BB_BROWSER_CMD: mock.browser,
            COMET_APP: mock.comet,
            MOCK_BROWSER_LOG: mock.log,
            MOCK_TARGET_COUNTER: mock.counter,
            MOCK_TARGET_MODE: "exact",
            MOCK_INPUT_MODE: inputMode,
            MOCK_TARGET_URL: target,
            NAV_WAIT_SECONDS: "0",
            INSPECT_WAIT_SECONDS: "0",
            POST_CLICK_WAIT_SECONDS: "0",
            POST_MODAL_WAIT_SECONDS: "0",
          },
          encoding: "utf8",
        },
      );

      const ledger = readFileSync(history, "utf8");
      if (inputMode !== "mismatch") {
        assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(ledger, /\trequested\t/);
      } else {
        assert.notEqual(result.status, 0);
        assert.match(ledger, /\tretry_pending\t.*\tinspected URL mismatch/);
        assert.doesNotMatch(ledger, /\trequested\t/);
        assert.equal(gscClickCount(mock), 0);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC binds the exact target to the current inspection header, not whole-page URL text", () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const target = "https://venturedex.co/startups/alpha";
  const wrongTarget = "https://venturedex.co/startups/wrong";
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
          GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
          BB_BROWSER_CMD: mock.browser,
          COMET_APP: mock.comet,
          MOCK_BROWSER_LOG: mock.log,
          MOCK_TARGET_COUNTER: mock.counter,
          MOCK_TARGET_MODE: "wrong_current_with_target_elsewhere",
          MOCK_INPUT_MODE: "cleared",
          MOCK_TARGET_URL: target,
          MOCK_WRONG_TARGET_URL: wrongTarget,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    const ledger = readFileSync(history, "utf8");
    assert.notEqual(result.status, 0);
    assert.match(ledger, /\tretry_pending\t.*\tinspected URL mismatch/);
    assert.doesNotMatch(ledger, /\trequested\t/);
    assert.equal(gscClickCount(mock), 0);

    const runtime = readFileSync(
      path.join(root, "scripts", "gsc-browser-runtime.js"),
      "utf8",
    );
    assert.match(runtime, /jsrenderer=.*jtca7c/);
    assert.match(runtime, /jsname=.*a9kxte/);
    assert.match(runtime, /data-event-action=.*request-indexing/);
    assert.match(runtime, /previousElementSibling/);
    assert.match(runtime, /jsname=.*us8Fnf/);
    assert.match(runtime, /getClientRects/);
    assert.match(
      runtime,
      /function clickTarget\(\s*expected,\s*expectedRouteId,/,
    );
    const currentInspectionSource = runtime.slice(
      runtime.indexOf("function currentInspection"),
      runtime.indexOf("function inspectTarget"),
    );
    assert.doesNotMatch(currentInspectionSource, /document\.body/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC rejects hidden stale target evidence and ambiguous route-bound result structure", () => {
  for (const mode of [
    "hidden_stale_target_visible_wrong",
    "active_root_ambiguous",
    "route_id_missing",
    "header_missing",
  ]) {
    const root = createGscFixture();
    const mock = createGscBrowserMock(root);
    const history = path.join(root, "history.tsv");
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
            GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
            BB_BROWSER_CMD: mock.browser,
            COMET_APP: mock.comet,
            MOCK_BROWSER_LOG: mock.log,
            MOCK_TARGET_COUNTER: mock.counter,
            MOCK_TARGET_MODE: mode,
            MOCK_INPUT_MODE: "cleared",
            MOCK_TARGET_URL: target,
            MOCK_WRONG_TARGET_URL: "https://venturedex.co/startups/wrong",
            NAV_WAIT_SECONDS: "0",
            INSPECT_WAIT_SECONDS: "0",
            POST_CLICK_WAIT_SECONDS: "0",
            POST_MODAL_WAIT_SECONDS: "0",
          },
          encoding: "utf8",
        },
      );

      const ledger = readFileSync(history, "utf8");
      assert.notEqual(result.status, 0, `${mode} must fail closed`);
      assert.match(ledger, /\tretry_pending\t.*\tinspected URL mismatch/);
      assert.doesNotMatch(ledger, /\trequested\t/);
      assert.equal(gscClickCount(mock), 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC normalizes a trailing slash in the route-bound inspection header", () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
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
          GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
          BB_BROWSER_CMD: mock.browser,
          COMET_APP: mock.comet,
          MOCK_BROWSER_LOG: mock.log,
          MOCK_TARGET_COUNTER: mock.counter,
          MOCK_TARGET_MODE: "trailing_slash",
          MOCK_TARGET_URL: target,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(readFileSync(history, "utf8"), /\trequested\t/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC turns unknown post-click confirmation into a non-retryable reconciliation blocker", () => {
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
          MOCK_TARGET_MODE: "confirmation_unknown",
          MOCK_TARGET_URL: target,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
          REQUEST_RESULT_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    const ledger = readFileSync(history, "utf8");
    assert.notEqual(result.status, 0);
    assert.match(ledger, /\tpost_request_confirmation_unknown\t/);
    assert.doesNotMatch(ledger, /\trequested\t|\tretry_pending\t/);
    assert.equal(
      readdirSync(artifactDir).filter((name) =>
        name.includes("post_request_confirmation_unknown"),
      ).length,
      1,
    );

    const secondResult = spawnSync(
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
          MOCK_TARGET_MODE: "exact",
          MOCK_TARGET_URL: target,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(secondResult.status, 0);
    assert.match(
      `${secondResult.stdout}\n${secondResult.stderr}`,
      /unresolved GSC reconciliation state/,
    );
    assert.equal(gscClickCount(mock), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC confirmation requires a post-click terminal-state transition", () => {
  const scenarios = [
    {
      mode: "stale_success_current_failure",
      expectedStatus: "retry_pending",
      expectedMessage: "request failure detected",
    },
    {
      mode: "conflicting_terminal",
      expectedStatus: "post_request_confirmation_unknown",
      expectedMessage: "terminal confirmation was not detected",
    },
  ];

  for (const scenario of scenarios) {
    const root = createGscFixture();
    const mock = createGscBrowserMock(root);
    const history = path.join(root, "history.tsv");
    const artifactDir = path.join(root, "artifacts");
    const targets = [
      "https://venturedex.co/startups/alpha",
      "https://venturedex.co/startups/beta",
    ];
    writeFileSync(history, historyHeader);

    try {
      const result = spawnSync(
        "bash",
        [
          path.join(root, "scripts", "submit-gsc-direct.sh"),
          "--url",
          targets[0],
          "--url",
          targets[1],
          "--force",
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
            MOCK_TARGET_MODE: scenario.mode,
            MOCK_TARGET_URL: targets[0],
            NAV_WAIT_SECONDS: "0",
            INSPECT_WAIT_SECONDS: "0",
            POST_CLICK_WAIT_SECONDS: "0",
            POST_MODAL_WAIT_SECONDS: "0",
            REQUEST_RESULT_WAIT_SECONDS: "0",
          },
          encoding: "utf8",
        },
      );

      const ledger = readFileSync(history, "utf8");
      assert.notEqual(result.status, 0, `${scenario.mode} must fail closed`);
      assert.equal(gscClickCount(mock), 1);
      assert.match(
        ledger,
        new RegExp(`\\t${scenario.expectedStatus}\\t`),
      );
      assert.match(ledger, new RegExp(scenario.expectedMessage));
      assert.doesNotMatch(ledger, /\trequested\t/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC after-click auth redirect is non-retryable and never captures login-page text", () => {
  const scenarios = [
    {
      mode: "after_click_auth",
      ledgerMarker:
        /gsc_auth_session_blocker: observed https:\/\/accounts\.google\.com\/v3\/signin\/identifier/,
      artifactMarker:
        /Page text capture suppressed outside authenticated VentureDex Search Console inspection surface; observed https:\/\/accounts\.google\.com\/v3\/signin\/identifier/,
    },
    {
      mode: "after_click_same_url_auth_overlay",
      ledgerMarker:
        /gsc_inspection_surface_blocker: observed https:\/\/search\.google\.com\/search-console\/inspect/,
      artifactMarker:
        /Page text capture suppressed because the authenticated VentureDex Search Console inspection surface was not ready; observed https:\/\/search\.google\.com\/search-console\/inspect/,
    },
  ];

  for (const scenario of scenarios) {
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
            MOCK_TARGET_MODE: scenario.mode,
            MOCK_TARGET_URL: target,
            NAV_WAIT_SECONDS: "0",
            INSPECT_WAIT_SECONDS: "0",
            POST_CLICK_WAIT_SECONDS: "0",
            POST_MODAL_WAIT_SECONDS: "0",
            REQUEST_RESULT_WAIT_SECONDS: "0",
          },
          encoding: "utf8",
        },
      );

      assert.notEqual(result.status, 0, scenario.mode);
      assert.equal(gscClickCount(mock), 1, scenario.mode);
      const ledger = readFileSync(history, "utf8");
      assert.match(ledger, /\trequest_click_pending\t/);
      assert.match(ledger, /\tpost_request_target_unverified\t/);
      assert.match(ledger, scenario.ledgerMarker);
      assert.doesNotMatch(ledger, /\trequested\t/);

      const artifactNames = readdirSync(artifactDir);
      assert.equal(artifactNames.length, 1);
      const artifact = readFileSync(
        path.join(artifactDir, artifactNames[0]),
        "utf8",
      );
      assert.match(artifact, scenario.artifactMarker);
      assert.doesNotMatch(
        artifact,
        /LOGIN_SENTINEL|private@example\.com|Consent for Dai Example/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC click side effect with lost transport output stays non-retryable", () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const artifactDir = path.join(root, "artifacts");
  const target = "https://venturedex.co/startups/alpha";
  writeFileSync(history, historyHeader);
  const args = [
    path.join(root, "scripts", "submit-gsc-direct.sh"),
    "--url",
    target,
    "--expect-url",
    target,
    "--skip-live-check",
  ];
  const env = {
    ...process.env,
    HISTORY_FILE: history,
    GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
    GSC_ARTIFACT_DIR: artifactDir,
    BB_BROWSER_CMD: mock.browser,
    COMET_APP: mock.comet,
    MOCK_BROWSER_LOG: mock.log,
    MOCK_TARGET_MODE: "click_output_lost",
    MOCK_TARGET_URL: target,
    NAV_WAIT_SECONDS: "0",
    INSPECT_WAIT_SECONDS: "0",
    POST_CLICK_WAIT_SECONDS: "0",
    POST_MODAL_WAIT_SECONDS: "0",
    REQUEST_RESULT_WAIT_SECONDS: "0",
  };

  try {
    const first = spawnSync("bash", args, {
      cwd: root,
      env,
      encoding: "utf8",
    });
    assert.notEqual(first.status, 0);
    assert.equal(gscClickCount(mock), 1);
    const ledger = readFileSync(history, "utf8");
    assert.match(ledger, /\trequest_click_pending\t/);
    assert.match(ledger, /\tpost_request_confirmation_unknown\t/);
    assert.match(ledger, /browser click outcome was not returned reliably/);
    assert.doesNotMatch(ledger, /\tretry_pending\t|\trequested\t/);

    const second = spawnSync("bash", args, {
      cwd: root,
      env,
      encoding: "utf8",
    });
    assert.notEqual(second.status, 0);
    assert.match(
      `${second.stdout}\n${second.stderr}`,
      /unresolved GSC reconciliation state/,
    );
    assert.equal(gscClickCount(mock), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC pre-click state and quota transport failures remain zero-click", () => {
  for (const mode of [
    "pre_click_state_transport_failure",
    "quota_probe_transport_failure",
  ]) {
    const root = createGscFixture();
    const mock = createGscBrowserMock(root);
    const history = path.join(root, "history.tsv");
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
            GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
            BB_BROWSER_CMD: mock.browser,
            COMET_APP: mock.comet,
            MOCK_BROWSER_LOG: mock.log,
            MOCK_TARGET_MODE: mode,
            MOCK_TARGET_URL: target,
            NAV_WAIT_SECONDS: "0",
            INSPECT_WAIT_SECONDS: "0",
            POST_CLICK_WAIT_SECONDS: "0",
            POST_MODAL_WAIT_SECONDS: "0",
            REQUEST_RESULT_WAIT_SECONDS: "0",
          },
          encoding: "utf8",
        },
      );

      assert.notEqual(result.status, 0, mode);
      assert.equal(gscClickCount(mock), 0, mode);
      const ledger = readFileSync(history, "utf8");
      assert.match(ledger, /\tretry_pending\t/, mode);
      assert.match(ledger, /pre-click Search Console state or quota probe was unavailable/, mode);
      assert.doesNotMatch(ledger, /\trequest_click_pending\t|\trequested\t/, mode);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC atomically refuses terminal state that appears between precheck and click", () => {
  const scenarios = [
    {
      mode: "atomic_terminal_success_static",
      expectedStatus: "requested",
      expectedExit: 0,
      expectedClicks: 0,
      force: false,
    },
    {
      mode: "atomic_terminal_success_static",
      expectedStatus: "requested",
      expectedExit: 0,
      expectedClicks: 1,
      force: true,
    },
    {
      mode: "atomic_terminal_quota",
      expectedStatus: "retry_pending",
      expectedExit: 2,
      expectedClicks: 0,
      force: false,
    },
    {
      mode: "atomic_terminal_conflict",
      expectedStatus: "pre_request_success_unverified",
      expectedExit: 1,
      expectedClicks: 0,
      force: false,
    },
    {
      mode: "atomic_terminal_failed",
      expectedStatus: "retry_pending",
      expectedExit: 1,
      expectedClicks: 0,
      force: false,
    },
  ];

  for (const scenario of scenarios) {
    const root = createGscFixture();
    const mock = createGscBrowserMock(root);
    const history = path.join(root, "history.tsv");
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
          ...(scenario.force ? ["--force"] : []),
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
            MOCK_TARGET_MODE: scenario.mode,
            MOCK_TARGET_URL: target,
            NAV_WAIT_SECONDS: "0",
            INSPECT_WAIT_SECONDS: "0",
            POST_CLICK_WAIT_SECONDS: "0",
            POST_MODAL_WAIT_SECONDS: "0",
            REQUEST_RESULT_WAIT_SECONDS: "0",
          },
          encoding: "utf8",
        },
      );

      assert.equal(result.status, scenario.expectedExit, scenario.mode);
      assert.equal(gscClickCount(mock), scenario.expectedClicks, scenario.mode);
      const statuses = readFileSync(history, "utf8")
        .trim()
        .split("\n")
        .slice(1)
        .map((line) => line.split("\t")[1]);
      assert.equal(statuses.at(-1), scenario.expectedStatus, scenario.mode);
      assert.notEqual(statuses.at(-1), "request_click_pending", scenario.mode);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC retries a known route-bound failure and recognizes a new failure transition", () => {
  const scenarios = [
    {
      mode: "preexisting_failed_retry",
      expectedStatus: "requested",
      expectedExit: 0,
    },
    {
      mode: "preexisting_failed_then_failed",
      expectedStatus: "retry_pending",
      expectedExit: 1,
    },
  ];

  for (const scenario of scenarios) {
    const root = createGscFixture();
    const mock = createGscBrowserMock(root);
    const history = path.join(root, "history.tsv");
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
            GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
            BB_BROWSER_CMD: mock.browser,
            COMET_APP: mock.comet,
            MOCK_BROWSER_LOG: mock.log,
            MOCK_TARGET_MODE: scenario.mode,
            MOCK_TARGET_URL: target,
            NAV_WAIT_SECONDS: "0",
            INSPECT_WAIT_SECONDS: "0",
            POST_CLICK_WAIT_SECONDS: "0",
            POST_MODAL_WAIT_SECONDS: "0",
            REQUEST_RESULT_WAIT_SECONDS: "0",
          },
          encoding: "utf8",
        },
      );

      assert.equal(result.status, scenario.expectedExit, scenario.mode);
      assert.equal(gscClickCount(mock), 1, scenario.mode);
      const statuses = readFileSync(history, "utf8")
        .trim()
        .split("\n")
        .slice(1)
        .map((line) => line.split("\t")[1]);
      assert.equal(statuses.at(-1), scenario.expectedStatus, scenario.mode);
      assert.notEqual(
        statuses.at(-1),
        "post_request_confirmation_unknown",
        scenario.mode,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC never lets a later whole-page quota signal downgrade route-bound post-click success", () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
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
          GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
          BB_BROWSER_CMD: mock.browser,
          COMET_APP: mock.comet,
          MOCK_BROWSER_LOG: mock.log,
          MOCK_TARGET_MODE: "success_then_quota",
          MOCK_TARGET_URL: target,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
          REQUEST_RESULT_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(gscClickCount(mock), 1);
    const ledger = readFileSync(history, "utf8");
    assert.match(ledger, /\trequested\t/);
    assert.doesNotMatch(ledger, /\tretry_pending\t|quota blocker/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC only repeats a pre-existing static success request with explicit force", () => {
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
        "--force",
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
          MOCK_TARGET_MODE: "static_success_then_dialog",
          MOCK_TARGET_URL: target,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
          REQUEST_RESULT_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(gscClickCount(mock), 1);
    assert.match(readFileSync(history, "utf8"), /\trequested\t/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC records a route-bound pre-existing success without a duplicate click", () => {
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
          MOCK_TARGET_MODE: "static_success_then_dialog",
          MOCK_TARGET_URL: target,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
          REQUEST_RESULT_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(gscClickCount(mock), 0);
    assert.match(
      readFileSync(history, "utf8"),
      /\trequested\t.*\texisting route-bound Search Console success state/,
    );
    assert.match(result.stdout, /without a duplicate click/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC never treats a pre-existing unbound success dialog as target completion", () => {
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
          MOCK_TARGET_MODE: "unchanged_dialog_success",
          MOCK_TARGET_URL: target,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
          REQUEST_RESULT_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    assert.equal(gscClickCount(mock), 0);
    const ledger = readFileSync(history, "utf8");
    assert.match(ledger, /\tpre_request_success_unverified\t/);
    assert.doesNotMatch(ledger, /\trequested\t/);
    assert.equal(
      readdirSync(artifactDir).filter((name) =>
        name.includes("pre_request_success_unverified"),
      ).length,
      1,
    );
    const retry = spawnSync(
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
          MOCK_TARGET_MODE: "exact",
          MOCK_TARGET_URL: target,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(retry.status, 0);
    assert.match(
      `${retry.stdout}\n${retry.stderr}`,
      /unresolved GSC reconciliation state/,
    );
    assert.equal(gscClickCount(mock), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC never clicks through a success-plus-quota pre-request conflict", () => {
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
          MOCK_TARGET_MODE: "pre_click_success_quota",
          MOCK_TARGET_URL: target,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    assert.equal(gscClickCount(mock), 0);
    const ledger = readFileSync(history, "utf8");
    assert.match(ledger, /\tpre_request_success_unverified\t/);
    assert.doesNotMatch(ledger, /\trequested\t|\tretry_pending\t/);
    assert.equal(
      readdirSync(artifactDir).filter((name) =>
        name.includes("pre_request_success_unverified"),
      ).length,
      1,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC tab open failures stop before eval and retain the exact browser blocker", () => {
  for (const openMode of ["exit_failure", "missing_tab_id"]) {
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
            MOCK_OPEN_MODE: openMode,
            MOCK_TARGET_MODE: "exact",
            MOCK_TARGET_URL: target,
            NAV_WAIT_SECONDS: "0",
            INSPECT_WAIT_SECONDS: "0",
            POST_CLICK_WAIT_SECONDS: "0",
            POST_MODAL_WAIT_SECONDS: "0",
          },
          encoding: "utf8",
        },
      );

      const output = `${result.stdout}\n${result.stderr}`;
      assert.notEqual(result.status, 0, `${openMode} must fail closed`);
      assert.match(
        output,
        /Could not open the managed Search Console tab|without a usable tab id/,
      );
      assert.doesNotMatch(output, /inspection input was unavailable/);
      assert.equal(gscClickCount(mock), 0);
      assert.match(
        readFileSync(history, "utf8"),
        /\tretry_pending\t.*\tgsc_browser_session_blocker: managed Search Console tab open failed/,
      );
      const evalCalls = readFileSync(mock.log, "utf8")
        .split("\n")
        .filter((line) => line.startsWith("eval "));
      assert.equal(evalCalls.length, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC tab open failure records every selected target for bounded retry", () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const artifactDir = path.join(root, "artifacts");
  const targets = [
    "https://venturedex.co/startups/alpha",
    "https://venturedex.co/startups/beta",
  ];
  writeFileSync(history, historyHeader);

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--url",
        targets[0],
        "--url",
        targets[1],
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
          MOCK_OPEN_MODE: "exit_failure",
          MOCK_TARGET_MODE: "exact",
          MOCK_TARGET_URL: targets[0],
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    const ledger = readFileSync(history, "utf8");
    for (const target of targets) {
      assert.match(
        ledger,
        new RegExp(
          `\\tretry_pending\\t${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\tgsc_browser_session_blocker: managed Search Console tab open failed`,
        ),
      );
    }
    assert.equal(gscClickCount(mock), 0);
    assert.equal(readdirSync(artifactDir).length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC tab open failure never downgrades a requested target in a mixed batch", () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const artifactDir = path.join(root, "artifacts");
  const requested = "https://venturedex.co/startups/alpha";
  const pending = "https://venturedex.co/startups/beta";
  writeFileSync(
    history,
    historyHeader +
      `2026-01-01 00:00:00\trequested\t${requested}\trequested\n`,
  );

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--url",
        requested,
        "--url",
        pending,
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
          MOCK_OPEN_MODE: "exit_failure",
          NAV_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    const ledger = readFileSync(history, "utf8");
    assert.equal((ledger.match(new RegExp(`\\tretry_pending\\t${requested}`, "g")) ?? []).length, 0);
    assert.equal((ledger.match(new RegExp(`\\tretry_pending\\t${pending}`, "g")) ?? []).length, 1);
    assert.equal(readdirSync(artifactDir).length, 1);
    assert.match(readdirSync(artifactDir)[0], new RegExp(gscArtifactTargetKeyForTest(pending)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC auth redirect records every unfinished URL without input, click, or login-page capture", () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const artifactDir = path.join(root, "artifacts");
  const requested = "https://venturedex.co/startups/alpha";
  const pending = "https://venturedex.co/startups/beta";
  writeFileSync(
    history,
    historyHeader +
      `2026-01-01 00:00:00\trequested\t${requested}\trequested\n`,
  );

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--url",
        requested,
        "--url",
        pending,
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
          MOCK_SURFACE_MODE: "auth_redirect",
          NAV_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    const ledger = readFileSync(history, "utf8");
    assert.match(
      ledger,
      new RegExp(`\\tretry_pending\\t${pending}\\tgsc_auth_session_blocker: observed https://accounts\\.google\\.com/v3/signin/identifier`),
    );
    assert.doesNotMatch(ledger, new RegExp(`\\tretry_pending\\t${requested}`));
    const browserLog = readFileSync(mock.log, "utf8");
    assert.doesNotMatch(browserLog, /VENTUREDEX_CALL:submit_input/);
    assert.doesNotMatch(browserLog, /VENTUREDEX_CALL:click_target/);
    assert.match(browserLog, /close --tab mock-tab/);
    assert.equal(gscClickCount(mock), 0);
    assert.equal(existsSync(artifactDir), false);

    const retryPreview = spawnSync(
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
          GSC_ARTIFACT_DIR: artifactDir,
        },
        encoding: "utf8",
      },
    );
    assert.equal(retryPreview.status, 0, retryPreview.stderr);
    assert.match(retryPreview.stdout, new RegExp(pending));
    assert.doesNotMatch(retryPreview.stdout, new RegExp(requested));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC auth races before input, after input, or before click stay zero-click and exactly classified", () => {
  for (const surfaceMode of ["atomic_redirect", "auth_after_input", "auth_before_click"]) {
    const root = createGscFixture();
    const mock = createGscBrowserMock(root);
    const history = path.join(root, "history.tsv");
    const artifactDir = path.join(root, "artifacts");
    const targets = [
      "https://venturedex.co/startups/alpha",
      "https://venturedex.co/startups/beta",
    ];
    writeFileSync(history, historyHeader);

    try {
      const result = spawnSync(
        "bash",
        [
          path.join(root, "scripts", "submit-gsc-direct.sh"),
          "--url",
          targets[0],
          "--url",
          targets[1],
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
            MOCK_SURFACE_MODE: surfaceMode,
            MOCK_TARGET_URL: targets[0],
            NAV_WAIT_SECONDS: "0",
            INSPECT_WAIT_SECONDS: "0",
            POST_CLICK_WAIT_SECONDS: "0",
            POST_MODAL_WAIT_SECONDS: "0",
          },
          encoding: "utf8",
        },
      );

      assert.notEqual(result.status, 0, surfaceMode);
      assert.equal(gscClickCount(mock), 0, surfaceMode);
      const ledger = readFileSync(history, "utf8");
      for (const target of targets) {
        assert.match(
          ledger,
          new RegExp(`\\tretry_pending\\t${target}\\tgsc_auth_session_blocker: observed https://accounts\\.google\\.com/v3/signin/identifier;`),
          `${surfaceMode}: ${target}`,
        );
      }
      assert.doesNotMatch(ledger, /\trequested\t/, surfaceMode);
      assert.equal(existsSync(artifactDir), false, surfaceMode);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC CDP connection failure persists a bounded browser blocker for every unfinished URL", () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const artifactDir = path.join(root, "artifacts");
  const targets = [
    "https://venturedex.co/startups/alpha",
    "https://venturedex.co/startups/beta",
  ];
  writeFileSync(history, historyHeader);

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--url",
        targets[0],
        "--url",
        targets[1],
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
          MOCK_CDP_MODE: "disconnected",
          COMET_CDP_PORT: "1",
          COMET_START_WAIT_SECONDS: "0",
          BB_BROWSER_CONNECT_MAX_ATTEMPTS: "1",
          BB_BROWSER_CONNECT_RETRY_SLEEP: "0",
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    const ledger = readFileSync(history, "utf8");
    for (const target of targets) {
      assert.match(
        ledger,
        new RegExp(`\\tretry_pending\\t${target}\\tgsc_browser_session_blocker:`),
      );
    }
    const browserLog = readFileSync(mock.log, "utf8");
    assert.doesNotMatch(browserLog, /^open /m);
    assert.doesNotMatch(browserLog, /^eval /m);
    assert.equal(gscClickCount(mock), 0);
    assert.equal(readdirSync(artifactDir).length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC missing browser dependencies persist every exact unfinished URL before exit", () => {
  for (const missing of ["bb-browser", "comet"]) {
    const root = createGscFixture();
    const mock = createGscBrowserMock(root);
    const history = path.join(root, "history.tsv");
    const artifactDir = path.join(root, "artifacts");
    const targets = [
      "https://venturedex.co/startups/alpha",
      "https://venturedex.co/startups/beta",
    ];
    writeFileSync(history, historyHeader);

    try {
      const result = spawnSync(
        "bash",
        [
          path.join(root, "scripts", "submit-gsc-direct.sh"),
          "--url",
          targets[0],
          "--url",
          targets[1],
          "--skip-live-check",
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            HISTORY_FILE: history,
            GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
            GSC_ARTIFACT_DIR: artifactDir,
            BB_BROWSER_CMD: missing === "bb-browser"
              ? path.join(root, "missing-bb-browser")
              : mock.browser,
            COMET_APP: missing === "comet"
              ? path.join(root, "missing-Comet")
              : mock.comet,
            MOCK_BROWSER_LOG: mock.log,
          },
          encoding: "utf8",
        },
      );

      assert.notEqual(result.status, 0, missing);
      const ledger = readFileSync(history, "utf8");
      for (const target of targets) {
        assert.match(
          ledger,
          new RegExp(`\\tretry_pending\\t${target}\\tgsc_browser_dependency_blocker:`),
          `${missing}: ${target}`,
        );
      }
      assert.equal(gscClickCount(mock), 0, missing);
      assert.equal(readdirSync(artifactDir).length, 2, missing);
      if (existsSync(mock.log)) {
        assert.doesNotMatch(readFileSync(mock.log, "utf8"), /^eval /m, missing);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC mid-batch quota preserves completed work and queues every unattempted target", () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const artifactDir = path.join(root, "artifacts");
  const targets = [
    "https://venturedex.co/startups/alpha",
    "https://venturedex.co/startups/beta",
    "https://venturedex.co/startups/gamma",
  ];
  writeFileSync(history, historyHeader);

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--url",
        targets[0],
        "--url",
        targets[1],
        "--url",
        targets[2],
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
          MOCK_TARGET_MODE: "batch_second_quota",
          MOCK_TARGET_URL: targets[0],
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
          REQUEST_RESULT_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    assert.equal(gscClickCount(mock), 1);
    const ledger = readFileSync(history, "utf8");
    assert.match(ledger, new RegExp(`\\trequested\\t${targets[0]}\\tindexing requested`));
    assert.doesNotMatch(ledger, new RegExp(`\\tretry_pending\\t${targets[0]}`));
    assert.match(
      ledger,
      new RegExp(`\\tretry_pending\\t${targets[1]}\\tquota blocker:`),
    );
    assert.match(
      ledger,
      new RegExp(`\\tretry_pending\\t${targets[2]}\\tbatch stopped after Search Console quota blocker`),
    );

    const retryPreview = spawnSync(
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
          GSC_ARTIFACT_DIR: artifactDir,
        },
        encoding: "utf8",
      },
    );
    assert.equal(retryPreview.status, 0, retryPreview.stderr);
    assert.doesNotMatch(retryPreview.stdout, new RegExp(targets[0]));
    assert.match(retryPreview.stdout, new RegExp(targets[1]));
    assert.match(retryPreview.stdout, new RegExp(targets[2]));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC checks newer reconciliation evidence before an older requested row", () => {
  const target = "https://venturedex.co/startups/alpha";

  for (const blocker of ["ledger", "artifact"]) {
    const root = createGscFixture();
    const history = path.join(root, "history.tsv");
    const artifactDir = path.join(root, "artifacts");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      history,
      historyHeader +
        `2026-01-01 00:00:00\trequested\t${target}\trequested\n` +
        (blocker === "ledger"
          ? `2026-01-02 00:00:00\tpost_request_confirmation_unknown\t${target}\tmanual reconciliation required\n`
          : ""),
    );
    if (blocker === "artifact") {
      writeFileSync(
        path.join(
          artifactDir,
          `20260102-000000-ledger_write_failed_after_request-${gscArtifactTargetKeyForTest(target)}.txt`,
        ),
        `status: ledger_write_failed_after_request\nurl: ${target}\n`,
      );
    }

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
            GSC_ARTIFACT_DIR: artifactDir,
          },
          encoding: "utf8",
        },
      );

      assert.notEqual(result.status, 0, `${blocker} must block before skip`);
      assert.match(
        `${result.stdout}\n${result.stderr}`,
        /unresolved GSC (reconciliation state|reconciliation artifact)/,
      );
      assert.doesNotMatch(readFileSync(history, "utf8"), /\tdry_run\t/);
      assert.doesNotMatch(result.stdout, /All selected targets already have requested/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC artifact identities do not collide across similar canonical URLs", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const artifactDir = path.join(root, "artifacts");
  const first = "https://venturedex.co/startups/alpha-beta";
  const second = "https://venturedex.co/startups/alpha--beta";
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    path.join(
      artifactDir,
      `20260102-000000-post_request_target_unverified-${gscArtifactTargetKeyForTest(first)}.txt`,
    ),
    `status: post_request_target_unverified\nurl: ${first}\n`,
  );
  writeFileSync(
    path.join(
      artifactDir,
      "20260101-000000-post_request_confirmation_unknown-venturedex-co-startups-alpha-beta.txt",
    ),
    `status: post_request_confirmation_unknown\nurl: ${first}\n`,
  );
  writeFileSync(history, historyHeader);

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--dry-run",
        "--url",
        second,
        "--skip-live-check",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          HISTORY_FILE: history,
          GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
          GSC_ARTIFACT_DIR: artifactDir,
        },
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(history, "utf8"), new RegExp(`\\tdry_run\\t${second}\\t`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC artifact scan errors and broken symlinks block before ledger mutation", () => {
  for (const failureMode of ["invalid_utf8", "broken_directory_symlink", "broken_file_symlink"]) {
    const root = createGscFixture();
    const history = path.join(root, "history.tsv");
    const artifactDir = path.join(root, "artifacts");
    const target = "https://venturedex.co/startups/alpha";
    writeFileSync(history, historyHeader);

    if (failureMode === "invalid_utf8") {
      mkdirSync(artifactDir, { recursive: true });
      const other = "https://venturedex.co/startups/beta";
      writeFileSync(
        path.join(
          artifactDir,
          `20260102-000000-post_request_target_unverified-${gscArtifactTargetKeyForTest(other)}.txt`,
        ),
        Buffer.from([0xff, 0xfe, 0xfd]),
      );
    } else if (failureMode === "broken_directory_symlink") {
      symlinkSync(path.join(root, "missing-artifact-target"), artifactDir);
    } else {
      mkdirSync(artifactDir, { recursive: true });
      symlinkSync(
        path.join(root, "missing-artifact-file"),
        path.join(
          artifactDir,
          `20260102-000000-post_request_target_unverified-${gscArtifactTargetKeyForTest(target)}.txt`,
        ),
      );
    }

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
            GSC_ARTIFACT_DIR: artifactDir,
          },
          encoding: "utf8",
        },
      );

      assert.notEqual(result.status, 0, failureMode);
      assert.match(
        `${result.stdout}\n${result.stderr}`,
        /artifacts could not be checked safely|artifact path is not a directory|unresolved GSC reconciliation artifact/,
        failureMode,
      );
      assert.equal(readFileSync(history, "utf8"), historyHeader, failureMode);
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
    assert.equal(gscClickCount(mock), 1);
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
    const clicksBeforeRetry = gscClickCount(mock);
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
    const clicksAfterRetry = gscClickCount(mock);
    assert.equal(clicksAfterRetry, clicksBeforeRetry);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC TERM after the browser click leaves a blocking durable intent and prevents a duplicate click", async () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const target = "https://venturedex.co/startups/alpha";
  writeFileSync(history, historyHeader);

  const env = {
    ...process.env,
    HISTORY_FILE: history,
    GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
    GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
    BB_BROWSER_CMD: mock.browser,
    COMET_APP: mock.comet,
    MOCK_BROWSER_LOG: mock.log,
    MOCK_TARGET_MODE: "success",
    MOCK_TARGET_URL: target,
    NAV_WAIT_SECONDS: "0",
    INSPECT_WAIT_SECONDS: "0",
    POST_CLICK_WAIT_SECONDS: "1",
    POST_MODAL_WAIT_SECONDS: "0",
    REQUEST_RESULT_WAIT_SECONDS: "0",
  };
  const args = [
    path.join(root, "scripts", "submit-gsc-direct.sh"),
    "--url",
    target,
    "--expect-url",
    target,
    "--skip-live-check",
  ];
  const child = spawn("bash", args, {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const outcomePromise = captureChild(child);

  try {
    await waitForPath(mock.clickCounter);
    assert.equal(gscClickCount(mock), 1);
    assert.match(readFileSync(history, "utf8"), /\trequest_click_pending\t/);
    child.kill("SIGTERM");
    const outcome = await outcomePromise;
    assert.equal(outcome.code, 143, outcome.stderr);
    assert.doesNotMatch(readFileSync(history, "utf8"), /\trequested\t/);

    const automaticRetry = spawnSync("bash", args, {
      cwd: root,
      env: {
        ...env,
        POST_CLICK_WAIT_SECONDS: "0",
      },
      encoding: "utf8",
    });
    assert.notEqual(automaticRetry.status, 0);
    assert.match(
      `${automaticRetry.stdout}\n${automaticRetry.stderr}`,
      /unresolved GSC reconciliation state/,
    );
    assert.equal(gscClickCount(mock), 1);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await outcomePromise;
    }
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
    assert.equal(gscClickCount(mock), 0);

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
    assert.equal(gscClickCount(mock), 1);
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

test("GSC freezes the canonical ledger authority before a parent symlink is switched", async () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const firstAuthority = path.join(root, "authority-a");
  const secondAuthority = path.join(root, "authority-b");
  const authorityAlias = path.join(root, "current-authority");
  const firstHistory = path.join(firstAuthority, "history.tsv");
  const secondHistory = path.join(secondAuthority, "history.tsv");
  const heldMarker = path.join(root, "symlink-lock-held");
  const releaseMarker = path.join(root, "symlink-release-lock");
  const target = "https://venturedex.co/startups/alpha";
  mkdirSync(firstAuthority);
  mkdirSync(secondAuthority);
  writeFileSync(firstHistory, historyHeader);
  writeFileSync(secondHistory, historyHeader);
  symlinkSync(firstAuthority, authorityAlias, "dir");

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
        HISTORY_FILE: path.join(authorityAlias, "history.tsv"),
        GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
        GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
        BB_BROWSER_CMD: mock.browser,
        COMET_APP: mock.comet,
        MOCK_BROWSER_LOG: mock.log,
        MOCK_TARGET_COUNTER: mock.counter,
        MOCK_TARGET_MODE: "success",
        MOCK_TARGET_URL: target,
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
    rmSync(authorityAlias);
    symlinkSync(secondAuthority, authorityAlias, "dir");
    writeFileSync(releaseMarker, "release\n");
    const outcome = await outcomePromise;
    assert.equal(outcome.code, 0, outcome.stderr);
    assert.match(readFileSync(firstHistory, "utf8"), /\trequested\t/);
    assert.equal(readFileSync(secondHistory, "utf8"), historyHeader);
    assert.equal(gscClickCount(mock), 1);
  } finally {
    writeFileSync(releaseMarker, "release\n");
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await outcomePromise;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC rejects a hard-link ledger alias created while another authority lock is held", async () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const alias = path.join(root, "history-alias.tsv");
  const heldMarker = path.join(root, "hardlink-lock-held");
  const releaseMarker = path.join(root, "hardlink-release-lock");
  const target = "https://venturedex.co/startups/alpha";
  writeFileSync(history, historyHeader);

  const sharedEnv = {
    ...process.env,
    GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
    GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
    BB_BROWSER_CMD: mock.browser,
    COMET_APP: mock.comet,
    MOCK_BROWSER_LOG: mock.log,
    MOCK_TARGET_COUNTER: mock.counter,
    MOCK_TARGET_MODE: "success",
    MOCK_TARGET_URL: target,
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
    env: {
      ...sharedEnv,
      HISTORY_FILE: history,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const firstOutcomePromise = captureChild(first);

  try {
    await waitForPath(heldMarker);
    linkSync(history, alias);
    const contender = spawnSync(
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
          HISTORY_FILE: alias,
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(contender.status, 0);
    assert.match(
      `${contender.stdout}\n${contender.stderr}`,
      /hard-link aliases/,
    );
    assert.equal(readFileSync(history, "utf8"), historyHeader);

    writeFileSync(releaseMarker, "release\n");
    const firstOutcome = await firstOutcomePromise;
    assert.notEqual(firstOutcome.code, 0);
    assert.match(firstOutcome.stderr, /hard-link aliases/);
    assert.equal(readFileSync(history, "utf8"), historyHeader);
    assert.equal(gscClickCount(mock), 0);
  } finally {
    writeFileSync(releaseMarker, "release\n");
    if (first.exitCode === null && first.signalCode === null) {
      first.kill("SIGTERM");
      await firstOutcomePromise;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC operational status readers reject an atomic ledger replacement after identity freeze", async () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const replacement = path.join(root, "replacement.tsv");
  const bin = path.join(root, "bin");
  const heldMarker = path.join(root, "reader-held");
  const releaseMarker = path.join(root, "reader-release");
  const target = "https://venturedex.co/startups/alpha";
  mkdirSync(bin);
  writeFileSync(history, historyHeader);
  writeFileSync(
    replacement,
    `${historyHeader}2026-07-26 16:00:00\trequested\t${target}\treplacement row\n`,
  );
  writeExecutable(
    path.join(bin, "python3"),
    `#!/bin/sh
if [ "$4" = "$MOCK_PYTHON_HOLD_TARGET" ] && [ ! -e "$MOCK_PYTHON_HELD_MARKER" ]; then
  : > "$MOCK_PYTHON_HELD_MARKER"
  while [ ! -e "$MOCK_PYTHON_RELEASE_MARKER" ]; do
    sleep 0.05
  done
fi
exec "${realPython3}" "$@"
`,
  );

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
        PATH: `${bin}:${process.env.PATH}`,
        HISTORY_FILE: history,
        GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
        GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
        BB_BROWSER_CMD: mock.browser,
        COMET_APP: mock.comet,
        MOCK_BROWSER_LOG: mock.log,
        MOCK_TARGET_MODE: "success",
        MOCK_TARGET_URL: target,
        MOCK_PYTHON_HOLD_TARGET: target,
        MOCK_PYTHON_HELD_MARKER: heldMarker,
        MOCK_PYTHON_RELEASE_MARKER: releaseMarker,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const outcomePromise = captureChild(child);

  try {
    await waitForPath(heldMarker);
    renameSync(replacement, history);
    writeFileSync(releaseMarker, "release\n");
    const outcome = await outcomePromise;
    assert.notEqual(outcome.code, 0);
    assert.match(
      `${outcome.stdout}\n${outcome.stderr}`,
      /ledger identity changed|ledger path changed|could not be checked safely/i,
    );
    assert.equal(gscClickCount(mock), 0);
    assert.doesNotMatch(outcome.stdout, /All selected targets already have requested/);
  } finally {
    writeFileSync(releaseMarker, "release\n");
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await outcomePromise;
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
    assert.equal(gscClickCount(mock), 0);
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

test("GSC migration refuses a hard-link alias introduced after the central lock", async () => {
  const root = createGscFixture();
  const codexHome = path.join(root, "codex");
  const legacy = path.join(root, "legacy.tsv");
  const central = path.join(
    codexHome,
    "automations",
    "venturedex-daily-curator",
    "gsc_submission_history.tsv",
  );
  const alias = path.join(root, "central-alias.tsv");
  const bin = path.join(root, "bin");
  const heldMarker = path.join(root, "migration-held");
  const releaseMarker = path.join(root, "migration-release");
  mkdirSync(path.dirname(central), { recursive: true });
  mkdirSync(bin);
  const originalCentral =
    `${historyHeader}2026-01-02 00:00:00\trequested\thttps://venturedex.co/startups/beta\trequested\n`;
  writeFileSync(central, originalCentral);
  writeFileSync(
    legacy,
    `${historyHeader}2026-01-01 00:00:00\tretry_pending\thttps://venturedex.co/startups/alpha\tfailed\n`,
  );
  writeExecutable(
    path.join(bin, "python3"),
    `#!/bin/sh
if [ "$3" = "$MOCK_MIGRATION_LEGACY" ] && [ ! -e "$MOCK_PYTHON_HELD_MARKER" ]; then
  : > "$MOCK_PYTHON_HELD_MARKER"
  while [ ! -e "$MOCK_PYTHON_RELEASE_MARKER" ]; do
    sleep 0.05
  done
fi
exec "${realPython3}" "$@"
`,
  );

  const child = spawn(
    "bash",
    [path.join(root, "scripts", "submit-gsc-direct.sh"), "--migrate-legacy-history"],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        CODEX_HOME: codexHome,
        GSC_LEGACY_HISTORY_FILE: legacy,
        MOCK_MIGRATION_LEGACY: legacy,
        MOCK_PYTHON_HELD_MARKER: heldMarker,
        MOCK_PYTHON_RELEASE_MARKER: releaseMarker,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const outcomePromise = captureChild(child);

  try {
    await waitForPath(heldMarker);
    linkSync(central, alias);
    writeFileSync(releaseMarker, "release\n");
    const outcome = await outcomePromise;
    assert.notEqual(outcome.code, 0);
    assert.match(
      `${outcome.stdout}\n${outcome.stderr}`,
      /hard-link aliases|identity changed before migration/,
    );
    assert.equal(readFileSync(central, "utf8"), originalCentral);
    assert.equal(readFileSync(alias, "utf8"), originalCentral);
    assert.doesNotMatch(readFileSync(central, "utf8"), /startups\/alpha/);
  } finally {
    writeFileSync(releaseMarker, "release\n");
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await outcomePromise;
    }
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
    {
      label: "quoted embedded tab",
      row: "2026-01-01 00:00:00\trequested\thttps://venturedex.co/startups/alpha\t\"message\twith tab\"",
      error: /expected 4 columns; found 5/,
    },
    {
      label: "status outer whitespace",
      row: "2026-01-01 00:00:00\t requested \thttps://venturedex.co/startups/alpha\tmessage",
      error: /cannot have outer whitespace/,
    },
    {
      label: "noncanonical trailing slash",
      row: "2026-01-01 00:00:00\trequested\thttps://venturedex.co/startups/alpha/\tmessage",
      error: /canonical VentureDex detail URL/,
    },
    {
      label: "unknown status",
      row: "2026-01-01 00:00:00\trequsted\thttps://venturedex.co/startups/alpha\tmessage",
      error: /unknown status/,
    },
    {
      label: "obsolete already_requested status",
      row: "2026-01-01 00:00:00\talready_requested\thttps://venturedex.co/startups/alpha\tmessage",
      error: /unknown status/,
    },
    {
      label: "invalid timestamp grammar",
      row: "not-a-timestamp\trequested\thttps://venturedex.co/startups/alpha\tmessage",
      error: /timestamp must use YYYY-MM-DD HH:MM:SS/,
    },
    {
      label: "Unicode line separator",
      row: "2026-01-01 00:00:00\trequested\thttps://venturedex.co/startups/alpha\tmessage\u2028continuation",
      error: /line separator/,
    },
    {
      label: "bare CR",
      row: "2026-01-01 00:00:00\trequested\thttps://venturedex.co/startups/alpha\tmessage\rcontinuation",
      error: /line separator/,
    },
    {
      label: "U+001F control separator",
      row: "2026-01-01 00:00:00\trequested\thttps://venturedex.co/startups/alpha\tmessage\u001fcontinuation",
      error: /line separator/,
    },
    {
      label: "U+FEFF control separator",
      row: "2026-01-01 00:00:00\trequested\thttps://venturedex.co/startups/alpha\tmessage\ufeffcontinuation",
      error: /line separator/,
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
