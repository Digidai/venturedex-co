import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  classifyGscUrl,
  classifyGscStatus,
  gscArtifactTargetKey,
  latestGscStatus,
  normalizeCanonicalUrl,
  parseGscLedgerText,
  readGscDiagnosticSnapshot,
  readGscLedger,
  readGscReconciliationArtifacts,
  renderGscDiagnosticsMarkdown,
  resolveDefaultGscArtifactDir,
  resolveDefaultGscHistoryPath,
  type GscUrlDiagnostic,
  withGscSnapshotLock,
} from "../scripts/promotion/gsc";

const ledger = `timestamp\tstatus\turl\tmessage
2026-06-11 10:00:00\tdry_run\thttps://venturedex.co/startups/billables-ai\tpreview only
2026-06-11 10:02:00\tretry_pending\thttps://venturedex.co/startups/billables-ai\trequest button not found
2026-06-11 10:04:00\trequested\thttps://venturedex.co/weekly/3\tindexing requested
`;

test("parseGscLedgerText keeps canonical URL rows and latest row order", () => {
  const rows = parseGscLedgerText(ledger);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].url, "https://venturedex.co/startups/billables-ai");
  assert.equal(normalizeCanonicalUrl("https://venturedex.co/weekly/3.html/"), "https://venturedex.co/weekly/3");
  assert.equal(
    parseGscLedgerText(ledger.replaceAll("\n", "\r\n")).length,
    3,
  );
});

test("parseGscLedgerText fails closed on a missing header or truncated row", () => {
  assert.throws(
    () => parseGscLedgerText(
      "2026-06-11 10:00:00\trequested\thttps://venturedex.co/startups/billables-ai\trequested\n",
    ),
    /Invalid GSC ledger header/,
  );
  assert.throws(
    () => parseGscLedgerText(
      "timestamp\tstatus\turl\tmessage\n2026-06-11 10:00:00\trequested\thttps://venturedex.co/startups/billables-ai\n",
    ),
    /expected 4 columns/,
  );
});

test("GSC diagnostics reject a non-empty ledger without a terminal LF", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "venturedex-gsc-ledger-lf-"));
  const history = path.join(root, "history.tsv");
  const unterminated =
    `${historyHeaderForTest()}2026-06-11 10:00:00\tretry_pending\t` +
    "https://venturedex.co/startups/billables-ai\t" +
    "manual pre-click reconciliation confirmed no request click";
  writeFileSync(history, unterminated);

  try {
    assert.throws(
      () => parseGscLedgerText(unterminated),
      /terminal LF/,
    );
    assert.throws(
      () => readGscLedger(history),
      /terminal LF/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parseGscLedgerText rejects ambiguous TSV, outer whitespace, and noncanonical URLs", () => {
  const invalidRows = [
    "2026-06-11 10:00:00\trequested\thttps://venturedex.co/startups/billables-ai\t\"message\twith tab\"",
    "2026-06-11 10:00:00\t requested \thttps://venturedex.co/startups/billables-ai\tmessage",
    "2026-06-11 10:00:00\trequsted\thttps://venturedex.co/startups/billables-ai\tmessage",
    "2026-06-11 10:00:00\talready_requested\thttps://venturedex.co/startups/billables-ai\tmessage",
    "not-a-timestamp\trequested\thttps://venturedex.co/startups/billables-ai\tmessage",
    "2026-06-11 10:00:00\trequested\thttps://venturedex.co/startups/billables-ai/\tmessage",
    "2026-06-11 10:00:00\trequested\thttps://venturedex.co/startups/billables-ai.html\tmessage",
  ];
  for (const row of invalidRows) {
    assert.throws(
      () => parseGscLedgerText(`${historyHeaderForTest()}${row}\n`),
      /Invalid GSC ledger row/,
    );
  }
});

test("parseGscLedgerText rejects bare CR and ambiguous Unicode control separators", () => {
  const row =
    "2026-06-11 10:00:00\trequested\thttps://venturedex.co/startups/billables-ai\tmessage";
  for (const separator of ["\r", "\u001f", "\ufeff", "\u2028"]) {
    assert.throws(
      () => parseGscLedgerText(
        `timestamp\tstatus\turl\tmessage${separator}${row}\n`,
      ),
      /Invalid GSC ledger line separator/,
    );
  }
});

test("readGscLedger rejects invalid UTF-8 even when the requested row shape is otherwise valid", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "venturedex-gsc-ledger-"));
  const history = path.join(root, "history.tsv");
  writeFileSync(
    history,
    Buffer.concat([
      Buffer.from(
        `${historyHeaderForTest()}2026-06-11 10:00:00\trequested\thttps://venturedex.co/startups/billables-ai\t`,
        "utf8",
      ),
      Buffer.from([0xff]),
      Buffer.from("\n", "utf8"),
    ]),
  );
  try {
    assert.throws(() => readGscLedger(history));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readGscLedger rejects FIFO, directory, and symlink authorities without blocking", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "venturedex-gsc-ledger-kind-"));
  const regular = path.join(root, "regular.tsv");
  writeFileSync(regular, historyHeaderForTest());
  const targets = [
    path.join(root, "fifo.tsv"),
    path.join(root, "directory.tsv"),
    path.join(root, "symlink.tsv"),
    path.join(root, "broken-symlink.tsv"),
  ];
  execFileSync("mkfifo", [targets[0]]);
  mkdirSync(targets[1]);
  symlinkSync(regular, targets[2]);
  symlinkSync(path.join(root, "missing.tsv"), targets[3]);

  try {
    for (const target of targets) {
      assert.throws(
        () => readGscLedger(target),
        /regular, non-symlink file/,
        target,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readGscLedger rejects hard-link aliases like the authoritative submitter", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "venturedex-gsc-ledger-hardlink-"));
  const history = path.join(root, "history.tsv");
  const alias = path.join(root, "history-alias.tsv");
  writeFileSync(
    history,
    `${historyHeaderForTest()}2026-06-11 10:04:00\trequested\thttps://venturedex.co/weekly/3\tindexing requested\n`,
  );
  linkSync(history, alias);

  try {
    assert.throws(
      () => readGscLedger(history),
      /hard-link aliases/,
    );
    assert.throws(
      () => readGscLedger(alias),
      /hard-link aliases/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("latestGscStatus returns the newest row for a target URL", () => {
  const rows = parseGscLedgerText(ledger);
  const row = latestGscStatus(rows, "https://venturedex.co/startups/billables-ai");
  assert.equal(row?.status, "retry_pending");
  assert.equal(classifyGscStatus(row).kind, "blocked");
});

test("a later dry-run cannot hide requested or blocked operational evidence", () => {
  const blockedRows = parseGscLedgerText(`${ledger}
2026-06-11 10:06:00\tdry_run\thttps://venturedex.co/startups/billables-ai\tpreview only
`);
  const requestedRows = parseGscLedgerText(`${ledger}
2026-06-11 10:06:00\tdry_run\thttps://venturedex.co/weekly/3\tpreview only
`);
  const previewOnly = parseGscLedgerText(`timestamp\tstatus\turl\tmessage
2026-06-11 10:06:00\tdry_run\thttps://venturedex.co/startups/new-company\tpreview only
`);

  assert.equal(
    latestGscStatus(blockedRows, "https://venturedex.co/startups/billables-ai")?.status,
    "retry_pending"
  );
  assert.equal(
    latestGscStatus(requestedRows, "https://venturedex.co/weekly/3")?.status,
    "requested"
  );
  assert.equal(
    latestGscStatus(previewOnly, "https://venturedex.co/startups/new-company")?.status,
    "dry_run"
  );
});

test("classifyGscStatus distinguishes requested, dry_run, blocked, and missing", () => {
  assert.equal(classifyGscStatus({ timestamp: "t", status: "requested", url: "u", message: "" }).kind, "complete");
  assert.equal(classifyGscStatus({ timestamp: "t", status: "dry_run", url: "u", message: "" }).kind, "needs_submit");
  assert.equal(classifyGscStatus({ timestamp: "t", status: "quota_exceeded", url: "u", message: "" }).kind, "blocked");
  assert.equal(classifyGscStatus({ timestamp: "t", status: "pre_request_success_unverified", url: "u", message: "" }).kind, "blocked");
  assert.equal(classifyGscStatus({ timestamp: "t", status: "reconciliation_archive_pending", url: "u", message: "" }).kind, "blocked");
  assert.equal(classifyGscStatus({ timestamp: "t", status: "post_request_target_unverified", url: "u", message: "" }).kind, "blocked");
  assert.equal(classifyGscStatus({ timestamp: "t", status: "post_request_confirmation_unknown", url: "u", message: "" }).kind, "blocked");
  assert.equal(classifyGscStatus({ timestamp: "t", status: "request_click_pending", url: "u", message: "" }).kind, "blocked");
  assert.equal(classifyGscStatus(null).kind, "missing");
});

test("a reconciliation artifact overrides an older requested ledger row", () => {
  const artifactDir = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "venturedex-gsc-artifacts-")),
  );
  const target = "https://venturedex.co/startups/billables-ai";
  const artifactPath = path.join(
    artifactDir,
    `20260726-120000-ledger_write_failed_after_request-${gscArtifactTargetKey(target)}.txt`,
  );
  writeFileSync(
    artifactPath,
    [
      "timestamp: 2026-07-26 12:00:00",
      "status: ledger_write_failed_after_request",
      `url: ${target}`,
      "message: manual reconciliation required",
      "",
      "--- page text ---",
    ].join("\n"),
  );

  try {
    const rows = parseGscLedgerText(
      `${historyHeaderForTest()}2026-07-25 12:00:00\trequested\t${target}\trequested\n`,
    );
    const artifacts = readGscReconciliationArtifacts(artifactDir);
    assert.equal(artifacts.length, 1);
    assert.equal(
      artifacts[0].targetKey,
      gscArtifactTargetKey(target),
    );
    assert.equal(artifacts[0].globalBlock, false);
    const result = classifyGscUrl(rows, target, artifacts);
    assert.equal(result.latest?.status, "requested");
    assert.equal(result.kind, "blocked");
    assert.match(result.message, /ledger_write_failed_after_request artifact/);
    assert.match(result.message, /manual reconciliation required/);
  } finally {
    rmSync(artifactDir, { recursive: true, force: true });
  }
});

test("an unreadable or partial reconciliation filename still blocks like the submitter", () => {
  const artifactDir = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "venturedex-gsc-artifacts-")),
  );
  const target = "https://venturedex.co/startups/billables-ai";
  writeFileSync(
    path.join(
      artifactDir,
      `20260726-120000-post_request_target_unverified-${gscArtifactTargetKey(target)}.txt`,
    ),
    "partial evidence without headers\n",
  );

  try {
    const rows = parseGscLedgerText(
      `${historyHeaderForTest()}2026-07-25 12:00:00\trequested\t${target}\trequested\n`,
    );
    const result = classifyGscUrl(
      rows,
      target,
      readGscReconciliationArtifacts(artifactDir),
    );
    assert.equal(result.kind, "blocked");
    assert.match(result.message, /post_request_target_unverified artifact/);
  } finally {
    rmSync(artifactDir, { recursive: true, force: true });
  }
});

test("hashed reconciliation artifacts cannot collide across similar slugs", () => {
  const artifactDir = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "venturedex-gsc-artifacts-")),
  );
  const first = "https://venturedex.co/startups/alpha-beta";
  const second = "https://venturedex.co/startups/alpha--beta";
  writeFileSync(
    path.join(
      artifactDir,
      `20260726-120000-post_request_target_unverified-${gscArtifactTargetKey(first)}.txt`,
    ),
    `status: post_request_target_unverified\nurl: ${first}\nmessage: first target only\n`,
  );

  try {
    const rows = parseGscLedgerText(
      `${historyHeaderForTest()}2026-07-25 12:00:00\trequested\t${second}\trequested\n`,
    );
    const artifacts = readGscReconciliationArtifacts(artifactDir);
    assert.notEqual(gscArtifactTargetKey(first), gscArtifactTargetKey(second));
    assert.equal(classifyGscUrl(rows, first, artifacts).kind, "blocked");
    assert.equal(classifyGscUrl(rows, second, artifacts).kind, "complete");
  } finally {
    rmSync(artifactDir, { recursive: true, force: true });
  }
});

test("malformed legacy reconciliation filenames block diagnostics globally", () => {
  const artifactDir = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "venturedex-gsc-artifacts-")),
  );
  const target = "https://venturedex.co/startups/billables-ai";
  writeFileSync(
    path.join(
      artifactDir,
      "20260726-120000-post_request_confirmation_unknown-.txt",
    ),
    "partial evidence without a target identity\n",
  );

  try {
    const rows = parseGscLedgerText(
      `${historyHeaderForTest()}2026-07-25 12:00:00\trequested\t${target}\trequested\n`,
    );
    const artifacts = readGscReconciliationArtifacts(artifactDir);
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0].globalBlock, true);
    assert.equal(classifyGscUrl(rows, target, artifacts).kind, "blocked");
  } finally {
    rmSync(artifactDir, { recursive: true, force: true });
  }
});

test("a broken reconciliation artifact-directory symlink fails closed", () => {
  const root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "venturedex-gsc-artifacts-")),
  );
  const artifactDir = path.join(root, "artifacts");
  symlinkSync(path.join(root, "missing-target"), artifactDir);
  try {
    assert.throws(
      () => readGscReconciliationArtifacts(artifactDir),
      /broken symlink/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a live reconciliation artifact-directory symlink fails closed", () => {
  const root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "venturedex-gsc-artifacts-")),
  );
  const realArtifactDir = path.join(root, "real-artifacts");
  const artifactDir = path.join(root, "artifacts");
  mkdirSync(realArtifactDir);
  symlinkSync(realArtifactDir, artifactDir);
  try {
    assert.throws(
      () => readGscReconciliationArtifacts(artifactDir),
      /real, non-symlink directory/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a reconciliation artifact authority through a symlink parent fails closed", () => {
  const root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "venturedex-gsc-artifacts-")),
  );
  const realParent = path.join(root, "real-parent");
  const linkedParent = path.join(root, "linked-parent");
  mkdirSync(realParent);
  mkdirSync(path.join(realParent, "artifacts"));
  symlinkSync(realParent, linkedParent);
  try {
    assert.throws(
      () => readGscReconciliationArtifacts(path.join(linkedParent, "artifacts")),
      /exact canonical path/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a reconciliation artifact file symlink is a global blocker and is never read", () => {
  const artifactDir = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "venturedex-gsc-artifacts-")),
  );
  const target = "https://venturedex.co/startups/billables-ai";
  symlinkSync(
    path.join(artifactDir, "missing-evidence"),
    path.join(
      artifactDir,
      `20260726-120000-post_request_confirmation_unknown-${gscArtifactTargetKey(target)}.txt`,
    ),
  );
  try {
    const artifacts = readGscReconciliationArtifacts(artifactDir);
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0].globalBlock, true);
    assert.equal(
      classifyGscUrl(
        parseGscLedgerText(
          `${historyHeaderForTest()}2026-07-25 12:00:00\trequested\t${target}\trequested\n`,
        ),
        target,
        artifacts,
      ).kind,
      "blocked",
    );
  } finally {
    rmSync(artifactDir, { recursive: true, force: true });
  }
});

test("the diagnostics snapshot lock excludes a reconciliation interleaving", () => {
  const root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "venturedex-gsc-snapshot-")),
  );
  const history = path.join(root, "history.tsv");
  const artifactDir = path.join(root, "artifacts");
  const target = "https://venturedex.co/startups/billables-ai";
  mkdirSync(artifactDir);
  writeFileSync(
    history,
    `${historyHeaderForTest()}2026-07-25 12:00:00\trequested\t${target}\trequested\n`,
  );
  writeFileSync(
    path.join(
      artifactDir,
      `20260726-120000-pre_request_success_unverified-${gscArtifactTargetKey(target)}.txt`,
    ),
    [
      "timestamp: 2026-07-26 12:00:00",
      "status: pre_request_success_unverified",
      `url: ${target}`,
      "message: zero-click evidence",
      "",
    ].join("\n"),
  );

  const contender = `${history}.lock.reconciler`;
  try {
    const result = withGscSnapshotLock(history, (canonicalHistory) => {
      const rows = readGscLedger(canonicalHistory);
      writeFileSync(contender, "token=reconciler\n");
      assert.throws(
        () => linkSync(contender, `${canonicalHistory}.lock`),
        (error: unknown) => (
          error instanceof Error
          && "code" in error
          && error.code === "EEXIST"
        ),
      );
      const artifacts = readGscReconciliationArtifacts(artifactDir);
      return classifyGscUrl(rows, target, artifacts);
    });
    assert.equal(result.kind, "blocked");
    assert.match(result.message, /pre_request_success_unverified artifact/);
    assert.equal(existsSync(`${history}.lock`), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("diagnostics neither replaces a held lock nor deletes a changed lock on release", () => {
  const root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "venturedex-gsc-lock-")),
  );
  const history = path.join(root, "history.tsv");
  const artifactDir = path.join(root, "artifacts");
  const lockPath = `${history}.lock`;
  mkdirSync(artifactDir);
  writeFileSync(history, historyHeaderForTest());
  writeFileSync(lockPath, "token=existing-owner\n");

  try {
    assert.throws(
      () => readGscDiagnosticSnapshot({
        historyPath: history,
        artifactDir,
      }),
      /already held; refusing to remove or replace/,
    );
    assert.equal(readFileSync(lockPath, "utf8"), "token=existing-owner\n");

    unlinkSync(lockPath);
    assert.throws(
      () => withGscSnapshotLock(history, (canonicalHistory) => {
        unlinkSync(`${canonicalHistory}.lock`);
        writeFileSync(`${canonicalHistory}.lock`, "token=replacement-owner\n");
      }),
      /unknown (?:identity|ownership)/,
    );
    assert.equal(readFileSync(lockPath, "utf8"), "token=replacement-owner\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("renderGscDiagnosticsMarkdown preserves rule that dry_run is not success", () => {
  const diagnostics: GscUrlDiagnostic[] = [
    {
      label: "Billables AI",
      url: "https://venturedex.co/startups/billables-ai",
      kind: "needs_submit",
      latest: null,
      message: "dry-run only",
    },
  ];
  const markdown = renderGscDiagnosticsMarkdown({
    generatedAt: "2026-06-12T00:00:00.000Z",
    historyPath: ".gsc_submission_history.tsv",
    diagnostics,
  });
  assert.match(markdown, /dry-run only/);
  assert.match(markdown, /it is not a Google indexing request/);
  assert.match(markdown, /post_request_target_unverified/);
  assert.match(markdown, /post_request_confirmation_unknown/);
  assert.match(markdown, /pre_request_success_unverified/);
  assert.match(markdown, /manually reconciled/);
});

test("default GSC history path remains the stable authority when its parent is missing", () => {
  const path = resolveDefaultGscHistoryPath({
    env: { CODEX_HOME: "/tmp/codex-home" },
    homeDir: "/tmp/home",
  });

  assert.equal(path, "/tmp/codex-home/automations/venturedex-daily-curator/gsc_submission_history.tsv");
});

test("explicit GSC history env override wins over automation defaults", () => {
  const path = resolveDefaultGscHistoryPath({
    env: {
      CODEX_HOME: "/tmp/codex-home",
      GSC_HISTORY_FILE: "/tmp/custom.tsv",
    },
  });

  assert.equal(path, "/tmp/custom.tsv");
});

test("GSC artifact diagnostics use the same stable automation authority", () => {
  assert.equal(
    resolveDefaultGscArtifactDir({
      env: { CODEX_HOME: "/tmp/codex-home" },
      homeDir: "/tmp/home",
    }),
    "/tmp/codex-home/automations/venturedex-daily-curator/gsc-artifacts",
  );
  assert.equal(
    resolveDefaultGscArtifactDir({
      env: {
        CODEX_HOME: "/tmp/codex-home",
        GSC_ARTIFACT_DIR: "/tmp/custom-artifacts",
      },
    }),
    "/tmp/custom-artifacts",
  );
});

function historyHeaderForTest(): string {
  return "timestamp\tstatus\turl\tmessage\n";
}
