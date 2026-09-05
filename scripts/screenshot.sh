#!/bin/bash
# Import a visually reviewed Codex in-app browser screenshot as a static asset.
# Browser interaction belongs to Codex's native browser tools, never this script.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

usage() {
  printf '%s\n' \
    'VentureDex screenshot importer (Codex in-app browser)' \
    'Usage: screenshot.sh <slug> <url> --from-codex /absolute/capture.png --reviewed [--check-only]' \
    '' \
    '1. Open the product URL using Codex native browser tools (browser: iab).' \
    '2. Wait for product content, dismiss overlays through visible UI, and capture.' \
    '3. Visually review the actual image: no blank/loading/consent surface.' \
    '4. Import that local PNG, JPEG, or WebP with --from-codex and --reviewed.' \
    '' \
    'The importer runs offline, preserves aspect ratio, and writes a 1440x900 WebP.' \
    'Review the final WebP too. No browser, daemon, Cloudflare request, or upload is started.'
}

if [ "${1:-}" = '--help' ] || [ "${1:-}" = '-h' ]; then
  usage
  exit 0
fi
if [ "$#" -lt 2 ]; then
  usage >&2
  exit 2
fi

slug="$1"
url="$2"
shift 2
capture=""
reviewed=0
check_only=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --from-codex)
      if [ "$#" -lt 2 ] || [ -n "$capture" ]; then
        echo 'ERROR: --from-codex requires exactly one local capture path.' >&2
        exit 2
      fi
      capture="$2"
      shift 2
      ;;
    --reviewed)
      reviewed=1
      shift
      ;;
    --check-only)
      check_only=1
      shift
      ;;
    *)
      echo "ERROR: Unknown screenshot argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$capture" ] || [ "$reviewed" -ne 1 ]; then
  echo 'BLOCKED: Native Codex browser capture and explicit visual review are required; no screenshot was changed.' >&2
  usage >&2
  exit 2
fi

node --input-type=module - "$REPO_ROOT" "$slug" "$url" "$capture" "$check_only" <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const [root, slug, rawUrl, capture, checkOnly] = process.argv.slice(2);
let temporaryPath;
try {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(slug)) {
    throw new Error('Invalid slug; use at most 100 lowercase letters, digits, or internal hyphens.');
  }
  if (/[\u0000-\u0020\u007f]/.test(rawUrl)) throw new Error('Invalid product URL.');
  const url = new URL(rawUrl);
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('Product URL must be an HTTP(S) URL without credentials.');
  }
  if (!path.isAbsolute(capture) || /[\u0000\r\n]/.test(capture)) {
    throw new Error('--from-codex requires an absolute local image path.');
  }
  const sourceStat = fs.lstatSync(capture);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || sourceStat.size === 0 || sourceStat.size > 40 * 1024 * 1024) {
    throw new Error('Capture must be a nonempty regular image file no larger than 40 MiB, not a symlink.');
  }
  const require = createRequire(path.join(root, 'package.json'));
  let sharp;
  try { sharp = require('sharp'); }
  catch { throw new Error('Image dependencies unavailable; run scripts/bootstrap-automation.sh first.'); }

  const source = fs.readFileSync(capture);
  const options = { limitInputPixels: 50_000_000, failOn: 'warning' };
  const metadata = await sharp(source, options).metadata();
  if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) !== 1) {
    throw new Error('Capture must be a single-frame PNG, JPEG, or WebP.');
  }
  if (metadata.width < 720 || metadata.height < 450) {
    throw new Error('Capture is too small; recapture a desktop viewport, preferably 1440x900.');
  }
  const output = await sharp(source, options)
    .rotate()
    .resize(1440, 900, { fit: 'contain', background: '#ffffff' })
    .webp({ quality: 92 })
    .toBuffer();
  const verified = await sharp(output, options).metadata();
  if (verified.format !== 'webp' || verified.width !== 1440 || verified.height !== 900 || output.length === 0) {
    throw new Error('Converted screenshot did not pass WebP format/dimension validation.');
  }
  if (checkOnly === '1') {
    console.log('OK: reviewed Codex capture passed offline preflight; no screenshot was written.');
    process.exit(0);
  }

  const directory = path.join(root, 'public', 'screenshots');
  fs.mkdirSync(directory, { recursive: true });
  if (fs.realpathSync(directory) !== directory) throw new Error('Screenshot output directory must not traverse a symlink.');
  const destination = path.join(directory, `${slug}.webp`);
  try {
    if (!fs.lstatSync(destination).isFile() || fs.lstatSync(destination).isSymbolicLink()) {
      throw new Error('Existing screenshot is not a regular file; refusing to replace it.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  temporaryPath = path.join(directory, `.${slug}.${randomUUID()}.tmp`);
  const fd = fs.openSync(temporaryPath, 'wx', 0o644);
  try {
    fs.writeFileSync(fd, output);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.renameSync(temporaryPath, destination);
  temporaryPath = undefined;
  console.log(`OK: imported reviewed Codex browser capture for ${rawUrl}`);
  console.log(`${destination} (1440x900 WebP, ${output.length} bytes; aspect ratio preserved)`);
  console.log('Local static asset only; visually review the final WebP before publishing.');
} catch (error) {
  if (temporaryPath) {
    try { fs.unlinkSync(temporaryPath); } catch {}
  }
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
}
JS
