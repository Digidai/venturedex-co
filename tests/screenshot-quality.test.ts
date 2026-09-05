import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const checkNames = ['loaded', 'unobstructed', 'legible', 'framing', 'card', 'detail'];

async function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'venturedex-screenshot-quality-test-'));
  for (const directory of ['scripts', 'public/screenshots', 'content/startups', 'node_modules/sharp']) mkdirSync(path.join(root, directory), { recursive: true });
  writeFileSync(path.join(root, 'node_modules/sharp/index.js'), `module.exports = require(${JSON.stringify(require.resolve('sharp'))});\n`);
  cpSync(path.join(repoRoot, 'scripts/screenshot-quality.mjs'), path.join(root, 'scripts/screenshot-quality.mjs'));
  const image = path.join(root, 'public/screenshots/example.webp');
  const manifest = path.join(root, 'content/screenshot-reviews.json');
  writeFileSync(path.join(root, 'content/startups/example.json'), JSON.stringify({ slug: 'example', url: 'https://example.test' }));
  await sharp(Buffer.from('<svg width="1280" height="720"><rect width="1280" height="720" fill="#111111"/><rect x="60" y="60" width="900" height="160" fill="#eeeeee"/><rect x="60" y="270" width="540" height="340" fill="#667799"/></svg>')).webp().toFile(image);
  const hash = () => createHash('sha256').update(readFileSync(image)).digest('hex');
  const baseline = path.join(root, 'content/screenshot-history-baseline.json');
  const writeBaseline = (assets = { example: hash() }) => writeFileSync(baseline, JSON.stringify({ schema_version: 1, base_commit: 'a'.repeat(40), assets }));
  writeBaseline();
  const record = () => ({
    sha256: hash(), width: 1280, height: 720, source_url: 'https://example.test/product',
    capture_method: 'codex-iab', capture_operator: 'test-capture-operator', reviewed_at: new Date().toISOString(), reviewer: 'test-schema-reviewer',
    checks: Object.fromEntries(checkNames.map(name => [name, true])),
    notes: 'Synthetic fixture for schema integrity only, not actual product visual approval.',
  });
  const writeManifest = (review: Record<string, unknown> = record()) => writeFileSync(manifest, JSON.stringify({ schema_version: 1, reviews: { example: review } }));
  const run = (...args: string[]) => spawnSync('node', [path.join(root, 'scripts/screenshot-quality.mjs'), ...args], { cwd: root, encoding: 'utf8' });
  const approveArgs = () => ['approve', 'example', '--sha256', hash(), '--source-url', 'https://example.test', '--capture-method', 'codex-iab', '--capture-operator', 'test-capture-operator', '--reviewer', 'test-schema-reviewer', '--notes', 'Synthetic fixture for schema integrity only, not actual product visual approval.', ...checkNames.map(name => `--${name}`)];
  return { root, image, manifest, baseline, hash, record, writeManifest, writeBaseline, run, approveArgs };
}

test('quality gate blocks missing reviews, not merely missing screenshot files', async () => {
  const f = await fixture();
  try {
    const missingManifest = f.run('validate');
    assert.notEqual(missingManifest.status, 0);
    assert.match(missingManifest.stderr, /screenshot-reviews.json/);
    writeFileSync(f.manifest, JSON.stringify({ schema_version: 1, reviews: {} }));
    const missingRecord = f.run('validate');
    assert.notEqual(missingRecord.status, 0);
    assert.match(missingRecord.stderr, /example: missing quality review/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('review attestation schema is hash-bound; changed pixels or dimensions invalidate it', async () => {
  const f = await fixture();
  try {
    f.writeManifest();
    assert.equal(f.run('validate').status, 0);
    f.writeManifest({ ...f.record(), sha256: '0'.repeat(64) });
    assert.match(f.run('validate').stderr, /stale or invalid review SHA-256/);
    f.writeManifest({ ...f.record(), width: 1440 });
    assert.match(f.run('validate').stderr, /dimensions do not match/);
    f.writeManifest();
    const replacement = await sharp(f.image).flop().toBuffer();
    writeFileSync(f.image, replacement);
    assert.match(f.run('validate').stderr, /stale or invalid review SHA-256/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('every visual check is mandatory boolean true, including both actual display contexts', async () => {
  const f = await fixture();
  try {
    for (const key of checkNames) {
      for (const value of [false, 'true', 1, undefined]) {
        const review = f.record();
        (review.checks as Record<string, unknown>)[key] = value;
        f.writeManifest(review);
        const result = f.run('validate');
        assert.notEqual(result.status, 0, `${key}=${value}`);
        assert.match(result.stderr, /all visual checks must be explicitly true/);
      }
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('invalid provenance, reviewer, date, source URL, and unexplained cross-host records fail closed', async () => {
  const f = await fixture();
  try {
    for (const change of [
      { capture_method: 'bb-browser' }, { reviewer: '' }, { notes: 'OK' },
      { capture_operator: undefined }, { capture_operator: 'test-schema-reviewer' }, { capture_operator: ' TEST-SCHEMA-REVIEWER ' },
      { reviewed_at: 'not a date' }, { reviewed_at: '2999-01-01T00:00:00Z' }, { reviewed_at: '2026-02-31T00:00:00Z' },
      { source_url: 'https://name:secret@example.test' }, { source_url: 'javascript:alert(1)' },
      { source_url: 'https://unrelated.test' },
    ]) {
      f.writeManifest({ ...f.record(), ...change });
      assert.notEqual(f.run('validate').status, 0, JSON.stringify(change));
    }
    f.writeManifest({ ...f.record(), source_url: 'https://new-name.test/product', notes: 'Official source: new-name.test; verified official rebrand redirect and product identity.' });
    assert.equal(f.run('validate').status, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('all-white, all-black, near-uniform, transparent, undersized and corrupt images fail even with a matching review hash', async () => {
  const f = await fixture();
  try {
    const partiallyTransparent = await sharp(f.image).ensureAlpha(0.5).webp().toBuffer();
    writeFileSync(f.image, partiallyTransparent);
    f.writeManifest();
    assert.match(f.run('validate').stderr, /transparent pixels/);
    for (const background of ['#ffffff', '#000000', '#222223', { r: 255, g: 255, b: 255, alpha: 0 }]) {
      await sharp({ create: { width: 1280, height: 720, channels: 4, background } }).webp().toFile(f.image);
      f.writeManifest();
      const result = f.run('validate');
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Blank or near-uniform|transparent/);
    }
    await sharp({ create: { width: 720, height: 450, channels: 3, background: '#223344' } }).webp().toFile(f.image);
    f.writeManifest();
    assert.match(f.run('validate').stderr, /too small/);
    writeFileSync(f.image, 'RIFF corrupt image bytes');
    f.writeManifest();
    assert.notEqual(f.run('validate').status, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('historical high-resolution assets are not rejected or modified for dimensions alone', async () => {
  const f = await fixture();
  try {
    const bytes = await sharp(f.image).resize(5100, 1920).webp().toBuffer();
    writeFileSync(f.image, bytes);
    f.writeBaseline(); // This test fixture's original historical image is high resolution.
    f.writeManifest({ ...f.record(), width: 5100, height: 1920, capture_method: 'historical-reviewed', capture_operator: undefined });
    const result = f.run('validate');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(f.image), bytes);
    f.writeManifest({ ...f.record(), width: 5100, height: 1920 });
    assert.match(f.run('validate').stderr, /native capture aspect ratio/);
    assert.match(f.run(...f.approveArgs()).stderr, /native capture aspect ratio/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('historical approval only accepts the original frozen slug and hash, never changed or new captures', async () => {
  const f = await fixture();
  try {
    f.writeManifest({ ...f.record(), capture_method: 'historical-reviewed', capture_operator: undefined });
    assert.equal(f.run('validate').status, 0, 'matching historical baseline does not need a capture operator');
    const originalBaseline = readFileSync(f.baseline);
    const replacement = await sharp(f.image).flop().toBuffer();
    writeFileSync(f.image, replacement);
    f.writeManifest({ ...f.record(), capture_method: 'historical-reviewed', capture_operator: undefined });
    assert.match(f.run('validate').stderr, /historical-reviewed is restricted to the frozen original slug and SHA-256/);
    const historicalArgs = f.approveArgs().map(value => value === 'codex-iab' ? 'historical-reviewed' : value);
    const beforeApproval = readFileSync(f.manifest);
    assert.notEqual(f.run(...historicalArgs).status, 0);
    assert.deepEqual(readFileSync(f.manifest), beforeApproval);
    assert.deepEqual(readFileSync(f.baseline), originalBaseline, 'approval must not refresh baseline from current bytes');
    f.writeManifest();
    assert.equal(f.run('validate').status, 0, 'changed native capture with independent reviewer is allowed');
    cpSync(f.image, path.join(f.root, 'public/screenshots/new-capture.webp'));
    writeFileSync(path.join(f.root, 'content/startups/new-capture.json'), JSON.stringify({ slug: 'new-capture', url: 'https://example.test' }));
    writeFileSync(f.manifest, JSON.stringify({ schema_version: 1, reviews: {
      example: f.record(), 'new-capture': { ...f.record(), capture_method: 'historical-reviewed', capture_operator: undefined },
    } }));
    assert.match(f.run('validate').stderr, /new-capture: historical-reviewed is restricted/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('missing, malformed, empty and symlinked history baselines fail closed', async () => {
  const f = await fixture();
  try {
    f.writeManifest();
    rmSync(f.baseline);
    assert.match(f.run('validate').stderr, /screenshot-history-baseline.json/);
    assert.notEqual(f.run(...f.approveArgs()).status, 0);
    for (const value of [null, { schema_version: 1, base_commit: 'a'.repeat(40), assets: {} }, { schema_version: 1, base_commit: 'invalid', assets: { example: f.hash() } }, { schema_version: 1, base_commit: 'a'.repeat(40), assets: { example: 'invalid' } }]) {
      writeFileSync(f.baseline, JSON.stringify(value));
      assert.notEqual(f.run('validate').status, 0);
    }
    const outside = path.join(f.root, 'outside-baseline.json');
    writeFileSync(outside, JSON.stringify({ schema_version: 1, base_commit: 'a'.repeat(40), assets: { example: f.hash() } }));
    rmSync(f.baseline);
    symlinkSync(outside, f.baseline);
    assert.notEqual(f.run('validate').status, 0);
    assert.notEqual(f.run(...f.approveArgs()).status, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('approve requires explicit flags and the hash the reviewer inspected; --reviewed is not approval', async () => {
  const f = await fixture();
  try {
    for (const args of [
      ['approve', 'example', '--reviewed'],
      f.approveArgs().filter(value => value !== '--detail'),
      f.approveArgs().map(value => value === f.hash() ? '0'.repeat(64) : value),
      [...f.approveArgs(), '--card'],
      [...f.approveArgs(), '--force'],
    ]) {
      assert.notEqual(f.run(...args).status, 0);
      assert.equal(existsSync(f.manifest), false);
    }
    const result = f.run(...f.approveArgs());
    assert.equal(result.status, 0, result.stderr);
    const saved = JSON.parse(readFileSync(f.manifest, 'utf8'));
    assert.equal(saved.reviews.example.sha256, f.hash());
    assert.equal(saved.reviews.example.checks.card, true);
    assert.equal(saved.reviews.example.checks.detail, true);
    assert.equal(f.run('validate').status, 0);
    assert.deepEqual(readdirSync(path.join(f.root, 'content')).sort(), ['screenshot-history-baseline.json', 'screenshot-reviews.json', 'startups']);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('orphan assets, orphan reviews, malformed manifests and symlinks do not bypass validation', async () => {
  const f = await fixture();
  try {
    f.writeManifest();
    cpSync(f.image, path.join(f.root, 'public/screenshots/orphan.webp'));
    assert.match(f.run('validate').stderr, /screenshot without startup\/review/);
    rmSync(path.join(f.root, 'public/screenshots/orphan.webp'));
    writeFileSync(f.manifest, JSON.stringify({ schema_version: 1, reviews: { example: f.record(), orphan: f.record() } }));
    assert.match(f.run('validate').stderr, /orphan quality review/);
    for (const manifest of [null, { schema_version: 2, reviews: {} }, { schema_version: 1, reviews: [] }]) {
      writeFileSync(f.manifest, JSON.stringify(manifest));
      assert.notEqual(f.run('validate').status, 0);
    }
    const outside = path.join(f.root, 'outside.json');
    writeFileSync(outside, JSON.stringify({ schema_version: 1, reviews: { example: f.record() } }));
    rmSync(f.manifest);
    symlinkSync(outside, f.manifest);
    assert.notEqual(f.run('validate').status, 0);
    assert.notEqual(f.run(...f.approveArgs()).status, 0);
    assert.equal(JSON.parse(readFileSync(outside, 'utf8')).reviews.example.sha256, f.hash());
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('approve refuses concurrent manifest writers without replacing their lock', async () => {
  const f = await fixture();
  try {
    const lock = path.join(f.root, 'content/.screenshot-reviews.lock');
    writeFileSync(lock, 'other reviewer is writing');
    assert.match(f.run(...f.approveArgs()).stderr, /writer is busy/);
    assert.equal(readFileSync(lock, 'utf8'), 'other reviewer is writing');
    assert.equal(existsSync(f.manifest), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('normal build and unified validator both enforce quality without a bypass environment variable', () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.build, /^npm run screenshots:validate &&/);
  assert.equal(pkg.scripts['screenshots:validate'], 'node scripts/screenshot-quality.mjs validate');
  const validator = readFileSync(path.join(repoRoot, 'scripts/validate.py'), 'utf8');
  assert.ok(validator.indexOf('"screenshot-quality.mjs"') < validator.indexOf('prime_url_cache(startup_files'));
  const manager = readFileSync(path.join(repoRoot, 'scripts/manage.sh'), 'utf8');
  assert.match(manager, /validation\/build has NOT passed/);
  assert.doesNotMatch(readFileSync(path.join(repoRoot, 'scripts/screenshot-quality.mjs'), 'utf8'), /process\.env|--skip|--force|fetch\(/);
});

test('content validator stops on the screenshot gate before any external URL operation', async () => {
  const f = await fixture();
  try {
    const probe = `
import importlib.util, sys
from pathlib import Path
from types import SimpleNamespace
validator_path = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(validator_path.parent))
spec = importlib.util.spec_from_file_location("screenshot_gate_probe", validator_path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
module.REPO_ROOT = Path(sys.argv[2]).resolve()
module.STARTUPS_DIR = module.REPO_ROOT / "content" / "startups"
module.validate_timestamps = lambda _slugs: []
def no_network(*_args):
    raise AssertionError("External URL checks ran before screenshot approval")
module.prime_url_cache = no_network
def blocked(command, **kwargs):
    assert command == ["node", str(module.REPO_ROOT / "scripts" / "screenshot-quality.mjs"), "validate"]
    return SimpleNamespace(returncode=1, stdout="", stderr="FAIL: example: missing quality review\\n")
module.subprocess.run = blocked
assert module.main() == 1
`;
    const result = spawnSync('python3', ['-c', probe, path.join(repoRoot, 'scripts/validate.py'), f.root], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /BUILD BLOCKED.*Repair screenshots/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('npm build actually refuses a fixture catalog without screenshot approval', async () => {
  const f = await fixture();
  try {
    cpSync(path.join(repoRoot, 'package.json'), path.join(f.root, 'package.json'));
    const result = spawnSync('npm', ['run', 'build'], { cwd: f.root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /screenshot-reviews.json/);
    assert.doesNotMatch(result.stdout, /> venturedex@[^\n]+ weekly:og/);
    assert.equal(existsSync(path.join(f.root, 'dist')), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
