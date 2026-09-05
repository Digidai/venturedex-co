#!/usr/bin/env node
// Offline audit derivatives only; never captures a browser or modifies assets.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public/screenshots");
const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error("Supply an absolute external output directory");
const reviewSpec = process.argv[3];
await mkdir(output, { recursive: true });
if (reviewSpec) {
  const index = JSON.parse(await readFile(path.join(output, "index.json"), "utf8"));
  const spec = JSON.parse(await readFile(reviewSpec, "utf8"));
  const result = {};
  for (const entry of index) {
    if (!spec.reviewedSheets.includes(entry.sheet)) continue;
    const decision = spec.decisions?.[entry.slug];
    result[entry.slug] = {
      verdict: decision ? "recapture" : "pass",
      reason: decision || "Reviewed full contact-sheet tile: identifiable product, readable main content, no blocking capture defect.",
      sha256: entry.sha256,
    };
  }
  for (const slug of Object.keys(spec.decisions || {})) {
    if (!result[slug]) throw new Error(`Decision outside reviewed sheets: ${slug}`);
  }
  await writeFile(spec.output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ reviewed: Object.keys(result).length, output: spec.output }));
  process.exit(0);
}

await mkdir(path.join(output, "originals"), { recursive: true });
const names = (await readdir(source)).filter(name => /\.(webp|png|jpe?g)$/i.test(name)).sort();
const entries = [];
const cellWidth = 640, imageHeight = 420, labelHeight = 36, gap = 12;
for (let offset = 0; offset < names.length; offset += 6) {
  const overlays = [];
  const sheet = String(Math.floor(offset / 6) + 1).padStart(2, "0");
  for (const [position, name] of names.slice(offset, offset + 6).entries()) {
    const data = await readFile(path.join(source, name));
    const slug = name.replace(/\.[^.]+$/, "");
    const sha256 = createHash("sha256").update(data).digest("hex");
    const metadata = await sharp(data).metadata();
    await writeFile(path.join(output, "originals", name), data);
    const thumbnail = await sharp(data).resize(cellWidth, imageHeight, { fit: "contain", background: "#d8dee6" }).png().toBuffer();
    const label = `<svg width="${cellWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#ffffff"/><text x="10" y="25" font-family="sans-serif" font-size="20" fill="#111">${offset + position + 1}. ${slug} (${metadata.width}×${metadata.height})</text></svg>`;
    const left = (position % 2) * (cellWidth + gap);
    const top = Math.floor(position / 2) * (imageHeight + labelHeight + gap);
    overlays.push({ input: thumbnail, left, top }, { input: Buffer.from(label), left, top: top + imageHeight });
    entries.push({ slug, name, sheet, sha256, width: metadata.width, height: metadata.height, original: path.join(output, "originals", name) });
  }
  await sharp({ create: { width: cellWidth * 2 + gap, height: 3 * (imageHeight + labelHeight + gap) - gap, channels: 3, background: "#607080" } }).composite(overlays).png().toFile(path.join(output, `sheet-${sheet}.png`));
}
await writeFile(path.join(output, "index.json"), JSON.stringify(entries, null, 2) + "\n");
console.log(JSON.stringify({ images: entries.length, sheets: Math.ceil(entries.length / 6), output }));
