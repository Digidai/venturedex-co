#!/usr/bin/env node
// Offline review aid. It never captures a browser or grants visual approvals.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractPaths = ['src/styles/screenshots.css', 'src/styles/global.css', 'src/components/SiteCard.astro', 'src/pages/search.astro', 'src/pages/startups/[slug].astro'];
const hash = value => createHash('sha256').update(value).digest('hex');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const inside = (parent, child) => child === parent || child.startsWith(`${parent}${path.sep}`);

async function regular(file) {
  const stat = await lstat(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), `Expected regular, non-symlink file: ${file}`);
  return readFile(file);
}

export function containGeometry(sourceWidth, sourceHeight, frameWidth) {
  for (const value of [sourceWidth, sourceHeight, frameWidth]) assert.ok(Number.isFinite(value) && value > 0, 'Dimensions must be finite and positive');
  const frameHeight = frameWidth * 9 / 16;
  // global.css uses border-box; the shared frame has a one-pixel bottom border.
  const availableHeight = frameHeight - 1;
  assert.ok(availableHeight > 0, 'Frame must leave room for its border');
  const scale = Math.min(frameWidth / sourceWidth, availableHeight / sourceHeight);
  const width = sourceWidth * scale, height = sourceHeight * scale;
  return {
    frame: { width: frameWidth, height: frameHeight },
    content: { width: frameWidth, height: availableHeight },
    rendered: { width, height, scale },
    offset: { x: (frameWidth - width) / 2, y: (availableHeight - height) / 2 },
    sourceRect: { x: 0, y: 0, width: sourceWidth, height: sourceHeight },
    croppedSourcePixels: 0,
  };
}

export async function verifyRenderingContract(root = defaultRoot) {
  const sources = Object.fromEntries(await Promise.all(contractPaths.map(async name => [name, (await regular(path.join(root, name))).toString('utf8')])));
  const css = sources[contractPaths[0]];
  const frame = css.match(/\.startup-screenshot-frame\s*\{([^}]*)\}/s)?.[1] || '';
  const image = css.match(/\.startup-screenshot-frame\s*>\s*img\s*\{([^}]*)\}/s)?.[1] || '';
  assert.match(frame, /aspect-ratio:\s*16\s*\/\s*9\s*;/, 'Shared frame must stay 16:9');
  assert.match(frame, /border-bottom:\s*1px\s+solid\s+var\(--color-border\)\s*;/, 'Geometry requires the observed 1px frame border');
  assert.match(image, /object-fit:\s*contain\s*;/, 'Shared image must use contain');
  assert.match(image, /object-position:\s*center\s*;/);
  assert.match(image, /width:\s*100%\s*;/);
  assert.match(image, /height:\s*100%\s*;/);
  assert.doesNotMatch(css, /object-fit:\s*cover|transform:\s*scale|@media|(?:min-|max-)?height:\s*(?!100%)[\d.]/);
  assert.match(sources[contractPaths[1]], /\*::after\s*\{[^}]*box-sizing:\s*border-box/s, 'Global border-box contract changed');
  for (const name of contractPaths.slice(2, 4)) {
    assert.match(sources[name], /import ["'][^"']*\/styles\/screenshots\.css["']/);
    assert.match(sources[name], /class="[^"]*startup-screenshot-frame/);
    assert.doesNotMatch(sources[name], /object-fit:\s*cover|transform:\s*scale\(/);
    assert.doesNotMatch(sources[name], /\.(?:card-screenshot|s-card-shot)(?:\s*>?\s*img)?\s*\{/, 'Image frame overrides must be reviewed before applying the shared geometry');
  }
  const detail = sources[contractPaths[4]].match(/\.detail-screenshot\s*\{([^}]*)\}/s)?.[1] || '';
  assert.match(detail, /width:\s*100%\s*;/, 'detail width must be natural responsive width');
  assert.match(detail, /height:\s*auto\s*;/, 'detail height must remain auto');
  assert.doesNotMatch(detail, /max-height|min-height|object-fit|aspect-ratio|overflow|transform/, 'detail must not clip or rescale its aspect');
  assert.match(sources[contractPaths[4]], /href=\{screenshotUrl\}[^>]*class="detail-screenshot-link"/s);
  return { passed: true, files: Object.fromEntries(Object.entries(sources).map(([name, value]) => [name, hash(value)])), sharedCss: css, detailCss: `.detail-screenshot {${detail}}` };
}

function html(title, body, style = '') {
  return `<!doctype html><html lang="en" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><link rel="stylesheet" href="shared-screenshots.css"><style>
*{box-sizing:border-box}body{margin:24px;font:14px/1.4 system-ui,sans-serif;color:#1a1a1a;background:#fafaf9;--color-badge-bg:#F3F4F6;--color-border:#E5E5E5}h1{font-size:20px;margin:0 0 6px}p{margin:5px 0}a{color:#2563eb}.notice{max-width:1150px;color:#555;margin-bottom:20px}.cards{display:grid;gap:20px}.item{margin:0;min-width:0}.label{padding:6px 0;font-size:13px}.label small{display:block;color:#666}.detail{max-width:1000px}.links{columns:4;max-width:1160px}.links a{display:block;margin:6px 0}${style}</style><body>${body}</body></html>\n`;
}

function sheetLabel(text, width, height, size = 16, fill = '#ffffff') {
  return Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}"/><text x="8" y="24" font-family="sans-serif" font-size="${size}" fill="#202020">${escape(text)}</text></svg>`);
}

export async function generateReviewGallery({ root = defaultRoot, output }) {
  root = await realpath(root);
  assert.ok(output && path.isAbsolute(output), 'Provide an absolute external output directory');
  output = path.resolve(output);
  assert.ok(!inside(root, output), 'Output must be outside the repository');
  try { await lstat(output); throw new Error('Output directory already exists; use a fresh snapshot directory'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const parent = await realpath(path.dirname(output));
  assert.ok(!inside(root, parent), 'Output must resolve outside the repository');
  const contract = await verifyRenderingContract(root);
  const sourceDirectory = path.join(root, 'public/screenshots');
  assert.equal(await realpath(sourceDirectory), sourceDirectory, 'Screenshot directory must not be a symlink');
  const names = (await readdir(sourceDirectory)).filter(name => /\.webp$/.test(name)).sort();
  assert.ok(names.length > 0, 'No screenshot assets found');
  const images = [];
  // Validate inputs before creating the output. Sources are frozen by bytes + SHA.
  for (const name of names) {
    assert.match(name, /^[a-z0-9][a-z0-9-]*\.webp$/, 'Unexpected screenshot filename');
    const bytes = await regular(path.join(sourceDirectory, name));
    const metadata = await sharp(bytes, { failOn: 'warning' }).metadata();
    assert.ok(metadata.width && metadata.height && metadata.format === 'webp', `Invalid image: ${name}`);
    const slug = name.slice(0, -5);
    const startup = JSON.parse(await regular(path.join(root, 'content/startups', `${slug}.json`)));
    assert.equal(startup.slug, slug, `Content mapping mismatch: ${slug}`);
    images.push({ slug, name: startup.product_name || slug, source_url: startup.url, asset: `assets/${name}`, sha256: hash(bytes), width: metadata.width, height: metadata.height,
      cards: Object.fromEntries([320, 360].map(width => [width, containGeometry(metadata.width, metadata.height, width)])),
      detail: { width: 1000, height: metadata.height * 1000 / metadata.width, croppedSourcePixels: 0 }, bytes });
  }
  await mkdir(output);
  await mkdir(path.join(output, 'assets'));
  await writeFile(path.join(output, 'shared-screenshots.css'), contract.sharedCss, { flag: 'wx' });
  const pages = { 320: [], 360: [] };
  for (const entry of images) {
    await writeFile(path.join(output, entry.asset), entry.bytes, { flag: 'wx' });
    const body = `<h1>${escape(entry.name)} — isolated detail image</h1><p class="notice">Actual detail-image CSS, natural aspect at 1000px. Not the complete production detail route. Source SHA-256: ${entry.sha256}</p><p><a href="index.html">Index</a> · <a href="${entry.asset}">Full original file</a></p><div class="detail"><img class="detail-screenshot" src="${entry.asset}" alt="${escape(entry.name)}"></div>`;
    await writeFile(path.join(output, `detail-${entry.slug}.html`), html(`${entry.slug}: detail`, body, contract.detailCss), { flag: 'wx' });
  }
  for (const width of [320, 360]) {
    for (let offset = 0; offset < images.length; offset += 6) {
      const batch = images.slice(offset, offset + 6), page = String(offset / 6 + 1).padStart(2, '0');
      const filename = `cards-${width}-${page}.html`, simulated = `simulated-${width}-${page}.png`;
      pages[width].push({ page, html: filename, simulated, slugs: batch.map(entry => entry.slug) });
      const cards = batch.map(entry => `<figure class="item"><div class="startup-screenshot-frame"><img src="${entry.asset}" alt="${escape(entry.name)}" loading="eager"></div><figcaption class="label"><a href="detail-${entry.slug}.html">${escape(entry.slug)} · ${escape(entry.name)}</a><small>${entry.width}×${entry.height} · SHA ${entry.sha256.slice(0, 12)}</small></figcaption></figure>`).join('');
      const body = `<h1>Isolated image-frame browser gallery · ${width}px · page ${page}</h1><p class="notice">Uses the frozen production shared CSS; labels are review-only. This is not a complete homepage/search route and viewing it does not grant approval. <a href="index.html">Index</a></p><div class="cards">${cards}</div>`;
      await writeFile(path.join(output, filename), html(filename, body, `.cards{grid-template-columns:repeat(3,${width}px)}`), { flag: 'wx' });
      const imageHeight = Math.round(width * 9 / 16), labelHeight = 48, gap = 18, margin = 24, header = 78;
      const canvasWidth = width * 3 + gap * 2 + margin * 2;
      const canvasHeight = header + (imageHeight + labelHeight) * 2 + gap + margin;
      const composite = [{ input: sheetLabel(`SIMULATED contain geometry — ${width}px — page ${page}; NOT a browser screenshot`, canvasWidth, header, 18, '#e6e9ed'), left: 0, top: 0 }];
      for (const [i, entry] of batch.entries()) {
        const left = margin + (i % 3) * (width + gap), top = header + Math.floor(i / 3) * (imageHeight + labelHeight + gap);
        const thumbnail = await sharp(entry.bytes).resize(width, imageHeight - 1, { fit: 'contain', background: '#F3F4F6' }).extend({ bottom: 1, background: '#E5E5E5' }).png().toBuffer();
        composite.push({ input: thumbnail, left, top }, { input: sheetLabel(`${entry.slug} · ${entry.sha256.slice(0, 10)}`, width, labelHeight), left, top: top + imageHeight });
      }
      await sharp({ create: { width: canvasWidth, height: canvasHeight, channels: 3, background: '#fafaf9' } }).composite(composite).png().toFile(path.join(output, simulated));
    }
  }
  const report = {
    schema_version: 1, generated_at: new Date().toISOString(), source_root: root,
    evidence_kind: 'offline_css_contract_and_contain_geometry', browser_review: 'not_performed', visual_approval_granted: false,
    limitations: ['Simulated PNGs are Sharp derivatives, not browser screenshots.', 'Fractional CSS layout is rounded to whole pixels only in simulated PNGs; JSON preserves fractional geometry.', 'HTML isolates the image frame and detail image, not full production routes.', 'Geometry is rectangular image-fit geometry only; decorative ancestor rounded corners, shadows, and full route layout are not modeled.', 'Each source is independently hash-frozen; regenerate after replacements and verify current hashes.', 'Geometry proves no object-fit cropping under the checked CSS contract, not loading, legibility, content quality, or visual approval.'],
    contract: { passed: contract.passed, files: contract.files }, geometry: { checked: images.length, passed: images.length, card_widths: [320, 360], detail_width: 1000, source_pixels_cropped: 0 },
    pages, images: images.map(({ bytes, ...entry }) => entry),
  };
  await writeFile(path.join(output, 'geometry-review.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  const index = `<h1>VentureDex offline screenshot review snapshot — ${images.length} assets</h1><p class="notice">The PNG contact sheets are geometry simulations, <strong>not browser screenshots</strong>. HTML uses the actual image CSS in an isolated review layout. All files are SHA-bound snapshots; browser and visual approval have NOT been performed by this tool. <a href="geometry-review.json">Geometry + provenance JSON</a></p>${[360, 320].map(width => `<h2>${width}px card frames</h2><div class="links">${pages[width].map(page => `<a href="${page.html}">Page ${page.page} · ${page.slugs[0]}…</a><a href="${page.simulated}">Simulated PNG ${page.page}</a>`).join('')}</div>`).join('')}<h2>1000px natural-aspect detail images</h2><div class="links">${images.map(entry => `<a href="detail-${entry.slug}.html">${escape(entry.slug)}</a>`).join('')}</div>`;
  await writeFile(path.join(output, 'index.html'), html('Screenshot review snapshot', index), { flag: 'wx' });
  return report;
}

export async function checkCurrent(output, root = defaultRoot) {
  const report = JSON.parse(await regular(path.join(output, 'geometry-review.json')));
  const current = await verifyRenderingContract(root);
  const stale = [];
  for (const [file, sha] of Object.entries(report.contract.files)) if (current.files[file] !== sha) stale.push(file);
  const names = (await readdir(path.join(root, 'public/screenshots'))).filter(name => name.endsWith('.webp')).sort();
  if (names.join('\n') !== report.images.map(entry => `${entry.slug}.webp`).sort().join('\n')) stale.push('screenshot inventory changed');
  for (const entry of report.images) {
    try { if (hash(await regular(path.join(root, 'public/screenshots', `${entry.slug}.webp`))) !== entry.sha256) stale.push(entry.slug); }
    catch { stale.push(entry.slug); }
  }
  return { current: stale.length === 0, stale, checked: report.images.length };
}

export async function serveGallery(output, port = 4319) {
  output = await realpath(output);
  await regular(path.join(output, 'geometry-review.json'));
  assert.ok(Number.isInteger(port) && port >= 0 && port <= 65535, 'Invalid local server port');
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
      assert.match(relative, /^(?:[a-z0-9][a-z0-9.-]*\.(?:html|css|json|png)|assets\/[a-z0-9][a-z0-9-]*\.webp)$/);
      const target = path.join(output, relative);
      assert.ok(inside(output, await realpath(target)));
      const bytes = await regular(target);
      response.writeHead(200, { 'Content-Type': mime[path.extname(target)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, output, value] = process.argv.slice(2);
  try {
    if (command === 'generate') {
      const report = await generateReviewGallery({ output });
      console.log(JSON.stringify({ output, images: report.images.length, geometry: report.geometry, browser_review: report.browser_review, visual_approval_granted: false }));
    } else if (command === 'check-current') {
      const result = await checkCurrent(output); console.log(JSON.stringify(result)); if (!result.current) process.exitCode = 1;
    } else if (command === 'serve') {
      const server = await serveGallery(output, value === undefined ? 4319 : Number(value));
      console.log(`Read-only review gallery: http://127.0.0.1:${server.address().port}/`);
    } else {
      console.log('Usage: screenshot-review-gallery.mjs generate /absolute/new-external-directory\n       screenshot-review-gallery.mjs check-current /absolute/gallery-directory\n       screenshot-review-gallery.mjs serve /absolute/gallery-directory [port]\nNo browser capture, live page review, or approval is performed.');
      if (command && !['--help', '-h'].includes(command)) process.exitCode = 2;
    }
  } catch (error) { console.error(`ERROR: ${error.message}`); process.exitCode = 1; }
}
