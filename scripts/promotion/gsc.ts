import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
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
  "reconciliation_archive_pending",
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
  if (text && !text.endsWith("\n")) {
    throw new Error(
      "Invalid GSC ledger: non-empty input must end with a terminal LF",
    );
  }
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

interface GscArtifactAuthority {
  descriptor: number;
  path: string;
  dev: number;
  ino: number;
}

function canonicalHistoryAuthority(path: string): string {
  if (!path || /[\t\r\n\0]/.test(path)) {
    throw new Error("GSC ledger authority contains an invalid control character");
  }
  const absolute = resolve(path);
  try {
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `GSC ledger must be a regular, non-symlink file: ${absolute}`,
      );
    }
    return realpathSync(absolute);
  } catch (error) {
    if (
      !error
      || typeof error !== "object"
      || !("code" in error)
      || error.code !== "ENOENT"
    ) {
      throw error;
    }
  }

  let ancestor = dirname(absolute);
  while (true) {
    try {
      const stat = lstatSync(ancestor);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(
          `GSC ledger parent authority must be a real directory: ${ancestor}`,
        );
      }
      const canonicalAncestor = realpathSync(ancestor);
      return resolve(canonicalAncestor, relative(ancestor, absolute));
    } catch (error) {
      if (
        !error
        || typeof error !== "object"
        || !("code" in error)
        || error.code !== "ENOENT"
      ) {
        throw error;
      }
    }
    const parent = dirname(ancestor);
    if (parent === ancestor) {
      throw new Error(
        `Could not resolve GSC ledger parent authority: ${absolute}`,
      );
    }
    ancestor = parent;
  }
}

function assertCanonicalDirectory(
  path: string,
  label: string,
): { dev: number; ino: number } {
  const absolute = resolve(path);
  const pathStat = lstatSync(absolute);
  if (!pathStat.isDirectory() || pathStat.isSymbolicLink()) {
    throw new Error(`${label} must be a real, non-symlink directory: ${absolute}`);
  }
  if (realpathSync(absolute) !== absolute) {
    throw new Error(`${label} must use its exact canonical path: ${absolute}`);
  }
  const descriptor = openSync(
    absolute,
    fsConstants.O_RDONLY
      | (fsConstants.O_DIRECTORY ?? 0)
      | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    const openedStat = fstatSync(descriptor);
    if (
      !openedStat.isDirectory()
      || openedStat.dev !== pathStat.dev
      || openedStat.ino !== pathStat.ino
    ) {
      throw new Error(`${label} identity changed while opening: ${absolute}`);
    }
    return { dev: openedStat.dev, ino: openedStat.ino };
  } finally {
    closeSync(descriptor);
  }
}

function assertDirectoryIdentity(
  path: string,
  identity: { dev: number; ino: number },
  label: string,
): void {
  const observed = assertCanonicalDirectory(path, label);
  if (observed.dev !== identity.dev || observed.ino !== identity.ino) {
    throw new Error(`${label} identity changed: ${resolve(path)}`);
  }
}

function fsyncDirectory(
  path: string,
  identity?: { dev: number; ino: number },
): void {
  const descriptor = openSync(
    path,
    fsConstants.O_RDONLY
      | (fsConstants.O_DIRECTORY ?? 0)
      | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    if (identity) {
      const openedStat = fstatSync(descriptor);
      if (
        !openedStat.isDirectory()
        || openedStat.dev !== identity.dev
        || openedStat.ino !== identity.ino
      ) {
        throw new Error(
          `Directory identity changed before fsync: ${resolve(path)}`,
        );
      }
    }
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function releaseGscSnapshotLock(
  lockPath: string,
  parent: string,
  token: string,
  identity: { dev: number; ino: number },
  parentIdentity: { dev: number; ino: number },
): void {
  assertDirectoryIdentity(
    parent,
    parentIdentity,
    "GSC ledger lock parent",
  );
  const descriptor = openSync(
    lockPath,
    fsConstants.O_RDONLY
      | fsConstants.O_NONBLOCK
      | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    const openedStat = fstatSync(descriptor);
    if (
      !openedStat.isFile()
      || openedStat.nlink !== 1
      || openedStat.dev !== identity.dev
      || openedStat.ino !== identity.ino
    ) {
      throw new Error(
        `Refusing to remove a GSC snapshot lock with unknown identity: ${lockPath}`,
      );
    }
    const metadata = new TextDecoder("utf-8", { fatal: true }).decode(
      readFileSync(descriptor),
    );
    if (!metadata.split("\n").includes(`token=${token}`)) {
      throw new Error(
        `Refusing to remove a GSC snapshot lock with unknown ownership: ${lockPath}`,
      );
    }
    const currentStat = lstatSync(lockPath);
    if (
      !currentStat.isFile()
      || currentStat.isSymbolicLink()
      || currentStat.nlink !== 1
      || currentStat.dev !== identity.dev
      || currentStat.ino !== identity.ino
    ) {
      throw new Error(
        `Refusing to remove a GSC snapshot lock whose path identity changed: ${lockPath}`,
      );
    }
    assertDirectoryIdentity(
      parent,
      parentIdentity,
      "GSC ledger lock parent",
    );
    unlinkSync(lockPath);
    fsyncDirectory(parent, parentIdentity);
  } finally {
    closeSync(descriptor);
  }
}

function openGscArtifactAuthority(
  directory: string,
): GscArtifactAuthority | null {
  if (!directory || /[\t\r\n\0]/.test(directory)) {
    throw new Error(
      "GSC artifact authority contains an invalid control character",
    );
  }
  const absolute = resolve(directory);
  let pathStat;
  try {
    pathStat = lstatSync(absolute);
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "ENOENT"
    ) {
      let ancestor = dirname(absolute);
      while (true) {
        try {
          assertCanonicalDirectory(ancestor, "GSC artifact parent authority");
          return null;
        } catch (ancestorError) {
          if (
            !ancestorError
            || typeof ancestorError !== "object"
            || !("code" in ancestorError)
            || ancestorError.code !== "ENOENT"
          ) {
            throw ancestorError;
          }
        }
        const parent = dirname(ancestor);
        if (parent === ancestor) {
          throw new Error(
            `Could not resolve GSC artifact parent authority: ${absolute}`,
          );
        }
        ancestor = parent;
      }
    }
    throw error;
  }
  if (pathStat.isSymbolicLink()) {
    let targetExists = true;
    try {
      realpathSync(absolute);
    } catch {
      targetExists = false;
    }
    throw new Error(
      targetExists
        ? `GSC artifact directory must be a real, non-symlink directory: ${absolute}`
        : `GSC artifact directory is a broken symlink: ${absolute}`,
    );
  }
  if (!pathStat.isDirectory()) {
    throw new Error(`GSC artifact path is not a directory: ${absolute}`);
  }
  if (realpathSync(absolute) !== absolute) {
    throw new Error(
      `GSC artifact directory must use its exact canonical path: ${absolute}`,
    );
  }
  const descriptor = openSync(
    absolute,
    fsConstants.O_RDONLY
      | (fsConstants.O_DIRECTORY ?? 0)
      | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    const openedStat = fstatSync(descriptor);
    if (
      !openedStat.isDirectory()
      || openedStat.dev !== pathStat.dev
      || openedStat.ino !== pathStat.ino
    ) {
      throw new Error(
        `GSC artifact authority changed while opening: ${absolute}`,
      );
    }
    return {
      descriptor,
      path: absolute,
      dev: openedStat.dev,
      ino: openedStat.ino,
    };
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function assertGscArtifactAuthority(authority: GscArtifactAuthority): void {
  const pathStat = lstatSync(authority.path);
  const openedStat = fstatSync(authority.descriptor);
  if (
    !pathStat.isDirectory()
    || pathStat.isSymbolicLink()
    || pathStat.dev !== authority.dev
    || pathStat.ino !== authority.ino
    || !openedStat.isDirectory()
    || openedStat.dev !== authority.dev
    || openedStat.ino !== authority.ino
    || realpathSync(authority.path) !== authority.path
  ) {
    throw new Error(
      `GSC artifact authority changed while reading: ${authority.path}`,
    );
  }
}

export function withGscSnapshotLock<T>(
  historyPath: string,
  operation: (canonicalHistoryPath: string) => T,
): T {
  const canonicalHistoryPath = canonicalHistoryAuthority(historyPath);
  const lockPath = `${canonicalHistoryPath}.lock`;
  const parent = dirname(lockPath);
  const parentIdentity = assertCanonicalDirectory(
    parent,
    "GSC ledger lock parent",
  );

  const token = `${process.pid}:${Date.now()}:${randomBytes(16).toString("hex")}`;
  const candidatePath = `${lockPath}.diagnostics.${process.pid}.${randomBytes(8).toString("hex")}`;
  const payload = Buffer.from(
    [
      `token=${token}`,
      `pid=${process.pid}`,
      `started_at=${new Date().toISOString()}`,
      `history_file=${canonicalHistoryPath}`,
      "owner=gsc-diagnostics",
      "",
    ].join("\n"),
    "utf8",
  );

  let candidateCreated = false;
  let lockCreated = false;
  let candidateIdentity: { dev: number; ino: number } | null = null;
  let lockIdentity: { dev: number; ino: number } | null = null;
  try {
    const candidateDescriptor = openSync(
      candidatePath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    candidateCreated = true;
    try {
      const createdStat = fstatSync(candidateDescriptor);
      if (!createdStat.isFile() || createdStat.nlink !== 1) {
        throw new Error(
          `GSC ledger snapshot owner candidate has an unsafe identity: ${candidatePath}`,
        );
      }
      candidateIdentity = {
        dev: createdStat.dev,
        ino: createdStat.ino,
      };
      let offset = 0;
      while (offset < payload.length) {
        offset += writeSync(candidateDescriptor, payload, offset);
      }
      fsyncSync(candidateDescriptor);
      const candidateStat = fstatSync(candidateDescriptor);
      if (
        !candidateStat.isFile()
        || candidateStat.nlink !== 1
        || candidateStat.dev !== candidateIdentity.dev
        || candidateStat.ino !== candidateIdentity.ino
      ) {
        throw new Error(
          `GSC ledger snapshot owner candidate has an unsafe identity: ${candidatePath}`,
        );
      }
    } finally {
      closeSync(candidateDescriptor);
    }

    assertDirectoryIdentity(
      parent,
      parentIdentity,
      "GSC ledger lock parent",
    );
    try {
      linkSync(candidatePath, lockPath);
      lockCreated = true;
    } catch (error) {
      if (
        error
        && typeof error === "object"
        && "code" in error
        && error.code === "EEXIST"
      ) {
        throw new Error(
          `GSC ledger snapshot lock is already held; refusing to remove or replace it: ${lockPath}`,
          { cause: error },
        );
      }
      throw new Error(
        `Could not atomically acquire GSC ledger snapshot lock: ${lockPath}`,
        { cause: error },
      );
    }

    const candidateStat = lstatSync(candidatePath);
    const lockStat = lstatSync(lockPath);
    assertDirectoryIdentity(
      parent,
      parentIdentity,
      "GSC ledger lock parent",
    );
    if (
      candidateStat.isFile()
      && !candidateStat.isSymbolicLink()
      && candidateIdentity
      && candidateStat.dev === candidateIdentity.dev
      && candidateStat.ino === candidateIdentity.ino
      && lockStat.isFile()
      && !lockStat.isSymbolicLink()
      && candidateStat.dev === lockStat.dev
      && candidateStat.ino === lockStat.ino
    ) {
      lockIdentity = { dev: lockStat.dev, ino: lockStat.ino };
    }
    if (
      !candidateStat.isFile()
      || candidateStat.isSymbolicLink()
      || !candidateIdentity
      || candidateStat.dev !== candidateIdentity.dev
      || candidateStat.ino !== candidateIdentity.ino
      || !lockStat.isFile()
      || lockStat.isSymbolicLink()
      || candidateStat.dev !== lockStat.dev
      || candidateStat.ino !== lockStat.ino
      || candidateStat.nlink !== 2
      || lockStat.nlink !== 2
    ) {
      throw new Error(
        `GSC ledger snapshot lock identity changed during acquisition: ${lockPath}`,
      );
    }
    unlinkSync(candidatePath);
    candidateCreated = false;
    fsyncDirectory(parent, parentIdentity);

    return operation(canonicalHistoryPath);
  } finally {
    if (candidateCreated) {
      try {
        const candidateStat = lstatSync(candidatePath);
        if (
          candidateStat.isFile()
          && !candidateStat.isSymbolicLink()
          && candidateIdentity
          && candidateStat.dev === candidateIdentity.dev
          && candidateStat.ino === candidateIdentity.ino
        ) {
          unlinkSync(candidatePath);
        }
      } catch {
        // Never broaden cleanup to a path whose identity is no longer ours.
      }
    }
    if (lockCreated && lockIdentity) {
      releaseGscSnapshotLock(
        lockPath,
        parent,
        token,
        lockIdentity,
        parentIdentity,
      );
    }
  }
}

export function readGscDiagnosticSnapshot(options: {
  historyPath?: string;
  artifactDir?: string;
} = {}): {
  rows: GscLedgerRow[];
  artifacts: GscReconciliationArtifact[];
} {
  const historyPath = options.historyPath ?? defaultGscHistoryPath();
  const artifactDir = options.artifactDir ?? defaultGscArtifactDir();
  return withGscSnapshotLock(historyPath, (canonicalHistoryPath) => ({
    rows: readGscLedger(canonicalHistoryPath),
    artifacts: readGscReconciliationArtifacts(artifactDir),
  }));
}

export function readGscReconciliationArtifacts(
  directory = defaultGscArtifactDir()
): GscReconciliationArtifact[] {
  const authority = openGscArtifactAuthority(directory);
  if (!authority) return [];
  const statuses = new Set<GscReconciliationArtifact["status"]>([
    "ledger_write_failed_after_request",
    "pre_request_success_unverified",
    "post_request_target_unverified",
    "post_request_confirmation_unknown",
  ]);
  const artifacts: GscReconciliationArtifact[] = [];

  try {
    for (const name of readdirSync(authority.path).sort()) {
      assertGscArtifactAuthority(authority);
      if (!name.endsWith(".txt")) continue;
      const path = join(authority.path, name);
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
      let entryIdentity: { dev: number; ino: number } | null = null;
      try {
        const stat = lstatSync(path);
        nonRegularEntry = (
          stat.isSymbolicLink()
          || !stat.isFile()
          || stat.nlink !== 1
        );
        if (!nonRegularEntry) {
          entryIdentity = { dev: stat.dev, ino: stat.ino };
        }
      } catch {
        // A directory race or unreadable entry is not clean evidence.
      }
      let text = "";
      let decodeFailed = false;
      if (!nonRegularEntry && entryIdentity) {
        try {
          const descriptor = openSync(
            path,
            fsConstants.O_RDONLY
              | fsConstants.O_NONBLOCK
              | (fsConstants.O_NOFOLLOW ?? 0),
          );
          try {
            const openedStat = fstatSync(descriptor);
            if (
              !openedStat.isFile()
              || openedStat.nlink !== 1
              || openedStat.dev !== entryIdentity.dev
              || openedStat.ino !== entryIdentity.ino
            ) {
              throw new Error(`GSC artifact identity changed while reading: ${path}`);
            }
            const bytes = readFileSync(descriptor);
            const completedStat = fstatSync(descriptor);
            const currentStat = lstatSync(path);
            if (
              !completedStat.isFile()
              || completedStat.nlink !== 1
              || completedStat.dev !== openedStat.dev
              || completedStat.ino !== openedStat.ino
              || completedStat.size !== openedStat.size
              || completedStat.mtimeMs !== openedStat.mtimeMs
              || completedStat.ctimeMs !== openedStat.ctimeMs
              || bytes.length !== openedStat.size
              || !currentStat.isFile()
              || currentStat.isSymbolicLink()
              || currentStat.nlink !== 1
              || currentStat.dev !== openedStat.dev
              || currentStat.ino !== openedStat.ino
              || currentStat.size !== completedStat.size
              || currentStat.mtimeMs !== completedStat.mtimeMs
              || currentStat.ctimeMs !== completedStat.ctimeMs
            ) {
              throw new Error(`GSC artifact path changed while reading: ${path}`);
            }
            text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } finally {
            closeSync(descriptor);
          }
        } catch {
          // The submitter treats the existence of the durable filename itself as
          // a blocker. Diagnostics must fail closed the same way if it is unreadable.
          decodeFailed = true;
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
    assertGscArtifactAuthority(authority);
    return artifacts;
  } finally {
    closeSync(authority.descriptor);
  }
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
    case "reconciliation_archive_pending":
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
  lines.push("- Treat `retry_pending`, `quota_exceeded`, `live_check_failed`, mismatches, `request_click_pending`, `pre_request_success_unverified`, `reconciliation_archive_pending`, `post_request_target_unverified`, and `post_request_confirmation_unknown` as blocked until visible Search Console state and the authoritative ledger are manually reconciled.");
  lines.push("- Only exact zero-click `pre_request_success_unverified` evidence is eligible for `--reconcile-pre-click-retry`; post-click or ledger-write uncertainty stays blocked.");
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
