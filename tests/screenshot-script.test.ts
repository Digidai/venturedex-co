import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screenshotScript = path.join(repoRoot, "scripts", "screenshot.sh");
const require = createRequire(import.meta.url);

async function fixture(width = 1280, height = 720) {
  const root = mkdtempSync(path.join(os.tmpdir(), "venturedex-codex-screenshot-test-"));
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  mkdirSync(path.join(root, "public", "screenshots"), { recursive: true });
  mkdirSync(path.join(root, "node_modules", "sharp"), { recursive: true });
  // The isolated fixture resolves the already-installed repo dependency without
  // creating a production worktree node_modules symlink or downloading packages.
  writeFileSync(path.join(root, "node_modules", "sharp", "index.js"),
    `module.exports = require(${JSON.stringify(require.resolve("sharp"))});\n`);
  const script = path.join(root, "scripts", "screenshot.sh");
  cpSync(screenshotScript, script);
  cpSync(path.join(repoRoot, "scripts", "screenshot-quality.mjs"), path.join(root, "scripts", "screenshot-quality.mjs"));
  cpSync(path.join(repoRoot, "scripts", "manage.sh"), path.join(root, "scripts", "manage.sh"));
  cpSync(path.join(repoRoot, "scripts", "load-local-env.sh"), path.join(root, "scripts", "load-local-env.sh"));
  const source = path.join(root, "Codex capture.png");
  // Geometric image tests conversion only; it is never asserted to be a product screenshot.
  await sharp(Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#2255aa"/><rect x="40" y="40" width="${width / 2}" height="${height / 2}" fill="#ffffff"/><circle cx="${width * .7}" cy="${height * .7}" r="80" fill="#ee7755"/></svg>`)).png().toFile(source);
  const output = path.join(root, "public", "screenshots", "example.webp");
  return { root, script, source, output };
}

function run(f: Awaited<ReturnType<typeof fixture>>, args?: string[]) {
  return spawnSync("bash", [f.script, ...(args ?? ["example", "https://example.test", "--from-codex", f.source, "--reviewed"])], {
    cwd: f.root,
    env: { ...process.env, CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "" },
    encoding: "utf8",
  });
}

test("legacy two-argument screenshot call fails closed with native capture instructions", async () => {
  const f = await fixture();
  try {
    const result = run(f, ["example", "https://example.test"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Native Codex browser capture and explicit visual review are required/);
    assert.match(result.stderr, /--from-codex/);
    assert.equal(existsSync(f.output), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("Codex capture import requires explicit visual review", async () => {
  const f = await fixture();
  try {
    const result = run(f, ["example", "https://example.test", "--from-codex", f.source]);
    assert.equal(result.status, 2);
    assert.equal(existsSync(f.output), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("source-reviewed capture imports unapproved, without cropping, padding, or upscaling", async () => {
  const f = await fixture();
  try {
    const original = readFileSync(f.source);
    const result = run(f);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /UNREVIEWED final asset/);
    assert.match(result.stdout, /Local static asset only/);
    const metadata = await sharp(f.output).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1280);
    assert.equal(metadata.height, 720);
    // The source corner is preserved instead of being padded with white.
    const edge = await sharp(f.output).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    assert.ok(edge[0] < 80 && edge[1] < 120 && edge[2] > 120);
    assert.equal(existsSync(path.join(f.root, "content", "screenshot-reviews.json")), false);
    assert.deepEqual(readFileSync(f.source), original);
    assert.deepEqual(readdirSync(path.dirname(f.output)), ["example.webp"]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("invalid image preserves any existing screenshot and leaves no partial output", async () => {
  const f = await fixture();
  try {
    writeFileSync(f.source, "not an image");
    writeFileSync(f.output, "existing screenshot");
    const result = run(f);
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(f.output, "utf8"), "existing screenshot");
    assert.deepEqual(readdirSync(path.dirname(f.output)), ["example.webp"]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("check-only decodes and validates a capture without writing assets", async () => {
  const f = await fixture();
  try {
    const result = run(f, ["example", "https://example.test", "--from-codex", f.source, "--reviewed", "--check-only"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /no screenshot was written/);
    assert.equal(existsSync(f.output), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("manage screenshot forwards native import options without Cloudflare credentials", async () => {
  const f = await fixture();
  try {
    mkdirSync(path.join(f.root, "content", "startups"), { recursive: true });
    writeFileSync(path.join(f.root, "content", "startups", "example.json"), JSON.stringify({ url: "https://example.test" }));
    for (const urlArgs of [["https://example.test"], []]) {
      const result = spawnSync("bash", [path.join(f.root, "scripts", "manage.sh"), "screenshot", "example", ...urlArgs, "--from-codex", f.source, "--reviewed"], {
        cwd: f.root,
        env: { ...process.env, VENTUREDEX_LOCAL_ENV_LOADED: "1", CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "" },
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal((await sharp(f.output).metadata()).format, "webp");
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("manage add rejects missing or invalid native capture before mutating content or assets", async () => {
  const f = await fixture();
  try {
    for (const args of [[], ["--from-codex", f.source], ["--from-codex", f.source, "--reviewed"]]) {
      writeFileSync(f.source, "not an image");
      const result = spawnSync("bash", [path.join(f.root, "scripts", "manage.sh"), "add", ...args], {
        cwd: f.root,
        env: { ...process.env, VENTUREDEX_LOCAL_ENV_LOADED: "1", CLOUDFLARE_API_TOKEN: "" },
        input: "https://example.test\nExample\nexample\n",
        timeout: 5000,
        encoding: "utf8",
      });
      assert.notEqual(result.status, 0, result.stdout + result.stderr);
      assert.equal(existsSync(path.join(f.root, "content")), false);
      assert.equal(existsSync(path.join(f.root, "public", "logos")), false);
      assert.equal(existsSync(f.output), false);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("small captures must be recaptured instead of silently enlarged", async () => {
  const f = await fixture(360, 240);
  try {
    const result = run(f);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /too small; recapture a desktop viewport/);
    assert.equal(existsSync(f.output), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("full-page and blank source captures cannot be imported with --reviewed", async () => {
  const f = await fixture(1280, 4000);
  try {
    const fullPage = run(f);
    assert.notEqual(fullPage.status, 0);
    assert.match(fullPage.stderr, /viewport framing/);
    await sharp({ create: { width: 1280, height: 720, channels: 3, background: "#ffffff" } }).png().toFile(f.source);
    const blank = run(f);
    assert.notEqual(blank.status, 0);
    assert.match(blank.stderr, /Blank or near-uniform/);
    assert.equal(existsSync(f.output), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("large native viewports only downsize, preserving their aspect ratio and minimum readable height", async () => {
  for (const [width, height, expectedWidth, expectedHeight] of [[2560, 1440, 1440, 810], [1920, 920, 1503, 720]]) {
    const f = await fixture(width, height);
    try {
      const result = run(f);
      assert.equal(result.status, 0, result.stderr);
      const metadata = await sharp(f.output).metadata();
      assert.equal(metadata.width, expectedWidth);
      assert.equal(metadata.height, expectedHeight);
      assert.ok(Math.abs(metadata.width! / metadata.height! - width / height) < .002);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

test("unsafe slug, credential URL, relative path, and unknown options fail without writes", async () => {
  const f = await fixture();
  try {
    for (const args of [
      ["../escape", "https://example.test", "--from-codex", f.source, "--reviewed"],
      ["example", "https://user:secret@example.test", "--from-codex", f.source, "--reviewed"],
      ["example", "https://example.test", "--from-codex", "relative.png", "--reviewed"],
      ["example", "https://example.test", "--unexpected"],
    ]) {
      const result = run(f, args);
      assert.notEqual(result.status, 0, result.stdout + result.stderr);
      assert.equal(existsSync(f.output), false);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("capture and output symlinks are rejected without changing their targets", async () => {
  const f = await fixture();
  try {
    const alias = path.join(f.root, "capture-alias.png");
    symlinkSync(f.source, alias);
    const linkedCapture = run(f, ["example", "https://example.test", "--from-codex", alias, "--reviewed"]);
    assert.notEqual(linkedCapture.status, 0);
    assert.equal(existsSync(f.output), false);
    const outside = path.join(f.root, "outside.txt");
    writeFileSync(outside, "preserve me");
    symlinkSync(outside, f.output);
    const linkedOutput = run(f);
    assert.notEqual(linkedOutput.status, 0);
    assert.equal(readFileSync(outside, "utf8"), "preserve me");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("screenshot importer has no external browser or network execution path", () => {
  const script = readFileSync(screenshotScript, "utf8");
  assert.doesNotMatch(script, /bb-browser|Comet|playwright_cli|remote-debugging|pkill|curl|fetch\(|https\.request/);
  assert.doesNotMatch(script, /load-local-env|CLOUDFLARE_API_TOKEN/);
  assert.match(script, /fit: 'inside', withoutEnlargement: true/);
  assert.match(script, /fs\.renameSync\(temporaryPath, destination\)/);
});
