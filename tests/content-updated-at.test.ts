import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createContentReaders, type TimestampEntry } from "../src/lib/content-transform";
import { buildStartupChanges } from "../src/lib/agent-resources";
import { sitemapLastmodDate } from "../src/lib/seo";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const published = "2026-07-01 12:00:00";
const firstSeen = "2026-06-30 01:02:03";
const authored = "2026-09-08 08:42:02";
const entry: TimestampEntry = { published_at: published, first_seen_at: firstSeen, updated_at: authored };
const records = ["edited", "legacy"].map((slug) => ({ slug, domain: `${slug}.example`, product_name: slug }));

function readersFor(edited: TimestampEntry = entry) {
  return createContentReaders({
    records,
    timestamps: { edited, legacy: { published_at: published, first_seen_at: firstSeen } },
    investorDirectory: {},
    collectionConfigs: [],
  });
}

test("authored update becomes UTC lastmod and a change event without changing publication", () => {
  const readers = readersFor();
  const startup = readers.getContentStartupBySlug("edited")!;
  assert.equal(startup.published_at, "2026-07-01T12:00:00Z");
  assert.equal(startup.first_seen_at, "2026-06-30T01:02:03Z");
  assert.equal(startup.created_at, startup.published_at);
  assert.equal(startup.updated_at, "2026-09-08T08:42:02Z");
  assert.equal(sitemapLastmodDate(startup.updated_at), "2026-09-08");
  const updates = buildStartupChanges(readers.getContentStartups()).items.filter((item) => item.type === "updated");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].name, "edited");
  assert.equal(updates[0].occurred_at, "2026-09-08T08:42:02.000Z");
  assert.deepEqual(readers.getContentStartupsPublishedBetween("2026-09-08 00:00:00", "2026-09-09 00:00:00"), []);
});

test("missing and equal updates preserve legacy deterministic transform behavior", () => {
  const legacy = readersFor({ published_at: published, first_seen_at: firstSeen }).getContentStartups();
  assert.ok(legacy.every((startup) => startup.updated_at === startup.published_at));
  assert.equal(buildStartupChanges(legacy).items.filter((item) => item.type === "updated").length, 0);
  const equal = readersFor({ ...entry, updated_at: published }).getContentStartupBySlug("edited")!;
  assert.equal(equal.updated_at, equal.published_at);
  const missing = readersFor({}).getContentStartupBySlug("edited")!;
  assert.equal(missing.updated_at, "");
});

test("authored UTC timestamps accept real leap days without local timezone conversion", () => {
  const leap = readersFor({ ...entry, updated_at: "2028-02-29 23:59:59" }).getContentStartupBySlug("edited")!;
  assert.equal(leap.updated_at, "2028-02-29T23:59:59Z");
});

const invalidUpdates: unknown[] = [
  null, "", 123, "2026-09-08", "2026-09-08T08:42:02Z", "2026-09-08 08:42:02+08:00",
  "2026-09-08 08:42:02 ", "2026-02-29 00:00:00", "2026-02-30 00:00:00",
  "2026-13-01 00:00:00", "2026-09-08 24:00:00", "2026-09-08 00:60:00", "0000-01-01 00:00:00",
];

test("transform rejects malformed or impossible authored timestamps", () => {
  for (const updated_at of invalidUpdates) {
    assert.throws(
      () => readersFor({ ...entry, updated_at } as TimestampEntry).getContentStartups(),
      /edited\.updated_at must be UTC YYYY-MM-DD HH:MM:SS/,
      JSON.stringify(updated_at)
    );
  }
});

test("authored timestamp requires a valid publication and cannot predate it", () => {
  for (const published_at of [null, "", "2026-02-30 00:00:00", "2026-07-01T12:00:00Z"]) {
    assert.throws(
      () => readersFor({ ...entry, published_at }).getContentStartups(),
      /published_at must be UTC YYYY-MM-DD HH:MM:SS when updated_at is set/
    );
  }
  assert.throws(
    () => readersFor({ ...entry, updated_at: "2026-07-01 11:59:59" }).getContentStartups(),
    /updated_at must not be earlier than published_at/
  );
});

function seedFixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "vd-authored-date-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const startupsDir = join(root, "startups");
  const weeklyDir = join(root, "weekly");
  mkdirSync(startupsDir);
  mkdirSync(weeklyDir);
  for (const record of records) writeFileSync(join(startupsDir, `${record.slug}.json`), JSON.stringify(record));
  writeFileSync(join(weeklyDir, "001.json"), JSON.stringify({ issue_number: 1, title: "Fixture", status: "published", published_at: published, picks: [] }));
  const timestampsFile = join(root, "timestamps.json");
  const output = join(root, "seed.sql");
  const canonical = join(root, "canonical.json");
  const timestamps: Record<string, TimestampEntry> = {
    edited: { ...entry },
    legacy: { published_at: published, first_seen_at: firstSeen },
  };
  const run = () => {
    writeFileSync(timestampsFile, JSON.stringify(timestamps));
    return spawnSync("bash", [join(repoRoot, "scripts/build-db.sh")], {
      env: {
        ...process.env,
        VENTUREDEX_STARTUPS_DIR: startupsDir,
        VENTUREDEX_WEEKLY_DIR: weeklyDir,
        VENTUREDEX_TIMESTAMPS_FILE: timestampsFile,
        VENTUREDEX_SEED_OUTPUT: output,
        EMIT_CANONICAL_JSON: canonical,
      },
      encoding: "utf8",
    });
  };
  const seed = () => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(output, "utf8");
  };
  const timestampGate = () => {
    writeFileSync(timestampsFile, JSON.stringify(timestamps));
    const result = spawnSync("python3", ["-c", "import json, validate; print(json.dumps(validate.validate_timestamps({'edited', 'legacy'})))"], {
      cwd: join(repoRoot, "scripts"),
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", VENTUREDEX_TIMESTAMPS_FILE: timestampsFile },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout) as string[];
  };
  return { timestamps, run, seed, canonical, timestampGate };
}

test("D1 seed uses authored updates on insert/upsert and preserves legacy dates on repeated seeds", (t) => {
  const fixture = seedFixture(t);
  const seed = fixture.seed();
  const raw = new Database(":memory:");
  t.after(() => raw.close());
  raw.exec(readFileSync(join(repoRoot, "d1/schema.sql"), "utf8"));
  raw.exec(seed);
  const row = (slug: string) => raw.prepare("SELECT published_at, first_seen_at, created_at, updated_at FROM startups WHERE slug = ?").get(slug) as Record<string, string>;
  assert.equal(row("edited").updated_at, authored);
  assert.match(row("legacy").updated_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  const created = row("edited").created_at;
  const legacyUpdate = "2026-07-02 03:04:05";
  raw.prepare("UPDATE startups SET updated_at = ? WHERE slug = 'legacy'").run(legacyUpdate);
  raw.prepare("UPDATE startups SET updated_at = ? WHERE slug = 'edited'").run(published);

  assert.equal(fixture.seed(), seed, "same source must generate byte-identical SQL and fingerprint");
  raw.exec(seed);
  assert.deepEqual(row("edited"), { published_at: published, first_seen_at: firstSeen, created_at: created, updated_at: authored });
  assert.equal(row("legacy").updated_at, legacyUpdate, "unmodified legacy row must not acquire the new seed clock");
  const canonical = JSON.parse(readFileSync(fixture.canonical, "utf8"));
  assert.equal(canonical.startups.edited.updated_at, authored);
  assert.equal(canonical.startups.legacy.updated_at, null);
  const publishedInUpdateWindow = raw.prepare("SELECT slug FROM startups WHERE workflow_status = 'published' AND published_at > ? AND published_at <= ?").all("2026-09-08 00:00:00", "2026-09-09 00:00:00");
  assert.deepEqual(publishedInUpdateWindow, [], "updating content must not make it newly published for newsletter selection");

  delete fixture.timestamps.edited.updated_at;
  raw.exec(fixture.seed());
  assert.equal(row("edited").updated_at, authored, "absent authored value must retain the existing D1 timestamp");
});

test("authored update participates in the D1 source fingerprint", (t) => {
  const fixture = seedFixture(t);
  const fingerprint = (sql: string) => sql.match(/Source fingerprint: sha256:([a-f0-9]{64})/)?.[1];
  const before = fingerprint(fixture.seed());
  fixture.timestamps.edited.updated_at = "2026-09-08 08:42:03";
  const after = fingerprint(fixture.seed());
  assert.ok(before && after);
  assert.notEqual(before, after);
});

test("D1 rejects the same invalid authored timestamps and pre-publication revisions", (t) => {
  const fixture = seedFixture(t);
  for (const updated_at of [...invalidUpdates, "2026-07-01 11:59:59"]) {
    fixture.timestamps.edited = { ...entry, updated_at } as TimestampEntry;
    const result = fixture.run();
    assert.notEqual(result.status, 0, JSON.stringify(updated_at));
    assert.match(result.stderr, /edited\.updated_at must (?:be UTC|not be earlier than published_at)/);
  }
});

test("content gate accepts omitted/equal/leap UTC updates and rejects invalid or early revisions", (t) => {
  const fixture = seedFixture(t);
  assert.deepEqual(fixture.timestampGate(), []);
  fixture.timestamps.edited.updated_at = published;
  assert.deepEqual(fixture.timestampGate(), []);
  fixture.timestamps.edited.updated_at = "2028-02-29 23:59:59";
  assert.deepEqual(fixture.timestampGate(), []);
  for (const updated_at of [...invalidUpdates, "2026-07-01 11:59:59"]) {
    fixture.timestamps.edited = { ...entry, updated_at } as TimestampEntry;
    assert.ok(
      fixture.timestampGate().some((error) => /edited\.updated_at must (?:be UTC|not be earlier than published_at)/.test(error)),
      JSON.stringify(updated_at)
    );
  }
});
