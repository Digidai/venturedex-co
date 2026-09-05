import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { checkCurrent, containGeometry, generateReviewGallery, serveGallery, verifyRenderingContract } from '../scripts/screenshot-review-gallery.mjs';

const project = process.cwd();
const contractFiles = ['src/styles/screenshots.css', 'src/styles/global.css', 'src/components/SiteCard.astro', 'src/pages/search.astro', 'src/pages/startups/[slug].astro'];

async function fixture() {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'venturedex-review-gallery-test-'));
  const root = path.join(parent, 'project');
  for (const relative of contractFiles) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    cpSync(path.join(project, relative), path.join(root, relative));
  }
  mkdirSync(path.join(root, 'public/screenshots'), { recursive: true });
  mkdirSync(path.join(root, 'content/startups'), { recursive: true });
  for (const [slug, width, height] of [['wide', 1800, 720], ['normal', 1440, 900]] as const) {
    await sharp({ create: { width, height, channels: 3, background: '#608090' } }).webp().toFile(path.join(root, `public/screenshots/${slug}.webp`));
    writeFileSync(path.join(root, `content/startups/${slug}.json`), JSON.stringify({ slug, product_name: `<${slug}>`, url: `https://${slug}.test/` }));
  }
  return { parent, root, output: path.join(parent, 'gallery') };
}

test('contain geometry accounts for the border-box frame and preserves every source edge', () => {
  for (const [width, height] of [[5100, 1920], [1280, 1024], [1440, 900], [1280, 720]]) {
    for (const cardWidth of [320, 360]) {
      const g = containGeometry(width, height, cardWidth);
      assert.equal(g.frame.width, cardWidth);
      assert.equal(g.frame.height, cardWidth * 9 / 16);
      assert.equal(g.content.height, cardWidth * 9 / 16 - 1);
      assert.equal(g.croppedSourcePixels, 0);
      assert.ok(g.rendered.width <= g.content.width + 1e-7);
      assert.ok(g.rendered.height <= g.content.height + 1e-7);
      assert.ok(Math.abs(g.rendered.width / g.rendered.height - width / height) < 1e-7);
      assert.ok(g.offset.x >= -1e-7 && g.offset.y >= -1e-7);
    }
  }
  assert.throws(() => containGeometry(0, 900, 360));
});

test('contract validation rejects cover, hover zoom, or a clipped detail image', async () => {
  const f = await fixture();
  try {
    assert.equal((await verifyRenderingContract(f.root)).passed, true);
    const css = path.join(f.root, 'src/styles/screenshots.css');
    const original = readFileSync(css, 'utf8');
    writeFileSync(css, original.replace('object-fit: contain', 'object-fit: cover'));
    await assert.rejects(verifyRenderingContract(f.root), /contain/);
    writeFileSync(css, original);
    const detail = path.join(f.root, 'src/pages/startups/[slug].astro');
    writeFileSync(detail, readFileSync(detail, 'utf8').replace('height: auto;', 'height: auto; max-height: 300px;'));
    await assert.rejects(verifyRenderingContract(f.root), /detail/);
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
});

test('gallery binds frozen images and CSS, labels simulations honestly, and cannot approve assets', async () => {
  const f = await fixture();
  try {
    const report = await generateReviewGallery({ root: f.root, output: f.output });
    assert.equal(report.images.length, 2);
    assert.equal(report.geometry.passed, 2);
    assert.equal(report.browser_review, 'not_performed');
    assert.equal(report.visual_approval_granted, false);
    assert.equal(readFileSync(path.join(f.output, 'shared-screenshots.css'), 'utf8'), readFileSync(path.join(f.root, 'src/styles/screenshots.css'), 'utf8'));
    for (const entry of report.images) {
      const bytes = readFileSync(path.join(f.output, entry.asset));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
      assert.equal(entry.cards['360'].croppedSourcePixels, 0);
      assert.equal(entry.detail.width, 1000);
    }
    const page = readFileSync(path.join(f.output, 'cards-360-01.html'), 'utf8');
    assert.match(page, /startup-screenshot-frame/);
    assert.match(page, /shared-screenshots\.css/);
    assert.match(page, /&lt;normal&gt;/);
    assert.match(readFileSync(path.join(f.output, 'index.html'), 'utf8'), /not browser screenshots/);
    assert.ok(existsSync(path.join(f.output, 'simulated-360-01.png')));
    assert.ok(existsSync(path.join(f.output, 'detail-normal.html')));
    assert.equal(existsSync(path.join(f.root, 'content/screenshot-reviews.json')), false);
    await assert.rejects(generateReviewGallery({ root: f.root, output: f.output }), /exists/);
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
});

test('generation rejects repository output and symlinked screenshot sources', async () => {
  const f = await fixture();
  try {
    await assert.rejects(generateReviewGallery({ root: f.root, output: path.join(f.root, 'gallery') }), /outside/);
    symlinkSync(path.join(f.root, 'public/screenshots/normal.webp'), path.join(f.root, 'public/screenshots/symlink.webp'));
    await assert.rejects(generateReviewGallery({ root: f.root, output: f.output }), /regular|symlink/);
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
});

test('current-image check detects post-review replacements without changing the frozen snapshot', async () => {
  const f = await fixture();
  try {
    await generateReviewGallery({ root: f.root, output: f.output });
    assert.equal((await checkCurrent(f.output, f.root)).current, true);
    const snapshot = readFileSync(path.join(f.output, 'assets/normal.webp'));
    await sharp({ create: { width: 1440, height: 900, channels: 3, background: '#909060' } }).webp().toFile(path.join(f.root, 'public/screenshots/normal.webp'));
    const result = await checkCurrent(f.output, f.root);
    assert.equal(result.current, false);
    assert.deepEqual(result.stale, ['normal']);
    assert.deepEqual(readFileSync(path.join(f.output, 'assets/normal.webp')), snapshot);
  } finally { rmSync(f.parent, { recursive: true, force: true }); }
});

test('gallery server is loopback-only, read-only, and cannot expose arbitrary files', async () => {
  const f = await fixture();
  let server: Server | undefined;
  try {
    await generateReviewGallery({ root: f.root, output: f.output });
    server = await serveGallery(f.output, 0);
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    assert.equal(address.address, '127.0.0.1');
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/assets/normal.webp`)).headers.get('content-type'), 'image/webp');
    assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/..%2Fproject%2Fpackage.json`)).status, 404);
    symlinkSync(path.join(f.root, 'content/startups/normal.json'), path.join(f.output, 'secret.json'));
    assert.equal((await fetch(`${base}/secret.json`)).status, 404);
  } finally {
    const activeServer = server;
    if (activeServer) await new Promise<void>((resolve, reject) => activeServer.close((error?: Error) => error ? reject(error) : resolve()));
    rmSync(f.parent, { recursive: true, force: true });
  }
});
