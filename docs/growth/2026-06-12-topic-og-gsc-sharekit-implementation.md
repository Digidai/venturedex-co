# VentureDex topic, OG, GSC diagnostics, and share-kit implementation notes

Date: 2026-06-12 CST

## Research constraints

This implementation follows the existing VentureDex growth plan, with four added engineering tracks:

1. SEO topic pages.
2. Weekly issue OG image generation.
3. Search Console status diagnostics.
4. Promotion and outreach share kits.

The core constraints are:

- Topic pages must add editorial value. They are generated from explicit topic configs and source-backed VentureDex startup records, not arbitrary tag pages.
- Structured data must describe visible page content. Topic pages use `CollectionPage`, breadcrumb, and `ItemList` markup rather than unsupported or misleading schema types.
- Weekly OG images must be real image assets at 1200x630 and wired into weekly page metadata, not merely generated files that pages ignore.
- Google request-indexing status must not be inferred from hidden DOM text or stale button state. Only `requested` ledger rows count as complete.
- Outreach automation creates reviewed drafts and share kits. It does not auto-post to communities or request backlinks.

## Official references

- Google AI features and your website: https://developers.google.com/search/docs/appearance/ai-features
- Google structured data policies: https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- Google Discover guidance: https://developers.google.com/search/docs/appearance/google-discover
- Google ask to recrawl URLs: https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
- Google sitemap ping deprecation: https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping
- IndexNow documentation: https://www.indexnow.org/documentation

## Engineering decisions

### Topic pages

Configuration lives in `content/topic-pages.json`. Runtime builders live in `src/lib/topic-pages.ts`.

The generator:

- Validates duplicate or malformed slugs.
- Uses explicit `product_types` and `tags` matchers.
- Filters unpublished startup records.
- Orders configured featured slugs first, then featured profiles, then latest published profiles.
- Computes top tags, investors, funding stages, latest profiles, and related weekly issues.
- Feeds `/topics`, `/topics/[slug]`, `sitemap.xml`, and `llms.txt`.

### Weekly OG images

The generator is `scripts/weekly-og.ts`.

It:

- Reads published weekly issues and startup names.
- Builds deterministic SVG cards.
- Renders PNG with `sharp`.
- Outputs `public/og/weekly-<issue>.png`.
- Runs before `astro build` through `npm run build`.
- Wires weekly pages to `og:image`, `og:image:width`, `og:image:height`, and `og:image:type`.

### GSC diagnostics

Pure diagnostics live in `scripts/promotion/gsc.ts`; CLI wrapper is `scripts/promotion/gsc-diagnostics.ts`.

The diagnostic state model:

- `requested` -> complete.
- `dry_run` -> needs submit.
- `retry_pending`, `quota_exceeded`, `live_check_failed`, `stopped_mismatch` -> blocked.
- missing ledger row -> missing.

The shell submitter now writes `page_state` into failure artifacts so a reviewer can separate quota, failure, and unknown page state.

### Share kit

Share-kit rendering lives in `scripts/promotion/share-kit.ts`; `scripts/promotion/build-pack.ts` is now a thin CLI.

The generated pack includes:

- Canonical URLs.
- Daily additions.
- LinkedIn draft.
- X / Threads drafts.
- Founder / team share kit.
- Investor share kit.
- Weekly issue share kit.
- Community review queue.
- Community distribution guardrails.

The pack uses UTM links and existing source-backed content fields only. It does not fabricate contacts, claims, or backlink requests.

## Review checklist

- Topic pages have enough profiles and visible editorial context.
- Topic URLs are in sitemap and `llms.txt`.
- Weekly issue pages reference the generated weekly image rather than the default site image.
- Generated OG images are 1200x630 PNG files and visually checked for text overlap.
- GSC diagnostics treat dry-run as incomplete.
- Share kit social copy is human-reviewable and not auto-posted.
- `npm run test`, `npm run typecheck`, `npm run build`, and live smoke pass before release.
