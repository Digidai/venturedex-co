# Screenshot quality repair — 2026-09-05

## Scope and result

The entire 299-image catalog was reviewed against the original files at
`e404ec73a8bb66209726ea559ffda8d3b93bb516`. 251 originals were retained and 48
were replaced with native Codex in-app browser captures. No startup facts,
funding data, publication dates, newsletter jobs, or indexing requests were changed.

The original review identified 44 images needing recapture. Reviewing the
remaining candidates at 320px identified four more: Ciridae, Enigma, Gridcog,
and Moment. Replacements address real overlays, unfinished animations, blank
product regions, undersized subjects, or poor framing. Meaningful official
product sections were selected where a homepage hero was unsuitable.

## Evidence and coverage

- Every final image received visual review; the 48 native source captures and final
  WebPs were checked by a reviewer different from their capture operator.
- Every image received a 320px contained-card visual review. These are explicitly
  labelled simulations, not browser screenshots. Primary content must be readable
  or recognizable; tiny product-interface labels need not be readable in a thumbnail.
- Exact-image geometry checks cover all 299 images at 320px and 360px, and natural
  aspect-ratio detail rendering. These checks prove image fit, not aesthetic quality.
- Three representative isolated shared-CSS views were inspected in the native
  Codex browser: 320px cards, 360px cards, and a full natural-ratio detail image.
- Complete production-route verification is recorded separately below. This is
  not a claim that all 299 individual routes were browsed.

All visual reviews were performed by AI agents; no human review is claimed.
File-header checks confirm all 48 native captures are unaltered JPEG bytes. Their
initial `.png` evidence filenames were retained for traceability; the extension
does not describe the actual encoding. Preserved reviewer references to "source
PNG" refer to those filenames. The audit records the actual format; hashes and
approved final WebPs are unchanged. The importer already decodes real file headers.
The [machine-readable audit](2026-09-05-screenshot-quality.json) includes per-image
before/after SHA-256, reasons, provenance, rendering coverage, and evidence hashes.
The [publication ledger](../../content/screenshot-reviews.json) binds approval to
the exact final WebP bytes.

Reproducible contact-sheet PNGs were removed after review when this host ran out
of disk space. Original image snapshots, raw captures, geometry metadata, per-image
review records and native browser evidence were retained. The audit records this
distinction; deleted derivatives are not represented as still available files.

## Durable changes

Cards and search results use the same 16:9 contain frame, without hover zoom.
Details preserve the image's natural aspect ratio and link to the full-size file.
All screenshot consumers use hash-versioned URLs so replacements do not retain
an old cache key.

The [quality protocol](../automation/screenshot-quality.md) requires six explicit
checks and independent final review. Missing, stale, invalid, or failed reviews
block validation and build. The historical exception is restricted to a frozen
slug/SHA baseline and cannot approve a newly captured image.

## Release verification

The complete local `manage.sh validate` gate passed on 2026-09-05:

- Dependency audit: zero vulnerabilities.
- Content and screenshot validation: 299/299, zero errors. Content validation
  retained 138 non-blocking editorial/investor-directory/source-availability
  warnings outside this image-only repair.
- Unit and release-safety tests: 467/467 passed; no skips or failures.
- Astro check: 122 files, zero errors, warnings, or hints.
- Production build and `git diff --check`: passed.

The built Cloudflare-adapter preview at `http://127.0.0.1:4325` was inspected in
the native Codex browser: homepage cards, `/search?q=natural`, `/startups/natural`,
and `/startups/8090`. Search rendered both matching entries; new 16:9 and retained
16:10 images were fully visible at natural ratio. The full-size href from Natural
was followed in the same task-owned tab and rendered the approved original file;
new-window behavior is not claimed from this check.

A separate HTTP check passed for all 299 versioned image URLs: status 200, WebP
MIME, exact approved SHA-256, and matching search-index screenshot URLs. This
checks publication bytes, not visual quality.

Native screenshots, per-image reports, the HTTP results, and the final exact-SHA
CI/deploy/live receipts are retained in the maintenance evidence directory.
GitHub Validate and Deploy must succeed for the published SHA before closeout;
local checks alone are not deployment evidence.
