import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const LEDGER_URL = new URL(
  "../docs/promotion/backlinks/2026-08-25-prospects.tsv",
  import.meta.url
);
const ALLOWED_STATUSES = new Set([
  "researched",
  "ready",
  "submitted",
  "accepted",
  "rejected",
  "blocked",
]);

test("backlink ledger has stable, auditable rows", () => {
  const lines = readFileSync(LEDGER_URL, "utf8").trim().split("\n");
  const header = lines[0].split("\t");
  const rows = lines.slice(1).map((line) => line.split("\t"));
  const field = (row: string[], name: string) => row[header.indexOf(name)];

  assert.deepEqual(header, [
    "id",
    "source_name",
    "source_url",
    "policy_url",
    "opportunity_type",
    "target_url",
    "relevance",
    "account_or_fee",
    "status",
    "evidence_url",
    "next_review",
    "notes",
  ]);
  assert.ok(rows.length >= 15);
  assert.ok(rows.every((row) => row.length === header.length));

  const ids = rows.map((row) => field(row, "id"));
  assert.equal(new Set(ids).size, ids.length);

  for (const row of rows) {
    assert.match(field(row, "source_url"), /^https:\/\//);
    assert.match(field(row, "policy_url"), /^https:\/\//);
    assert.match(field(row, "target_url"), /^https:\/\/venturedex\.co(?:\/|$)/);
    assert.ok(ALLOWED_STATUSES.has(field(row, "status")));
    assert.match(field(row, "next_review"), /^\d{4}-\d{2}-\d{2}$/);
  }
});
