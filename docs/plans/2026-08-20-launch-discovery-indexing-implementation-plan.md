# Launch Discovery Indexing Implementation Plan

Implementation is test-driven and follows the repository release control plane.

**Goal:** Publish launch changes to IndexNow after a verified deployment and expose every canonical launch page through VentureDex's AI discovery surfaces.

**Architecture:** The snapshot sync produces a deterministic changed-URL artifact. The scheduled workflow waits for the exact release SHA before calling a retrying IndexNow client. Sitemap modification timestamps and AI discovery records are generated from the same versioned launch snapshot.

**Tech Stack:** TypeScript, Node.js test runner, Astro static routes, GitHub Actions, IndexNow JSON API, Cloudflare Workers.

---

### Task 1: Specify launch IndexNow behavior

**Files:**
- Modify: `tests/indexnow.test.ts`
- Modify: `scripts/promotion/content.ts`
- Modify: `scripts/promotion/indexnow.ts`

**Steps:**
1. Add failing tests for `--all-launches`, `--urls-file`, launch path validation, retryable responses, and explicit history paths.
2. Run `npx tsx --test tests/indexnow.test.ts` and confirm the new cases fail.
3. Implement launch URL collection, bounded retries, and durable result recording.
4. Re-run the focused test and confirm it passes.

### Task 2: Produce the post-deploy change set

**Files:**
- Modify: `tests/whatships.test.ts`
- Modify: `scripts/sync-whatships.ts`
- Modify: `src/lib/whatships.ts`

**Steps:**
1. Add failing tests for additions, updates, slug changes, no-op runs, and retained `last_changed_at` timestamps.
2. Run `npx tsx --test tests/whatships.test.ts` and confirm failure.
3. Add optional timestamp reconciliation and `--changed-urls-output` JSON generation.
4. Re-run the focused test and confirm it passes.

### Task 3: Connect notification to the exact deployment

**Files:**
- Modify: `.github/workflows/sync-whatships.yml`
- Modify: `package.json`
- Modify: `tests/whatships.test.ts`

**Steps:**
1. Add workflow-contract assertions that require deploy-run outputs, an exact-SHA success check, post-deploy IndexNow, and artifact upload.
2. Update the workflow and package scripts.
3. Run focused workflow and IndexNow tests.

### Task 4: Add launch records to AI discovery

**Files:**
- Modify: `tests/ai-discovery.test.ts`
- Modify: `src/lib/ai-discovery.ts`
- Modify: `src/lib/ai-discovery-content.ts`
- Modify: `src/pages/llms.txt.ts`
- Modify: `tests/whatships.test.ts`

**Steps:**
1. Add failing tests for launch inventory, canonical URLs, evidence fields, and absence of internal discovery attribution.
2. Extend the AI index and LLM full-text renderer with launch records.
3. Link the public launch JSON endpoint from compact LLM navigation.
4. Re-run focused AI and launch tests.

### Task 5: Align sitemap and governance

**Files:**
- Modify: `src/pages/sitemap.xml.ts`
- Modify: `docs/automation/README.md`
- Modify: `docs/automation/venturedex-whatships-runbook.md`
- Modify: `docs/automation/venturedex-learning-log.md`

**Steps:**
1. Use `last_changed_at` with the original publish date as a compatibility fallback.
2. Document post-deploy notification, backfill, evidence, and failure states.
3. Append the user-directed control-plane change to the learning log.
4. Run `git diff --check`.

### Task 6: Verify and release

**Files:**
- Verify all changed files.

**Steps:**
1. Run the focused tests, `npm test`, `npm run typecheck`, and `npm run build`.
2. Run `bash scripts/manage.sh validate` and resolve only reproducible blockers.
3. Stage the exact files, run `git diff --cached --check`, commit, push, and open a PR.
4. Wait for exact-SHA Validate and Deploy success.
5. Verify live sitemap, AI index, LLM full text, and launch counts.
6. Submit the one-time IndexNow backfill and retain the response evidence.
