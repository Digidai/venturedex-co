import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { TextDecoder } from "node:util";
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

const GSC_LEDGER_STATUSES = new Set([
  "requested",
  "dry_run",
  "retry_pending",
  "stopped_mismatch",
  "live_check_failed",
  "quota_exceeded",
  "request_click_pending",
  "pre_request_success_unverified",
  "post_request_target_unverified",
  "post_request_confirmation_unknown",
]);

export interface GscReconciliationArtifact {
  path: string;
  targetKey: string | null;
  globalBlock: boolean;
  timestamp: string;
  status:
    | "ledger_write_failed_after_request"
    | "pre_request_success_unverified"
    | "post_request_target_unverified"
    | "post_request_confirmation_unknown";
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

export function defaultGscArtifactDir(): string {
  return resolveDefaultGscArtifactDir();
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

export function resolveDefaultGscArtifactDir(options: {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
} = {}): string {
  const env = options.env ?? process.env;
  if (env.GSC_ARTIFACT_DIR) return env.GSC_ARTIFACT_DIR;
  const codeHome = env.CODEX_HOME || join(options.homeDir ?? homedir(), ".codex");
  return join(
    codeHome,
    "automations",
    "venturedex-daily-curator",
    "gsc-artifacts"
  );
}

export function parseGscLedgerText(text: string): GscLedgerRow[] {
  if (/\r(?!\n)|[\v\f\u001c-\u001f\u0085\ufeff\u2028\u2029]/u.test(text)) {
    throw new Error("Invalid GSC ledger line separator");
  }
  const lines = text.split(/\r?\n/);
  const expectedHeader = "timestamp\tstatus\turl\tmessage";
  if (lines[0] !== expectedHeader) {
    throw new Error("Invalid GSC ledger header");
  }
  const rows: GscLedgerRow[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const columns = line.split("\t");
    if (columns.length !== 4) {
      throw new Error(
        `Invalid GSC ledger row at line ${index + 1}: expected 4 columns`,
      );
    }
    const [timestamp, status, url, message] = columns;
    if (
      !timestamp.trim()
      || !status.trim()
      || !url.trim()
      || timestamp !== timestamp.trim()
      || status !== status.trim()
      || url !== url.trim()
    ) {
      throw new Error(
        `Invalid GSC ledger row at line ${index + 1}: timestamp, status, and url are required and cannot have outer whitespace`,
      );
    }
    if (!isCanonicalGscDetailUrl(url)) {
      throw new Error(
        `Invalid GSC ledger row at line ${index + 1}: url must be a canonical VentureDex detail URL`,
      );
    }
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(timestamp)) {
      throw new Error(
        `Invalid GSC ledger row at line ${index + 1}: timestamp must use YYYY-MM-DD HH:MM:SS`,
      );
    }
    if (!GSC_LEDGER_STATUSES.has(status)) {
      throw new Error(
        `Invalid GSC ledger row at line ${index + 1}: unknown status ${JSON.stringify(status)}`,
      );
    }
    rows.push({
      timestamp,
      status,
      url,
      message: message.trim(),
    });
  }
  return rows;
}

export function readGscLedger(path = defaultGscHistoryPath()): GscLedgerRow[] {
  let descriptor: number;
  try {
    descriptor = openSync(
      path,
      fsConstants.O_RDONLY
        | fsConstants.O_NONBLOCK
        | (fsConstants.O_NOFOLLOW ?? 0),
    );
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "ENOENT"
    ) {
      return [];
    }
    throw new Error(
      `GSC ledger must be a readable regular, non-symlink file: ${path}`,
      { cause: error },
    );
  }
  let bytes: Buffer;
  try {
    const openedStat = fstatSync(descriptor);
    if (!openedStat.isFile()) {
      throw new Error(
        `GSC ledger must be a regular, non-symlink file: ${path}`,
      );
    }
    if (openedStat.nlink !== 1) {
      throw new Error(
        `GSC ledger must not have hard-link aliases: ${path}`,
      );
    }
    bytes = readFileSync(descriptor);
    const currentStat = lstatSync(path);
    if (
      !currentStat.isFile()
      || currentStat.isSymbolicLink()
      || currentStat.nlink !== 1
      || currentStat.dev !== openedStat.dev
      || currentStat.ino !== openedStat.ino
    ) {
      throw new Error(
        `GSC ledger path changed while reading: ${path}`,
      );
    }
  } finally {
    closeSync(descriptor);
  }
  const text = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  }).decode(bytes);
  return parseGscLedgerText(text);
}

export function readGscReconciliationArtifacts(
  directory = defaultGscArtifactDir()
): GscReconciliationArtifact[] {
  if (!existsSync(directory)) {
    try {
      const stat = lstatSync(directory);
      if (stat.isSymbolicLink()) {
        throw new Error(`GSC artifact directory is a broken symlink: ${directory}`);
      }
    } catch (error) {
      if (
        error
        && typeof error === "object"
        && "code" in error
        && error.code === "ENOENT"
      ) {
        return [];
      }
      throw error;
    }
    throw new Error(`GSC artifact directory is not reachable: ${directory}`);
  }
  const statuses = new Set<GscReconciliationArtifact["status"]>([
    "ledger_write_failed_after_request",
    "pre_request_success_unverified",
    "post_request_target_unverified",
    "post_request_confirmation_unknown",
  ]);
  const artifacts: GscReconciliationArtifact[] = [];

  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith(".txt")) continue;
    const path = join(directory, name);
    const status = [...statuses].find((candidate) => (
      name.includes(`-${candidate}-`)
    ));
    if (!status) continue;
    const marker = `-${status}-`;
    const artifactTarget = name.slice(
      name.indexOf(marker) + marker.length,
      -".txt".length,
    );
    const hashedTarget = /^.+--sha256-[0-9a-f]{12}$/.test(artifactTarget);
    let nonRegularEntry = true;
    try {
      const stat = lstatSync(path);
      nonRegularEntry = stat.isSymbolicLink() || !stat.isFile();
    } catch {
      // A directory race or unreadable entry is not clean evidence.
    }
    let text = "";
    let decodeFailed = false;
    if (!nonRegularEntry) {
      try {
        const bytes = readFileSync(path);
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        // The submitter treats the existence of the durable filename itself as
        // a blocker. Diagnostics must fail closed the same way if it is unreadable.
        try {
          readFileSync(path);
          decodeFailed = true;
        } catch {
          // A hashed filename still scopes an unreadable artifact to one exact
          // URL identity. An unreadable legacy filename is handled globally below.
        }
      }
    }
    const fields = new Map<string, string>();
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) break;
      const separator = line.indexOf(":");
      if (separator <= 0) continue;
      fields.set(
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim()
      );
    }
    const rawUrl = fields.get("url") ?? "";
    const url = normalizeCanonicalUrl(rawUrl);
    const headerStatus = fields.get("status") ?? "";
    let globalBlock = decodeFailed || nonRegularEntry;
    if (hashedTarget) {
      if (headerStatus && headerStatus !== status) globalBlock = true;
      if (
        rawUrl
        && (
          !isCanonicalGscDetailUrl(rawUrl)
          || gscArtifactTargetKey(rawUrl) !== artifactTarget
        )
      ) {
        globalBlock = true;
      }
    } else if (
      !isCanonicalGscDetailUrl(rawUrl)
      || sanitizeGscArtifactTarget(rawUrl) !== artifactTarget
      || (headerStatus && headerStatus !== status)
    ) {
      globalBlock = true;
    }
    artifacts.push({
      path,
      targetKey: hashedTarget ? artifactTarget : null,
      globalBlock,
      timestamp: fields.get("timestamp") ?? "",
      status,
      url,
      message: fields.get("message") ?? "manual reconciliation required",
    });
  }
  return artifacts;
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
    case "request_click_pending":
    case "pre_request_success_unverified":
    case "post_request_target_unverified":
    case "post_request_confirmation_unknown":
      return { kind: "blocked", message: `${row.status} at ${row.timestamp}: ${row.message}` };
    default:
      return { kind: "needs_submit", message: `${row.status || "unknown"} at ${row.timestamp}` };
  }
}

export function classifyGscUrl(
  rows: GscLedgerRow[],
  url: string,
  artifacts: GscReconciliationArtifact[] = []
): {
  kind: GscStatusKind;
  latest: GscLedgerRow | null;
  message: string;
} {
  const normalizedUrl = normalizeCanonicalUrl(url);
  const targetKey = gscArtifactTargetKey(normalizedUrl);
  const artifact = [...artifacts]
    .reverse()
    .find((candidate) => (
      candidate.globalBlock
      || candidate.targetKey === targetKey
      || candidate.url === normalizedUrl
    ));
  const latest = latestGscStatus(rows, normalizedUrl);
  if (artifact) {
    return {
      kind: "blocked",
      latest,
      message: `${artifact.status} artifact at ${artifact.path}: ${artifact.message}`,
    };
  }
  return { latest, ...classifyGscStatus(latest) };
}

export function buildLatestGscDiagnostics(
  rows = readGscLedger(),
  artifacts = readGscReconciliationArtifacts()
): GscUrlDiagnostic[] {
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
    const classification = classifyGscUrl(rows, target.url, artifacts);
    return {
      ...target,
      latest: classification.latest,
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
  lines.push("- Treat `retry_pending`, `quota_exceeded`, `live_check_failed`, mismatches, `request_click_pending`, `pre_request_success_unverified`, `post_request_target_unverified`, and `post_request_confirmation_unknown` as blocked until visible Search Console state and the authoritative ledger are manually reconciled.");
  lines.push("- Do not infer success from hidden DOM text or a stale `REQUEST INDEXING` button.");
  lines.push("");
  return `${lines.join("\n").trim()}\n`;
}

export function normalizeCanonicalUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\.html$/i, "");
}

function sanitizeGscArtifactTarget(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "unknown";
}

export function gscArtifactTargetKey(url: string): string {
  const normalizedUrl = normalizeCanonicalUrl(url);
  const digest = createHash("sha256")
    .update(normalizedUrl, "utf8")
    .digest("hex")
    .slice(0, 12);
  return `${sanitizeGscArtifactTarget(normalizedUrl)}--sha256-${digest}`;
}

function isCanonicalGscDetailUrl(url: string): boolean {
  return /^https:\/\/venturedex\.co\/(?:startups\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|weekly\/[1-9][0-9]*)$/.test(url);
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
