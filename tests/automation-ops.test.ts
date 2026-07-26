import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
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
  statSync,
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
  return realpathSync(mkdtempSync(path.join(os.tmpdir(), prefix)));
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
    `GSC_ARTIFACT_DIR="\${GSC_ARTIFACT_DIR:-${path.join(realpathSync(root), "artifacts")}}"`;
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
  cpSync(
    path.join(repoRoot, "scripts", "gsc-reconciliation.py"),
    path.join(root, "scripts", "gsc-reconciliation.py"),
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
MOCK_CONCURRENT_ROW_MARKER="\${MOCK_CONCURRENT_ROW_MARKER:-${path.join(root, "concurrent-row-once")}}"
append_concurrent_row() {
  status="$1"
  message="$2"
  if [ ! -e "$MOCK_CONCURRENT_ROW_MARKER" ]; then
    : > "$MOCK_CONCURRENT_ROW_MARKER"
    printf '2026-07-26 23:59:59\\t%s\\t%s\\t%s\\n' \
      "$status" \
      "$MOCK_TARGET_URL" \
      "$message" \
      >> "$HISTORY_FILE"
  fi
}
append_blocker_and_replay_latest() {
  blocker_status="$1"
  blocker_message="$2"
  if [ ! -e "$MOCK_CONCURRENT_ROW_MARKER" ]; then
    : > "$MOCK_CONCURRENT_ROW_MARKER"
    latest_row=$(awk -F '\\t' -v target="$MOCK_TARGET_URL" '
      $3 == target && $2 != "dry_run" { latest = $0 }
      END { print latest }
    ' "$HISTORY_FILE")
    if [ -z "$latest_row" ]; then
      echo "missing replay row" >&2
      exit 97
    fi
    printf '2026-07-26 23:59:58\\t%s\\t%s\\t%s\\n' \
      "$blocker_status" \
      "$MOCK_TARGET_URL" \
      "$blocker_message" \
      >> "$HISTORY_FILE"
    printf '%s\\n' "$latest_row" >> "$HISTORY_FILE"
  fi
}
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
      *VENTUREDEX_CALL:inspection_entry_surface*)
        if [ "$MOCK_SURFACE_MODE" = "auth_redirect" ]; then
          echo "gsc_auth_session_blocker|||https://accounts.google.com/v3/signin/identifier"
        elif [ "$MOCK_SURFACE_MODE" = "entry_transport_failure" ]; then
          echo "inspection_entry_surface_ready"
          echo "mock entry transport failure" >&2
          exit 72
        elif [ "$MOCK_SURFACE_MODE" = "overview_wrong_property" ]; then
          echo "gsc_inspection_surface_blocker|||https://search.google.com/search-console"
        elif [ "$MOCK_SURFACE_MODE" = "wrong_property" ]; then
          echo "gsc_inspection_surface_blocker|||https://search.google.com/search-console/inspect"
        else
          echo "inspection_entry_surface_ready"
        fi
        ;;
      *VENTUREDEX_CALL:inspect_target*)
        count=0
        if [ -f "$MOCK_TARGET_COUNTER" ]; then count=$(cat "$MOCK_TARGET_COUNTER"); fi
        count=$((count + 1))
        printf '%s\\n' "$count" > "$MOCK_TARGET_COUNTER"
        if [ "$MOCK_SURFACE_MODE" = "auth_after_input" ]; then
          echo "gsc_auth_session_blocker|||https://accounts.google.com/v3/signin/identifier"
        elif [ "$MOCK_SURFACE_MODE" = "overview_stuck_after_input" ]; then
          echo "gsc_inspection_surface_blocker|||https://search.google.com/search-console"
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
        elif [ "$MOCK_TARGET_MODE" = "duplicate_route_id" ]; then
          echo "inspection_route_id_ambiguous"
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
        if [ "$MOCK_TARGET_MODE" = "concurrent_blocker_before_intent" ]; then
          append_concurrent_row \
            "reconciliation_archive_pending" \
            "concurrent blocker inserted after frozen capture"
          echo "submitted"
        elif [ "$MOCK_TARGET_MODE" = "concurrent_retry_aba_before_intent" ]; then
          append_blocker_and_replay_latest \
            "reconciliation_archive_pending" \
            "concurrent blocker inserted before exact retry replay"
          echo "submitted"
        elif [ "$MOCK_TARGET_MODE" = "concurrent_artifact_before_intent" ]; then
          mkdir -p "$GSC_ARTIFACT_DIR"
          mv "$MOCK_STAGED_ARTIFACT" \
            "$GSC_ARTIFACT_DIR/$(basename "$MOCK_STAGED_ARTIFACT")"
          echo "submitted"
        elif [ "$MOCK_TARGET_MODE" = "artifact_authority_swap_before_intent" ] ||
             [ "$MOCK_TARGET_MODE" = "artifact_authority_swap_requested_conflict" ]; then
          mv "$MOCK_STAGED_ARTIFACT" \
            "$GSC_ARTIFACT_DIR/$(basename "$MOCK_STAGED_ARTIFACT")"
          mv "$GSC_ARTIFACT_DIR" "$MOCK_HIDDEN_ARTIFACT_DIR"
          mkdir "$GSC_ARTIFACT_DIR"
          echo "submitted"
        elif [ "$MOCK_SURFACE_MODE" = "atomic_redirect" ]; then
          echo "gsc_auth_session_blocker|||https://accounts.google.com/v3/signin/identifier"
        elif [ "$MOCK_INPUT_MODE" = "transport_failure" ]; then
          echo "submitted"
          echo "mock input transport failure" >&2
          exit 73
        else
          echo "submitted"
        fi
        ;;
      *VENTUREDEX_CALL:dismiss_success_dialog*)
        if [ "$MOCK_DIALOG_MODE" = "transport_failure" ]; then
          echo "success_dialog_dismissed"
          exit 74
        elif [ "$MOCK_DIALOG_MODE" = "ambiguous_ack" ]; then
          echo "success_dialog_ack_ambiguous"
        elif [ "$MOCK_DIALOG_MODE" = "absent" ]; then
          echo "success_dialog_absent"
        else
          echo "success_dialog_dismissed"
        fi
        ;;
      *VENTUREDEX_CALL:success_dialog_state*)
        if [ "$MOCK_DIALOG_MODE" = "persists" ]; then
          echo "success_dialog_visible"
        elif [ "$MOCK_DIALOG_MODE" = "verify_transport_failure" ]; then
          exit 75
        else
          echo "success_dialog_absent"
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
        if [ "$MOCK_TARGET_MODE" = "concurrent_requested_then_ambiguous" ]; then
          append_concurrent_row \
            "requested" \
            "concurrent requested inserted after exact intent"
          echo "request_button_ambiguous"
        elif [ "$MOCK_TARGET_MODE" = "concurrent_retry_after_click" ]; then
          clicks=0
          if [ -f "$MOCK_CLICK_COUNTER" ]; then clicks=$(cat "$MOCK_CLICK_COUNTER"); fi
          clicks=$((clicks + 1))
          printf '%s\\n' "$clicks" > "$MOCK_CLICK_COUNTER"
          append_concurrent_row \
            "retry_pending" \
            "concurrent retry inserted after browser click"
          echo "clicked"
        elif [ "$MOCK_TARGET_MODE" = "concurrent_old_intent_after_click" ]; then
          clicks=0
          if [ -f "$MOCK_CLICK_COUNTER" ]; then clicks=$(cat "$MOCK_CLICK_COUNTER"); fi
          clicks=$((clicks + 1))
          printf '%s\\n' "$clicks" > "$MOCK_CLICK_COUNTER"
          append_concurrent_row \
            "request_click_pending" \
            "request click intent persisted before browser action; completion unresolved until a terminal ledger row is recorded"
          echo "clicked"
        elif [ "$MOCK_TARGET_MODE" = "concurrent_intent_aba_after_click" ]; then
          clicks=0
          if [ -f "$MOCK_CLICK_COUNTER" ]; then clicks=$(cat "$MOCK_CLICK_COUNTER"); fi
          clicks=$((clicks + 1))
          printf '%s\\n' "$clicks" > "$MOCK_CLICK_COUNTER"
          append_blocker_and_replay_latest \
            "post_request_confirmation_unknown" \
            "concurrent blocker inserted before exact intent replay"
          echo "clicked"
        elif [ "$MOCK_SURFACE_MODE" = "auth_before_click" ]; then
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
        if [ "$MOCK_TARGET_MODE" = "concurrent_blocker_after_click" ] &&
           [ "$state_count" -ge 2 ]; then
          append_concurrent_row \
            "post_request_confirmation_unknown" \
            "concurrent blocker inserted after browser click"
          echo "success"
        elif [ "$MOCK_TARGET_MODE" = "preexisting_failed_retry" ]; then
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
             [ "$MOCK_TARGET_MODE" = "artifact_authority_swap_requested_conflict" ] ||
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

function writePreClickReconciliationArtifact(
  artifactDir: string,
  url: string,
): string {
  mkdirSync(artifactDir, { recursive: true });
  const artifact = path.join(
    artifactDir,
    `20260726-174233-pre_request_success_unverified-${gscArtifactTargetKeyForTest(url)}.txt`,
  );
  writeFileSync(
    artifact,
    [
      "timestamp: 2026-07-26 17:42:33",
      "status: pre_request_success_unverified",
      `url: ${url}`,
      "message: pre-existing terminal state was unbound; no request click occurred",
      "page_state: success",
      "",
      "--- page text ---",
      url,
      "URL is not on Google",
      "REQUEST INDEXING",
      "",
    ].join("\n"),
  );
  return artifact;
}

function runPreClickReconciliation(
  root: string,
  history: string,
  artifactDir: string,
  artifact: string,
  env: NodeJS.ProcessEnv = {},
) {
  return spawnSync(
    "bash",
    [
      path.join(root, "scripts", "submit-gsc-direct.sh"),
      "--reconcile-pre-click-retry",
      artifact,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        HISTORY_FILE: history,
        GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
        GSC_ARTIFACT_DIR: artifactDir,
        ...env,
      },
      encoding: "utf8",
    },
  );
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

test("GSC durable append rechecks the terminal LF after validation", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const bin = path.join(root, "bin");
  const mutationMarker = path.join(root, "ledger-mutated");
  const target = "https://venturedex.co/startups/alpha";
  mkdirSync(bin);
  writeFileSync(history, historyHeader);
  writeExecutable(
    path.join(bin, "python3"),
    `#!/bin/sh
if [ "$4" = "dry_run" ] && [ ! -e "$MOCK_MUTATION_MARKER" ]; then
  : > "$MOCK_MUTATION_MARKER"
  "$MOCK_REAL_PYTHON" -c 'import os, sys
fd = os.open(sys.argv[1], os.O_RDWR)
try:
    os.ftruncate(fd, os.fstat(fd).st_size - 1)
finally:
    os.close(fd)' "$2"
fi
exec "$MOCK_REAL_PYTHON" "$@"
`,
  );

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--dry-run",
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
          MOCK_MUTATION_MARKER: mutationMarker,
          MOCK_REAL_PYTHON: realPython3,
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /ledger must end with a terminal LF/,
    );
    assert.equal(readFileSync(history, "utf8"), historyHeader.slice(0, -1));
    assert.ok(existsSync(mutationMarker));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC dry-run append rejects a valid same-size in-place ledger rewrite", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const bin = path.join(root, "bin");
  const mutationMarker = path.join(root, "ledger-rewritten");
  const target = "https://venturedex.co/startups/beta";
  mkdirSync(bin);
  writeFileSync(
    history,
    historyHeader +
      "2026-07-26 17:42:34\tretry_pending\thttps://venturedex.co/startups/alpha\tordinary retry\n",
  );
  const originalInode = statSync(history).ino;
  writeExecutable(
    path.join(bin, "python3"),
    `#!/bin/sh
if [ "$4" = "dry_run" ] && [ ! -e "$MOCK_MUTATION_MARKER" ]; then
  : > "$MOCK_MUTATION_MARKER"
  "$MOCK_REAL_PYTHON" -c 'import os, sys
path = sys.argv[1]
fd = os.open(path, os.O_RDWR)
try:
    payload = os.read(fd, os.fstat(fd).st_size)
    old = b"/startups/alpha"
    new = b"/startups/gamma"
    offset = payload.index(old)
    os.lseek(fd, offset, os.SEEK_SET)
    if os.write(fd, new) != len(new):
        raise OSError("partial same-size rewrite")
    os.fsync(fd)
finally:
    os.close(fd)' "$2"
fi
exec "$MOCK_REAL_PYTHON" "$@"
`,
  );

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--dry-run",
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
          MOCK_MUTATION_MARKER: mutationMarker,
          MOCK_REAL_PYTHON: realPython3,
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /ledger no longer matches its frozen append snapshot/,
    );
    assert.equal(statSync(history).ino, originalInode);
    const ledger = readFileSync(history, "utf8");
    assert.match(ledger, /startups\/gamma/);
    assert.doesNotMatch(ledger, /\tdry_run\t/);
    assert.ok(existsSync(mutationMarker));
  } finally {
    rmSync(root, { recursive: true, force: true });
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
    "duplicate_route_id",
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

test("GSC records a confirmed request before stopping on unsafe success-dialog cleanup", () => {
  for (const dialogMode of [
    "ambiguous_ack",
    "persists",
    "transport_failure",
    "verify_transport_failure",
  ]) {
    const root = createGscFixture();
    const mock = createGscBrowserMock(root);
    const history = path.join(root, "history.tsv");
    const first = "https://venturedex.co/startups/alpha";
    const second = "https://venturedex.co/startups/beta";
    writeFileSync(history, historyHeader);

    try {
      const result = spawnSync(
        "bash",
        [
          path.join(root, "scripts", "submit-gsc-direct.sh"),
          "--url",
          first,
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
            GSC_ARTIFACT_DIR: path.join(root, "artifacts"),
            BB_BROWSER_CMD: mock.browser,
            COMET_APP: mock.comet,
            MOCK_BROWSER_LOG: mock.log,
            MOCK_DIALOG_MODE: dialogMode,
            MOCK_TARGET_MODE: "exact",
            MOCK_TARGET_URL: first,
            NAV_WAIT_SECONDS: "0",
            INSPECT_WAIT_SECONDS: "0",
            POST_CLICK_WAIT_SECONDS: "0",
            POST_MODAL_WAIT_SECONDS: "0",
            REQUEST_RESULT_WAIT_SECONDS: "0",
          },
          encoding: "utf8",
        },
      );

      assert.notEqual(result.status, 0, dialogMode);
      assert.equal(gscClickCount(mock), 1, dialogMode);
      const ledger = readFileSync(history, "utf8");
      assert.match(
        ledger,
        new RegExp(
          `\\trequested\\t${first}\\tindexing requested; batch stopped`,
        ),
        dialogMode,
      );
      assert.match(
        ledger,
        new RegExp(
          `\\tretry_pending\\t${second}\\tbatch stopped after a confirmed indexing request`,
        ),
        dialogMode,
      );
      assert.doesNotMatch(
        ledger,
        new RegExp(
          `\\t(?:pre_request_success_unverified|post_request_confirmation_unknown)\\t${first}\\t`,
        ),
        dialogMode,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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

test("GSC accepts the exact VentureDex Overview only as an inspection entry surface", () => {
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
          MOCK_SURFACE_MODE: "overview",
          MOCK_TARGET_MODE: "success",
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

    assert.equal(result.status, 0, result.stderr);
    assert.equal(gscClickCount(mock), 1);
    assert.match(readFileSync(history, "utf8"), /\trequested\t/);
    const browserLog = readFileSync(mock.log, "utf8");
    assert.match(browserLog, /inspectionEntrySurface\(\)/);
    assert.match(browserLog, /submitInspectionInput\(/);
    assert.match(browserLog, /inspectTarget\(/);
    assert.match(browserLog, /clickTarget\(/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC never treats Overview itself as a route-bound inspection result", () => {
  const scenarios = [
    {
      mode: "overview_wrong_property",
      expected: /gsc_inspection_surface_blocker: observed https:\/\/search\.google\.com\/search-console/,
      submitted: false,
    },
    {
      mode: "overview_stuck_after_input",
      expected:
        /gsc_inspection_surface_blocker: observed https:\/\/search\.google\.com\/search-console; inspection surface changed before any request click/,
      submitted: true,
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
            MOCK_SURFACE_MODE: scenario.mode,
            MOCK_TARGET_MODE: "success",
            MOCK_TARGET_URL: target,
            NAV_WAIT_SECONDS: "0",
            INSPECT_WAIT_SECONDS: "0",
            POST_CLICK_WAIT_SECONDS: "0",
            POST_MODAL_WAIT_SECONDS: "0",
          },
          encoding: "utf8",
        },
      );

      assert.notEqual(result.status, 0, scenario.mode);
      assert.equal(gscClickCount(mock), 0, scenario.mode);
      assert.doesNotMatch(readFileSync(history, "utf8"), /\trequested\t/, scenario.mode);
      assert.match(
        `${result.stdout}\n${result.stderr}\n${readFileSync(history, "utf8")}`,
        scenario.expected,
        scenario.mode,
      );
      assert.equal(existsSync(mock.submitCounter), scenario.submitted);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC entry and input transport failures cannot spoof ready markers", () => {
  const scenarios = [
    {
      surfaceMode: "entry_transport_failure",
      inputMode: "",
      expected: /inspection surface preflight failed/,
    },
    {
      surfaceMode: "overview",
      inputMode: "transport_failure",
      expected: /inspection input transport failed/,
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
            MOCK_SURFACE_MODE: scenario.surfaceMode,
            MOCK_INPUT_MODE: scenario.inputMode,
            MOCK_TARGET_MODE: "success",
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
      assert.doesNotMatch(readFileSync(history, "utf8"), /\trequested\t/);
      assert.match(`${result.stdout}\n${result.stderr}`, scenario.expected);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
    assert.deepEqual(
      readdirSync(artifactDir),
      [],
      "the frozen artifact authority should exist but remain empty",
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
      assert.deepEqual(
        readdirSync(artifactDir),
        [],
        `${surfaceMode}: the frozen artifact authority should remain empty`,
      );
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

test("GSC artifact scan errors and broken symlinks fail closed with durable authority when available", () => {
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
        /artifacts could not be checked safely|Could not establish GSC artifact directory|Could not normalize the GSC artifact authority|artifact authority must be a real, non-symlink directory|unresolved GSC reconciliation artifact/,
        failureMode,
      );
      const ledger = readFileSync(history, "utf8");
      if (failureMode === "broken_directory_symlink") {
        assert.equal(ledger, historyHeader, failureMode);
      } else {
        assert.match(
          ledger,
          new RegExp(`\\treconciliation_archive_pending\\t${target}\\t`),
          failureMode,
        );
        assert.doesNotMatch(ledger, /\tdry_run\t/, failureMode);
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
        "2099-12-31 23:59:59\tretry_pending\thttps://venturedex.co/startups/beta\tfuture-dated legacy retry",
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
    assert.match(result.stdout, /imported 2 unique legacy rows/);
    const merged = readFileSync(central, "utf8");
    assert.equal((merged.match(/startups\/beta/g) ?? []).length, 2);
    assert.match(merged, /startups\/alpha/);
    assert.ok(merged.indexOf("startups/alpha") < merged.indexOf("startups/beta"));
    const betaRows = merged
      .trimEnd()
      .split("\n")
      .slice(1)
      .map((row) => row.split("\t"))
      .filter((row) => row[2] === "https://venturedex.co/startups/beta");
    assert.equal(
      betaRows.at(-1)?.[1],
      "requested",
      "future-dated legacy retry must never override existing central authority",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC migration refuses a central append between read and replace", () => {
  const root = createGscFixture();
  const codexHome = path.join(root, "codex");
  const legacy = path.join(root, "legacy.tsv");
  const hookDir = path.join(root, "python-hook");
  const central = path.join(
    codexHome,
    "automations",
    "venturedex-daily-curator",
    "gsc_submission_history.tsv",
  );
  mkdirSync(path.dirname(central), { recursive: true });
  mkdirSync(hookDir);
  const originalCentral =
    `${historyHeader}2026-01-02 00:00:00\trequested\thttps://venturedex.co/startups/beta\trequested\n`;
  const concurrentRow =
    "2026-01-03 00:00:00\trequested\thttps://venturedex.co/startups/gamma\tconcurrent central append\n";
  writeFileSync(central, originalCentral);
  writeFileSync(
    legacy,
    `${historyHeader}2026-01-01 00:00:00\tretry_pending\thttps://venturedex.co/startups/alpha\tfailed\n`,
  );
  writeFileSync(
    path.join(hookDir, "sitecustomize.py"),
    `import os
import tempfile

_original_mkstemp = tempfile.mkstemp
_injected = False

def _mkstemp(*args, **kwargs):
    global _injected
    if not _injected and kwargs.get("prefix") == ".gsc-history-":
        _injected = True
        fd = os.open(
            os.environ["MOCK_MIGRATION_CENTRAL"],
            os.O_WRONLY | os.O_APPEND | getattr(os, "O_NOFOLLOW", 0),
        )
        try:
            payload = os.environ["MOCK_MIGRATION_CONCURRENT_ROW"].encode("utf-8")
            if os.write(fd, payload) != len(payload):
                raise OSError("partial concurrent central append")
            os.fsync(fd)
        finally:
            os.close(fd)
    return _original_mkstemp(*args, **kwargs)

tempfile.mkstemp = _mkstemp
`,
  );

  try {
    const result = spawnSync(
      "bash",
      [path.join(root, "scripts", "submit-gsc-direct.sh"), "--migrate-legacy-history"],
      {
        cwd: root,
        env: {
          ...process.env,
          PYTHONPATH: hookDir,
          CODEX_HOME: codexHome,
          GSC_LEGACY_HISTORY_FILE: legacy,
          MOCK_MIGRATION_CENTRAL: central,
          MOCK_MIGRATION_CONCURRENT_ROW: concurrentRow,
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /Authoritative GSC ledger changed before migration lock/,
    );
    assert.equal(readFileSync(central, "utf8"), originalCentral + concurrentRow);
    assert.doesNotMatch(readFileSync(central, "utf8"), /startups\/alpha/);
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
    {
      label: "missing terminal LF",
      row: "2026-01-01 00:00:00\trequested\thttps://venturedex.co/startups/alpha\tmessage",
      error: /terminal LF/,
      terminalNewline: false,
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
    writeFileSync(
      legacy,
      historyHeader + invalid.row + (invalid.terminalNewline === false ? "" : "\n"),
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

      assert.notEqual(result.status, 0, invalid.label);
      assert.match(`${result.stdout}\n${result.stderr}`, invalid.error, invalid.label);
      assert.equal(readFileSync(central, "utf8"), originalCentral, invalid.label);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC pre-click reconciliation stays blocked until exact archival and resumes safely", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const target = "https://venturedex.co/startups/alpha";
  const bin = path.join(root, "bin");
  mkdirSync(path.join(root, "artifacts"), { recursive: true });
  mkdirSync(bin);
  const artifactDir = realpathSync(path.join(root, "artifacts"));
  const artifact = writePreClickReconciliationArtifact(artifactDir, target);
  writeFileSync(
    history,
    historyHeader +
      `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tpre-existing terminal state was unbound; no request click occurred\n`,
  );
  writeExecutable(
    path.join(bin, "python3"),
    `#!/bin/sh
if [ "$2" = "archive" ]; then
  echo "injected archive failure" >&2
  exit 88
fi
exec "${realPython3}" "$@"
`,
  );

  const run = (injectArchiveFailure = false) => spawnSync(
    "bash",
    [
      path.join(root, "scripts", "submit-gsc-direct.sh"),
      "--reconcile-pre-click-retry",
      artifact,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: injectArchiveFailure
          ? `${bin}:${process.env.PATH}`
          : process.env.PATH,
        HISTORY_FILE: history,
        GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
        GSC_ARTIFACT_DIR: artifactDir,
      },
      encoding: "utf8",
    },
  );

  try {
    const first = run(true);
    assert.notEqual(first.status, 0);
    assert.match(first.stderr, /reconciliation_archive_pending outcome is durable/);
    assert.ok(existsSync(artifact), "active artifact must remain on archive failure");
    let ledger = readFileSync(history, "utf8");
    assert.equal(
      (
        ledger.match(
          new RegExp(`\\treconciliation_archive_pending\\t${target}\\t`, "g"),
        ) ?? []
      )
        .length,
      1,
    );
    assert.doesNotMatch(ledger, new RegExp(`\\tretry_pending\\t${target}\\t`));

    const second = run();
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.match(second.stdout, /Resuming transaction-bound reconciliation archival/);
    assert.ok(!existsSync(artifact));
    assert.ok(
      existsSync(path.join(artifactDir, "resolved", path.basename(artifact))),
    );
    ledger = readFileSync(history, "utf8");
    assert.equal(
      (ledger.match(new RegExp(`\\tretry_pending\\t${target}\\t`, "g")) ?? [])
        .length,
      1,
      "archive recovery must append one final retry outcome",
    );

    const consumer = spawnSync(
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
    assert.equal(
      consumer.status,
      0,
      `${consumer.stdout}\n${consumer.stderr}`,
    );
    assert.match(consumer.stdout, new RegExp(target));
    assert.match(consumer.stdout, /Dry-run complete; no indexing request was sent/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC reconciliation snapshot token seals initial and archive-final ABA replay", () => {
  for (const phase of ["initial", "final"] as const) {
    const root = createGscFixture();
    const history = path.join(root, "history.tsv");
    const target = "https://venturedex.co/startups/alpha";
    const artifactDirectory = path.join(root, "artifacts");
    const hookDir = path.join(root, "python-hook");
    mkdirSync(artifactDirectory);
    mkdirSync(hookDir);
    const artifactDir = realpathSync(artifactDirectory);
    const artifact = writePreClickReconciliationArtifact(artifactDir, target);
    writeFileSync(
      history,
      historyHeader +
        `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tartifact=${path.basename(artifact)}; pre-existing terminal state was unbound or conflicting; no request click occurred\n`,
    );
    writeFileSync(
      path.join(hookDir, "sitecustomize.py"),
      `import os

_original_open = os.open
_injected = False

def _open(path, flags, *args, **kwargs):
    global _injected
    raw = os.path.abspath(os.fspath(path))
    history = os.environ["MOCK_RECONCILE_ABA_HISTORY"]
    if (
        not _injected
        and raw == history
        and flags & os.O_RDWR
    ):
        with open(history, "rb") as handle:
            rows = [line for line in handle.readlines()[1:] if line.strip()]
        latest = rows[-1]
        fields = latest.rstrip(b"\\n").split(b"\\t", 3)
        status = fields[1].decode("utf-8")
        phase = os.environ["MOCK_RECONCILE_ABA_PHASE"]
        trigger = (
            (phase == "initial" and status == "pre_request_success_unverified")
            or (
                phase == "final"
                and status == "reconciliation_archive_pending"
            )
        )
        if trigger:
            _injected = True
            fd = _original_open(
                history,
                os.O_WRONLY | os.O_APPEND | getattr(os, "O_NOFOLLOW", 0),
            )
            try:
                blocker = (
                    b"2026-07-26 23:59:58\\tpost_request_confirmation_unknown\\t"
                    + fields[2]
                    + b"\\tconcurrent blocker inserted before exact reconciliation replay\\n"
                )
                payload = blocker + latest
                if os.write(fd, payload) != len(payload):
                    raise OSError("partial reconciliation ABA injection")
                os.fsync(fd)
            finally:
                os.close(fd)
    return _original_open(path, flags, *args, **kwargs)

os.open = _open
`,
    );

    const run = () => spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--reconcile-pre-click-retry",
        artifact,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          PYTHONPATH: hookDir,
          HISTORY_FILE: history,
          GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
          GSC_ARTIFACT_DIR: artifactDir,
          MOCK_RECONCILE_ABA_HISTORY: history,
          MOCK_RECONCILE_ABA_PHASE: phase,
        },
        encoding: "utf8",
      },
    );

    try {
      const first = run();
      assert.notEqual(
        first.status,
        0,
        `${phase}\n${first.stdout}\n${first.stderr}`,
      );
      let ledger = readFileSync(history, "utf8");
      assert.doesNotMatch(ledger, /\tretry_pending\t/);
      const targetRows = ledger
        .trimEnd()
        .split("\n")
        .slice(1)
        .map((row) => row.split("\t"))
        .filter((row) => row[2] === target);
      assert.equal(targetRows.at(-1)?.[1], "reconciliation_archive_pending");
      assert.match(
        targetRows.at(-1)?.[3] ?? "",
        /conditional transition interference detected/,
      );
      if (phase === "initial") {
        assert.ok(existsSync(artifact));
        assert.ok(
          !existsSync(path.join(artifactDir, "resolved", path.basename(artifact))),
        );
      } else {
        assert.ok(!existsSync(artifact));
        assert.ok(
          existsSync(path.join(artifactDir, "resolved", path.basename(artifact))),
        );
      }

      const second = run();
      assert.notEqual(second.status, 0, phase);
      ledger = readFileSync(history, "utf8");
      assert.doesNotMatch(ledger, /\tretry_pending\t/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC retry consumer accepts a canonical target key truncated on a hyphen", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const slug = `${"a".repeat(66)}-b`;
  const target = `https://venturedex.co/startups/${slug}`;
  const artifactDirectory = path.join(root, "artifacts");
  mkdirSync(artifactDirectory);
  const artifactDir = realpathSync(artifactDirectory);
  const artifact = writePreClickReconciliationArtifact(artifactDir, target);
  assert.match(path.basename(artifact), /---sha256-[0-9a-f]{12}\.txt$/);
  writeFileSync(
    history,
    historyHeader +
      `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tpre-existing terminal state was unbound; no request click occurred\n`,
  );

  try {
    const reconciled = runPreClickReconciliation(
      root,
      history,
      artifactDir,
      artifact,
    );
    assert.equal(
      reconciled.status,
      0,
      `${reconciled.stdout}\n${reconciled.stderr}`,
    );

    const consumer = spawnSync(
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
    assert.equal(
      consumer.status,
      0,
      `${consumer.stdout}\n${consumer.stderr}`,
    );
    assert.match(consumer.stdout, new RegExp(target));
    assert.match(consumer.stdout, /Dry-run complete; no indexing request was sent/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC reconciliation canonicalizes relative and trailing-slash artifact authorities", () => {
  for (const mode of ["relative", "trailing-slash"]) {
    const root = createGscFixture();
    const history = path.join(root, "history.tsv");
    const target = "https://venturedex.co/startups/alpha";
    const artifactDirectory = path.join(root, "artifacts");
    mkdirSync(artifactDirectory);
    const artifactDir = realpathSync(artifactDirectory);
    const artifact = writePreClickReconciliationArtifact(artifactDir, target);
    const suppliedArtifactDir =
      mode === "relative"
        ? path.relative(root, artifactDir)
        : `${artifactDir}///`;
    writeFileSync(
      history,
      historyHeader +
        `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tpre-existing terminal state was unbound; no request click occurred\n`,
    );

    try {
      const result = spawnSync(
        "bash",
        [
          path.join(root, "scripts", "submit-gsc-direct.sh"),
          "--artifact-dir",
          suppliedArtifactDir,
          "--reconcile-pre-click-retry",
          artifact,
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

      assert.equal(result.status, 0, `${mode}\n${result.stdout}\n${result.stderr}`);
      assert.match(
        result.stdout,
        new RegExp(
          `Archived reconciliation artifact: ${path
            .join(artifactDir, "resolved", path.basename(artifact))
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        ),
        mode,
      );
      assert.ok(!existsSync(artifact), mode);
      assert.ok(
        existsSync(
          path.join(artifactDir, "resolved", path.basename(artifact)),
        ),
        mode,
      );
      const targetRows = readFileSync(history, "utf8")
        .trimEnd()
        .split("\n")
        .slice(1)
        .map((row) => row.split("\t"))
        .filter((row) => row[2] === target);
      assert.equal(targetRows.at(-1)?.[1], "retry_pending", mode);
      assert.equal(
        targetRows.filter(
          (row) => row[1] === "reconciliation_archive_pending",
        ).length,
        1,
        mode,
      );
      assert.equal(
        targetRows.filter((row) => row[1] === "retry_pending").length,
        1,
        mode,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC pre-click reconciliation rejects mixed modes and aliased evidence without mutation", () => {
  for (const mode of ["mixed", "hardlink"]) {
    const root = createGscFixture();
    const history = path.join(root, "history.tsv");
    const target = "https://venturedex.co/startups/alpha";
    mkdirSync(path.join(root, "artifacts"), { recursive: true });
    const artifactDir = realpathSync(path.join(root, "artifacts"));
    const artifact = writePreClickReconciliationArtifact(artifactDir, target);
    writeFileSync(
      history,
      historyHeader +
        `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tpre-existing terminal state was unbound; no request click occurred\n`,
    );
    if (mode === "hardlink") {
      linkSync(artifact, path.join(artifactDir, "artifact-hardlink.txt"));
    }

    try {
      const args = [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--reconcile-pre-click-retry",
        artifact,
      ];
      if (mode === "mixed") {
        args.push("--url", target);
      }
      const result = spawnSync("bash", args, {
        cwd: root,
        env: {
          ...process.env,
          HISTORY_FILE: history,
          GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
          GSC_ARTIFACT_DIR: artifactDir,
        },
        encoding: "utf8",
      });

      assert.notEqual(result.status, 0, mode);
      assert.doesNotMatch(readFileSync(history, "utf8"), /\tretry_pending\t/);
      assert.ok(existsSync(artifact));
      if (mode === "mixed") {
        assert.match(result.stderr, /exclusive, non-browser operation/);
      } else {
        assert.match(result.stderr, /single-link regular file/);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC pre-click reconciliation rejects unrelated retry provenance and substring-only URL evidence", () => {
  for (const mode of ["unrelated-retry", "substring-url"]) {
    const root = createGscFixture();
    const history = path.join(root, "history.tsv");
    const target = "https://venturedex.co/startups/alpha";
    mkdirSync(path.join(root, "artifacts"), { recursive: true });
    const artifactDir = realpathSync(path.join(root, "artifacts"));
    const artifact = writePreClickReconciliationArtifact(artifactDir, target);
    if (mode === "substring-url") {
      const original = readFileSync(artifact, "utf8");
      writeFileSync(
        artifact,
        original.replace(
          `--- page text ---\n${target}\n`,
          `--- page text ---\n${target}-different\n`,
        ),
      );
    }
    const initialLedger =
      historyHeader +
      `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tpre-existing terminal state was unbound; no request click occurred\n` +
      (mode === "unrelated-retry"
        ? `2026-07-26 17:43:34\tretry_pending\t${target}\tbutton not found during an unrelated run\n`
        : "");
    writeFileSync(history, initialLedger);

    try {
      const result = runPreClickReconciliation(
        root,
        history,
        artifactDir,
        artifact,
      );
      assert.notEqual(result.status, 0, mode);
      assert.equal(readFileSync(history, "utf8"), initialLedger, mode);
      assert.ok(existsSync(artifact), mode);
      if (mode === "substring-url") {
        assert.match(result.stderr, /exact route-bound target as a visible URL line/);
      } else {
        assert.match(result.stderr, /latest operational status is retry_pending/);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC reconciliation source disappearance leaves a durable non-retryable transaction", async () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const target = "https://venturedex.co/startups/alpha";
  const artifactDir = realpathSync(
    (() => {
      const directory = path.join(root, "artifacts");
      mkdirSync(directory);
      return directory;
    })(),
  );
  const artifact = writePreClickReconciliationArtifact(artifactDir, target);
  const bin = path.join(root, "bin");
  const held = path.join(root, "archive-held");
  const release = path.join(root, "archive-release");
  mkdirSync(bin);
  writeFileSync(
    history,
    historyHeader +
      `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tpre-existing terminal state was unbound; no request click occurred\n`,
  );
  writeExecutable(
    path.join(bin, "python3"),
    `#!/bin/sh
if [ "$2" = "archive" ]; then
  : > "$MOCK_ARCHIVE_HELD"
  while [ ! -e "$MOCK_ARCHIVE_RELEASE" ]; do sleep 0.05; done
fi
exec "${realPython3}" "$@"
`,
  );
  const child = spawn(
    "bash",
    [
      path.join(root, "scripts", "submit-gsc-direct.sh"),
      "--reconcile-pre-click-retry",
      artifact,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HISTORY_FILE: history,
        GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
        GSC_ARTIFACT_DIR: artifactDir,
        MOCK_ARCHIVE_HELD: held,
        MOCK_ARCHIVE_RELEASE: release,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const outcomePromise = captureChild(child);

  try {
    await waitForPath(held);
    rmSync(artifact);
    writeFileSync(release, "release\n");
    const outcome = await outcomePromise;
    assert.notEqual(outcome.code, 0);
    assert.match(outcome.stderr, /artifact disappeared before archival/);
    const ledger = readFileSync(history, "utf8");
    assert.match(
      ledger,
      new RegExp(`\\treconciliation_archive_pending\\t${target}\\t`),
    );
    assert.doesNotMatch(ledger, new RegExp(`\\tretry_pending\\t${target}\\t`));

    const retry = spawnSync(
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
    assert.equal(retry.status, 0, `${retry.stdout}\n${retry.stderr}`);
    assert.match(retry.stdout, /No unresolved GSC retry_pending targets remain/);
    assert.doesNotMatch(retry.stdout, new RegExp(target));
  } finally {
    writeFileSync(release, "release\n");
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await outcomePromise;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC reconciliation never overwrites a raced archive destination", async () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const target = "https://venturedex.co/startups/alpha";
  const artifactDirectory = path.join(root, "artifacts");
  mkdirSync(artifactDirectory);
  const artifactDir = realpathSync(artifactDirectory);
  const artifact = writePreClickReconciliationArtifact(artifactDir, target);
  const bin = path.join(root, "bin");
  const held = path.join(root, "archive-held");
  const release = path.join(root, "archive-release");
  const resolved = path.join(artifactDir, "resolved");
  const destination = path.join(resolved, path.basename(artifact));
  mkdirSync(bin);
  writeFileSync(
    history,
    historyHeader +
      `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tpre-existing terminal state was unbound; no request click occurred\n`,
  );
  writeExecutable(
    path.join(bin, "python3"),
    `#!/bin/sh
if [ "$2" = "archive" ]; then
  : > "$MOCK_ARCHIVE_HELD"
  while [ ! -e "$MOCK_ARCHIVE_RELEASE" ]; do sleep 0.05; done
fi
exec "${realPython3}" "$@"
`,
  );
  const child = spawn(
    "bash",
    [
      path.join(root, "scripts", "submit-gsc-direct.sh"),
      "--reconcile-pre-click-retry",
      artifact,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HISTORY_FILE: history,
        GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
        GSC_ARTIFACT_DIR: artifactDir,
        MOCK_ARCHIVE_HELD: held,
        MOCK_ARCHIVE_RELEASE: release,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const outcomePromise = captureChild(child);

  try {
    await waitForPath(held);
    assert.ok(
      existsSync(resolved),
      "prepare must freeze the resolved authority before archival",
    );
    writeFileSync(destination, "sentinel archive evidence\n");
    writeFileSync(release, "release\n");
    const outcome = await outcomePromise;
    assert.notEqual(outcome.code, 0);
    assert.match(
      outcome.stderr,
      /archive destination already exists|evidence exists in both active and resolved authorities/,
    );
    assert.equal(readFileSync(destination, "utf8"), "sentinel archive evidence\n");
    assert.ok(existsSync(artifact));
    const ledger = readFileSync(history, "utf8");
    assert.match(ledger, /\treconciliation_archive_pending\t/);
    assert.doesNotMatch(ledger, /\tretry_pending\t/);
  } finally {
    writeFileSync(release, "release\n");
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await outcomePromise;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC reconciliation CAS cannot downgrade a concurrently requested URL", async () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const target = "https://venturedex.co/startups/alpha";
  const artifactDirectory = path.join(root, "artifacts");
  mkdirSync(artifactDirectory);
  const artifactDir = realpathSync(artifactDirectory);
  const artifact = writePreClickReconciliationArtifact(artifactDir, target);
  const bin = path.join(root, "bin");
  const held = path.join(root, "transition-held");
  const release = path.join(root, "transition-release");
  mkdirSync(bin);
  writeFileSync(
    history,
    historyHeader +
      `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tpre-existing terminal state was unbound; no request click occurred\n`,
  );
  writeExecutable(
    path.join(bin, "python3"),
    `#!/bin/sh
if [ "$9" = "reconciliation_archive_pending" ]; then
  : > "$MOCK_TRANSITION_HELD"
  while [ ! -e "$MOCK_TRANSITION_RELEASE" ]; do sleep 0.05; done
fi
exec "${realPython3}" "$@"
`,
  );
  const child = spawn(
    "bash",
    [
      path.join(root, "scripts", "submit-gsc-direct.sh"),
      "--reconcile-pre-click-retry",
      artifact,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HISTORY_FILE: history,
        GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
        GSC_ARTIFACT_DIR: artifactDir,
        MOCK_TRANSITION_HELD: held,
        MOCK_TRANSITION_RELEASE: release,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const outcomePromise = captureChild(child);

  try {
    await waitForPath(held);
    appendFileSync(
      history,
      `2026-07-26 17:43:34\trequested\t${target}\tconcurrent verified request\n`,
    );
    writeFileSync(release, "release\n");
    const outcome = await outcomePromise;
    assert.notEqual(outcome.code, 0);
    const ledger = readFileSync(history, "utf8");
    assert.match(ledger, new RegExp(`\\trequested\\t${target}\\t`));
    assert.doesNotMatch(ledger, /\treconciliation_archive_pending\t|\tretry_pending\t/);
    assert.ok(existsSync(artifact));
  } finally {
    writeFileSync(release, "release\n");
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await outcomePromise;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC reconciliation seals a first-write interleaving with a non-retry blocker", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const target = "https://venturedex.co/startups/alpha";
  const artifactDirectory = path.join(root, "artifacts");
  const pythonPath = path.join(root, "python-path");
  mkdirSync(artifactDirectory);
  mkdirSync(pythonPath);
  const artifactDir = realpathSync(artifactDirectory);
  const artifact = writePreClickReconciliationArtifact(artifactDir, target);
  const artifactDigest = createHash("sha256")
    .update(readFileSync(artifact))
    .digest("hex");
  const resolvedDirectory = path.join(artifactDir, "resolved");
  mkdirSync(resolvedDirectory);
  const artifactStat = statSync(artifact);
  const directoryStat = statSync(artifactDir);
  const resolvedStat = statSync(resolvedDirectory);
  const transactionMessage =
    `artifact=${path.basename(artifact)}; sha256=${artifactDigest}; ` +
    `file_identity=${artifactStat.dev}:${artifactStat.ino}; ` +
    `artifact_dir_identity=${directoryStat.dev}:${directoryStat.ino}; ` +
    `resolved_dir_identity=${resolvedStat.dev}:${resolvedStat.ino}; ` +
    "zero-click reconciliation archive pending";
  writeFileSync(
    history,
    historyHeader +
      `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tpre-existing terminal state was unbound; no request click occurred\n` +
      `2026-07-26 17:43:34\treconciliation_archive_pending\t${target}\t${transactionMessage}\n`,
  );
  writeFileSync(
    path.join(pythonPath, "sitecustomize.py"),
    `import os

_original_write = os.write
_injected = False

def _interleaving_write(fd, payload):
    global _injected
    target = os.environ["MOCK_INTERLEAVE_TARGET"]
    needle = ("\\tretry_pending\\t" + target + "\\t").encode("utf-8")
    if not _injected and needle in bytes(payload):
        _injected = True
        history = os.environ["MOCK_INTERLEAVE_HISTORY"]
        injected = (
            "2026-07-26 17:44:34\\trequested\\t"
            + target
            + "\\tconcurrent verified request inside first os.write\\n"
        ).encode("utf-8")
        other_fd = os.open(
            history,
            os.O_WRONLY
            | os.O_APPEND
            | getattr(os, "O_NONBLOCK", 0)
            | getattr(os, "O_NOFOLLOW", 0),
        )
        try:
            _original_write(other_fd, injected)
            os.fsync(other_fd)
        finally:
            os.close(other_fd)
    return _original_write(fd, payload)

os.write = _interleaving_write
`,
  );

  try {
    const first = runPreClickReconciliation(
      root,
      history,
      artifactDir,
      artifact,
      {
        PYTHONPATH: pythonPath,
        MOCK_INTERLEAVE_HISTORY: history,
        MOCK_INTERLEAVE_TARGET: target,
      },
    );
    assert.notEqual(first.status, 0);
    assert.match(
      `${first.stdout}\n${first.stderr}`,
      /interleaved append|non-retry reconciliation blocker/,
    );
    assert.ok(!existsSync(artifact));
    assert.ok(
      existsSync(path.join(artifactDir, "resolved", path.basename(artifact))),
    );

    const ledgerAfterInterference = readFileSync(history, "utf8");
    const rows = ledgerAfterInterference.trimEnd().split("\n").slice(1);
    const statuses = rows.map((row) => row.split("\t")[1]);
    assert.deepEqual(statuses.slice(-4), [
      "reconciliation_archive_pending",
      "requested",
      "retry_pending",
      "reconciliation_archive_pending",
    ]);
    const latest = rows.at(-1)?.split("\t") ?? [];
    assert.equal(latest[1], "reconciliation_archive_pending");
    assert.match(latest[3] ?? "", /conditional transition interference detected/);

    const second = runPreClickReconciliation(
      root,
      history,
      artifactDir,
      artifact,
    );
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /transaction provenance does not bind/);
    assert.equal(readFileSync(history, "utf8"), ledgerAfterInterference);

    const retry = spawnSync(
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
    assert.equal(retry.status, 0, `${retry.stdout}\n${retry.stderr}`);
    assert.match(retry.stdout, /No unresolved GSC retry_pending targets remain/);
    assert.doesNotMatch(retry.stdout, new RegExp(target));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC reconciliation seals a post-read size race with a non-retry blocker", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const target = "https://venturedex.co/startups/alpha";
  const unrelated = "https://venturedex.co/startups/beta";
  const artifactDirectory = path.join(root, "artifacts");
  const pythonPath = path.join(root, "python-path");
  mkdirSync(artifactDirectory);
  mkdirSync(pythonPath);
  const artifactDir = realpathSync(artifactDirectory);
  const artifact = writePreClickReconciliationArtifact(artifactDir, target);
  const artifactDigest = createHash("sha256")
    .update(readFileSync(artifact))
    .digest("hex");
  const resolvedDirectory = path.join(artifactDir, "resolved");
  mkdirSync(resolvedDirectory);
  const artifactStat = statSync(artifact);
  const directoryStat = statSync(artifactDir);
  const resolvedStat = statSync(resolvedDirectory);
  const transactionMessage =
    `artifact=${path.basename(artifact)}; sha256=${artifactDigest}; ` +
    `file_identity=${artifactStat.dev}:${artifactStat.ino}; ` +
    `artifact_dir_identity=${directoryStat.dev}:${directoryStat.ino}; ` +
    `resolved_dir_identity=${resolvedStat.dev}:${resolvedStat.ino}; ` +
    "zero-click reconciliation archive pending";
  writeFileSync(
    history,
    historyHeader +
      `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tpre-existing terminal state was unbound; no request click occurred\n` +
      `2026-07-26 17:43:34\treconciliation_archive_pending\t${target}\t${transactionMessage}\n`,
  );
  writeFileSync(
    path.join(pythonPath, "sitecustomize.py"),
    `import os

_original_lstat = os.lstat
_original_write = os.write
_injected = False

def _raced_lstat(path, *args, **kwargs):
    global _injected
    history = os.environ["MOCK_INTERLEAVE_HISTORY"]
    target = os.environ["MOCK_INTERLEAVE_TARGET"]
    if not _injected and os.path.abspath(os.fspath(path)) == history:
        check_fd = os.open(
            history,
            os.O_RDONLY
            | getattr(os, "O_NONBLOCK", 0)
            | getattr(os, "O_NOFOLLOW", 0),
        )
        try:
            chunks = []
            while True:
                chunk = os.read(check_fd, 65536)
                if not chunk:
                    break
                chunks.append(chunk)
        finally:
            os.close(check_fd)
        needle = ("\\tretry_pending\\t" + target + "\\t").encode("utf-8")
        if needle in b"".join(chunks):
            _injected = True
            unrelated = os.environ["MOCK_INTERLEAVE_UNRELATED"]
            injected = (
                "2026-07-26 17:44:34\\trequested\\t"
                + unrelated
                + "\\tconcurrent unrelated request after transition read\\n"
            ).encode("utf-8")
            other_fd = os.open(
                history,
                os.O_WRONLY
                | os.O_APPEND
                | getattr(os, "O_NONBLOCK", 0)
                | getattr(os, "O_NOFOLLOW", 0),
            )
            try:
                _original_write(other_fd, injected)
                os.fsync(other_fd)
            finally:
                os.close(other_fd)
    return _original_lstat(path, *args, **kwargs)

os.lstat = _raced_lstat
`,
  );

  try {
    const first = runPreClickReconciliation(
      root,
      history,
      artifactDir,
      artifact,
      {
        PYTHONPATH: pythonPath,
        MOCK_INTERLEAVE_HISTORY: history,
        MOCK_INTERLEAVE_TARGET: target,
        MOCK_INTERLEAVE_UNRELATED: unrelated,
      },
    );
    assert.notEqual(first.status, 0);
    assert.match(
      `${first.stdout}\n${first.stderr}`,
      /identity or size changed|non-retry reconciliation blocker/,
    );
    assert.ok(!existsSync(artifact));
    assert.ok(
      existsSync(path.join(artifactDir, "resolved", path.basename(artifact))),
    );

    const ledgerAfterInterference = readFileSync(history, "utf8");
    const rows = ledgerAfterInterference.trimEnd().split("\n").slice(1);
    const statusesAndUrls = rows.map((row) => {
      const columns = row.split("\t");
      return `${columns[1]} ${columns[2]}`;
    });
    assert.deepEqual(statusesAndUrls.slice(-4), [
      `reconciliation_archive_pending ${target}`,
      `retry_pending ${target}`,
      `requested ${unrelated}`,
      `reconciliation_archive_pending ${target}`,
    ]);
    const latestTarget = [...rows]
      .reverse()
      .map((row) => row.split("\t"))
      .find((columns) => columns[2] === target);
    assert.equal(latestTarget?.[1], "reconciliation_archive_pending");
    assert.match(
      latestTarget?.[3] ?? "",
      /conditional transition interference detected/,
    );

    const retry = spawnSync(
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
    assert.equal(retry.status, 0, `${retry.stdout}\n${retry.stderr}`);
    assert.match(retry.stdout, /No unresolved GSC retry_pending targets remain/);
    assert.doesNotMatch(retry.stdout, new RegExp(target));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC final reconciliation blocks resolved authority swaps at ledger entry", () => {
  for (const mode of ["replace-resolved", "move-evidence"]) {
    const root = createGscFixture();
    const history = path.join(root, "history.tsv");
    const target = "https://venturedex.co/startups/alpha";
    const artifactDirectory = path.join(root, "artifacts");
    const pythonPath = path.join(root, "python-path");
    mkdirSync(artifactDirectory);
    mkdirSync(pythonPath);
    const artifactDir = realpathSync(artifactDirectory);
    const artifact = writePreClickReconciliationArtifact(artifactDir, target);
    writeFileSync(
      history,
      historyHeader +
        `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tpre-existing terminal state was unbound; no request click occurred\n`,
    );
    writeFileSync(
      path.join(pythonPath, "sitecustomize.py"),
      `import os

_original_open = os.open
_resolved_opened = False
_injected = False

def _copy_file(source, destination):
    source_fd = _original_open(source, os.O_RDONLY)
    try:
        chunks = []
        while True:
            chunk = os.read(source_fd, 65536)
            if not chunk:
                break
            chunks.append(chunk)
    finally:
        os.close(source_fd)
    destination_fd = _original_open(
        destination,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL,
        0o600,
    )
    try:
        for chunk in chunks:
            offset = 0
            while offset < len(chunk):
                offset += os.write(destination_fd, chunk[offset:])
        os.fsync(destination_fd)
    finally:
        os.close(destination_fd)

def _open(path, flags, *args, **kwargs):
    global _resolved_opened, _injected
    raw = os.fspath(path)
    if (
        raw == "resolved"
        and kwargs.get("dir_fd") is not None
        and flags & getattr(os, "O_DIRECTORY", 0)
    ):
        _resolved_opened = True
    history = os.environ["MOCK_FINALIZE_HISTORY"]
    if (
        not _injected
        and _resolved_opened
        and os.path.abspath(raw) == history
        and flags & os.O_RDWR
    ):
        _injected = True
        artifact_dir = os.environ["MOCK_FINALIZE_ARTIFACT_DIR"]
        name = os.environ["MOCK_FINALIZE_ARTIFACT_NAME"]
        resolved = os.path.join(artifact_dir, "resolved")
        if os.environ["MOCK_FINALIZE_MODE"] == "replace-resolved":
            moved = os.path.join(artifact_dir, "resolved-held-original")
            os.rename(resolved, moved)
            os.mkdir(resolved)
            _copy_file(
                os.path.join(moved, name),
                os.path.join(resolved, name),
            )
        else:
            os.rename(
                os.path.join(resolved, name),
                os.path.join(artifact_dir, "moved-evidence.txt"),
            )
    return _original_open(path, flags, *args, **kwargs)

os.open = _open
`,
    );

    try {
      const result = runPreClickReconciliation(
        root,
        history,
        artifactDir,
        artifact,
        {
          PYTHONPATH: pythonPath,
          MOCK_FINALIZE_HISTORY: history,
          MOCK_FINALIZE_ARTIFACT_DIR: artifactDir,
          MOCK_FINALIZE_ARTIFACT_NAME: path.basename(artifact),
          MOCK_FINALIZE_MODE: mode,
        },
      );

      assert.notEqual(result.status, 0, mode);
      assert.match(
        `${result.stdout}\n${result.stderr}`,
        /Resolved reconciliation evidence (path|authority)|durable ledger transaction remains blocked/,
        mode,
      );
      const ledger = readFileSync(history, "utf8");
      const targetRows = ledger
        .trimEnd()
        .split("\n")
        .slice(1)
        .map((row) => row.split("\t"))
        .filter((row) => row[2] === target);
      assert.equal(targetRows.at(-1)?.[1], "reconciliation_archive_pending", mode);
      assert.equal(
        targetRows.filter((row) => row[1] === "retry_pending").length,
        0,
        mode,
      );
      assert.match(
        targetRows.at(-1)?.[3] ?? "",
        /file_identity=.*artifact_dir_identity=.*resolved_dir_identity=/,
        mode,
      );
      assert.ok(!existsSync(artifact), mode);
      if (mode === "replace-resolved") {
        assert.ok(
          existsSync(
            path.join(
              artifactDir,
              "resolved-held-original",
              path.basename(artifact),
            ),
          ),
          mode,
        );
        assert.ok(
          existsSync(
            path.join(artifactDir, "resolved", path.basename(artifact)),
          ),
          mode,
        );
      } else {
        assert.ok(existsSync(path.join(artifactDir, "moved-evidence.txt")), mode);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC final reconciliation seals a resolved swap during retry append", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const target = "https://venturedex.co/startups/alpha";
  const artifactDirectory = path.join(root, "artifacts");
  const pythonPath = path.join(root, "python-path");
  mkdirSync(artifactDirectory);
  mkdirSync(pythonPath);
  const artifactDir = realpathSync(artifactDirectory);
  const artifact = writePreClickReconciliationArtifact(artifactDir, target);
  writeFileSync(
    history,
    historyHeader +
      `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tpre-existing terminal state was unbound; no request click occurred\n`,
  );
  writeFileSync(
    path.join(pythonPath, "sitecustomize.py"),
    `import os

_original_write = os.write
_injected = False

def _write(fd, payload):
    global _injected
    target = os.environ["MOCK_APPEND_SWAP_TARGET"]
    needle = ("\\tretry_pending\\t" + target + "\\t").encode("utf-8")
    if not _injected and needle in bytes(payload):
        _injected = True
        artifact_dir = os.environ["MOCK_APPEND_SWAP_ARTIFACT_DIR"]
        resolved = os.path.join(artifact_dir, "resolved")
        os.rename(resolved, os.path.join(artifact_dir, "resolved-held-original"))
        os.mkdir(resolved)
    return _original_write(fd, payload)

os.write = _write
`,
  );

  try {
    const result = runPreClickReconciliation(
      root,
      history,
      artifactDir,
      artifact,
      {
        PYTHONPATH: pythonPath,
        MOCK_APPEND_SWAP_TARGET: target,
        MOCK_APPEND_SWAP_ARTIFACT_DIR: artifactDir,
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /evidence authority changed during the ledger append|non-retry reconciliation blocker/,
    );
    const targetRows = readFileSync(history, "utf8")
      .trimEnd()
      .split("\n")
      .slice(1)
      .map((row) => row.split("\t"))
      .filter((row) => row[2] === target);
    assert.equal(
      targetRows.filter((row) => row[1] === "retry_pending").length,
      1,
      "the injected swap occurs inside the retry append itself",
    );
    assert.equal(targetRows.at(-1)?.[1], "reconciliation_archive_pending");
    assert.match(
      targetRows.at(-1)?.[3] ?? "",
      /conditional transition interference detected/,
    );
    assert.ok(
      existsSync(
        path.join(
          artifactDir,
          "resolved-held-original",
          path.basename(artifact),
        ),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC consumer rejects a fsynced reconciliation retry after SIGKILL moved its evidence", () => {
  for (const mode of ["retry-backlog", "explicit-url"]) {
    const root = createGscFixture();
    const history = path.join(root, "history.tsv");
    const target = "https://venturedex.co/startups/alpha";
    const artifactDirectory = path.join(root, "artifacts");
    const pythonPath = path.join(root, "python-path");
    mkdirSync(artifactDirectory);
    mkdirSync(pythonPath);
    const artifactDir = realpathSync(artifactDirectory);
    const artifact = writePreClickReconciliationArtifact(artifactDir, target);
    writeFileSync(
      history,
      historyHeader +
        `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tpre-existing terminal state was unbound; no request click occurred\n`,
    );
    writeFileSync(
      path.join(pythonPath, "sitecustomize.py"),
      `import os
import signal

_original_write = os.write
_injected = False

def _write(fd, payload):
    global _injected
    target = os.environ["MOCK_SIGKILL_TARGET"]
    needle = ("\\tretry_pending\\t" + target + "\\t").encode("utf-8")
    if not _injected and needle in bytes(payload):
        _injected = True
        written = _original_write(fd, payload)
        os.fsync(fd)
        artifact_dir = os.environ["MOCK_SIGKILL_ARTIFACT_DIR"]
        resolved = os.path.join(artifact_dir, "resolved")
        os.rename(resolved, os.path.join(artifact_dir, "resolved-held-original"))
        os.mkdir(resolved)
        os.kill(os.getpid(), signal.SIGKILL)
        return written
    return _original_write(fd, payload)

os.write = _write
`,
    );

    try {
      const interrupted = runPreClickReconciliation(
        root,
        history,
        artifactDir,
        artifact,
        {
          PYTHONPATH: pythonPath,
          MOCK_SIGKILL_TARGET: target,
          MOCK_SIGKILL_ARTIFACT_DIR: artifactDir,
        },
      );
      assert.notEqual(interrupted.status, 0, mode);
      const interruptedRows = readFileSync(history, "utf8")
        .trimEnd()
        .split("\n")
        .slice(1)
        .map((row) => row.split("\t"))
        .filter((row) => row[2] === target);
      assert.equal(
        interruptedRows.at(-1)?.[1],
        "retry_pending",
        "the durable retry row must survive the killed transition process",
      );
      assert.match(
        interruptedRows.at(-1)?.[3] ?? "",
        /artifact=.*sha256=.*file_identity=.*artifact_dir_identity=.*resolved_dir_identity=/,
      );
      assert.ok(
        existsSync(
          path.join(
            artifactDir,
            "resolved-held-original",
            path.basename(artifact),
          ),
        ),
      );
      assert.equal(
        existsSync(path.join(artifactDir, "resolved", path.basename(artifact))),
        false,
      );

      const mock = createGscBrowserMock(root);
      const args = mode === "retry-backlog"
        ? ["--dry-run", "--retry-pending", "--skip-live-check"]
        : [
            "--url",
            target,
            "--expect-url",
            target,
            "--skip-live-check",
          ];
      const retry = spawnSync(
        "bash",
        [path.join(root, "scripts", "submit-gsc-direct.sh"), ...args],
        {
          cwd: root,
          env: {
            ...process.env,
            PYTHONPATH: "",
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

      if (mode === "retry-backlog") {
        assert.notEqual(retry.status, 0);
        assert.doesNotMatch(retry.stdout, new RegExp(target));
      } else {
        assert.notEqual(retry.status, 0);
      }
      assert.match(
        retry.stderr,
        /reconciliation-derived retry evidence is missing, moved, or no longer matches/,
      );
      assert.match(retry.stderr, new RegExp(target));
      assert.equal(
        existsSync(mock.log),
        false,
        "retry provenance must fail before any browser command",
      );
      assert.equal(gscClickCount(mock), 0);

      const finalRows = readFileSync(history, "utf8")
        .trimEnd()
        .split("\n")
        .slice(1)
        .map((row) => row.split("\t"))
        .filter((row) => row[2] === target);
      assert.equal(finalRows.at(-1)?.[1], "reconciliation_archive_pending");
      assert.match(
        finalRows.at(-1)?.[3] ?? "",
        /current canonical evidence no longer matches the latest retry provenance/,
      );
      assert.equal(
        finalRows.filter((row) => row[1] === "retry_pending").length,
        1,
      );
      assert.equal(
        finalRows.filter((row) => row[1] === "dry_run").length,
        0,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC consumer rejects an unterminated retry ledger before selection or append", () => {
  for (const mode of ["retry-backlog", "explicit-url"]) {
    const root = createGscFixture();
    const history = path.join(root, "history.tsv");
    const target = "https://venturedex.co/startups/alpha";
    const artifactDir = path.join(root, "artifacts");
    const mock = createGscBrowserMock(root);
    const original =
      historyHeader +
      `2026-07-26 17:42:34\tretry_pending\t${target}\t` +
      "manual pre-click reconciliation confirmed no request click";
    writeFileSync(history, original);

    try {
      const args = mode === "retry-backlog"
        ? ["--dry-run", "--retry-pending", "--skip-live-check"]
        : [
            "--url",
            target,
            "--expect-url",
            target,
            "--skip-live-check",
          ];
      const result = spawnSync(
        "bash",
        [path.join(root, "scripts", "submit-gsc-direct.sh"), ...args],
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
          },
          encoding: "utf8",
        },
      );

      assert.notEqual(result.status, 0, mode);
      assert.match(`${result.stdout}\n${result.stderr}`, /terminal LF/, mode);
      assert.equal(readFileSync(history, "utf8"), original, mode);
      assert.equal(existsSync(mock.log), false, mode);
      assert.equal(gscClickCount(mock), 0, mode);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC consumer treats a terminated truncated reconciliation prefix as malformed", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const target = "https://venturedex.co/startups/alpha";
  const artifactDir = path.join(root, "artifacts");
  const mock = createGscBrowserMock(root);
  writeFileSync(
    history,
    historyHeader +
      `2026-07-26 17:42:34\tretry_pending\t${target}\t` +
      "manual pre-click reconciliation confirmed no request click\n",
  );

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--dry-run",
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
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /reconciliation-derived retry evidence is missing, moved, or no longer matches/,
    );
    assert.equal(existsSync(mock.log), false);
    assert.equal(gscClickCount(mock), 0);
    const rows = readFileSync(history, "utf8")
      .trimEnd()
      .split("\n")
      .slice(1)
      .map((row) => row.split("\t"))
      .filter((row) => row[2] === target);
    assert.equal(rows.at(-1)?.[1], "reconciliation_archive_pending");
    assert.equal(rows.filter((row) => row[1] === "dry_run").length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC outcome CAS preserves concurrent request and reconciliation authority", () => {
  const cases = [
    {
      mode: "concurrent_blocker_before_intent",
      clicks: 0,
      latest: "reconciliation_archive_pending",
      message: /concurrent blocker inserted after frozen capture/,
    },
    {
      mode: "concurrent_requested_then_ambiguous",
      clicks: 0,
      latest: "requested",
      message: /concurrent requested inserted after exact intent/,
    },
    {
      mode: "concurrent_blocker_after_click",
      clicks: 1,
      latest: "post_request_confirmation_unknown",
      message: /concurrent blocker inserted after browser click/,
    },
    {
      mode: "concurrent_retry_after_click",
      clicks: 1,
      latest: "post_request_confirmation_unknown",
      message: /conditional transition interference detected while appending requested/,
    },
    {
      mode: "concurrent_old_intent_after_click",
      clicks: 1,
      latest: "request_click_pending",
      message: /^request click intent persisted before browser action; completion unresolved until a terminal ledger row is recorded$/,
    },
  ] as const;

  for (const scenario of cases) {
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

      assert.notEqual(
        result.status,
        0,
        `${scenario.mode}\n${result.stdout}\n${result.stderr}`,
      );
      assert.equal(gscClickCount(mock), scenario.clicks, scenario.mode);
      const rows = readFileSync(history, "utf8")
        .trimEnd()
        .split("\n")
        .slice(1)
        .map((row) => row.split("\t"))
        .filter((row) => row[2] === target);
      assert.equal(rows.at(-1)?.[1], scenario.latest, scenario.mode);
      assert.match(rows.at(-1)?.[3] ?? "", scenario.message, scenario.mode);
      assert.equal(
        rows.filter((row) => row[1] === "requested").length,
        scenario.latest === "requested" ? 1 : 0,
        scenario.mode,
      );
      if (scenario.mode === "concurrent_requested_then_ambiguous") {
        assert.equal(
          rows.filter((row) => row[1] === "retry_pending").length,
          0,
          "an ambiguous no-click result must not downgrade concurrent requested",
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC full-ledger snapshot token rejects pre-click and post-click ABA replay", () => {
  const cases = [
    {
      mode: "concurrent_retry_aba_before_intent",
      initial:
        "2026-07-26 17:42:34\tretry_pending\t%s\tordinary retry\n",
      clicks: 0,
      latest: "reconciliation_archive_pending",
      blocker: "reconciliation_archive_pending",
    },
    {
      mode: "concurrent_intent_aba_after_click",
      initial: "",
      clicks: 1,
      latest: "request_click_pending",
      blocker: "post_request_confirmation_unknown",
    },
  ] as const;

  for (const scenario of cases) {
    const root = createGscFixture();
    const mock = createGscBrowserMock(root);
    const history = path.join(root, "history.tsv");
    const target = "https://venturedex.co/startups/alpha";
    writeFileSync(
      history,
      historyHeader + scenario.initial.replace("%s", target),
    );

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

      assert.notEqual(
        result.status,
        0,
        `${scenario.mode}\n${result.stdout}\n${result.stderr}`,
      );
      assert.equal(gscClickCount(mock), scenario.clicks, scenario.mode);
      const rows = readFileSync(history, "utf8")
        .trimEnd()
        .split("\n")
        .slice(1)
        .map((row) => row.split("\t"))
        .filter((row) => row[2] === target);
      assert.equal(rows.at(-1)?.[1], scenario.latest, scenario.mode);
      assert.ok(
        rows.some((row) => row[1] === scenario.blocker),
        `${scenario.mode} must retain the concurrent blocker`,
      );
      assert.equal(
        rows.filter((row) => row[1] === "requested").length,
        0,
        `${scenario.mode} must not report requested`,
      );

      const second = spawnSync(
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
      assert.notEqual(second.status, 0, scenario.mode);
      assert.equal(
        gscClickCount(mock),
        scenario.clicks,
        `${scenario.mode} must remain blocked on a new run`,
      );
      assert.doesNotMatch(readFileSync(history, "utf8"), /\trequested\t/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC refuses the click when an active artifact appears after browser input", () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const target = "https://venturedex.co/startups/alpha";
  const stagingDir = path.join(root, "staging-artifacts");
  const artifactDir = path.join(root, "artifacts");
  mkdirSync(stagingDir);
  const stagedArtifact = writePreClickReconciliationArtifact(
    realpathSync(stagingDir),
    target,
  );
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
          MOCK_TARGET_MODE: "concurrent_artifact_before_intent",
          MOCK_TARGET_URL: target,
          MOCK_STAGED_ARTIFACT: stagedArtifact,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
          REQUEST_RESULT_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(gscClickCount(mock), 0);
    assert.ok(existsSync(path.join(artifactDir, path.basename(stagedArtifact))));
    assert.match(
      readFileSync(history, "utf8"),
      new RegExp(`\\treconciliation_archive_pending\\t${target}\\t`),
    );

    const second = spawnSync(
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
          MOCK_TARGET_MODE: "concurrent_artifact_before_intent",
          MOCK_TARGET_URL: target,
          MOCK_STAGED_ARTIFACT: stagedArtifact,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
          REQUEST_RESULT_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(second.status, 0);
    assert.equal(gscClickCount(mock), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC artifact authority swap is durably blocked across a new run", () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const target = "https://venturedex.co/startups/alpha";
  const stagingDir = path.join(root, "staging-artifacts");
  const artifactDir = path.join(root, "artifacts");
  const hiddenArtifactDir = path.join(root, "artifacts-hidden");
  mkdirSync(stagingDir);
  const stagedArtifact = writePreClickReconciliationArtifact(
    realpathSync(stagingDir),
    target,
  );
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
    MOCK_TARGET_MODE: "artifact_authority_swap_before_intent",
    MOCK_TARGET_URL: target,
    MOCK_STAGED_ARTIFACT: stagedArtifact,
    MOCK_HIDDEN_ARTIFACT_DIR: hiddenArtifactDir,
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
    assert.notEqual(first.status, 0, `${first.stdout}\n${first.stderr}`);
    assert.equal(gscClickCount(mock), 0);
    assert.ok(
      existsSync(path.join(hiddenArtifactDir, path.basename(stagedArtifact))),
      "the hidden original authority must remain auditable",
    );
    assert.deepEqual(readdirSync(artifactDir), []);
    const ledger = readFileSync(history, "utf8");
    assert.match(
      ledger,
      new RegExp(`\\treconciliation_archive_pending\\t${target}\\t`),
    );
    assert.match(ledger, /GSC artifact authority changed or could not be verified/);
    assert.doesNotMatch(ledger, /\trequested\t/);

    const second = spawnSync("bash", args, {
      cwd: root,
      env,
      encoding: "utf8",
    });
    assert.notEqual(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.equal(gscClickCount(mock), 0);
    assert.doesNotMatch(readFileSync(history, "utf8"), /\trequested\t/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC artifact authority swap cannot downgrade frozen requested authority", () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const target = "https://venturedex.co/startups/alpha";
  const stagingDir = path.join(root, "staging-artifacts");
  const artifactDir = path.join(root, "artifacts");
  const hiddenArtifactDir = path.join(root, "artifacts-hidden");
  mkdirSync(stagingDir);
  const stagedArtifact = writePreClickReconciliationArtifact(
    realpathSync(stagingDir),
    target,
  );
  const requestedRow =
    `2026-07-26 17:42:34\trequested\t${target}\tpre-existing requested authority\n`;
  writeFileSync(history, historyHeader + requestedRow);

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
        "--force",
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
          MOCK_TARGET_MODE: "artifact_authority_swap_requested_conflict",
          MOCK_TARGET_URL: target,
          MOCK_STAGED_ARTIFACT: stagedArtifact,
          MOCK_HIDDEN_ARTIFACT_DIR: hiddenArtifactDir,
          NAV_WAIT_SECONDS: "0",
          INSPECT_WAIT_SECONDS: "0",
          POST_CLICK_WAIT_SECONDS: "0",
          POST_MODAL_WAIT_SECONDS: "0",
          REQUEST_RESULT_WAIT_SECONDS: "0",
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(gscClickCount(mock), 0);
    assert.equal(readFileSync(history, "utf8"), historyHeader + requestedRow);
    assert.ok(
      existsSync(path.join(hiddenArtifactDir, path.basename(stagedArtifact))),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC precheck live failure cannot downgrade a concurrent requested row", () => {
  const root = createGscFixture();
  const mock = createGscBrowserMock(root);
  const history = path.join(root, "history.tsv");
  const artifactDir = path.join(root, "artifacts");
  const bin = path.join(root, "bin");
  const target = "https://venturedex.co/startups/alpha";
  mkdirSync(bin);
  writeFileSync(history, historyHeader);
  writeExecutable(
    path.join(bin, "curl"),
    `#!/bin/sh
printf '2026-07-26 23:59:59\\trequested\\t%s\\tconcurrent requested during live precheck\\n' \
  "$MOCK_TARGET_URL" \
  >> "$HISTORY_FILE"
exit 22
`,
  );

  try {
    const result = spawnSync(
      "bash",
      [
        path.join(root, "scripts", "submit-gsc-direct.sh"),
        "--url",
        target,
        "--expect-url",
        target,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          HISTORY_FILE: history,
          GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
          GSC_ARTIFACT_DIR: artifactDir,
          BB_BROWSER_CMD: mock.browser,
          COMET_APP: mock.comet,
          MOCK_BROWSER_LOG: mock.log,
          MOCK_TARGET_URL: target,
        },
        encoding: "utf8",
      },
    );

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(gscClickCount(mock), 0);
    const rows = readFileSync(history, "utf8")
      .trimEnd()
      .split("\n")
      .slice(1)
      .map((row) => row.split("\t"))
      .filter((row) => row[2] === target);
    assert.equal(rows.at(-1)?.[1], "requested");
    assert.match(rows.at(-1)?.[3] ?? "", /concurrent requested during live precheck/);
    assert.equal(
      rows.filter((row) => row[1] === "live_check_failed").length,
      0,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC batch retry CAS seals reconciliation provenance inserted after its snapshot", () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const artifactDirectory = path.join(root, "artifacts");
  const hookDir = path.join(root, "python-hook");
  const target = "https://venturedex.co/startups/alpha";
  mkdirSync(artifactDirectory);
  mkdirSync(hookDir);
  const artifactDir = realpathSync(artifactDirectory);
  const artifact = writePreClickReconciliationArtifact(artifactDir, target);
  writeFileSync(
    history,
    historyHeader +
      `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tpre-existing terminal state was unbound; no request click occurred\n`,
  );

  try {
    const reconciled = runPreClickReconciliation(
      root,
      history,
      artifactDir,
      artifact,
    );
    assert.equal(
      reconciled.status,
      0,
      `${reconciled.stdout}\n${reconciled.stderr}`,
    );
    const derivedMessage = readFileSync(history, "utf8")
      .trimEnd()
      .split("\n")
      .slice(1)
      .map((row) => row.split("\t"))
      .filter((row) => row[2] === target && row[1] === "retry_pending")
      .at(-1)?.[3];
    assert.ok(derivedMessage);
    appendFileSync(
      history,
      `2026-07-26 18:00:00\tlive_check_failed\t${target}\tolder operational blocker\n`,
    );
    writeFileSync(
      path.join(hookDir, "sitecustomize.py"),
      `import os

_original_open = os.open
_injected = False

def _open(path, flags, *args, **kwargs):
    global _injected
    raw = os.path.abspath(os.fspath(path))
    history = os.environ["MOCK_BATCH_RACE_HISTORY"]
    if (
        not _injected
        and raw == history
        and flags & os.O_RDWR
    ):
        _injected = True
        fd = _original_open(
            history,
            os.O_WRONLY | os.O_APPEND | getattr(os, "O_NOFOLLOW", 0),
        )
        try:
            payload = os.environ["MOCK_BATCH_RACE_ROW"].encode("utf-8")
            written = os.write(fd, payload)
            if written != len(payload):
                raise OSError("partial injected row")
            os.fsync(fd)
        finally:
            os.close(fd)
    return _original_open(path, flags, *args, **kwargs)

os.open = _open
`,
    );

    const blocked = spawnSync(
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
          PYTHONPATH: hookDir,
          HISTORY_FILE: history,
          GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
          GSC_ARTIFACT_DIR: artifactDir,
          BB_BROWSER_CMD: path.join(root, "missing-bb-browser"),
          COMET_APP: path.join(root, "Comet"),
          MOCK_BATCH_RACE_HISTORY: history,
          MOCK_BATCH_RACE_ROW:
            `2026-07-26 18:00:01\tretry_pending\t${target}\t${derivedMessage}\n`,
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(blocked.status, 0);

    const afterRace = readFileSync(history, "utf8")
      .trimEnd()
      .split("\n")
      .slice(1)
      .map((row) => row.split("\t"))
      .filter((row) => row[2] === target);
    assert.equal(afterRace.at(-1)?.[1], "reconciliation_archive_pending");
    assert.match(
      afterRace.at(-1)?.[3] ?? "",
      /conditional transition interference detected/,
    );
    assert.ok(
      afterRace.some(
        (row) => row[1] === "retry_pending" && row[3] === derivedMessage,
      ),
      "the concurrent reconciliation provenance row must remain auditable",
    );
    assert.equal(
      afterRace.filter((row) => (
        row[1] === "retry_pending"
        && /gsc_browser_dependency_blocker/.test(row[3] ?? "")
      )).length,
      0,
    );

    renameSync(
      path.join(artifactDir, "resolved"),
      path.join(artifactDir, "resolved-moved"),
    );
    mkdirSync(path.join(artifactDir, "resolved"));
    const mock = createGscBrowserMock(root);
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
          PYTHONPATH: "",
          HISTORY_FILE: history,
          GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
          GSC_ARTIFACT_DIR: artifactDir,
          BB_BROWSER_CMD: mock.browser,
          COMET_APP: mock.comet,
          MOCK_BROWSER_LOG: mock.log,
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
    assert.equal(gscClickCount(mock), 0);
    const finalRows = readFileSync(history, "utf8")
      .trimEnd()
      .split("\n")
      .slice(1)
      .map((row) => row.split("\t"))
      .filter((row) => row[2] === target);
    assert.equal(finalRows.at(-1)?.[1], "reconciliation_archive_pending");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GSC diagnostic artifact writer is exclusive, non-following, and non-overwriting", () => {
  for (const mode of ["regular", "symlink"]) {
    const root = tempDir("venturedex-gsc-artifact-write-");
    const artifactDir = realpathSync(root);
    const name =
      "20260726-174233-pre_request_success_unverified-" +
      `${gscArtifactTargetKeyForTest("https://venturedex.co/startups/alpha")}.txt`;
    const destination = path.join(artifactDir, name);
    const sentinel = path.join(artifactDir, "sentinel.txt");
    writeFileSync(sentinel, "preserve me\n");
    if (mode === "regular") {
      writeFileSync(destination, "existing evidence\n");
    } else {
      symlinkSync(sentinel, destination);
    }

    try {
      const result = spawnSync(
        realPython3,
        [
          path.join(repoRoot, "scripts", "gsc-reconciliation.py"),
          "write",
          artifactDir,
          name,
          "2026-07-26 17:42:33",
          "pre_request_success_unverified",
          "https://venturedex.co/startups/alpha",
          "zero click",
          "success",
          "https://venturedex.co/startups/alpha\nREQUEST INDEXING",
        ],
        { encoding: "utf8" },
      );
      assert.notEqual(result.status, 0, mode);
      assert.equal(readFileSync(sentinel, "utf8"), "preserve me\n", mode);
      if (mode === "regular") {
        assert.equal(readFileSync(destination, "utf8"), "existing evidence\n");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC helper rejects top-level artifact authority swaps during write and archive", () => {
  for (const mode of ["write", "archive"]) {
    const root = tempDir("venturedex-gsc-artifact-authority-");
    const artifactDir = path.join(root, "artifacts");
    const movedArtifactDir = path.join(root, "artifacts-moved");
    const hookDir = path.join(root, "hooks");
    const target = "https://venturedex.co/startups/alpha";
    const name =
      "20260726-174233-pre_request_success_unverified-" +
      `${gscArtifactTargetKeyForTest(target)}.txt`;
    mkdirSync(artifactDir);
    mkdirSync(hookDir);

    const helperArgs = [
      path.join(repoRoot, "scripts", "gsc-reconciliation.py"),
    ];
    if (mode === "write") {
      const directoryStat = statSync(artifactDir);
      helperArgs.push(
        "write",
        artifactDir,
        `${directoryStat.dev}:${directoryStat.ino}`,
        name,
        "2026-07-26 17:42:33",
        "pre_request_success_unverified",
        target,
        "zero click",
        "success",
        `${target}\nREQUEST INDEXING`,
      );
    } else {
      const artifact = writePreClickReconciliationArtifact(artifactDir, target);
      const resolvedDirectory = path.join(artifactDir, "resolved");
      mkdirSync(resolvedDirectory);
      const artifactStat = statSync(artifact);
      const directoryStat = statSync(artifactDir);
      const resolvedStat = statSync(resolvedDirectory);
      const digest = createHash("sha256")
        .update(readFileSync(artifact))
        .digest("hex");
      helperArgs.push(
        "archive",
        artifactDir,
        name,
        `${artifactStat.dev}:${artifactStat.ino}`,
        `${directoryStat.dev}:${directoryStat.ino}`,
        `${resolvedStat.dev}:${resolvedStat.ino}`,
        digest,
      );
    }
    writeFileSync(
      path.join(hookDir, "sitecustomize.py"),
      [
        "import os",
        "import stat",
        "_original_fsync = os.fsync",
        "_injected = False",
        "def _fsync(fd):",
        "    global _injected",
        "    result = _original_fsync(fd)",
        "    observed = os.fstat(fd)",
        "    archive_ready = (",
        "        os.environ['INJECT_MODE'] == 'archive'",
        "        and stat.S_ISDIR(observed.st_mode)",
        "        and os.path.exists(os.path.join(",
        "            os.environ['INJECT_ARTIFACT_DIR'],",
        "            'resolved',",
        "            os.environ['INJECT_ARTIFACT_NAME'],",
        "        ))",
        "    )",
        "    write_ready = (",
        "        os.environ['INJECT_MODE'] == 'write'",
        "        and stat.S_ISREG(observed.st_mode)",
        "    )",
        "    if not _injected and (archive_ready or write_ready):",
        "        _injected = True",
        "        os.rename(",
        "            os.environ['INJECT_ARTIFACT_DIR'],",
        "            os.environ['INJECT_MOVED_ARTIFACT_DIR'],",
        "        )",
        "        os.mkdir(os.environ['INJECT_ARTIFACT_DIR'])",
        "    return result",
        "os.fsync = _fsync",
        "",
      ].join("\n"),
    );

    try {
      const result = spawnSync(realPython3, helperArgs, {
        env: {
          ...process.env,
          PYTHONPATH: hookDir,
          INJECT_MODE: mode,
          INJECT_ARTIFACT_DIR: artifactDir,
          INJECT_MOVED_ARTIFACT_DIR: movedArtifactDir,
          INJECT_ARTIFACT_NAME: name,
        },
        encoding: "utf8",
      });

      assert.notEqual(result.status, 0, mode);
      assert.match(result.stderr, /authority path changed/, mode);
      if (mode === "write") {
        assert.ok(!existsSync(path.join(artifactDir, name)), mode);
        assert.ok(existsSync(path.join(movedArtifactDir, name)), mode);
      } else {
        assert.ok(!existsSync(path.join(artifactDir, "resolved", name)), mode);
        assert.ok(
          existsSync(path.join(movedArtifactDir, "resolved", name)),
          mode,
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("GSC reconciliation rejects same-inode artifact mutation after preparation", async () => {
  const root = createGscFixture();
  const history = path.join(root, "history.tsv");
  const target = "https://venturedex.co/startups/alpha";
  const artifactDirectory = path.join(root, "artifacts");
  const bin = path.join(root, "bin");
  const held = path.join(root, "archive-held");
  const release = path.join(root, "archive-release");
  mkdirSync(artifactDirectory);
  mkdirSync(bin);
  const artifactDir = realpathSync(artifactDirectory);
  const artifact = writePreClickReconciliationArtifact(artifactDir, target);
  const originalIdentity = statSync(artifact).ino;
  writeFileSync(
    history,
    historyHeader +
      `2026-07-26 17:42:34\tpre_request_success_unverified\t${target}\tpre-existing terminal state was unbound; no request click occurred\n`,
  );
  writeExecutable(
    path.join(bin, "python3"),
    `#!/bin/sh
if [ "$2" = "archive" ]; then
  : > "$MOCK_ARCHIVE_HELD"
  while [ ! -e "$MOCK_ARCHIVE_RELEASE" ]; do sleep 0.05; done
fi
exec "${realPython3}" "$@"
`,
  );
  const child = spawn(
    "bash",
    [
      path.join(root, "scripts", "submit-gsc-direct.sh"),
      "--reconcile-pre-click-retry",
      artifact,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HISTORY_FILE: history,
        GSC_LEGACY_HISTORY_FILE: path.join(root, "missing-legacy.tsv"),
        GSC_ARTIFACT_DIR: artifactDir,
        MOCK_ARCHIVE_HELD: held,
        MOCK_ARCHIVE_RELEASE: release,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const outcomePromise = captureChild(child);

  try {
    await waitForPath(held);
    const original = readFileSync(artifact, "utf8");
    writeFileSync(
      artifact,
      original.replace(
        "message: pre-existing terminal state was unbound; no request click occurred",
        "message: altered after transaction preparation",
      ),
    );
    assert.equal(
      statSync(artifact).ino,
      originalIdentity,
      "the adversarial mutation must preserve the prepared inode",
    );
    writeFileSync(release, "release\n");
    const outcome = await outcomePromise;

    assert.notEqual(outcome.code, 0);
    assert.match(outcome.stderr, /artifact digest changed before archival/);
    assert.ok(existsSync(artifact));
    assert.ok(
      !existsSync(path.join(artifactDir, "resolved", path.basename(artifact))),
    );
    const ledger = readFileSync(history, "utf8");
    assert.match(ledger, /\treconciliation_archive_pending\t/);
    assert.doesNotMatch(ledger, /\tretry_pending\t/);
  } finally {
    writeFileSync(release, "release\n");
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await outcomePromise;
    }
    rmSync(root, { recursive: true, force: true });
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
