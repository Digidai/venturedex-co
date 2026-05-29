import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
} from "@cloudflare/workers-types";

/**
 * In-memory D1 test harness.
 *
 * Wraps a synchronous `better-sqlite3` `:memory:` database in a minimal adapter
 * that mimics the subset of the Cloudflare D1 API that `src/lib` actually uses:
 *
 *   db.prepare(sql).bind(...args).first<T>(col?) / .all<T>() / .run() / .raw()
 *   db.batch([stmt, ...])
 *   db.exec(sql)
 *
 * Real SQLite SQL (ON CONFLICT DO UPDATE, COALESCE, excluded.*, datetime(...),
 * CASE, SUM(CASE ...)) runs natively, so the D1-backed functions exercise their
 * actual queries instead of mocks. The D1 API is async; better-sqlite3 is sync,
 * so results are wrapped in resolved promises.
 *
 * The object is cast to `D1Database` because we only implement the methods the
 * code under test calls — not the full surface (`dump`, `withSession`, etc.).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

/** Resolve a schema path relative to the repo root when not absolute. */
function resolveSchemaPath(schemaPath: string): string {
  return path.isAbsolute(schemaPath) ? schemaPath : path.join(REPO_ROOT, schemaPath);
}

type RawDb = Database.Database;

/** A row object as returned by better-sqlite3. */
type Row = Record<string, unknown>;

interface RunInfo {
  changes: number;
  lastInsertRowid: number | bigint;
}

function makeMeta(info?: RunInfo) {
  const changes = info ? info.changes : 0;
  const lastRowId = info ? Number(info.lastInsertRowid) : 0;
  return {
    changes,
    last_row_id: lastRowId,
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: changes,
    changed_db: changes > 0,
  };
}

/**
 * Internal prepared statement that does the real (synchronous) better-sqlite3
 * work. The public D1-shaped methods wrap these results in resolved promises so
 * `await stmt.first()/.all()/.run()` behaves like the async D1 API, while
 * `batch()` can call the sync variants inside a sqlite transaction (which
 * cannot return a promise).
 */
function buildPreparedStatement(
  raw: RawDb,
  sql: string,
  boundArgs: unknown[]
): D1PreparedStatement {
  const args = boundArgs as never[];

  function runSync<T>(): D1Result<T> {
    const info = raw.prepare(sql).run(...args);
    return {
      results: [] as T[],
      success: true,
      meta: makeMeta(info),
    } as unknown as D1Result<T>;
  }

  function firstSync<T>(column?: string): T | null {
    const stmt = raw.prepare(sql);
    // better-sqlite3 throws if .get() is used on a non-reader statement
    // (e.g. an UPDATE without RETURNING). D1 returns null in that case.
    if (!stmt.reader) {
      stmt.run(...args);
      return null;
    }
    const row = stmt.get(...args) as Row | undefined;
    if (row === undefined) return null;
    if (column !== undefined) {
      return (row[column] ?? null) as T;
    }
    return row as T;
  }

  function allSync<T>(): D1Result<T> {
    const stmt = raw.prepare(sql);
    if (!stmt.reader) {
      const info = stmt.run(...args);
      return {
        results: [] as T[],
        success: true,
        meta: makeMeta(info),
      } as unknown as D1Result<T>;
    }
    const rows = stmt.all(...args) as T[];
    return {
      results: rows,
      success: true,
      meta: makeMeta(),
    } as unknown as D1Result<T>;
  }

  function rawSync<T>(): T[] {
    const stmt = raw.prepare(sql);
    if (!stmt.reader) {
      stmt.run(...args);
      return [] as T[];
    }
    return stmt.raw().all(...args) as T[];
  }

  const statement = {
    // D1's bind() returns a new bound statement; mirror that immutability.
    bind: (...nextArgs: unknown[]): D1PreparedStatement =>
      buildPreparedStatement(raw, sql, nextArgs),
    first: async <T = unknown>(column?: string): Promise<T | null> =>
      firstSync<T>(column),
    all: async <T = unknown>(): Promise<D1Result<T>> => allSync<T>(),
    run: async <T = unknown>(): Promise<D1Result<T>> => runSync<T>(),
    raw: async <T = unknown[]>(): Promise<T[]> => rawSync<T>(),
    // Synchronous variant used by batch() inside a sqlite transaction.
    _runSync: runSync,
  };

  return statement as unknown as D1PreparedStatement;
}

interface SyncStatement {
  _runSync: <T>() => D1Result<T>;
}

/**
 * Create a fresh in-memory D1-compatible database seeded from `schemaPath`
 * (default `d1/schema.sql`, resolved relative to the repo root). Call once per
 * test (or in beforeEach) so each test gets an isolated database.
 */
export function createTestD1(schemaPath = "d1/schema.sql"): D1Database {
  const raw = new Database(":memory:");
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");

  const schemaSql = readFileSync(resolveSchemaPath(schemaPath), "utf8");
  raw.exec(schemaSql);

  const db = {
    prepare(sql: string): D1PreparedStatement {
      return buildPreparedStatement(raw, sql, []);
    },

    async batch<T = unknown>(
      statements: D1PreparedStatement[]
    ): Promise<D1Result<T>[]> {
      // D1 runs a batch as an implicit transaction. Mirror that so partial
      // failures roll back. The callback must stay synchronous (better-sqlite3
      // transactions reject promise-returning functions), so run the sync
      // variant of each statement and resolve the collected results after.
      const runAll = raw.transaction((): D1Result<T>[] =>
        statements.map((stmt) =>
          (stmt as unknown as SyncStatement)._runSync<T>()
        )
      );
      return runAll();
    },

    async exec(sql: string): Promise<D1Result> {
      raw.exec(sql);
      return {
        results: [],
        success: true,
        meta: makeMeta(),
      } as unknown as D1Result;
    },

    /** Test-only escape hatch for direct access to the underlying sqlite db. */
    __raw: raw,
  };

  return db as unknown as D1Database;
}
