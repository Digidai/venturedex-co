import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const scriptsDir = join(repoRoot, "scripts");
const rejectedPath = join(repoRoot, "content", "rejected.jsonl");
const legacyLines = readFileSync(rejectedPath, "utf8").trim().split("\n");
const pythonProgram = [
  "import json",
  "import sys",
  "from pathlib import Path",
  "sys.path.insert(0, sys.argv[1])",
  "import validate",
  "active, errors, warnings = validate.validate_rejected_file(",
  "    set(json.loads(sys.argv[3])), Path(sys.argv[2])",
  ")",
  "print(json.dumps({'active': active, 'errors': errors, 'warnings': warnings}))",
].join("\n");

interface ValidationResult {
  active: number;
  errors: string[];
  warnings: string[];
}

function validateFile(path: string, startupSlugs: string[] = []): ValidationResult {
  return JSON.parse(
    execFileSync(
      "python3",
      ["-c", pythonProgram, scriptsDir, path, JSON.stringify(startupSlugs)],
      {
        encoding: "utf8",
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      }
    )
  ) as ValidationResult;
}

function validateLines(
  lines: string[],
  startupSlugs: string[] = []
): ValidationResult {
  const temp = mkdtempSync(join(tmpdir(), "vd-rejected-validator-"));
  const path = join(temp, "rejected.jsonl");
  try {
    writeFileSync(path, `${lines.join("\n")}\n`);
    return validateFile(path, startupSlugs);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function validateEntries(
  entries: Array<Record<string, unknown>>,
  startupSlugs: string[] = []
): ValidationResult {
  return validateLines(
    [...legacyLines, ...entries.map((entry) => JSON.stringify(entry))],
    startupSlugs
  );
}

function activeV2(slug = "example-company"): Record<string, unknown> {
  return {
    schema_version: 2,
    slug,
    company_url: "https://example.com/",
    decision_source_url: "https://news.example.com/example-company-seed",
    decision_source_type: "funding",
    rejected_at: "2026-07-26",
    stage: "F3",
    reason: "The reported financing does not disclose an eligible round stage.",
    lifecycle: {
      status: "active",
      revisit_triggers: ["later_funding_round", "governance_change"],
    },
  };
}

test("the 872 schema-less rows remain valid legacy v1 entries", () => {
  const result = validateFile(rejectedPath);

  assert.equal(legacyLines.length, 872);
  assert.equal(result.active, 872);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("a complete v2 active rejection keeps company and decision URLs explicit", () => {
  const result = validateEntries([activeV2()]);

  assert.equal(result.active, 873);
  assert.deepEqual(result.errors, []);
});

test("a superseded v2 rejection preserves history only for an accepted startup", () => {
  const entry = activeV2();
  entry.lifecycle = {
    status: "superseded",
    revisit_triggers: ["later_funding_round", "new_product_evidence"],
    resolution: {
      resolved_at: "2026-08-02",
      trigger: "new_product_evidence",
      outcome: "accepted",
      note: "New official product evidence cleared the original F1 rejection.",
    },
  };

  const accepted = validateEntries([entry], ["example-company"]);
  assert.equal(accepted.active, 872);
  assert.deepEqual(accepted.errors, []);

  const orphaned = validateEntries([entry]);
  assert.match(
    orphaned.errors.join("\n"),
    /superseded rejection must resolve to an existing content\/startups entry/
  );
});

test("v2 fails closed when URL roles or lifecycle fields are incomplete", () => {
  const result = validateEntries([
    {
      schema_version: 2,
      slug: "ambiguous-company",
      url: "https://news.example.com/ambiguous-company",
      date: "2026-07-26",
      stage: "F1",
      reason: "The product cannot be evaluated from public evidence.",
      lifecycle: {
        status: "active",
        revisit_triggers: [],
      },
    },
  ]);
  const errors = result.errors.join("\n");

  assert.match(errors, /unsupported fields: date, url/);
  assert.match(errors, /v2 missing field: company_url/);
  assert.match(errors, /v2 missing field: decision_source_url/);
  assert.match(errors, /v2 lifecycle\.revisit_triggers must be a non-empty array/);
});

test("v2 rejects unsupported triggers and incomplete superseded resolutions", () => {
  const entry = activeV2();
  entry.lifecycle = {
    status: "superseded",
    revisit_triggers: ["rumor"],
    resolution: {
      resolved_at: "2026-07-25",
      trigger: "new_product_evidence",
      outcome: "rejected",
      note: "",
    },
  };

  const errors = validateEntries([entry], ["example-company"]).errors.join("\n");
  assert.match(errors, /unsupported values: rumor/);
  assert.match(errors, /resolved_at must be on or after rejected_at/);
  assert.match(errors, /resolution\.trigger must be listed in revisit_triggers/);
  assert.match(errors, /resolution\.outcome must be 'accepted'/);
  assert.match(errors, /resolution\.note must be a non-empty string/);
});

test("a schema-less row cannot masquerade as a partial v2 entry", () => {
  const result = validateEntries([
    {
      slug: "partial-v2",
      url: "https://example.com/",
      date: "2026-07-26",
      stage: "F1",
      reason: "The public product evidence is incomplete.",
      company_url: "https://example.com/",
    },
  ]);

  assert.match(
    result.errors.join("\n"),
    /schema-less legacy entry contains v2 fields .*add schema_version: 2/
  );
});

test("a schema-less row appended after the frozen legacy block is rejected", () => {
  const result = validateEntries([
    {
      slug: "new-legacy-row",
      url: "https://example.com/new-legacy-row",
      date: "2026-07-26",
      stage: "F1",
      reason: "This post-v2 row must not use the legacy shape.",
    },
  ]);

  assert.match(
    result.errors.join("\n"),
    /rejected\.jsonl:873 new rejected entries must use schema_version: 2/
  );
});

test("v2 rejects wrong JSON types instead of crashing", () => {
  const entry = activeV2();
  entry.decision_source_type = ["funding"];
  entry.stage = { value: "F3" };
  entry.lifecycle = {
    status: ["active"],
    revisit_triggers: ["later_funding_round"],
  };

  const errors = validateEntries([entry]).errors.join("\n");
  assert.match(errors, /invalid decision_source_type/);
  assert.match(errors, /invalid rejection stage/);
  assert.match(errors, /invalid lifecycle status/);
});

test("deleting a frozen legacy row fails closed", () => {
  const result = validateLines(legacyLines.slice(0, -1));
  assert.match(result.errors.join("\n"), /legacy v1 block was shortened/);
});

test("a missing or empty rejection registry fails closed", () => {
  const temp = mkdtempSync(join(tmpdir(), "vd-rejected-validator-"));
  const missing = join(temp, "missing.jsonl");
  const empty = join(temp, "empty.jsonl");
  try {
    writeFileSync(empty, "");
    assert.match(validateFile(missing).errors.join("\n"), /rejected\.jsonl is missing/);
    assert.match(validateFile(empty).errors.join("\n"), /rejected\.jsonl is empty/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("reordering frozen legacy rows fails the ordered slug digest", () => {
  const reordered = [...legacyLines];
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];

  const result = validateLines(reordered);
  assert.match(result.errors.join("\n"), /legacy v1 ordered slug digest mismatch/);
});

test("editing a frozen legacy row fails even when its slug stays in place", () => {
  const edited = [...legacyLines];
  const first = JSON.parse(edited[0]) as Record<string, unknown>;
  first.reason = "Rewritten historical decision without a governed migration.";
  edited[0] = JSON.stringify(first);

  const result = validateLines(edited);
  assert.match(result.errors.join("\n"), /frozen legacy v1 block digest mismatch/);
});

test("an in-place v2 upgrade requires an explicit governance digest update", () => {
  const upgraded = [...legacyLines];
  upgraded[0] = JSON.stringify(activeV2("anthropic-claude"));

  const result = validateLines(upgraded);
  assert.match(result.errors.join("\n"), /frozen legacy v1 block digest mismatch/);
});
