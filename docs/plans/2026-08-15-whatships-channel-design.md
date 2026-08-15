# VentureDex launch channel design

## Outcome

Add an independent VentureDex launch-video channel at `/launches`, with a canonical VentureDex detail page at `/launches/{slug}` for every published item. List cards, covers, search results, structured data, the sitemap, and the public JSON feed all point to VentureDex routes.

The original launch video is the primary evidence. Detail pages play that video from its original X media URL and link to the original X post. Public pages do not identify or link to the catalog used for internal discovery.

## Chosen architecture

The version-controlled snapshot is `content/whatships.json`. A scheduled GitHub Action runs `scripts/sync-whatships.ts`, resolves an immutable upstream data revision, validates it, and rewrites the snapshot only when published metadata changes. The snapshot keeps builds reproducible: normal Astro builds, Worker requests, and release jobs never fetch the discovery catalog live.

The scheduled updater uses the repository's existing exact-main release path. It may update only the snapshot, must fail closed on ambiguous input or deletion, and must explicitly dispatch the existing deploy workflow after its built-in-token push.

## Public product contract

Each launch record exposes only the facts needed to render an original VentureDex page: stable IDs, slug, short title, product, company, category, tags, original publish time, duration, feature flag, original X post URL, and original `video.twimg.com` MP4 URL.

VentureDex does not copy upstream descriptions, posters, avatars, page URLs, or HTML. List covers are the first frames of the original videos rather than third-party poster images. Detail-page copy is generated from the factual record and VentureDex's own presentation, not copied source prose.

Public attribution is to the original publisher through the original X post. The discovery catalog and its provenance remain internal build metadata and are not emitted by `/launches.json`, rendered pages, structured data, `llms.txt`, or the sitemap.

The launch channel remains separate from `content/startups`, D1, Daily curation, Weekly research, site search, and newsletters. A launch page is product-video evidence, not a funding claim or a researched startup profile.

## Failure behavior

The updater fails closed on invalid schemas, missing or invalid original videos, duplicate tweet IDs or slugs, a suspicious catalog-size range, more than 200 additions in one run, or any automatic deletion. Unknown categories degrade to `other` while preserving `source_category`; the legacy `devtools` value normalizes to `developer-tools`. When fetching or validation fails, no file is changed and the deployed channel keeps its last successful snapshot.

## Verification

Required verification covers the snapshot contract, direct-video URL allowlist, public-field allowlist, 1,287 canonical detail routes, list-to-detail navigation, video metadata/playback, desktop and mobile layouts, public JSON, sitemap, AI-navigation text, CSP, a production build, and the repository's complete validation gate. Public artifacts must contain no discovery-catalog domain or attribution.
