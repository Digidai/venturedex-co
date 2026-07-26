import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  latestDailyStartups,
  latestWeeklyIssue,
  loadPublishedWeeklyIssues,
  loadStartups,
  startupUrl,
  weeklyUrl,
  writeText,
} from "./content";

export interface GscLedgerRow {
  timestamp: string;
  status: string;
  url: string;
  message: string;
}

export type GscStatusKind = "complete" | "needs_submit" | "blocked" | "missing" | "skipped";

export interface GscUrlDiagnostic {
  label: string;
  url: string;
  kind: GscStatusKind;
  latest: GscLedgerRow | null;
  message: string;
}

export function defaultGscHistoryPath(): string {
  return resolveDefaultGscHistoryPath();
}

export function resolveDefaultGscHistoryPath(options: {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
} = {}): string {
  const env = options.env ?? process.env;
  const explicit = env.HISTORY_FILE || env.GSC_HISTORY_FILE;
  if (explicit) return explicit;

  const codeHome = env.CODEX_HOME || join(options.homeDir ?? homedir(), ".codex");
  // The automation-scoped ledger is the only default authority. A missing
  // central file must surface as missing evidence; silently falling back to
  // the stale repo-local ledger can turn legacy rows into false completion.
  // Operators may still select another authority explicitly with HISTORY_FILE
  // or GSC_HISTORY_FILE, while legacy import remains an explicit submit-script
  // migration step.
  return join(
    codeHome,
    "automations",
    "venturedex-daily-curator",
    "gsc_submission_history.tsv"
  );
}

export function parseGscLedgerText(text: string): GscLedgerRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rows = lines[0]?.startsWith("timestamp\t") ? lines.slice(1) : lines;
  return rows
    .map((line) => {
      const [timestamp = "", status = "", url = "", ...messageParts] = line.split("\t");
      return {
        timestamp: timestamp.trim(),
        status: status.trim(),
        url: normalizeCanonicalUrl(url),
        message: messageParts.join("\t").trim(),
      };
    })
    .filter((row) => row.url);
}

export function readGscLedger(path = defaultGscHistoryPath()): GscLedgerRow[] {
  if (!existsSync(path)) return [];
  return parseGscLedgerText(readFileSync(path, "utf8"));
}

export function latestGscStatus(rows: GscLedgerRow[], url: string): GscLedgerRow | null {
  const target = normalizeCanonicalUrl(url);
  const matching = rows.filter((row) => row.url === target);
  if (matching.length === 0) return null;

  // A dry run is a preview, not a state transition. It must not downgrade an
  // earlier requested row or hide an unresolved retry/quota/live-check blocker.
  // When no operational row exists yet, the newest dry-run remains useful as
  // explicit "needs submit" evidence.
  return [...matching].reverse().find((row) => row.status !== "dry_run")
    ?? matching[matching.length - 1];
}

export function classifyGscStatus(row: GscLedgerRow | null): { kind: GscStatusKind; message: string } {
  if (!row) return { kind: "missing", message: "no ledger row" };
  switch (row.status) {
    case "requested":
      return { kind: "complete", message: `requested at ${row.timestamp}` };
    case "dry_run":
      return { kind: "needs_submit", message: `dry-run only at ${row.timestamp}` };
    case "stopped_mismatch":
    case "live_check_failed":
    case "retry_pending":
    case "quota_exceeded":
      return { kind: "blocked", message: `${row.status} at ${row.timestamp}: ${row.message}` };
    case "already_requested":
      return { kind: "skipped", message: `already requested at ${row.timestamp}` };
    default:
      return { kind: "needs_submit", message: `${row.status || "unknown"} at ${row.timestamp}` };
  }
}

export function buildLatestGscDiagnostics(rows = readGscLedger()): GscUrlDiagnostic[] {
  const startups = latestDailyStartups(loadStartups());
  const weekly = latestWeeklyIssue(loadPublishedWeeklyIssues());
  const targets = startups.map((startup) => ({
    label: startup.product_name,
    url: startupUrl(startup.slug),
  }));
  if (weekly) {
    targets.push({
      label: `Weekly #${weekly.issue_number}: ${weekly.title}`,
      url: weeklyUrl(weekly.issue_number),
    });
  }

  return targets.map((target) => {
    const latest = latestGscStatus(rows, target.url);
    const classification = classifyGscStatus(latest);
    return {
      ...target,
      latest,
      kind: classification.kind,
      message: classification.message,
    };
  });
}

export function renderGscDiagnosticsMarkdown(input: {
  generatedAt: string;
  historyPath: string;
  diagnostics: GscUrlDiagnostic[];
}): string {
  const counts = countBy(input.diagnostics.map((diagnostic) => diagnostic.kind));
  const lines: string[] = [];
  lines.push(`# VentureDex GSC Diagnostics - ${input.generatedAt.slice(0, 10)}`);
  lines.push("");
  lines.push(`Generated at ${input.generatedAt}.`);
  lines.push(`History file: ${input.historyPath}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Complete: ${counts.complete ?? 0}`);
  lines.push(`- Needs submit: ${counts.needs_submit ?? 0}`);
  lines.push(`- Blocked: ${counts.blocked ?? 0}`);
  lines.push(`- Missing: ${counts.missing ?? 0}`);
  lines.push(`- Skipped: ${counts.skipped ?? 0}`);
  lines.push("");
  lines.push("## URL State");
  for (const diagnostic of input.diagnostics) {
    lines.push(`- ${diagnostic.label}: ${diagnostic.kind} - ${diagnostic.message} - ${diagnostic.url}`);
  }
  lines.push("");
  lines.push("## Rules");
  lines.push("- Treat `requested` as complete.");
  lines.push("- Treat `dry_run` as preview only; it is not a Google indexing request.");
  lines.push("- Treat `retry_pending`, `quota_exceeded`, `live_check_failed`, and mismatches as blocked until visible Search Console state or the ledger changes.");
  lines.push("- Do not infer success from hidden DOM text or a stale `REQUEST INDEXING` button.");
  lines.push("");
  return `${lines.join("\n").trim()}\n`;
}

export function normalizeCanonicalUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\.html$/i, "");
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

export function writeGscDiagnosticsReport(path: string, body: string): void {
  writeText(path, body);
}
