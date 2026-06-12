# VentureDex Topic Cluster + IndexNow Follow-up - 2026-06-12

## Research constraints

- Google's SEO starter guide says Search discovers pages through links and that site organization helps users and search engines understand page relationships.
- Google's link best practices require crawlable `a` elements and descriptive anchor text; topic links should be visible HTML, not hidden metadata.
- Google breadcrumb guidance supports structured context for pages, but structured data must match visible page content.
- IndexNow supports POSTing a set of changed URLs after host ownership is verified through the key file; submitted URLs must belong to the host.

## Changes

- Startup detail pages now show visible related topic cards after tags.
- Weekly issue pages now show a topic map connecting the issue's picks to topic pages.
- `llms.txt` now describes topic-map links as part of startup profile context.
- IndexNow supports `--all-startups` and `--all-weekly`, plus `seo:indexnow:all-content`, for template-level changes that affect many canonical pages.
- Growth reports now summarize the latest valid IndexNow history row instead of only linking to the JSONL file.

## Verification plan

- `npm test`
- `npm run typecheck`
- `npm run build`
- `npx tsx scripts/promotion/indexnow.ts --all-startups --all-weekly --topics --dry-run`
- Local screenshot checks for `/startups/dapple` and `/weekly/3` on desktop and mobile.
- After deploy, submit `npm run seo:indexnow:all-content` and refresh `npm run growth:report`.

## Sources

- https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- https://developers.google.com/search/docs/crawling-indexing/links-crawlable
- https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
- https://www.indexnow.org/documentation
