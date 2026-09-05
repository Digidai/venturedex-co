#!/usr/bin/env node
// Offline integrity gate. Visual judgments are explicit reviewer attestations,
// not an image-score heuristic and not evidence supplied by the importer.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const CHECKS = ['loaded', 'unobstructed', 'legible', 'framing', 'card', 'detail'];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;
const IMAGE_OPTIONS = { limitInputPixels: 50_000_000, failOn: 'warning' };
const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function productUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) throw new Error('Invalid source URL.');
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('Source URL must be HTTP(S), without credentials.');
  }
  return url;
}

function regularFile(filename, maxBytes = 40 * 1024 * 1024) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > maxBytes) {
    throw new Error('Expected a nonempty regular file, not a symlink, within the size limit.');
  }
  if (fs.realpathSync(filename) !== path.resolve(filename)) throw new Error('File path must not traverse a symlink.');
  return fs.readFileSync(filename);
}

export async function inspectImage(source, { nativeCapture = false, webpOnly = false } = {}) {
  const bytes = typeof source === 'string' ? regularFile(source) : source;
  const metadata = await sharp(bytes, IMAGE_OPTIONS).metadata();
  if (!(webpOnly ? ['webp'] : ['png', 'jpeg', 'webp']).includes(metadata.format) || (metadata.pages ?? 1) !== 1) {
    throw new Error(webpOnly ? 'Final screenshot must be a single-frame WebP.' : 'Capture must be a single-frame PNG, JPEG, or WebP.');
  }
  const rotated = [5, 6, 7, 8].includes(metadata.orientation);
  const width = rotated ? metadata.height : metadata.width;
  const height = rotated ? metadata.width : metadata.height;
  if (width < 1280 || height < 720) throw new Error('Capture is too small; recapture a desktop viewport of at least 1280x720 without upscaling.');
  const ratio = width / height;
  if (ratio < 1.4 || (nativeCapture && ratio > 2.1) || ratio > 3) {
    throw new Error('Invalid viewport framing; use a landscape viewport, not a full-page or panoramic capture.');
  }
  // Decode actual pixels, not just the header. Only near-uniform frames are a
  // hard failure: legitimate dark/white layouts still require visual review.
  // stats() examines decoded input pixels. Do not remove alpha first: an
  // invisible image must not pass based on hidden RGB content.
  const stats = await sharp(bytes, IMAGE_OPTIONS).stats();
  if (metadata.hasAlpha && !stats.isOpaque) throw new Error('Screenshot contains transparent pixels; recapture the opaque browser viewport.');
  const maxDeviation = Math.max(...stats.channels.map(channel => channel.stdev));
  if (maxDeviation < 3.5 && stats.entropy < 0.3) throw new Error('Blank or near-uniform screenshot; capture meaningful loaded product content.');
  return { sha256: createHash('sha256').update(bytes).digest('hex'), width, height, format: metadata.format };
}

export function reviewErrors(review, image, startup, baseline) {
  if (!object(review)) return ['missing quality review'];
  const errors = [];
  if (!/^[a-f0-9]{64}$/.test(review.sha256 ?? '') || review.sha256 !== image.sha256) errors.push('stale or invalid review SHA-256');
  if (review.width !== image.width || review.height !== image.height) errors.push('review dimensions do not match final image');
  if (!['codex-iab', 'historical-reviewed'].includes(review.capture_method)) errors.push('invalid capture_method');
  if (review.capture_method === 'historical-reviewed' && (!startup?.slug || !baseline?.assets
    || !own(baseline.assets, startup.slug) || baseline.assets[startup.slug] !== image.sha256)) {
    errors.push('historical-reviewed is restricted to the frozen original slug and SHA-256; changed/new captures require codex-iab independent review');
  }
  if (review.capture_method === 'codex-iab') {
    if (image.width / image.height > 2.1) errors.push('native capture aspect ratio must not exceed 2.1; recapture a readable desktop viewport');
    if (typeof review.capture_operator !== 'string' || review.capture_operator.trim().length < 3 || review.capture_operator.length > 200 || /[\u0000-\u001f\u007f]/.test(review.capture_operator)) {
      errors.push('native capture_operator required for independent review');
    } else if (review.capture_operator.trim().toLowerCase() === String(review.reviewer).trim().toLowerCase()) {
      errors.push('native capture_operator and final reviewer must be different');
    }
  }
  if (typeof review.reviewed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(review.reviewed_at)
    || !Number.isFinite(Date.parse(review.reviewed_at)) || new Date(review.reviewed_at).toISOString() !== review.reviewed_at.replace(/(?<=:\d{2})Z$/, '.000Z')
    || Date.parse(review.reviewed_at) > Date.now() + 300_000) errors.push('invalid or future reviewed_at');
  for (const key of ['reviewer', 'notes']) {
    if (typeof review[key] !== 'string' || review[key].trim().length < (key === 'notes' ? 12 : 3) || review[key].length > 2000 || /[\u0000-\u001f\u007f]/.test(review[key])) errors.push(`meaningful single-line ${key} required`);
  }
  if (!object(review.checks) || CHECKS.some(key => !own(review.checks, key) || review.checks[key] !== true)) errors.push(`all visual checks must be explicitly true: ${CHECKS.join(', ')}`);
  try {
    const source = productUrl(review.source_url);
    if (startup) {
      const host = value => value.hostname.toLowerCase().replace(/^www\./, '');
      const expected = host(productUrl(startup.url));
      const actual = host(source);
      if (actual !== expected && !actual.endsWith(`.${expected}`) && !String(review.notes).includes(`Official source: ${actual}`)) {
        errors.push(`source URL host differs from product; document verified redirect with "Official source: ${actual}" in notes`);
      }
    }
  } catch { errors.push('invalid source_url'); }
  return errors;
}

function readManifest(root, allowMissing = false) {
  const filename = path.join(root, 'content', 'screenshot-reviews.json');
  if (allowMissing && !fs.existsSync(filename)) return { schema_version: 1, reviews: {} };
  const manifest = JSON.parse(regularFile(filename, 5 * 1024 * 1024).toString('utf8'));
  if (!object(manifest) || manifest.schema_version !== 1 || !object(manifest.reviews)) throw new Error('Invalid screenshot review manifest schema.');
  return manifest;
}

function readHistoryBaseline(root) {
  const filename = path.join(root, 'content', 'screenshot-history-baseline.json');
  const baseline = JSON.parse(regularFile(filename, 5 * 1024 * 1024).toString('utf8'));
  if (!object(baseline) || baseline.schema_version !== 1 || !/^[a-f0-9]{40}$/.test(baseline.base_commit ?? '')
    || !object(baseline.assets) || Object.keys(baseline.assets).length === 0
    || Object.entries(baseline.assets).some(([slug, hash]) => !SLUG.test(slug) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('Invalid frozen screenshot history baseline schema.');
  }
  return baseline;
}

export async function validateCatalog(root = ROOT) {
  const errors = [];
  let manifest;
  try { manifest = readManifest(root); }
  catch (error) { return { checked: 0, errors: [`screenshot-reviews.json: ${error.message}`] }; }
  let baseline;
  try { baseline = readHistoryBaseline(root); }
  catch (error) { return { checked: 0, errors: [`screenshot-history-baseline.json: ${error.message}`] }; }
  const directory = path.join(root, 'content', 'startups');
  const files = fs.readdirSync(directory).filter(name => name.endsWith('.json')).sort();
  if (!files.length) return { checked: 0, errors: ['No startup files; refusing empty screenshot validation.'] };
  const slugs = new Set();
  for (const filename of files) {
    const slug = path.basename(filename, '.json');
    slugs.add(slug);
    try {
      if (!SLUG.test(slug)) throw new Error('Invalid startup filename slug.');
      const startup = JSON.parse(regularFile(path.join(directory, filename)).toString('utf8'));
      if (startup.slug !== slug) throw new Error('Startup slug does not match filename.');
      const image = await inspectImage(path.join(root, 'public', 'screenshots', `${slug}.webp`), { webpOnly: true });
      for (const error of reviewErrors(own(manifest.reviews, slug) ? manifest.reviews[slug] : undefined, image, startup, baseline)) errors.push(`${slug}: ${error}`);
    } catch (error) { errors.push(`${slug}: ${error.message}`); }
  }
  for (const slug of Object.keys(manifest.reviews)) if (!slugs.has(slug)) errors.push(`${slug}: orphan quality review without startup`);
  for (const filename of fs.readdirSync(path.join(root, 'public', 'screenshots'))) {
    if (filename.endsWith('.webp') && !slugs.has(path.basename(filename, '.webp'))) errors.push(`${filename}: screenshot without startup/review`);
  }
  return { checked: files.length, errors };
}

function approveOptions(args) {
  const values = {};
  const accepted = new Set(['--sha256', '--source-url', '--capture-method', '--capture-operator', '--reviewer', '--notes', ...CHECKS.map(key => `--${key}`)]);
  while (args.length) {
    const key = args.shift();
    if (!accepted.has(key) || own(values, key)) throw new Error(`Unknown or duplicate option: ${key}`);
    if (CHECKS.includes(key.slice(2))) values[key] = true;
    else {
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
      values[key] = value;
    }
  }
  return values;
}

export async function approve(slug, args, root = ROOT) {
  if (!SLUG.test(slug ?? '')) throw new Error('Invalid slug.');
  const values = approveOptions([...args]);
  if (CHECKS.some(key => values[`--${key}`] !== true)) throw new Error('Approval requires each explicit visual check flag after inspecting the final image, card, and detail page.');
  const asset = path.join(root, 'public', 'screenshots', `${slug}.webp`);
  const image = await inspectImage(asset, { webpOnly: true });
  if (values['--sha256'] !== image.sha256) throw new Error('Expected --sha256 must match the final asset you actually reviewed.');
  const startup = JSON.parse(regularFile(path.join(root, 'content', 'startups', `${slug}.json`)).toString('utf8'));
  if (startup.slug !== slug) throw new Error('Startup slug does not match filename.');
  const review = {
    sha256: image.sha256, width: image.width, height: image.height,
    source_url: values['--source-url'], capture_method: values['--capture-method'],
    ...(values['--capture-operator'] ? { capture_operator: values['--capture-operator'] } : {}),
    reviewed_at: new Date().toISOString(), reviewer: values['--reviewer'],
    checks: Object.fromEntries(CHECKS.map(key => [key, values[`--${key}`]])), notes: values['--notes'],
  };
  const errors = reviewErrors(review, image, startup, readHistoryBaseline(root));
  if (errors.length) throw new Error(errors.join('; '));
  const directory = path.join(root, 'content');
  if (fs.realpathSync(directory) !== directory) throw new Error('Content directory must not traverse a symlink.');
  // Serialize reviews from independent agents; never overwrite a concurrently
  // approved entry based on a stale copy of the manifest.
  const lock = path.join(directory, '.screenshot-reviews.lock');
  let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Screenshot review writer is busy; retry after it finishes.'); throw error; }
  let temporary;
  try {
    const manifest = readManifest(root, true);
    if ((await inspectImage(asset, { webpOnly: true })).sha256 !== image.sha256) throw new Error('Asset changed during approval; inspect again.');
    manifest.reviews[slug] = review;
    manifest.reviews = Object.fromEntries(Object.entries(manifest.reviews).sort(([a], [b]) => a.localeCompare(b)));
    temporary = path.join(directory, `.screenshot-reviews.${randomUUID()}.tmp`);
    const output = fs.openSync(temporary, 'wx', 0o644);
    try { fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n'); fs.fsyncSync(output); }
    finally { fs.closeSync(output); }
    fs.renameSync(temporary, path.join(directory, 'screenshot-reviews.json'));
    temporary = undefined;
  } finally {
    if (temporary) fs.unlinkSync(temporary);
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
  return review;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'validate' && args.length === 0) {
    const result = await validateCatalog();
    for (const error of result.errors) console.error(`FAIL: ${error}`);
    console.log(`Screenshot quality: ${result.checked} assets checked, ${result.errors.length} errors.`);
    process.exitCode = result.errors.length ? 1 : 0;
  } else if (command === 'inspect' && args.length === 1 && SLUG.test(args[0])) {
    console.log(JSON.stringify(await inspectImage(path.join(ROOT, 'public', 'screenshots', `${args[0]}.webp`), { webpOnly: true }), null, 2));
  } else if (command === 'approve') {
    const slug = args.shift();
    const review = await approve(slug, args);
    console.log(`Approved reviewer attestation for ${slug} at SHA-256 ${review.sha256}. Any changed pixels invalidate this record.`);
  } else if (command === '--help' || command === '-h') {
    console.log('Offline screenshot gate: validate | inspect <slug> | approve <slug> --sha256 HASH --source-url URL --capture-method codex-iab|historical-reviewed --capture-operator CAPTURER --reviewer REVIEWER --notes "specific observed evidence" --loaded --unobstructed --legible --framing --card --detail');
    console.log('Native captures require different capture-operator and reviewer attestations. Historical captures may omit capture-operator only when the exact slug and SHA-256 match the frozen original baseline. Changed/new images cannot claim historical status. These are review records, not authenticated identities or automatic proof of visual quality/browser provenance.');
  } else throw new Error('Use --help. Unknown commands/options fail closed.');
}

if (process.argv[1] && process.argv[1] !== '-' && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`ERROR: ${error.message}`); process.exitCode = 1; });
}
