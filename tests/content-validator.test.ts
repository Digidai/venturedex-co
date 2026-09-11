import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeResearch } from "../src/lib/json";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDir = path.join(repoRoot, "scripts");

function runValidatorProbe(expression: string, input: unknown = null): unknown {
  const code = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(scriptsDir)})`,
    "import validate as validator",
    "payload = json.load(sys.stdin)",
    `print(json.dumps(${expression}))`,
  ].join("\n");
  const result = spawnSync("python3", ["-c", code], {
    cwd: repoRoot,
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("content validator accepts source-stated named rounds and explicit unnamed rounds, not ambiguous labels", () => {
  const stages = runValidatorProbe(
    "{stage: validator.is_allowed_funding_stage(stage) for stage in payload}",
    ["Unspecified", "Seed", "Series C", "Series D", "Series L", "Growth", "Series AA", "Pre-Seed"],
  );
  assert.deepEqual(stages, {
    Unspecified: true,
    Seed: true,
    "Series C": true,
    "Series D": true,
    "Series L": true,
    Growth: false,
    "Series AA": false,
    "Pre-Seed": true,
  });
});

test("unnamed financing requires an evidence-bound assessment without inventing a stage", () => {
  const valid = {
    research: {
      unnamed_round_assessment: {
        reason:
          "The financing source states no round name, while the official product and operating materials provide enough current evidence to assess the company without guessing a stage.",
        source_ids: ["official", "funding", "product"],
      },
      sources: [
        { id: "official", type: "official" },
        { id: "funding", type: "funding" },
        { id: "product", type: "product" },
      ],
      product_evidence: [
        { claim: "First product claim", source_ids: ["official", "product"] },
        { claim: "Second product claim", source_ids: ["product"] },
      ],
    },
  };
  assert.deepEqual(
    runValidatorProbe("validator.validate_unnamed_round_assessment(payload, required=True)", valid),
    [],
  );
  const missing = structuredClone(valid);
  delete (missing.research as Record<string, unknown>).unnamed_round_assessment;
  assert.deepEqual(
    runValidatorProbe("validator.validate_unnamed_round_assessment(payload, required=True)", missing),
    ["research.unnamed_round_assessment is required for funding with no source-stated stage"],
  );
});

test("Series D+ breakout exception must bind official, funding, and product evidence", () => {
  const valid = {
    research: {
      breakout_exception: {
        reason:
          "This independent private company merits late-stage review because its unusually inspectable product workflow and current market signal are both material to VentureDex readers.",
        source_ids: ["official", "funding", "product"],
      },
      sources: [
        { id: "official", type: "official" },
        { id: "funding", type: "funding" },
        { id: "product", type: "product" },
      ],
      product_evidence: [
        { claim: "First product claim", source_ids: ["official", "product"] },
        { claim: "Second product claim", source_ids: ["product"] },
      ],
    },
  };
  assert.deepEqual(
    runValidatorProbe(
      "validator.validate_breakout_exception(payload, required=True)",
      valid,
    ),
    [],
  );

  const missing = structuredClone(valid);
  delete (missing.research as Record<string, unknown>).breakout_exception;
  assert.deepEqual(
    runValidatorProbe(
      "validator.validate_breakout_exception(payload, required=True)",
      missing,
    ),
    ["research.breakout_exception is required for Series D+ funding stages"],
  );

  const weak = structuredClone(valid);
  weak.research.breakout_exception.source_ids = ["funding", "product", "missing"];
  const errors = runValidatorProbe(
    "validator.validate_breakout_exception(payload, required=True)",
    weak,
  ) as string[];
  assert.ok(errors.some((error) => error.includes("unknown research sources")));
  assert.ok(errors.some((error) => error.includes("official source")));

  const wrongTypes = structuredClone(valid) as unknown as {
    research: { breakout_exception: { reason: unknown; source_ids: string[] } };
  };
  wrongTypes.research.breakout_exception.reason = Number("9".repeat(80));
  wrongTypes.research.breakout_exception.source_ids = [
    "official",
    "funding",
    " product ",
  ];
  const typeErrors = runValidatorProbe(
    "validator.validate_breakout_exception(payload, required=True)",
    wrongTypes,
  ) as string[];
  assert.ok(typeErrors.some((error) => error.includes("reason must be a string")));
  assert.ok(typeErrors.some((error) => error.includes("exact source ids")));
});

test("research normalization preserves a validated breakout exception", () => {
  const normalized = normalizeResearch({
    verified_at: "2026-08-11",
    sources: [],
    product_evidence: [],
    breakout_exception: {
      reason: "Evidence-bound late-stage exception",
      source_ids: ["official", "funding", "product"],
    },
  });
  assert.deepEqual(normalized?.breakout_exception, {
    reason: "Evidence-bound late-stage exception",
    source_ids: ["official", "funding", "product"],
  });
});

test("research normalization preserves an unnamed-round assessment", () => {
  const normalized = normalizeResearch({
    verified_at: "2026-09-11",
    sources: [],
    product_evidence: [],
    unnamed_round_assessment: {
      reason: "Evidence-bound unnamed financing assessment",
      source_ids: ["official", "funding", "product"],
    },
  });
  assert.deepEqual(normalized?.unnamed_round_assessment, {
    reason: "Evidence-bound unnamed financing assessment",
    source_ids: ["official", "funding", "product"],
  });
});
