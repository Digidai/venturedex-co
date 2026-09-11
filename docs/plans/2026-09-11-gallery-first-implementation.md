# Screenshot-first Discovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. In this environment use the available executing-plans guidance; no sub-agent delegation is authorized.

**Goal:** Put reviewed company screenshots in the first screen and make research browsing continuous without adding cover assets.

**Architecture:** Reuse Astro prerendering, SiteCard and existing query filtering. Isolate related-company ranking and sourced investor participation in pure modules; keep the D1 funding data contract and institutional research freshness unchanged.

**Tech Stack:** Astro 7, TypeScript, JSON content, native HTML forms/disclosures, Node test runner, existing Cloudflare release workflow.

---

## Task 1: Regression tests

Files: `tests/gallery-discovery.test.ts`, `tests/startup-filter.test.ts`, `tests/related-startups.test.ts`, `tests/investor-participation.test.ts`.

Write assertions for gallery-before-markets, priority screenshots, visible query input, query normalization/multiword AND matching, region-only exclusion and deterministic relevance. Add participation fixtures with a source-linked round, investor directory, valid date and exact source URL; reject unknown identities, invalid roles, duplicate relations and unsupported rounds. Run `npx tsx --test tests/gallery-discovery.test.ts tests/startup-filter.test.ts tests/related-startups.test.ts tests/investor-participation.test.ts`; confirm failures before implementation.

## Task 2: Discovery UI

Files: `src/pages/index.astro`, `src/pages/directory.astro`, `src/components/FilterBar.astro`, `src/components/SiteCard.astro`, `src/layouts/Base.astro`, `src/lib/startup-filter.ts`.

Move the bounded gallery above explanatory modules. Add GET `/directory?q=...` search and topic shortcuts. Reuse the filter form for immediate keyword filtering and facets, restore state on `pageshow`/`popstate`, and announce result counts. Keep all screenshot URLs and `object-fit: contain`; add no image source. Collapse secondary navigation using native details, supporting Escape and outside click. Run targeted tests and `npm run typecheck`, then inspect desktop and phone viewports.

## Task 3: Related-company ranking

Files: `src/lib/related-startups.ts`, `src/lib/content-transform.ts`, `tests/related-startups.test.ts`.

Rank published non-self candidates by specific shared tags or exact structured category; generic AI/enterprise labels and matching regions never suffice. Break ties by publication time then slug. Test no mutation, null/malformed research, empty candidates and the Conveo regression. Do not modify editorial selection or stored taxonomy.

## Task 4: Source-bound investor relationships

Files: `content/investor-participations.json`, `src/lib/investor-participation.ts`, `src/lib/investor-activity-content.ts`, `src/pages/investors/index.astro`, `src/pages/investors/[slug].astro`, `src/pages/startups/[slug].astro`, `src/pages/sitemap.xml.ts`, `docs/automation/investor-research.md`.

Record only directly verified relationships. Bind company, canonical investor, date/stage, evidence URL and verification date. Build a shared activity map combining existing lead records with explicitly sourced participation. Display source/role, company screenshots and existing firm profile; keep totals labeled as company round totals. Reuse one coverage calculation across hub, detail, sitemap and company links. Update maintenance documentation without changing freshness, Daily scheduling or runtime funding fields.

## Task 5: Validation and release

Run targeted tests, `bash scripts/manage.sh validate`, `git diff --check`, and confirm no media/curation/newsletter changes. Verify browser behavior and screenshot placement at 1280×720, 375×844, 390×844 and 414×844, plus dark mode and narrow menus. Commit implementation independently from this approved design. Use the repository PR/Validate/main/deploy workflow and verify the actual live pages and untouched screenshot hashes before claiming completion.
