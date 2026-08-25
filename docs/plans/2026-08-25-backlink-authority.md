# VentureDex Backlink Authority Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish a citation-ready VentureDex research index and execute the first auditable white-hat authority submissions.

**Architecture:** A pure TypeScript aggregator derives evidence metrics from version-controlled published content. An Astro research page renders those metrics with Dataset JSON-LD, while sitemap, internal routing, IndexNow, GitHub citation metadata, and a backlink ledger make the asset discoverable and measurable.

**Tech Stack:** Astro 7, TypeScript, Node test runner, JSON-LD/Schema.org, GitHub Actions, Cloudflare Workers, IndexNow, GitHub CLI.

---

### Task 1: Build the deterministic evidence aggregate

**Files:**
- Create: `src/lib/evidence-index.ts`
- Create: `tests/evidence-index.test.ts`

**Step 1: Write the failing test**

Cover startup count, unique sources, evidence/risk counts, source-type counts, funding-stage counts, top tags, and the newest content date. Include malformed and duplicate source fixtures.

**Step 2: Run the focused test and verify failure**

Run: `npx tsx --test tests/evidence-index.test.ts`

Expected: FAIL because `buildEvidenceIndex` does not exist.

**Step 3: Implement the minimal pure aggregator**

Parse `Startup.research_json` through the existing normalizer, deduplicate valid HTTP(S) source URLs, normalize CSV tags, preserve deterministic sort order, and return serializable primitives only.

**Step 4: Run the focused test**

Run: `npx tsx --test tests/evidence-index.test.ts`

Expected: PASS.

### Task 2: Add citation-grade structured data

**Files:**
- Modify: `src/lib/seo.ts`
- Modify: `tests/seo.test.ts`

**Step 1: Write a failing JSON-LD test**

Assert that the research graph defines `/research#dataset`, uses `/research` as the dataset URL, carries `dateModified`, exposes evidence variables, and lists the existing JSON/Markdown/RSS distributions without claiming a license.

**Step 2: Run the focused test and verify failure**

Run: `npx tsx --test tests/seo.test.ts`

Expected: FAIL because `researchIndexJsonLd` does not exist.

**Step 3: Implement `researchIndexJsonLd` and point the homepage Dataset entity at `/research`**

Reuse existing Organization, WebSite, WebPage, breadcrumb, URL, and undefined-stripping helpers.

**Step 4: Rerun the SEO tests**

Run: `npx tsx --test tests/seo.test.ts`

Expected: PASS.

### Task 3: Publish the research page and discovery paths

**Files:**
- Create: `src/pages/research.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/layouts/Base.astro`
- Modify: `src/pages/sitemap.xml.ts`
- Modify: `scripts/promotion/indexnow.ts`
- Modify: `scripts/promotion/growth-report.ts`
- Modify: `tests/indexnow.test.ts`
- Modify: `tests/seo.test.ts`

**Step 1: Extend route/source tests to require `/research`**

Assert that the sitemap source includes the route and the IndexNow hub selection includes its canonical URL.

**Step 2: Run focused tests and verify failure**

Run: `npx tsx --test tests/indexnow.test.ts tests/seo.test.ts`

Expected: FAIL on the missing research route.

**Step 3: Implement the editorial data-ledger page**

Render a server-free, build-time page with scope, as-of date, ledger metrics, stage/source distributions, top themes, methodology, limitations, correction path, citation text, and machine-readable download links. Add a compact homepage route and footer link. Add `/research` to sitemap, IndexNow hubs, and growth-report hub coverage.

**Step 4: Rerun focused tests and build**

Run: `npx tsx --test tests/indexnow.test.ts tests/seo.test.ts && npm run typecheck && npm run build`

Expected: PASS, and `dist/client/research/index.html` contains the canonical, citation text, and Dataset JSON-LD.

### Task 4: Make the public GitHub surface citable

**Files:**
- Create: `README.md`
- Create: `CITATION.cff`

**Step 1: Add a concise repository README**

Link the live site, research index, editorial policy, AI index, and contribution/correction email. Describe the project as source-backed editorial research and state that public access does not grant model-training or unrestricted reuse permission.

**Step 2: Add a dataset citation file**

Use CFF 1.2.0 with `type: dataset`, VentureDex authorship, version, repository URL, and canonical research URL. Do not add a license or DOI that does not exist.

**Step 3: Validate YAML and links**

Run: `ruby -e 'require "yaml"; YAML.safe_load_file("CITATION.cff", permitted_classes: [Date]); puts "valid"' -r date`

Expected: `valid`.

### Task 5: Add the audited acquisition ledger

**Files:**
- Create: `docs/promotion/backlinks/README.md`
- Create: `docs/promotion/backlinks/2026-08-25-prospects.tsv`

**Step 1: Record qualified opportunities**

For every candidate record the source URL, submission/policy URL, opportunity type, target page, relevance, account/payment constraint, status, evidence URL, and next review date. Exclude paid dofollow placements, PBNs, bulk directories, and irrelevant lists.

**Step 2: Document status semantics and review cadence**

Make `submitted` distinct from `accepted`, and record that `nofollow`/`ugc` links can have referral/discovery value without being represented as PageRank wins.

**Step 3: Check the tab-separated file**

Run a small Node read that asserts one header width, unique opportunity IDs, allowed statuses, and non-empty canonical/policy URLs.

Expected: PASS.

### Task 6: Run the full local acceptance gate

**Files:**
- Verify all changed files.

**Step 1: Inspect desktop and 390px output**

Run the local preview and confirm the research page, homepage route, footer route, chart labels, focus states, and no-JavaScript readability.

**Step 2: Run repository gates**

Run: `npm audit --audit-level=high`

Run: `bash scripts/manage.sh validate`

Run: `git diff --check`

Expected: all pass. Restore generated validation outputs that are not part of this feature before committing.

### Task 7: Release and execute external submissions

**Files:**
- No new product files unless review feedback requires a scoped fix.

**Step 1: Push the feature branch and open a focused pull request**

Disclose the data derivation, licensing boundary, local gates, and external-submission plan.

**Step 2: Wait for Validate, merge, and wait for the exact-main Deploy**

Record the PR, merged SHA, Validate run, Deploy run, and live response separately.

**Step 3: Verify the live asset**

Check `/research`, sitemap inclusion, canonical, Dataset JSON-LD, mobile rendering, and machine-readable links. Submit `/research` through the existing IndexNow explicit-URL path only after the exact deployment succeeds; treat HTTP 200 as a receipt.

**Step 4: Update GitHub repository metadata**

Set the repository homepage to `https://venturedex.co`, improve the factual description, and add relevant repository topics.

**Step 5: Open two focused, disclosed resource-list pull requests**

Target only lists whose current policies and sections match founder market research. Link to `/research`, disclose affiliation, and update the ledger to `submitted` with exact PR URLs. Do not mark either link acquired until merged and live on the default branch.

**Step 6: Final evidence review**

Search for the exact domain and brand, check Cloudflare referrers, and report live, submitted, accepted, blocked, and future-review states independently.
