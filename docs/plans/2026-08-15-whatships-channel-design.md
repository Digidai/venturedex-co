# WhatShips channel design

## Outcome

Add an independent VentureDex channel for the published launch-video metadata curated by whatships.com. The channel is searchable and paginated, is linked from the global homepage navigation, and updates through a versioned snapshot every six hours.

## Chosen architecture

The source of truth is `content/whatships.json`. A scheduled GitHub Action runs `scripts/sync-whatships.ts`, resolves the latest upstream commit that changed `src/data/videos.json`, fetches that exact immutable revision, validates it, and rewrites the snapshot only when published metadata changed. Because a push made with the default `GITHUB_TOKEN` does not recursively trigger `on: push` workflows, the sync explicitly dispatches the existing deploy workflow. Its manual-dispatch path runs the complete release gate against exact current `main` before any upload or D1 operation.

This is preferable to build-time fetching, which could produce different artifacts from the same VentureDex commit, and to Worker/D1 synchronization, which would bypass the repository audit trail and couple the new channel to the newsletter runtime.

## Data and rights boundary

The snapshot contains factual reference metadata plus one derived, source-hosted WhatShips poster URL: stable IDs, title, product, company, category, tags, publish time, duration, feature flag, the poster URL, the WhatShips detail URL, and the original X post URL. It deliberately excludes descriptions, copied poster files, avatars, video URLs, and playback. List cards load the cover directly from WhatShips, credit WhatShips, and send visitors to both the directory entry and original post.

The import remains separate from `content/startups`, D1, Daily curation, Weekly research, site search, and newsletters. Inclusion means “published by WhatShips,” not “endorsed as a VentureDex startup.”

## Failure behavior

The importer fails closed on invalid schemas, duplicate tweet IDs or slugs, a suspicious catalog-size range, more than 200 additions in one run, or any automatic deletion. Unknown categories degrade to `other` while preserving `source_category`; the legacy `devtools` value normalizes to `developer-tools`. When fetching or validation fails, no file is changed and the deployed channel keeps its last successful snapshot.

## Verification

The implementation adds focused contract tests, TypeScript/Astro checking, a production build, snapshot validation, sitemap and AI-navigation coverage, and a local rendered-page review at desktop and mobile widths. No push, remote schedule activation, or production deployment is part of the local implementation pass.
