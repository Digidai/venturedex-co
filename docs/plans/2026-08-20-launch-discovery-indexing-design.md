# Launch discovery indexing design

## Outcome

Every canonical VentureDex launch page must be discoverable through the XML sitemap, Bing and other IndexNow participants, and VentureDex's AI-readable discovery files. Search-engine notification happens only after the exact launch snapshot commit has deployed successfully. Public pages and discovery files continue to identify VentureDex and the original publisher; they never expose the internal catalog used to find candidates.

## Approaches considered

1. Submit IndexNow before deployment. This is fast but can notify crawlers about URLs that still return 404, so it is rejected.
2. Run a separate periodic full-catalog submitter. This is simple but repeats more than 1,300 unchanged URLs, delays new entries, and separates submission evidence from the release that created the pages, so it is rejected.
3. Wait for the exact deploy triggered by the launch sync, then submit the sync's deterministic URL change set. This is the selected design because it binds publication and notification to the same SHA and fails visibly without rolling back already-published content.

## Data flow

`scripts/sync-whatships.ts` compares the previous and next snapshots by `tweet_id`. It writes an optional JSON file containing the canonical hub, changed detail URLs, and AI discovery surfaces. Additions use the new slug; removals use the old slug; a slug-changing update includes both. The scheduled workflow stores that file under `RUNNER_TEMP`, commits only `content/whatships.json`, dispatches the existing exact-main deploy, waits for that exact run to succeed, and then calls the IndexNow submitter.

The IndexNow CLI gains `--all-launches`, `--urls-file`, and `--history-file`. `--all-launches` supports one bounded backfill; scheduled runs use `--urls-file`. URL validation explicitly permits `/launches`, `/launches/{slug}`, and `/launches.json`. Network failures, HTTP 429, and HTTP 5xx receive bounded retries with `Retry-After` support. CI evidence is written to an artifact and the step summary instead of creating a second repository commit.

## Google and AI discovery

The existing XML sitemap remains the Google inventory and continues to be declared in `robots.txt`. Launch detail `lastmod` uses a local `last_changed_at` timestamp when available, rather than pretending the original post date is the VentureDex page's modification time. New and materially updated records receive the immutable upstream commit time; unchanged records retain their prior value.

The typed AI index gains a launch count, launch route, launch JSON endpoint, and canonical launch entries. `llms-full.txt` renders the same entries as compact evidence records. The records include only VentureDex URL, product identity, category, public tags, original publish time, duration, original video URL, and original post URL. They do not include internal catalog attribution, copied descriptions, posters, avatars, or source-page URLs.

## Failure and safety behavior

- A failed deploy blocks IndexNow submission for that snapshot.
- An IndexNow failure does not misreport the deployment as failed; the workflow fails at the notification stage and preserves an artifact with the exact URLs and response state.
- Automatic removals remain blocked by the existing sync policy.
- The one-time backfill stays below IndexNow's 10,000-URL protocol ceiling and the CLI's explicit `--max-urls` guard.
- Google sitemap exposure, GSC sitemap registration, URL Inspection requests, and actual indexing remain separate states.

## Verification

Tests cover exact change-set generation, slug changes, no-op output, launch URL validation, all-launch collection, retry behavior, AI index entries, LLM text rendering, sitemap timestamps, and workflow ordering. The final gate is `bash scripts/manage.sh validate`, followed by exact-SHA CI/deploy checks, live sitemap and AI-surface counts, and an IndexNow backfill receipt.
