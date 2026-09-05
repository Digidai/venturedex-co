# Screenshot quality protocol

The Codex in-app browser is the only capture runtime. The importer is offline and the review ledger is a publication gate, not an automatic aesthetic score. Never start bb-browser, Comet, CDP, or external Playwright as a fallback.

## Capture and choose

1. Create a task-owned `iab` tab, verify the official URL, and use a desktop viewport at default zoom (native 1280x720 is supported). Do not stretch a browser image or shrink a full-page screenshot.
2. Wait for fonts, product graphics, and text to settle. Dismiss only actual consent/chat overlays using visible controls. Do not delete DOM nodes or conceal real product UI.
3. Inspect the returned native screenshot. Reject blank/error/loading screens, animation residue, obstructed text, unreadable/tiny subjects, and badly cut framing. A meaningful product section is valid; a homepage hero is not compulsory. Compare a second candidate when the first is doubtful.
4. Save native bytes, without alteration, to an absolute task-owned path. Import with `scripts/screenshot.sh SLUG URL --from-codex ABS --reviewed`. Import success is provisional. Conversion never upscales, crops, or adds padding.

## Independent final review

The capture operator and final reviewer must differ. Inspect final WebP at readable size and its presentation in the shared card frame and natural-ratio detail view, including a narrow layout. The card itself already labels the company; a missing logo inside a useful product section is not an automatic failure. Low-level metrics can reject near-uniform/corrupt files but cannot establish visual quality.

| Check | Required observation |
| --- | --- |
| loaded | Actual product/brand content, not skeleton, spinner, error, or incomplete animation |
| unobstructed | No real consent/chat/promotion panel hiding the subject |
| legible | Primary heading or product subject is readable at intended display size |
| framing | Meaningful complete subject, no accidental browser chrome or destructive crop |
| card | Full image survives 16:9 contain frame, no hover zoom crop |
| detail | Natural aspect ratio, no max-height clipping; full-size link works |

Use `node scripts/screenshot-quality.mjs inspect SLUG` to obtain the exact final SHA-256. Then:

```bash
node scripts/screenshot-quality.mjs approve SLUG \
  --sha256 EXACT_REVIEWED_HASH --source-url https://official.example/product \
  --capture-method codex-iab --capture-operator CAPTURE_OPERATOR \
  --reviewer INDEPENDENT_REVIEWER --notes "Specific observed subject and rendering evidence" \
  --loaded --unobstructed --legible --framing --card --detail
```

This records a reviewer attestation; it does not perform the review or authenticate people. `--reviewed` alone cannot approve. Do not invent a second reviewer or mark unchecked boxes. Verified official cross-domain redirects require a specific `Official source: hostname` note, not an arbitrary unrelated URL.

The versioned `content/screenshot-reviews.json` accompanies the exact image. Any byte change invalidates approval. A failed review needs a better capture, not an override. Historical images retained after real visual inspection use `historical-reviewed` provenance; this label must not be used to bypass independent review for new captures.

Historical provenance additionally requires an exact slug/SHA-256 match in `content/screenshot-history-baseline.json`, frozen at migration commit `e404ec73a8bb66209726ea559ffda8d3b93bb516`. Changed or new images cannot claim this label. The baseline is a governance artifact, not part of the Daily writable-content scope; do not append new captures to it.

For catalog-wide historical repairs, record coverage precisely: every source/final image is visually inspected; every image is inspected at the worst-case 320px card size using labelled contain-render simulations; full-catalog geometry checks verify no crop; representative actual homepage, search, card and detail pages are then checked in the Codex browser. Simulation sheets are not browser screenshots, and representative route checks must not be described as 299 individually browsed pages. A failed simulation or real-page example blocks that image until repaired. The batch report records the distinction and hashes of the reviewed assets.

## Verify and publish

```bash
node scripts/screenshot-quality.mjs validate
./scripts/manage.sh validate
git diff --check
```

The quality check also precedes `npm run build`; absent/stale records, failed checks, invalid dimensions, corrupt/blank/transparent images, orphan reviews, and unreviewed assets block publication. Stage the image and review ledger together. The normal exact-SHA Validate → Deploy → live-smoke release remains mandatory. No GSC request or newsletter trigger is implied by screenshot maintenance.
