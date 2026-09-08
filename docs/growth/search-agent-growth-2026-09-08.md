# Search and Agent growth — 2026-09-08

## Decision and scope

Ship a bounded improvement to the existing public research product: accurate topic membership and comparisons, a lighter discovery homepage, crawlable funding-news pagination, evidence-preserving per-company resources, and deployment-linked search discovery. Preserve every existing company and launch URL. Do not bulk noindex launches, send outreach, or change subscription delivery.

The previous audit's launch URL share and word counts do not establish a crawl-budget or quality failure. Topic pages already had statistics and company pages already had answer summaries. The implementation therefore improves their accuracy and usefulness rather than claiming those features were absent.

## Baseline and measurement limits

- Read on 2026-09-08: Cloudflare RUM reports 25 visits / 27 pageviews over 7 days, including 2 ChatGPT-referred visits. The 30-day report is sampled (sample interval 10); do not compare it directly with exact server-request counts.
- GSC UI read on 2026-09-07, 28-day Web window Aug 9–Sep 5: 1 click / 1,922 impressions / average position 44.4. These are not fresh Sep 8 observations and do not prove a specific cause.
- Prior live HTML: home 534,464 bytes; funding news 539,474 bytes. These are transferred-document sizes before compression, not Core Web Vitals. Real-user CWV coverage was insufficient.
- Existing inventory: 304 research profiles, 6 topics, 10 collections, 214 indexable investor profiles, 1,402 launches. Claim records and source links are not independently verified facts.
- An IndexNow receipt or GSC request is discovery evidence, never proof of indexing, ranking, AI citation, or traffic growth.

## Implementation contract

1. Home becomes a concise research entry point; the complete filterable catalog remains available at `/directory`, including old homepage filter-query compatibility. All catalog entries remain linked in HTML.
2. Funding news uses bounded, static, self-canonical pages with ordinary previous/next links. No JavaScript-only load-more dependency and no canonical of all pages to page one.
3. Topics use explicit membership criteria, source-linked comparison data and accurate date/coverage labels. Broad category collections retain their separate browsing role.
4. Each startup gets Markdown and JSON representations with stable canonical identity, source IDs, claim-source references, research dates and editorial boundaries. A compact index supports selective retrieval. No invented license or ranking claim.
5. Keep `/sitemap.xml` compatible; add grouped sitemaps for diagnostic segmentation. Publish-driven IndexNow submits only safe, live changed URLs and retains receipts.

## Success criteria and follow-up

- Release gate: full repository validation, route/canonical/header checks, mobile/desktop interaction checks and production smoke checks at the actual deployed SHA.
- Engineering outcome: materially smaller home/news HTML, complete catalog access, bounded Agent fetches, reproducible source mappings and crawlable page sequences.
- Growth outcome: measure rolling 28-day non-brand clicks, impressions by directory and comparable query cohorts, engaged visits, source click-through and confirmed subscriptions. At this baseline, use absolute counts as well as percentages. Do not report percentage wins from one click.
- Review indexed URLs separately from submitted URLs; separate visible AI citations from AI referrer visits. Referrers undercount zero-click use and removed-referrer traffic.
- Next editorial work: deepen existing high-impression entities and six topic pages with first-party product evidence; earn editorial references from actual research users. Do not expand generic content volume before checking relevance and outcomes.

## References

- [Google AI search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide): no special AI file or schema guarantees visibility.
- [Google pagination](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading): discoverable links and distinct canonical URLs.
- [Google helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): no preferred word count.
- [Google crawl budget](https://developers.google.com/crawling/docs/crawl-budget): diagnose actual crawl conditions, not URL-share heuristics.

## Release evidence

Local implementation: 500/500 repository tests passed; content validation 304/304 passed (0 errors, 137 non-blocking editorial/external-source warnings); dependency audit reported 0 vulnerabilities. Final type/build/release checks are tracked below.

First production build: home 75,066 bytes (about 86% less than the Sep 7 live baseline), news page one 131,250 bytes (about 76% less). The full filterable catalog remains deliberately complete at `/directory` (535,399 bytes); this is not a claim that every route is lightweight or that Core Web Vitals improved. New resources: llms.txt 3,149 bytes, compact index 111,436 bytes, changes snapshot 20,348 bytes, Shapes JSON 4,859 bytes / Markdown 3,730 bytes.

Browser checks against the production build: old homepage `type=DevTools&sort=newest` link reaches `/directory` and displays 61/304 companies; Clear filters restores 304; home and news have no whole-page overflow at 390px. Seven news pages preserve all 304 rounds; four grouped sitemaps partition all 1,968 URLs exactly once. Local asset bindings differ from production; real deployed images still require live checks.

GitHub CLI currently returns HTTP 401. The connected GitHub integration reports repository push/admin permissions; use its normal PR path if CLI credentials remain unavailable. No traffic uplift or deployment is claimed by these local checks.
