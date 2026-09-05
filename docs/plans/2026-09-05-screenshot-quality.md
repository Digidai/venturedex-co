# Screenshot Quality and Historical Repair Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This workspace uses the available `executing-plans` equivalent; the user has already approved implementation and historical repair.

**Goal:** Review every published screenshot, repair unacceptable captures with the Codex in-app browser, and prevent unreviewed or stale image assets from being published.

**Architecture:** Native browser capture stays separate from offline image import. Import preserves real content and aspect ratio without enlargement or added padding. A versioned review ledger binds explicit visual checks to the exact final image SHA-256. Offline validation and the build both enforce this ledger. Gallery, search, and detail rendering preserve the entire image.

**Tech Stack:** Codex native in-app browser, Node.js/sharp, Python content validator, Astro/CSS, Node test runner, GitHub Actions/Cloudflare existing release workflow.

## Task 1: Isolate and establish the baseline

- Keep the user's main checkout and unrelated worktrees untouched. Create `codex/screenshot-quality-20260905` from verified origin/main `e404ec73a8bb66209726ea559ffda8d3b93bb516`.
- Bootstrap dependencies using the existing script. Inventory all 299 assets and all rendering consumers.
- Reproduce missing review enforcement, blank-input acceptance, artificial padding/enlargement, and cropped card/detail images.

## Task 2: Implement a fail-closed screenshot review gate

- Files: `scripts/screenshot.sh`, `scripts/screenshot-quality.mjs`, `scripts/manage.sh`, `scripts/validate.py`, `package.json`, screenshot tests.
- First add failing tests for missing/stale reviews, incomplete checks, malformed assets, low-resolution captures, blank images, and content-preserving conversion.
- Import only native reviewed local captures. Do not treat `--reviewed` as final publication approval. Preserve original aspect ratio, never upscale or pad; reject full-page/undersized capture geometry.
- Add explicit approval of final images and validate all published slugs against the ledger. Bind source URL, capture provenance, dimensions, reviewer, time, notes, six visual checks, and SHA-256.
- Make the full validator and normal build fail on absent, rejected, or stale review records. Test conversion separately from visual attestation.

## Task 3: Remove presentation-dependent clipping

- Files: `src/components/SiteCard.astro`, `src/pages/search.astro`, `src/pages/startups/[slug].astro`, shared CSS and regression tests.
- First add tests demonstrating differing card ratios, `cover`, image zoom, and detail max-height clipping.
- Use a consistent 16:9 gallery frame with contain; preserve natural image ratio in details; expose the full-size image.
- Verify card/search/detail and narrow layouts using the Codex browser.

## Task 4: Audit and repair all historical screenshots

- Files: all `public/screenshots/*.webp`, `content/screenshot-reviews.json`, review report.
- Generate labelled review sheets, inspect every image, and inspect suspicious originals at full resolution. Record per-image verdicts and exact hashes, not metadata-only approvals.
- Reject blank/loading/error/consent screens, unreadable animation frames, browser chrome, and framing that loses the product subject. Do not reject genuine product UI as a popup.
- Recapture rejected images through task-owned `iab` tabs only, dismissing actual overlays through visible controls. Prefer stable meaningful product sections when the hero is unsuitable. Preserve original screenshots until a better native capture is verified.
- Independently inspect replacement source/final assets and actual rendering before ledger approval. Historical reviewed assets retain honest historical provenance; do not claim they were natively recaptured.

## Task 5: Integrate operating instructions and release

- Update `content/STANDARD.md`, `content/CODEX_TASK.md`, the Daily runbook, and workflow-facing instructions to require the new review command and ledger. Preserve schedules, browser ownership, and GSC duplicate-request safeguards.
- Run focused tests, full `manage.sh validate`, GitHub Actions configuration check, and `git diff --check`.
- Commit implementation/assets and documentation separately. Publish only through the existing exact-SHA Validate → Deploy workflow. Verify live images/card/detail/search on both hosts and record exact CI/deploy evidence.
- Do not initiate curation, newsletter delivery, GSC requests, or remote deletion. Clean only this worktree after its commits are remote-reachable, preserving evidence externally.

## Acceptance

- Every published slug has a reviewed exact-hash screenshot record, with no unresolved visual rejects silently marked approved.
- Any byte change, missing file/review, failed check, invalid dimensions, or corrupt asset blocks publication.
- No screenshot workflow invokes bb-browser, Comet, CDP, or external Playwright.
- Actual live presentation preserves full content and improves the rejected historical screenshots.
