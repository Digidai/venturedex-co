# Navigation and discovery implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. In this environment use the available executing-plans guidance; no sub-agent delegation is authorized.

**Goal:** Ship the approved navigation, compact top funding strip, and useful categorized footer, including substantive destinations and verified interactions.

**Architecture:** Preserve Astro prerendering, existing screenshot assets, directory filtering, and research eligibility. A pure category model supplies the footer, category pages, sitemap, and machine-readable navigation. Only nonempty, published cohorts get category URLs. Investor footer entries use the existing source-backed indexing gate.

**Tech Stack:** Astro, TypeScript, native HTML/CSS, Node test runner, existing GitHub Actions and Cloudflare Workers release pipeline.

## Approved design and boundaries

- Seven direct desktop links; complete native mobile menu with Escape/outside-click behavior.
- A compact funding strip directly below navigation, ahead of the existing compact hero. Explicit pause, keyboard access, and reduced-motion support. No duplicate lower funding section.
- A spacious five-column footer: industries, stages and regions, investors, research topics, and site/research resources. Two-column mobile layout with readable touch targets; no collapsed link graveyard.
- Category hub and industry/stage/region pages use explicit existing taxonomy, authored scope and comparison questions, real counts, research dates, source links, original screenshot galleries, local search/sort, clear/empty states, and URL/back restoration.
- No synthetic covers, company screenshot modifications, investor fact changes, guessed city/country data, empty category pages, or combinatorial SEO facets. Directory query canonical behavior remains unchanged.
- Shared theme, typography, brand colors, original screenshot aspect ratios and first-row priority loading are preserved.

## Execution and acceptance

1. Add failing category and navigation contract tests, including published-only membership, exact taxonomy, empty omission, deduplication, evidence dates, stable URLs, seven direct links and top ticker.
2. Implement pure category definitions/model and shared footer. Add index/detail pages, category search/sort and visible scope/source summaries.
3. Restore navigation and top ticker; verify native mobile menu, pause, focus and reduced motion.
4. Integrate self-canonicals, visible-content JSON-LD, sitemap and existing AI navigation. Scope deploy discovery to the new hub (sitemap discovers details).
5. Run targeted tests, full canonical validation and built-page/link checks. Compare screenshot asset hashes against the base commit. Inspect desktop/mobile/dark screenshots and exercise search, clear, history, menu and ticker controls in a real browser.
6. Commit and push only this change, pass PR CI, merge after rechecking current main, then wait for the exact production SHA to deploy through the existing pipeline. Verify both public hosts and new routes. Report deployment separately from search indexing or AI inclusion.

## Evidence basis

- https://startups.gallery/ — grouped directory navigation is the useful pattern, not its recruiting-specific taxonomy.
- https://developers.google.com/search/docs/crawling-indexing/links-crawlable — descriptive, crawlable internal links.
- https://developers.google.com/search/docs/appearance/ai-features — ordinary SEO foundations and visible-content consistency apply; indexing or AI inclusion is not guaranteed, and special AI files are not required.

## Release record

### Source-health repairs found by the release gate

The first complete validation detected existing upstream failures, unrelated to category membership or screenshot files. No validator rules were weakened:

- Bessemer and boldstart: official homepages return 200; historical downloaded logo URLs return 404 after site changes. Use the existing per-asset reachability exception with factual dated notes; preserve the local bytes and historical download URLs. This is not a new visual/whole-manifest review.
- Dragonfly: https://dragonfly.xyz/ redirects to https://dragonfly.com/, which explicitly announces the migration. Update current website/source-page links, retaining the old icon's historical source and a dated per-asset note. Research review dates remain unchanged.
- BrainsMingle: https://www.wamda.com/2026/06/egypt-brainsmingle-raises-400000-seed-basharsoft-group and the publisher homepage returned HTTP 500; a browser confirmed the publisher's backend connection exception. Replace the active funding reference with https://arabfinance.com/en/news/newdetails/basharsoft-group-backs-brainsmingle-seed-investment (2026-06-30), which independently publishes the same press-release claims about the $400,000 seed round, BasharSoft, bookings/payments/live sessions and private hubs. Correct publisher attribution, retain round date/amount/stage and the original product review date. The old URL remains recorded here and in Git history.

### Verification

- Content validation after source repairs: 314/314 profiles, 0 errors. Existing informational warnings and explicit cached-logo reachability warnings remain visible; they are not represented as successful upstream fetches.
- Full test suite: 630/630 passed. Follow-up targeted source/navigation tests: 62/62 passed.
- Astro: 179 files checked, no errors, warnings or hints. Production build passed.
- New built-HTML gate: seven direct desktop links, 21 nonempty category detail pages plus their hub, 2,836 internal-link checks, matching canonical URLs, ItemList counts/order, sitemap and AI-index membership.
- Browser: 1280px desktop home (45px funding strip, first screenshot at y=364px), 390px phone layout, native mobile menu Escape/outside-click, light/dark themes, category keyword search, zero-results state, reset, A–Z sort, profile navigation and back restoration; no console errors observed. Reduced-motion mode removes animation and duplicate content and keeps horizontal browsing.
- A 320px pass identified cramped legacy header controls; the narrow breakpoint and menu positioning were tightened without hiding any destinations. Final narrow/tablet regression and exact production receipts are required before release acceptance.
- `git diff` against base `1e949ee420f77a1da8d2520cb0b4196526f6b384` confirms no changes to `public/screenshots`, `public/logos`, `content/screenshot-reviews.json`, `SiteCard.astro` or screenshot-fit CSS. All 314 screenshots passed the existing hash-bound quality gate.
- SEO/AI discovery improvements are technical eligibility and navigation work, not a promise of indexing, ranking or AI citation. The existing release workflow owns live checks and bounded IndexNow notification.
