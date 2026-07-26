import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const buildDb = join(repoRoot, "scripts/build-db.sh");
const manage = join(repoRoot, "scripts/manage.sh");
const checkGithubActions = join(repoRoot, "scripts/check-github-actions.sh");

function temporaryContentFixture(): {
  root: string;
  startupsDir: string;
  timestampsFile: string;
  output: string;
  slug: string;
} {
  const root = mkdtempSync(join(tmpdir(), "vd-release-gate-"));
  const startupsDir = join(root, "startups");
  mkdirSync(startupsDir);

  const sourceName = readdirSync(join(repoRoot, "content/startups"))
    .filter((name) => name.endsWith(".json"))
    .sort()[0];
  assert.ok(sourceName, "the repository must contain a startup fixture");
  copyFileSync(
    join(repoRoot, "content/startups", sourceName),
    join(startupsDir, sourceName)
  );

  const slug = basename(sourceName, ".json");
  const timestampsFile = join(root, "timestamps.json");
  writeFileSync(
    timestampsFile,
    JSON.stringify({
      [slug]: {
        published_at: "2026-07-01 12:00:00",
        first_seen_at: "2026-07-01 12:00:00",
      },
    })
  );

  return {
    root,
    startupsDir,
    timestampsFile,
    output: join(root, "generated-seed.sql"),
    slug,
  };
}

function buildEnv(
  fixture: ReturnType<typeof temporaryContentFixture>
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    VENTUREDEX_STARTUPS_DIR: fixture.startupsDir,
    VENTUREDEX_TIMESTAMPS_FILE: fixture.timestampsFile,
    VENTUREDEX_SEED_OUTPUT: fixture.output,
  };
}

function remoteSchemaPayload(options: { brokenWeekly?: boolean } = {}): string {
  const tables: Array<[string, string[]]> = [
    [
      "startups",
      [
        "id", "slug", "domain", "canonical_url", "product_name", "summary",
        "editor_note", "research_json", "editor_rating", "why_featured",
        "product_type", "funding_stage", "funding_display", "founded_year",
        "team_size", "hq_location", "region", "tags", "investors", "links_json",
        "is_featured", "screenshot_r2_key", "screenshot_status",
        "workflow_status", "codex_stage", "first_seen_at", "published_at",
        "created_at", "updated_at",
      ],
    ],
    [
      "weekly_issues",
      [
        "id", "issue_number", "title", "editorial_intro", "published_at",
        ...(options.brokenWeekly ? [] : ["status"]),
      ],
    ],
    [
      "weekly_issue_startups",
      ["issue_id", "startup_id", "display_order", "issue_note"],
    ],
    [
      "funding_rounds",
      [
        "id", "company_name", "company_slug", "company_url", "amount", "stage",
        "lead_investor", "date", "source_url", "source_name",
      ],
    ],
    ["investors", ["id", "slug", "name", "short_name", "website", "description"]],
    ["search_index_terms", ["startup_id", "normalized_term", "term_type", "weight"]],
    ["collections", ["id", "slug", "title", "description", "type", "published"]],
    ["collection_startups", ["collection_id", "startup_id", "rank", "pinned"]],
    [
      "newsletter_subscriptions",
      [
        "id", "email", "preferences_json", "status", "source",
        "unsubscribe_token", "created_at", "confirmed_at", "unsubscribed_at",
        "updated_at",
      ],
    ],
    [
      "newsletter_sends",
      [
        "id", "send_key", "newsletter_type", "status", "subject",
        "preview_text", "html_main", "text_main", "period_start", "period_end",
        "item_count", "recipient_count", "provider", "provider_batch_ids",
        "error_log", "created_at", "sent_at", "updated_at",
      ],
    ],
    [
      "newsletter_deliveries",
      [
        "id", "send_id", "subscription_id", "email", "status",
        "provider_message_id", "error_message", "created_at", "sent_at",
        "updated_at",
      ],
    ],
    ["rate_limits", ["bucket", "count", "window_start"]],
  ];
  const payload: Array<{ results: Array<Record<string, unknown>> }> = tables.map(([, columns]) => ({
    results: columns.map((name, cid) => ({
      cid,
      name,
      type: "TEXT",
      notnull: 0,
      dflt_value: null,
      pk: name === "id" || name === "bucket" ? 1 : 0,
    })),
  }));
  payload.push({
    results: [
      { constraint_name: "startups.slug", ok: 1 },
      { constraint_name: "weekly_issues.issue_number", ok: 1 },
      { constraint_name: "investors.slug", ok: 1 },
      { constraint_name: "newsletter_subscriptions.email", ok: 1 },
      { constraint_name: "newsletter_sends.send_key", ok: 1 },
      {
        constraint_name: "newsletter_deliveries.send_id,subscription_id",
        ok: 1,
      },
    ],
  });
  return JSON.stringify(payload);
}

function temporaryRemotePreflightRepo(): {
  root: string;
  repo: string;
  bin: string;
  marker: string;
  seedHash: string;
  slug: string;
  weeklyIssue: number;
} {
  const root = mkdtempSync(join(tmpdir(), "vd-remote-preflight-"));
  const repo = join(root, "repo");
  const bin = join(root, "bin");
  const marker = join(root, "deploy-called");
  const startupSourceName = readdirSync(join(repoRoot, "content/startups"))
    .filter((name) => name.endsWith(".json"))
    .sort()[0];
  assert.ok(startupSourceName);
  const slug = basename(startupSourceName, ".json");
  const timestamps = JSON.parse(
    readFileSync(join(repoRoot, "content/timestamps.json"), "utf8")
  );
  const weeklySourceName = readdirSync(join(repoRoot, "content/weekly"))
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => Number.parseInt(left) - Number.parseInt(right))
    .find((name) => {
      const issue = JSON.parse(
        readFileSync(join(repoRoot, "content/weekly", name), "utf8")
      );
      return issue.status === "published";
    });
  assert.ok(weeklySourceName);
  const weeklyIssueData = JSON.parse(
    readFileSync(join(repoRoot, "content/weekly", weeklySourceName), "utf8")
  );
  const weeklyIssue = weeklyIssueData.issue_number as number;

  for (const directory of [
    join(repo, "scripts"),
    join(repo, "d1"),
    join(repo, "content/startups"),
    join(repo, "content/weekly"),
    join(repo, "dist/server"),
    bin,
  ]) {
    mkdirSync(directory, { recursive: true });
  }
  for (const [source, target] of [
    [manage, join(repo, "scripts/manage.sh")],
    [buildDb, join(repo, "scripts/build-db.sh")],
    [
      join(repoRoot, "scripts/load-local-env.sh"),
      join(repo, "scripts/load-local-env.sh"),
    ],
    [join(repoRoot, "d1/schema.sql"), join(repo, "d1/schema.sql")],
    [
      join(repoRoot, "content/collections.json"),
      join(repo, "content/collections.json"),
    ],
    [
      join(repoRoot, "content/investors.json"),
      join(repo, "content/investors.json"),
    ],
    [
      join(repoRoot, "content/startups", startupSourceName),
      join(repo, "content/startups", startupSourceName),
    ],
    [
      join(repoRoot, "content/weekly", weeklySourceName),
      join(repo, "content/weekly", weeklySourceName),
    ],
  ]) {
    copyFileSync(source, target);
  }
  writeFileSync(
    join(repo, "content/timestamps.json"),
    `${JSON.stringify({ [slug]: timestamps[slug] }, null, 2)}\n`
  );
  writeFileSync(join(repo, "dist/server/wrangler.json"), "{}\n");
  chmodSync(join(repo, "scripts/manage.sh"), 0o755);
  chmodSync(join(repo, "scripts/build-db.sh"), 0o755);

  const generated = spawnSync("bash", [join(repo, "scripts/build-db.sh")], {
    cwd: repo,
    env: {
      ...process.env,
      VENTUREDEX_SEED_OUTPUT: join(repo, "d1/generated-seed.sql"),
    },
    encoding: "utf8",
  });
  assert.equal(generated.status, 0, generated.stderr);
  const seedHash = createHash("sha256")
    .update(readFileSync(join(repo, "d1/generated-seed.sql")))
    .digest("hex");

  const npxWrapper = join(bin, "npx");
  writeFileSync(
    npxWrapper,
    `#!/bin/bash
set -euo pipefail
args="$*"
if [[ "$args" == *"site_aliases"* ]]; then
  printf '%s\n' "$MOCK_LEGACY_JSON"
elif [[ "$args" == *"PRAGMA table_info(startups);"* ]]; then
  printf '%s\n' "$MOCK_SCHEMA_JSON"
elif [[ "$args" == *"SELECT slug FROM startups"* ]]; then
  printf '%s\n' "$MOCK_STARTUP_JSON"
elif [[ "$args" == *"SELECT issue_number FROM weekly_issues"* ]]; then
  printf '%s\n' "$MOCK_WEEKLY_JSON"
elif [[ "$args" == *"wrangler deploy"* ]]; then
  printf 'called\n' > "$DEPLOY_MARKER"
  printf 'Deployed https://preflight-fixture.workers.dev\n'
else
  printf 'Unexpected npx invocation: %s\n' "$args" >&2
  exit 91
fi
`
  );
  chmodSync(npxWrapper, 0o755);

  return { root, repo, bin, marker, seedHash, slug, weeklyIssue };
}

test("content validator fails closed when no startup files exist", () => {
  const root = mkdtempSync(join(tmpdir(), "vd-empty-validator-"));
  try {
    const code = [
      "import sys",
      "from pathlib import Path",
      `sys.path.insert(0, ${JSON.stringify(join(repoRoot, "scripts"))})`,
      "import validate",
      `validate.STARTUPS_DIR = Path(${JSON.stringify(root)})`,
      "raise SystemExit(validate.main())",
    ].join("\n");
    const result = spawnSync("python3", ["-c", code], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /no startup files/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("content validator reports missing deterministic startup timestamps", () => {
  const fixture = temporaryContentFixture();
  writeFileSync(fixture.timestampsFile, "{}");
  try {
    const code = [
      "import sys",
      "from pathlib import Path",
      `sys.path.insert(0, ${JSON.stringify(join(repoRoot, "scripts"))})`,
      "import validate",
      `validate.TIMESTAMPS_FILE = Path(${JSON.stringify(fixture.timestampsFile)})`,
      `errors = validate.validate_timestamps({${JSON.stringify(fixture.slug)}})`,
      "print('\\n'.join(errors))",
      "raise SystemExit(1 if errors else 0)",
    ].join("\n");
    const result = spawnSync("python3", ["-c", code], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /missing timestamp entry/i);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("database seed generation refuses empty content without overwriting output", () => {
  const root = mkdtempSync(join(tmpdir(), "vd-empty-seed-"));
  const startupsDir = join(root, "startups");
  const timestampsFile = join(root, "timestamps.json");
  const output = join(root, "generated-seed.sql");
  mkdirSync(startupsDir);
  writeFileSync(timestampsFile, "{}");
  writeFileSync(output, "sentinel");

  try {
    const result = spawnSync("bash", [buildDb], {
      cwd: repoRoot,
      env: {
        ...process.env,
        VENTUREDEX_STARTUPS_DIR: startupsDir,
        VENTUREDEX_TIMESTAMPS_FILE: timestampsFile,
        VENTUREDEX_SEED_OUTPUT: output,
      },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /no startup files/i);
    assert.equal(readFileSync(output, "utf8"), "sentinel");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("database seed generation refuses a startup missing deterministic timestamps", () => {
  const fixture = temporaryContentFixture();
  writeFileSync(fixture.timestampsFile, "{}");
  writeFileSync(fixture.output, "sentinel");

  try {
    const result = spawnSync("bash", [buildDb], {
      cwd: repoRoot,
      env: buildEnv(fixture),
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /missing.*timestamp/i);
    assert.equal(readFileSync(fixture.output, "utf8"), "sentinel");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("database seed generation refuses to erase every published Weekly issue", () => {
  const fixture = temporaryContentFixture();
  const weeklyDir = join(fixture.root, "weekly");
  mkdirSync(weeklyDir);
  writeFileSync(fixture.output, "sentinel");

  try {
    const result = spawnSync("bash", [buildDb], {
      cwd: repoRoot,
      env: {
        ...buildEnv(fixture),
        VENTUREDEX_WEEKLY_DIR: weeklyDir,
        VENTUREDEX_ALLOW_WEEKLY_ISSUE_REMOVALS: "",
      },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /no published Weekly issues/i);
    assert.equal(readFileSync(fixture.output, "utf8"), "sentinel");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("content validator fails closed when there is no published Weekly issue", () => {
  const weeklyDir = mkdtempSync(join(tmpdir(), "vd-empty-weekly-validator-"));
  try {
    const code = [
      "import sys",
      "from pathlib import Path",
      `sys.path.insert(0, ${JSON.stringify(join(repoRoot, "scripts"))})`,
      "import validate",
      `validate.WEEKLY_DIR = Path(${JSON.stringify(weeklyDir)})`,
      "errors, _warnings = validate.validate_weekly_files(set())",
      "print('\\n'.join(errors))",
      "raise SystemExit(1 if errors else 0)",
    ].join("\n");
    const result = spawnSync("python3", ["-c", code], {
      cwd: repoRoot,
      env: {
        ...process.env,
        VENTUREDEX_ALLOW_WEEKLY_ISSUE_REMOVALS: "",
      },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /no published Weekly issues/i);
  } finally {
    rmSync(weeklyDir, { recursive: true, force: true });
  }
});

test("generated seed carries a source fingerprint and stale content is rejected", () => {
  const fixture = temporaryContentFixture();
  try {
    const generated = spawnSync("bash", [buildDb], {
      cwd: repoRoot,
      env: buildEnv(fixture),
      encoding: "utf8",
    });
    assert.equal(generated.status, 0, generated.stderr);
    assert.match(
      readFileSync(fixture.output, "utf8"),
      /^-- Source fingerprint: sha256:[a-f0-9]{64}$/m
    );

    const fresh = spawnSync("bash", [manage, "check-seed"], {
      cwd: repoRoot,
      env: buildEnv(fixture),
      encoding: "utf8",
    });
    assert.equal(fresh.status, 0, fresh.stderr);
    assert.match(fresh.stdout, /generated_seed: fresh/);

    const startupPath = join(
      fixture.startupsDir,
      readdirSync(fixture.startupsDir)[0]
    );
    const startup = JSON.parse(readFileSync(startupPath, "utf8"));
    startup.summary = `${startup.summary} changed`;
    writeFileSync(startupPath, `${JSON.stringify(startup, null, 2)}\n`);

    const stale = spawnSync("bash", [manage, "check-seed"], {
      cwd: repoRoot,
      env: buildEnv(fixture),
      encoding: "utf8",
    });
    assert.notEqual(stale.status, 0);
    assert.match(`${stale.stdout}\n${stale.stderr}`, /fingerprint.*stale/i);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("catalog sync refuses every remote slug removal without the exact auditable set", () => {
  const swap = spawnSync(
    "bash",
    [manage, "__test-catalog-slugs", "alpha,beta", "alpha,gamma"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        VENTUREDEX_ALLOW_STARTUP_REMOVALS: "",
      },
      encoding: "utf8",
    }
  );
  assert.notEqual(swap.status, 0);
  assert.match(`${swap.stdout}\n${swap.stderr}`, /remote startup slug/i);
  assert.match(`${swap.stdout}\n${swap.stderr}`, /beta/);

  const growthWithDeletion = spawnSync(
    "bash",
    [manage, "__test-catalog-slugs", "alpha,beta", "alpha,gamma,delta"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        VENTUREDEX_ALLOW_STARTUP_REMOVALS: "",
      },
      encoding: "utf8",
    }
  );
  assert.notEqual(growthWithDeletion.status, 0);
  assert.match(`${growthWithDeletion.stdout}\n${growthWithDeletion.stderr}`, /beta/);

  const wrongOverride = spawnSync(
    "bash",
    [manage, "__test-catalog-slugs", "alpha,beta,gamma", "alpha"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        VENTUREDEX_ALLOW_STARTUP_REMOVALS: "beta",
      },
      encoding: "utf8",
    }
  );
  assert.notEqual(wrongOverride.status, 0);

  const allowed = spawnSync(
    "bash",
    [manage, "__test-catalog-slugs", "alpha,beta,gamma", "alpha"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        VENTUREDEX_ALLOW_STARTUP_REMOVALS: "gamma,beta",
      },
      encoding: "utf8",
    }
  );
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout, /explicit removals authorized/i);

  const growth = spawnSync(
    "bash",
    [manage, "__test-catalog-slugs", "alpha,beta", "alpha,beta,gamma"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        VENTUREDEX_ALLOW_STARTUP_REMOVALS: "",
      },
      encoding: "utf8",
    }
  );
  assert.equal(growth.status, 0, growth.stderr);
});

test("Weekly sync refuses empty and equal-count replacement sets without exact approval", () => {
  const empty = spawnSync(
    "bash",
    [manage, "__test-weekly-issues", "1,2", ""],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        VENTUREDEX_ALLOW_WEEKLY_ISSUE_REMOVALS: "",
      },
      encoding: "utf8",
    }
  );
  assert.notEqual(empty.status, 0);
  assert.match(`${empty.stdout}\n${empty.stderr}`, /Weekly issue/i);
  assert.match(`${empty.stdout}\n${empty.stderr}`, /1,2/);

  const replacement = spawnSync(
    "bash",
    [manage, "__test-weekly-issues", "1,2", "1,3"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        VENTUREDEX_ALLOW_WEEKLY_ISSUE_REMOVALS: "",
      },
      encoding: "utf8",
    }
  );
  assert.notEqual(replacement.status, 0);
  assert.match(`${replacement.stdout}\n${replacement.stderr}`, /2/);

  const approved = spawnSync(
    "bash",
    [manage, "__test-weekly-issues", "1,2", "1,3"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        VENTUREDEX_ALLOW_WEEKLY_ISSUE_REMOVALS: "2",
      },
      encoding: "utf8",
    }
  );
  assert.equal(approved.status, 0, approved.stderr);
  assert.match(approved.stdout, /explicit removals authorized/i);
});

test("GitHub Actions availability check fails closed when gh is unavailable", () => {
  const root = mkdtempSync(join(tmpdir(), "vd-no-gh-"));
  try {
    const result = spawnSync("/bin/bash", [checkGithubActions], {
      cwd: repoRoot,
      env: { ...process.env, PATH: root },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /requires the gh CLI/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release refuses to trust validation from a different commit", () => {
  const result = spawnSync("bash", [manage, "release"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: "test-only-token",
      VENTUREDEX_RELEASE_SHA: "0000000000000000000000000000000000000000",
      VENTUREDEX_VALIDATED_SHA: "",
    },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /release SHA .* does not match checked-out SHA/i
  );
});

test("direct deploy and sync fail on a wrong SHA before validation or network", () => {
  for (const command of ["deploy", "sync"]) {
    const result = spawnSync("bash", [manage, command], {
      cwd: repoRoot,
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: "test-only-token",
        VENTUREDEX_RELEASE_SHA: "0000000000000000000000000000000000000000",
        VENTUREDEX_VALIDATED_SHA: "",
      },
      encoding: "utf8",
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0);
    assert.match(output, /release SHA .* does not match checked-out SHA/i);
    assert.doesNotMatch(output, /Content Validator|npm audit|wrangler/i);
  }
});

test("remote guard, schema, and legacy failures prevent Worker deploy", () => {
  const fixture = temporaryRemotePreflightRepo();
  const goodLegacy = JSON.stringify([
    { results: [] },
    { results: [{ name: "startup_id" }] },
  ]);
  const legacySchema = JSON.stringify([
    { results: [{ name: "sites" }] },
    { results: [{ name: "site_id" }] },
  ]);
  const matchingStartups = JSON.stringify([
    { results: [{ slug: fixture.slug }] },
  ]);
  const removalStartups = JSON.stringify([
    { results: [{ slug: fixture.slug }, { slug: "remote-only" }] },
  ]);
  const matchingWeekly = JSON.stringify([
    { results: [{ issue_number: fixture.weeklyIssue }] },
  ]);

  const runPreflight = (
    legacyJson: string,
    schemaJson: string,
    startupJson: string
  ) => {
    rmSync(fixture.marker, { force: true });
    return spawnSync(
      "bash",
      [
        join(fixture.repo, "scripts/manage.sh"),
        "__test-preflight-deploy",
        fixture.seedHash,
      ],
      {
        cwd: fixture.repo,
        env: {
          ...process.env,
          PATH: `${fixture.bin}:${process.env.PATH}`,
          VENTUREDEX_LOCAL_ENV_LOADED: "1",
          CLOUDFLARE_API_TOKEN: "test-only-token",
          CLOUDFLARE_ACCOUNT_ID: "test-only-account",
          VENTUREDEX_ALLOW_STARTUP_REMOVALS: "",
          VENTUREDEX_ALLOW_WEEKLY_ISSUE_REMOVALS: "",
          VENTUREDEX_SEED_OUTPUT: join(
            fixture.repo,
            "d1/generated-seed.sql"
          ),
          DEPLOY_MARKER: fixture.marker,
          MOCK_LEGACY_JSON: legacyJson,
          MOCK_SCHEMA_JSON: schemaJson,
          MOCK_STARTUP_JSON: startupJson,
          MOCK_WEEKLY_JSON: matchingWeekly,
        },
        encoding: "utf8",
      }
    );
  };

  try {
    const removalFailure = runPreflight(
      goodLegacy,
      remoteSchemaPayload(),
      removalStartups
    );
    assert.notEqual(removalFailure.status, 0);
    assert.match(
      `${removalFailure.stdout}\n${removalFailure.stderr}`,
      /remote-only/
    );
    assert.equal(
      existsSync(fixture.marker),
      false,
      "a failed complete-set guard must prevent Worker deploy"
    );

    const schemaFailure = runPreflight(
      goodLegacy,
      remoteSchemaPayload({ brokenWeekly: true }),
      matchingStartups
    );
    assert.notEqual(schemaFailure.status, 0);
    assert.match(
      `${schemaFailure.stdout}\n${schemaFailure.stderr}`,
      /weekly_issues missing required column.*status/i
    );
    assert.equal(
      existsSync(fixture.marker),
      false,
      "an unsupported remote schema must prevent Worker deploy"
    );

    const legacyFailure = runPreflight(
      legacySchema,
      remoteSchemaPayload(),
      matchingStartups
    );
    assert.notEqual(legacyFailure.status, 0);
    assert.match(
      `${legacyFailure.stdout}\n${legacyFailure.stderr}`,
      /legacy site-first schema/i
    );
    assert.equal(
      existsSync(fixture.marker),
      false,
      "legacy schema repair must fail closed before Worker deploy"
    );

    const success = runPreflight(
      goodLegacy,
      remoteSchemaPayload(),
      matchingStartups
    );
    assert.equal(success.status, 0, `${success.stdout}\n${success.stderr}`);
    assert.equal(
      existsSync(fixture.marker),
      true,
      "the mock proves deploy remains reachable only after preflight passes"
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Wrangler deploy output preserves the exact workers.dev smoke target", () => {
  const workersUrl = "https://venturedex-preview.example.workers.dev";
  const result = spawnSync(
    "bash",
    [manage, "__test-extract-first-url"],
    {
      cwd: repoRoot,
      input: `Uploaded VentureDex\nDashboard: https://dash.cloudflare.com/example\nDeployed ${workersUrl}\n`,
      encoding: "utf8",
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), workersUrl);
});

test("release lock preserves another owner and cleans up on exit or signal", () => {
  const root = mkdtempSync(join(tmpdir(), "vd-release-lock-"));
  const fixtureRepo = join(root, "repo");
  mkdirSync(join(fixtureRepo, "scripts"), { recursive: true });
  copyFileSync(manage, join(fixtureRepo, "scripts", "manage.sh"));
  copyFileSync(
    join(repoRoot, "scripts", "load-local-env.sh"),
    join(fixtureRepo, "scripts", "load-local-env.sh")
  );
  chmodSync(join(fixtureRepo, "scripts", "manage.sh"), 0o755);
  execFileSync("git", ["init", "-q", fixtureRepo]);
  const gitDir = join(fixtureRepo, ".git");
  const lockDir = join(gitDir, "venturedex-release.lock");

  try {
    mkdirSync(lockDir);
    writeFileSync(join(lockDir, "pid"), "external-owner\n");
    const blocked = spawnSync(
      "bash",
      [join(fixtureRepo, "scripts", "manage.sh"), "__test-release-lock"],
      { cwd: fixtureRepo, encoding: "utf8" }
    );
    assert.notEqual(blocked.status, 0);
    assert.equal(readFileSync(join(lockDir, "pid"), "utf8"), "external-owner\n");

    rmSync(lockDir, { recursive: true, force: true });
    const normalExit = spawnSync(
      "bash",
      [join(fixtureRepo, "scripts", "manage.sh"), "__test-release-lock"],
      { cwd: fixtureRepo, encoding: "utf8" }
    );
    assert.equal(normalExit.status, 0, normalExit.stderr);
    assert.equal(existsSync(lockDir), false);

    const signalExit = spawnSync(
      "bash",
      [join(fixtureRepo, "scripts", "manage.sh"), "__test-release-lock-signal"],
      { cwd: fixtureRepo, encoding: "utf8" }
    );
    assert.equal(signalExit.status, 143, signalExit.stderr);
    assert.equal(existsSync(lockDir), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dirty current-main source fails before remote lookup or the audited gate", () => {
  const root = mkdtempSync(join(tmpdir(), "vd-dirty-main-release-"));
  const fixtureRepo = join(root, "repo");
  const origin = join(root, "origin.git");
  const bin = join(root, "bin");
  mkdirSync(join(fixtureRepo, "scripts"), { recursive: true });
  mkdirSync(join(fixtureRepo, "src"), { recursive: true });
  mkdirSync(bin);

  const realGit = execFileSync("sh", ["-c", "command -v git"], {
    encoding: "utf8",
  }).trim();
  execFileSync(realGit, ["init", "--bare", "-q", origin]);
  execFileSync(realGit, ["init", "-q", fixtureRepo]);
  execFileSync(realGit, [
    "-C",
    fixtureRepo,
    "config",
    "user.email",
    "tests@example.com",
  ]);
  execFileSync(realGit, [
    "-C",
    fixtureRepo,
    "config",
    "user.name",
    "Tests",
  ]);
  copyFileSync(manage, join(fixtureRepo, "scripts", "manage.sh"));
  copyFileSync(
    join(repoRoot, "scripts", "load-local-env.sh"),
    join(fixtureRepo, "scripts", "load-local-env.sh")
  );
  chmodSync(join(fixtureRepo, "scripts", "manage.sh"), 0o755);
  writeFileSync(join(fixtureRepo, "src", "app.ts"), "export const clean = true;\n");
  execFileSync(realGit, ["-C", fixtureRepo, "add", "."]);
  execFileSync(realGit, ["-C", fixtureRepo, "commit", "-qm", "main fixture"]);
  execFileSync(realGit, ["-C", fixtureRepo, "branch", "-M", "main"]);
  execFileSync(realGit, ["-C", fixtureRepo, "remote", "add", "origin", origin]);
  execFileSync(realGit, ["-C", fixtureRepo, "push", "-qu", "origin", "main"]);
  const mainSha = execFileSync(realGit, ["-C", fixtureRepo, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();

  writeFileSync(join(fixtureRepo, "src", "app.ts"), "export const clean = false;\n");
  const gitWrapper = join(bin, "git");
  writeFileSync(
    gitWrapper,
    `#!/bin/sh
case " $* " in
  *" ls-remote "*) echo "LS_REMOTE_CALLED" >&2; exit 86 ;;
esac
exec "${realGit}" "$@"
`
  );
  chmodSync(gitWrapper, 0o755);

  try {
    const result = spawnSync(
      "bash",
      [join(fixtureRepo, "scripts", "manage.sh"), "release"],
      {
        cwd: fixtureRepo,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          CLOUDFLARE_API_TOKEN: "test-only-token",
          VENTUREDEX_RELEASE_SHA: mainSha,
          VENTUREDEX_VALIDATED_SHA: "",
        },
        encoding: "utf8",
      }
    );
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0);
    assert.match(output, /not a clean checkout/i);
    assert.match(output, /src\/app\.ts/);
    assert.doesNotMatch(output, /LS_REMOTE_CALLED|Content Validator|npm audit|wrangler/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("post-build race guard permits only exact generated release artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "vd-post-build-race-"));
  const fixtureRepo = join(root, "repo");
  mkdirSync(join(fixtureRepo, "scripts"), { recursive: true });
  mkdirSync(join(fixtureRepo, "src"), { recursive: true });
  mkdirSync(join(fixtureRepo, "d1"), { recursive: true });
  mkdirSync(join(fixtureRepo, "content", "weekly"), { recursive: true });
  mkdirSync(join(fixtureRepo, "public", "og"), { recursive: true });

  copyFileSync(manage, join(fixtureRepo, "scripts", "manage.sh"));
  copyFileSync(
    join(repoRoot, "scripts", "load-local-env.sh"),
    join(fixtureRepo, "scripts", "load-local-env.sh")
  );
  chmodSync(join(fixtureRepo, "scripts", "manage.sh"), 0o755);
  writeFileSync(join(fixtureRepo, "src", "app.ts"), "export const clean = true;\n");
  writeFileSync(join(fixtureRepo, "d1", "generated-seed.sql"), "-- old seed\n");
  writeFileSync(
    join(fixtureRepo, "content", "weekly", "5.json"),
    `${JSON.stringify({
      issue_number: 5,
      status: "published",
      title: "Fixture",
    })}\n`
  );

  execFileSync("git", ["init", "-q", fixtureRepo]);
  execFileSync("git", ["-C", fixtureRepo, "config", "user.email", "tests@example.com"]);
  execFileSync("git", ["-C", fixtureRepo, "config", "user.name", "Tests"]);
  execFileSync("git", ["-C", fixtureRepo, "add", "."]);
  execFileSync("git", ["-C", fixtureRepo, "commit", "-qm", "clean fixture"]);

  try {
    writeFileSync(join(fixtureRepo, "d1", "generated-seed.sql"), "-- generated seed\n");
    writeFileSync(join(fixtureRepo, "public", "og", "weekly-5.png"), "generated");

    const generatedOnly = spawnSync(
      "bash",
      [join(fixtureRepo, "scripts", "manage.sh"), "__test-post-build-source-clean"],
      { cwd: fixtureRepo, encoding: "utf8" }
    );
    assert.equal(generatedOnly.status, 0, generatedOnly.stderr);

    const lockedSeedHash = createHash("sha256")
      .update(readFileSync(join(fixtureRepo, "d1", "generated-seed.sql")))
      .digest("hex");
    writeFileSync(join(fixtureRepo, "d1", "generated-seed.sql"), "-- replaced generation\n");
    const replacedSeed = spawnSync(
      "bash",
      [
        join(fixtureRepo, "scripts", "manage.sh"),
        "__test-seed-hash",
        lockedSeedHash,
      ],
      { cwd: fixtureRepo, encoding: "utf8" }
    );
    assert.notEqual(replacedSeed.status, 0);
    assert.match(`${replacedSeed.stdout}\n${replacedSeed.stderr}`, /seed changed/i);

    writeFileSync(join(fixtureRepo, "src", "app.ts"), "export const clean = false;\n");
    const racedSource = spawnSync(
      "bash",
      [join(fixtureRepo, "scripts", "manage.sh"), "__test-post-build-source-clean"],
      { cwd: fixtureRepo, encoding: "utf8" }
    );
    assert.notEqual(racedSource.status, 0);
    assert.match(`${racedSource.stdout}\n${racedSource.stderr}`, /src\/app\.ts/);

    writeFileSync(join(fixtureRepo, "src", "app.ts"), "export const clean = true;\n");
    writeFileSync(join(fixtureRepo, "public", "og", "weekly-999.png"), "unexpected");
    const fakeOg = spawnSync(
      "bash",
      [join(fixtureRepo, "scripts", "manage.sh"), "__test-post-build-source-clean"],
      { cwd: fixtureRepo, encoding: "utf8" }
    );
    assert.notEqual(fakeOg.status, 0);
    assert.match(`${fakeOg.stdout}\n${fakeOg.stderr}`, /weekly-999\.png/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release workflow deploys only a successfully validated SHA", () => {
  const ci = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
  const deploy = readFileSync(
    join(repoRoot, ".github/workflows/deploy.yml"),
    "utf8"
  );
  const manager = readFileSync(manage, "utf8");
  const urlExtractor = manager.slice(
    manager.indexOf("extract_first_url()"),
    manager.indexOf("\nhtml_contains()")
  );

  assert.match(ci, /^concurrency:/m);
  assert.doesNotMatch(ci, /paths-ignore:/);
  assert.match(ci, /npm audit --audit-level=high/);
  assert.match(deploy, /workflow_run:/);
  assert.doesNotMatch(deploy, /^\s{2}push:/m);
  assert.match(deploy, /workflow_run\.event == 'push'/);
  assert.match(deploy, /workflow_run\.head_branch == 'main'/);
  assert.match(deploy, /workflow_run\.conclusion == 'success'/);
  assert.match(deploy, /github\.event_name == 'workflow_dispatch'[\s\S]*github\.ref == 'refs\/heads\/main'/);
  assert.match(deploy, /workflow_run\.head_sha/);
  assert.match(deploy, /VENTUREDEX_RELEASE_SHA/);
  assert.match(deploy, /git ls-remote origin refs\/heads\/main/);
  assert.match(deploy, /remote_main_sha.*VENTUREDEX_RELEASE_SHA/);
  assert.match(deploy, /npm audit --audit-level=high/);
  assert.match(deploy, /^concurrency:/m);
  assert.match(deploy, /cancel-in-progress: false/);
  assert.match(deploy, /VENTUREDEX_VALIDATED_SHA/);
  assert.match(manager, /cmd_validate\(\)[\s\S]*npm audit --audit-level=high/);
  assert.equal(
    urlExtractor.split("sys.stdin.read()").length - 1,
    1,
    "deploy URL extraction must consume Wrangler output exactly once"
  );
  const validate = manager.slice(
    manager.indexOf("cmd_validate()"),
    manager.indexOf("\nassert_release_expected_sha_matches_head()")
  );
  assert.match(
    validate,
    /npm run typecheck/,
    "the unified release gate must include Astro diagnostics"
  );

  const sync = manager.slice(
    manager.indexOf("cmd_sync_internal()"),
    manager.indexOf("\nrefuse_direct_production_mutation()")
  );
  const preflight = manager.slice(
    manager.indexOf("remote_sync_preflight()"),
    manager.indexOf("\ndeploy_worker_after_remote_sync_preflight()")
  );
  const preflightDeploy = manager.slice(
    manager.indexOf("deploy_worker_after_remote_sync_preflight()"),
    manager.indexOf("\ncmd_sync_internal()")
  );
  const schemaPreflight = manager.slice(
    manager.indexOf("assert_remote_schema_migration_feasible()"),
    manager.indexOf("\nassert_remote_schema_not_legacy()")
  );
  const legacyProbe = manager.slice(
    manager.indexOf("legacy_schema_needs_repair()"),
    manager.indexOf("\nassert_remote_schema_migration_feasible()")
  );
  const legacyGuard = manager.slice(
    manager.indexOf("assert_remote_schema_not_legacy()"),
    manager.indexOf("\nensure_current_remote_schema()")
  );
  const remoteStartupProbe = manager.slice(
    manager.indexOf("remote_manual_startup_slugs()"),
    manager.indexOf("\nremote_published_weekly_issue_numbers()")
  );
  const remoteWeeklyProbe = manager.slice(
    manager.indexOf("remote_published_weekly_issue_numbers()"),
    manager.indexOf("\nlocal_startup_slugs()")
  );
  assert.match(
    manager,
    /codex_stage = 'manual'/
  );
  assert.match(
    preflight,
    /assert_generated_seed_fresh[\s\S]*assert_release_seed_hash_unchanged[\s\S]*assert_remote_schema_not_legacy[\s\S]*assert_remote_schema_migration_feasible[\s\S]*remote_manual_startup_slugs[\s\S]*assert_catalog_slug_change_allowed[\s\S]*remote_published_weekly_issue_numbers[\s\S]*assert_weekly_issue_change_allowed/,
    "the read-only remote preflight must cover seed, schema, and both complete-set guards"
  );
  assert.doesNotMatch(
    `${preflight}\n${schemaPreflight}\n${legacyProbe}\n${legacyGuard}\n${remoteStartupProbe}\n${remoteWeeklyProbe}`,
    /\b(?:ALTER|DROP|UPDATE|DELETE|INSERT|REPLACE|CREATE)\s+(?:TABLE|INDEX|INTO|FROM|[A-Za-z_])/i,
    "the pre-deploy remote sync preflight must remain read-only"
  );
  assert.doesNotMatch(
    `${preflight}\n${schemaPreflight}\n${legacyProbe}\n${legacyGuard}\n${remoteStartupProbe}\n${remoteWeeklyProbe}`,
    /--file(?:=|\s)/,
    "the preflight must never execute a SQL file"
  );
  assert.ok(
    preflightDeploy.indexOf("\n  remote_sync_preflight") <
      preflightDeploy.indexOf("\n  deploy_worker"),
    "Worker deployment must be reachable only after remote D1 preflight passes"
  );
  assert.equal(
    sync.split("remote_sync_preflight").length - 1,
    2,
    "D1 sync must run the same preflight before migration and again before seed execution"
  );
  assert.ok(
    sync.indexOf("remote_sync_preflight") <
      sync.indexOf("ensure_current_remote_schema"),
    "the first D1 mutation must not run until read-only preflight succeeds"
  );
  assert.ok(
    sync.lastIndexOf("remote_sync_preflight") >
      sync.indexOf("ensure_current_remote_schema") &&
      sync.lastIndexOf("remote_sync_preflight") <
        sync.indexOf("Applying d1/generated-seed.sql"),
    "the actual seed path must revalidate all remote guards after migration"
  );
  assert.ok(
    preflight.indexOf("assert_catalog_slug_change_allowed") >= 0,
    "catalog slug-removal guard must run before remote seed execution"
  );
  assert.ok(
    preflight.indexOf("assert_weekly_issue_change_allowed") >= 0,
    "Weekly issue-removal guard must run before remote seed execution"
  );

  const release = manager.slice(
    manager.indexOf("cmd_release()"),
    manager.indexOf("\ncmd_add()")
  );
  assert.ok(
    release.indexOf("assert_release_source_clean") <
      release.indexOf("prepare_release_artifacts"),
    "release must reject dirty or untracked source before building artifacts"
  );
  assert.ok(
      release.indexOf("prepare_release_artifacts") <
      release.indexOf("assert_release_post_build_source_clean") &&
      release.indexOf("assert_release_post_build_source_clean") <
        release.indexOf("deploy_worker_after_remote_sync_preflight"),
    "release must reject post-build source races immediately before deploy"
  );
  assert.ok(
    release.indexOf("prepare_release_artifacts") <
      release.indexOf("capture_release_artifact_hashes") &&
      release.indexOf("capture_release_artifact_hashes") <
        release.indexOf("deploy_worker_after_remote_sync_preflight"),
    "release must lock the generated seed and deployable dist after build"
  );
  assert.ok(
    release.split("assert_release_post_build_source_clean").length - 1 >= 2,
    "release must recheck post-build source before deploy and again before D1 sync"
  );
  assert.ok(
    release.indexOf("assert_release_artifact_hashes_unchanged") <
      release.indexOf("deploy_worker_after_remote_sync_preflight"),
    "release must verify build-time seed and dist hashes before deploy"
  );
  assert.ok(
    release.indexOf("assert_release_seed_hash_unchanged") >
      release.indexOf("deploy_worker_after_remote_sync_preflight") &&
      release.indexOf("assert_release_seed_hash_unchanged") <
        release.indexOf("cmd_sync_internal --skip-build"),
    "release must verify the build-time seed hash again before D1 sync"
  );
  assert.ok(
    release.indexOf("deploy_worker_after_remote_sync_preflight") <
      release.indexOf("cmd_sync_internal --skip-build"),
    "release must deploy static content before mutating D1"
  );
  assert.ok(
    release.indexOf("deploy_worker_after_remote_sync_preflight") <
      release.indexOf("cmd_sync_internal --skip-build"),
    "the preflighted Worker deploy must remain before the first D1 mutation"
  );
  assert.match(release, /smoke_with_retry/);
  assert.ok(
    release.split("assert_release_head_is_current_main").length - 1 >= 3,
    "release must recheck origin/main before deploy and before D1 mutation"
  );
  assert.match(manager, /sync\) shift; cmd_sync_public/);
  assert.match(manager, /deploy\) cmd_deploy_public/);
  assert.doesNotMatch(manager, /sync\) shift; cmd_sync_internal/);
  assert.doesNotMatch(
    manager,
    /repair_legacy_remote_schema|DROP TABLE IF EXISTS search_index_terms/,
    "the release command must not retain a destructive legacy auto-repair path"
  );

  assert.ok(
    sync.indexOf("assert_release_seed_hash_unchanged") <
      sync.indexOf("npx wrangler d1 execute"),
    "the exact build-time seed hash must be rechecked immediately before remote D1 execution"
  );
});
