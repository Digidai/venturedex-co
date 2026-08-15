# WhatShips Channel: Source Research and Integration Decision

Status: architecture decision and source snapshot, not deployment evidence

Research date: 2026-08-15

VentureDex baseline: `e863d62475b7e5ed0a4a7f5602f717daa236af58`

WhatShips upstream head observed: `5c622317fd2353eb2fcf6f994801399dc40ecd9d`

## Decision Summary

VentureDex should add WhatShips as a separate launch-video discovery channel backed by a small, version-controlled reference snapshot. It must not convert WhatShips entries into `content/startups/*.json` records and must not mirror WhatShips or X video assets.

The scheduled integration should fetch the public upstream JSON at an immutable Git commit, normalize an allowlisted subset of factual metadata, run its focused snapshot checks, and commit only `content/whatships.json` directly to the current `main` tip. The push uses the built-in `GITHUB_TOKEN`; because GitHub intentionally does not create ordinary recursive workflow runs for that push, the sync workflow must then explicitly dispatch the existing `deploy.yml` through its `workflow_dispatch` trigger. GitHub documents `workflow_dispatch` as an exception that still creates a workflow run when invoked with `GITHUB_TOKEN`. The manual-dispatch path leaves `VENTUREDEX_VALIDATED_SHA` empty, so `scripts/manage.sh release` reruns the complete repository gate for the exact current `main` SHA before publishing. The snapshot is rendered statically, just like the rest of VentureDex content.

This design was selected because it:

- preserves VentureDex's commit-addressed, reproducible static build;
- keeps imported launch signals distinct from researched startup profiles and funding claims;
- gives every displayed item an explicit WhatShips entry link and original X post link;
- supports deterministic deduplication and rollback in Git;
- avoids copying third-party videos, poster files, avatars, and long descriptions whose reuse is not clearly licensed; list covers use source-hosted WhatShips poster URLs and fail to a local placeholder; and
- reuses the repository's exact-current-main Deploy and release gate without adding another runtime database writer.

The automatic push is only the content-update boundary. `sync_validated`, `main_pushed`, `deploy_dispatched`, `release_gate_passed`, `deploy_passed`, and `live_verified` remain distinct states. A workflow file or cron declaration in Git is not evidence that the schedule is enabled remotely or that any content reached production.

## WhatShips: Verified Public Surfaces

The following observations were verified directly on 2026-08-15. They are a point-in-time snapshot and must be rechecked before materially expanding the reuse scope.

| Surface | Verified observation | Integration consequence |
| --- | --- | --- |
| [Home](https://whatships.com/) | Describes the site as a curated directory of product launch videos, demos, and walkthroughs shared on X/Twitter. | Treat WhatShips as a discovery/index source, not as the owner of the underlying product or media. |
| [About](https://whatships.com/about/) | Says approved records are added to `src/data/videos.json` and published on the next build. It also says names, trademarks, and video content remain the property of their respective owners. | The public GitHub JSON is the best structured discovery input, but its media fields are not a grant to republish the media. |
| [LLM navigation](https://whatships.com/llms.txt) | Instructs readers to cite the product name, link the original X post, and link WhatShips for the directory entry. | Every VentureDex card should retain both links and visible source attribution. |
| [robots.txt](https://whatships.com/robots.txt) | Advertises `search=yes`, `ai-train=no`, and `use=reference`; several named AI crawlers are disallowed. | A linked directory/reference view is aligned with the signal. Model training and broad content replication are not. Robots signals are not a copyright licence. |
| [Sitemap](https://whatships.com/sitemap.xml) | Listed 1,287 `/videos/{slug}/` pages, matching the number of published records in the upstream JSON at the observed commit. | Use it as a parity/diagnostic surface, not as the primary parser input. A brief deployment lag must not cause an automatic deletion. |
| [Public repository](https://github.com/dingyi/whatships.com) | The repository is public. `README.md` says MIT applies to original source code and documentation, while third-party video content remains with its owners. `package.json` declares MIT, but the repository root exposed no standalone `LICENSE` file at the observed commit. | Do not infer a blanket licence for the curated dataset, descriptions, posters, avatars, or videos. |
| [Creator Tools](https://whatships.com/tools/) | Lists eight launch-video creation tools through a separate static model with no publish status, timestamp, or per-tool detail route. | Do not mix this ancillary catalog into the scheduled launch-event stream. It can become a separately reviewed static subsection later. |
| RSS/API probes | `/rss.xml`, `/feed.xml`, and `/api` returned 404 during the snapshot. | Do not build around an undocumented RSS or API contract. Fetch the versioned GitHub file at a resolved commit. |

The public repository also exposes a self-hosted proxy for X video playback. That implementation exists because direct `video.twimg.com` playback rejects ordinary browser referrers. VentureDex must not copy the proxy pattern or proxy the same third-party media as part of this channel.

## Data Snapshot

The observed upstream file was [`src/data/videos.json`](https://github.com/dingyi/whatships.com/blob/5c622317fd2353eb2fcf6f994801399dc40ecd9d/src/data/videos.json), blob `6d5e7274c7160e31698eee05816f3efb01f6de10`, with an HTTP payload size of 1,380,285 bytes.

| Check | Result |
| --- | ---: |
| Total records | 1,291 |
| `status: published` | 1,287 |
| `status: draft` | 4 |
| Duplicate `id` values | 0 |
| Duplicate `slug` values | 0 |
| Duplicate `tweetId` values | 0 |
| Missing published `id`, `slug`, `title`, `tweetUrl`, `tweetId`, or `publishedAt` | 0 |
| Published records with null/non-positive duration | 7 |
| Records with a non-null upstream `videoUrl` | 1,291 |
| Records whose poster points to a WhatShips-local path | 1,291 |

Published category counts were:

| Category | Count |
| --- | ---: |
| `ai` | 462 |
| `developer-tools` | 299 |
| `other` | 261 |
| `design` | 110 |
| `consumer` | 65 |
| `hardware` | 35 |
| `productivity` | 33 |
| `motion` | 20 |
| `devtools` | 2 |

The two `devtools` records are a live schema-drift example: WhatShips' TypeScript catalog advertises `developer-tools`, not `devtools`. The importer therefore uses an explicit alias map (`devtools` to `developer-tools`). Any other valid but unknown category is mapped to `other`, with the normalized source value preserved as `source_category` and reported for later review; structural or type drift still fails the run.

The catalog also carries upstream-import signals: 567 published records have an `imported` tag and 231 have a `launchgallery` tag, for 798 distinct records (about 62% of the published set). At the observed revision, 554 titles and 512 descriptions ended in an ellipsis. Those facts reinforce the reference-only boundary: VentureDex does not present the source descriptions as its own research, and a copied source title may still be an upstream excerpt.

The upstream array is not the presentation order. WhatShips filters to `status: published` and sorts by `publishedAt` descending with title as the tie-breaker. VentureDex must define its own deterministic sort instead of preserving upstream array order.

## WhatShips Update Reality

The public README describes a weekly X API discovery pipeline, but the referenced `weekly-discovery.yml` was absent from the observed `main` branch. Recent public history instead showed roughly daily discovery pull requests generated through Grok/X search, followed by human review and an irregular batch merge into `src/data/videos.json`. For example, [PR #35](https://github.com/dingyi/whatships.com/pull/35) contained discovery candidates that were not yet public catalog entries, while [commit `867f499`](https://github.com/dingyi/whatships.com/commit/867f4992e62f0e3d687603698f5ba4b488c40e8f) added a reviewed batch to the published data.

VentureDex must therefore synchronize only `status: published` records already present on upstream `main`. It must never treat an open discovery PR, issue, inbox file, or candidate document as published content. The six-hour VentureDex schedule is a polling and catch-up interval, not a claim that WhatShips publishes every six hours.

## Fit with VentureDex's Current Architecture

VentureDex is a static Astro site. `astro.config.mjs` sets `output: "static"`; `src/lib/content.ts` eagerly imports version-controlled JSON so pages can prerender when D1 is unavailable. `tests/content-parity.test.ts` proves the TypeScript content transform and generated D1 seed remain equivalent for the startup domain.

The release chain reinforces that content model:

- `.github/workflows/ci.yml` runs `scripts/manage.sh validate` on pull requests and pushes to `main`.
- `.github/workflows/deploy.yml` releases only the exact current `origin/main` SHA after a successful Validate run, or after the complete gate on a manual dispatch.
- `scripts/manage.sh release` verifies source cleanliness and artifact hashes, uploads the Worker/static bundle, then syncs the generated D1 seed, and finally runs bounded live smoke checks.
- `.github/workflows/weekly-draft.yml` is an existing precedent for content-writing scheduled automation, although WhatShips differs by using an authorized direct `main` push after focused snapshot checks and relying on the explicitly dispatched Deploy path for the complete gate.
- `src/worker.ts` and `wrangler.toml` currently reserve Cloudflare scheduled events for Daily and Weekly newsletter delivery only.
- `d1/schema.sql` explicitly says page rendering comes from `content/`; several discovery/snapshot tables are reserved and are not wired to deployed code.

WhatShips records do not satisfy the startup-profile contract. They commonly lack a canonical product site, funding source, official/funding research pair, two source-backed product claims, risk analysis, brand assets, and VentureDex publication timestamps. Inserting them into `content/startups/*.json` would either fail validation or weaken the meaning of a VentureDex startup profile. A dedicated channel model avoids that semantic collision.

## Integration Alternatives

| Option | Benefits | Costs and failure modes | Decision |
| --- | --- | --- | --- |
| Fetch at Astro build time | Few new files; newest data appears on every build. | The same VentureDex commit can produce different Validate and Deploy artifacts; upstream downtime breaks unrelated releases; no reviewable source snapshot; rollback cannot recover the exact upstream input; a compromised upstream response reaches the build directly. | Rejected. It conflicts with exact-SHA reproducibility. |
| Scheduled GitHub Action writes a versioned snapshot | Deterministic input pinned to an upstream SHA; Git diff, tests, rollback, and current release gates remain effective; no new runtime service. | The built-in token push does not trigger Validate, so the workflow must explicitly dispatch Deploy; branch protection, a concurrent `main` update, or dispatch permissions can block the run. | Selected. Run every six hours, gate locally, make one non-force `main` commit, then dispatch Deploy. |
| Cloudflare Worker Cron syncs into D1 | Can publish without Git and can approach near-real-time freshness. | Requires a new runtime table/API/client fetch path; bypasses content review and exact-SHA builds; creates split truth between static HTML/sitemap and D1; adds retries, leases, migrations, and monitoring to the newsletter Worker; an upstream incident becomes a production runtime dependency. | Rejected for the current requirement. Revisit only if sub-hour freshness becomes a measured product need. |

## Selected Data Contract

The canonical snapshot is `content/whatships.json`. The exact schema is enforced by the sync implementation and tests, but the public-content boundary is fixed:

| Field | Rule |
| --- | --- |
| `id` | Preserve the upstream stable id verbatim after strict plain-text validation. It must be unique but is not synthesized with a VentureDex prefix. |
| `tweet_id` | Preserve the canonical decimal `tweetId` separately. Addition, update, and deletion accounting uses this key because it binds the record to the original post. |
| `slug` | Preserve the upstream slug after strict slug validation. |
| `title` | One short source title/excerpt, stored as plain text and HTML-escaped when rendered. |
| `product`, `company` | Plain factual labels. |
| `category` | Allowlisted value after explicit alias normalization. Unknown valid values map to `other`. |
| `source_category` | Preserve the lower-case upstream value whenever it differs from the normalized category, including unknown-to-`other` normalization. |
| `tags`, `featured` | Retain bounded plain-text tags and the upstream boolean; neither is a VentureDex endorsement. |
| `published_at` | Valid upstream ISO timestamp, normalized to UTC. This is the launch-post time, not the VentureDex sync time. |
| `duration_seconds` | Nullable non-negative integer. |
| `poster_url` | Derive only from a validated `/posters/{safe-name}.webp` source path as `https://whatships.com/posters/{safe-name}.webp`. The browser loads it from WhatShips; VentureDex does not download or proxy it. |
| `source_url` | Derive as `https://whatships.com/videos/{slug}/`; do not accept an arbitrary host from upstream data. |
| `original_post_url` | Normalize to `https://x.com/{handle}/status/{tweet_id}` and require the path id to equal `tweet_id`. |
| Provenance | Record the upstream Git commit, data blob/hash, and deterministic source commit time at snapshot level. A wall-clock `last_checked_at` belongs in the Action summary, not in a no-op content diff. |

The snapshot must not contain or render these upstream fields by default:

- `description` or other long-form copied prose;
- `videoUrl`, `streamUrl`, or any proxy URL;
- copied, proxied, or locally cached `poster` files; only the derived source-hosted `poster_url` is allowed;
- `authorAvatar` or cached X profile media; or
- arbitrary upstream HTML.

This is an intentionally conservative reference implementation, not a legal conclusion. If the relevant owners provide written permission for richer reuse, expand the allowlist in a separately reviewed change and retain the original X and WhatShips attribution.

## Product and SEO Boundary

- The channel should have one VentureDex hub route and a homepage navigation entry.
- Cards should open the WhatShips detail page and offer a separate original-X link. They should not pretend the launch metadata is VentureDex funding research.
- Do not generate 1,287 thin VentureDex detail pages by copying upstream titles or descriptions. The hub may be indexable, but filtered/search states should follow the repository's existing crawl policy.
- Keep launch time, upstream sync time, and VentureDex publication time distinct.
- A WhatShips item matching an existing VentureDex startup may link to that VentureDex profile, but the match must use an explicit reviewed mapping. Name similarity alone is not enough.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Upstream schema changes silently corrupt the channel | Strict parser, explicit category aliases, URL/id invariants, size/count guards, and fail-closed writes. |
| One transient/partial response deletes most records | Fetch an immutable commit, require a complete JSON array, compare exact id sets, and prohibit scheduled deletions. |
| Repeated schedules create duplicate records or commits | Key by `tweetId`, canonicalize and sort output, compare a content hash, and make no commit on an identical snapshot. |
| Source or media rights are overstated | Keep only minimal reference metadata; load covers from WhatShips without copying or proxying them; show attribution; retain both outbound links; require separate permission for video or richer reuse. |
| External data makes releases non-reproducible | Fetch only in the snapshot workflow, never in Astro build, Worker requests, or the production release job. |
| An automation push does not start normal CI/deploy | This is expected for a built-in `GITHUB_TOKEN` push. After verifying remote `main` equals the pushed SHA, call the existing Deploy workflow's `workflow_dispatch` endpoint with Actions write permission; that path reruns the full gate before release. |
| Branch protection or a concurrent writer rejects the update | Fetch and compare the current remote tip immediately before a non-force push. Fail closed on a protected-branch rejection or non-fast-forward and retry from fresh `main` on the next schedule. |
| Push succeeds but Deploy dispatch fails | Record `main_pushed_dispatch_failed`, do not claim release, and recover only when the exact pushed SHA is still current `main`; never dispatch an unrelated later SHA as silent recovery. |
| Channel freshness is mistaken for reliability | Report upstream SHA, snapshot hash, additions, updates, missing ids, and last successful run. The last known-good snapshot remains live on failure. |

## References

- [WhatShips home](https://whatships.com/)
- [WhatShips About](https://whatships.com/about/)
- [WhatShips robots.txt](https://whatships.com/robots.txt)
- [WhatShips llms.txt](https://whatships.com/llms.txt)
- [WhatShips sitemap](https://whatships.com/sitemap.xml)
- [WhatShips Creator Tools](https://whatships.com/tools/)
- [WhatShips public repository](https://github.com/dingyi/whatships.com)
- [Pinned upstream data snapshot](https://github.com/dingyi/whatships.com/blob/5c622317fd2353eb2fcf6f994801399dc40ecd9d/src/data/videos.json)
- [Pinned upstream catalog transform](https://github.com/dingyi/whatships.com/blob/5c622317fd2353eb2fcf6f994801399dc40ecd9d/src/lib/catalog.ts)
- [GitHub Actions schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub workflow recursion rules for `GITHUB_TOKEN`](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)
- [GitHub REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
