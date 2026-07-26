import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyGscStatus,
  latestGscStatus,
  normalizeCanonicalUrl,
  parseGscLedgerText,
  renderGscDiagnosticsMarkdown,
  resolveDefaultGscHistoryPath,
  type GscUrlDiagnostic,
} from "../scripts/promotion/gsc";

const ledger = `timestamp\tstatus\turl\tmessage
2026-06-11 10:00:00\tdry_run\thttps://venturedex.co/startups/billables-ai/\tpreview only
2026-06-11 10:02:00\tretry_pending\thttps://venturedex.co/startups/billables-ai\trequest button not found
2026-06-11 10:04:00\trequested\thttps://venturedex.co/weekly/3\tindexing requested
`;

test("parseGscLedgerText normalizes URL suffixes and keeps latest row order", () => {
  const rows = parseGscLedgerText(ledger);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].url, "https://venturedex.co/startups/billables-ai");
  assert.equal(normalizeCanonicalUrl("https://venturedex.co/weekly/3.html/"), "https://venturedex.co/weekly/3");
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
  assert.equal(classifyGscStatus(null).kind, "missing");
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
