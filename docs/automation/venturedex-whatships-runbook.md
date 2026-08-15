# VentureDex WhatShips Sync Runbook

Status: operational contract

Applies to: `content/whatships.json`, `scripts/sync-whatships.ts`, `.github/workflows/sync-whatships.yml`

Research basis: [`docs/research/whatships-channel.md`](../research/whatships-channel.md)

## Objective

Refresh the VentureDex WhatShips channel from the public WhatShips catalog every six hours while preserving these invariants:

1. The production channel is rendered only from a version-controlled snapshot.
2. The same VentureDex Git SHA always builds from the same WhatShips input.
3. A scheduled run may add or safely update reference metadata, but it may not delete published items.
4. Every record retains a WhatShips detail link and the original X post link.
5. The workflow never copies or serves upstream videos, poster files, avatars, or long descriptions. It may retain only a validated WhatShips-hosted poster URL for list-card display.
6. A pre-push fetch, parse, validation, or rate-limit failure leaves the committed snapshot and live site unchanged; a post-push dispatch or publication failure leaves production at the last known-good release and records the pushed-but-unreleased state.
7. After all focused sync gates pass, one non-force commit is pushed to the exact current `main` tip and the existing Deploy workflow is explicitly dispatched; Deploy then owns the complete release gate.
8. Sync validation, the `main` push, Deploy dispatch, release-gate success, and live verification remain separate evidence boundaries.
9. A workflow file or cron declaration in Git is not evidence that the remote schedule is enabled or that production changed.

## Authority Order

When implementation details conflict, use this order:

1. This runbook.
2. `content/whatships.json` schema version and provenance block.
3. `scripts/sync-whatships.ts`.
4. `.github/workflows/sync-whatships.yml`.
5. The upstream WhatShips repository and website.

The upstream public file is a discovery input, not a production runtime dependency and not permission to expand the copied-field allowlist.

## Scheduled Workflow Contract

Use both manual and scheduled triggers:

```yaml
on:
  workflow_dispatch:
  schedule:
    - cron: "17 */6 * * *"
```

The minute is intentionally offset from the start of the hour because GitHub documents higher scheduled-workflow load at hour boundaries. Schedule execution is UTC, may be delayed, and may occasionally be dropped. The next successful run is the catch-up mechanism; never create duplicate backfill records based on the number of missed schedules.

Use one serialized concurrency group:

```yaml
concurrency:
  group: whatships-sync-${{ github.repository }}
  cancel-in-progress: false
```

The workflow uses the built-in `GITHUB_TOKEN` with:

```yaml
permissions:
  contents: write
  actions: write
```

`contents: write` permits the normal `main` commit. `actions: write` permits the workflow to call the existing Deploy workflow's `workflow_dispatch` endpoint after that push. GitHub documents that an ordinary push made with `GITHUB_TOKEN` does not create a recursive workflow run, while `workflow_dispatch` and `repository_dispatch` are explicit exceptions. The sync must therefore dispatch Deploy; it must not wait for the push to start Validate.

Do not expose Cloudflare, D1, R2, newsletter, X API, browser, or Google Search Console credentials to this workflow. Do not grant administration, force-push, or ruleset-bypass permission merely to make the sync pass. If repository branch protection rejects a built-in-token direct push, fail closed and resolve the repository policy separately.

## Mutation Scope

The sync implementation may change only:

- `content/whatships.json`.

The scheduled wrapper may create only:

- one normal commit whose sole file change is `content/whatships.json`;
- one non-force update to `refs/heads/main`;
- one explicit dispatch of `.github/workflows/deploy.yml` at the pushed `main` state; and
- its own Action logs and job summary.

It must not change startup records, timestamps, investor data, rejected-candidate history, screenshots, brand assets, D1 seed files, Daily/Weekly run state, learning logs, or release configuration. The sync job itself must never write remote D1, upload a Worker, submit URLs to Search Console, or send a newsletter. Only the separately dispatched, existing Deploy workflow may perform the normal release mutations after its own complete gate.

If implementation or schema files need a change, make that change through the normal human-reviewed engineering process. A scheduled data run must not self-modify its parser, workflow, tests, or policy.

## Source Resolution and Fetch

The source path is:

```text
repository: dingyi/whatships.com
branch ref: refs/heads/main
file: src/data/videos.json
```

For every run:

1. Resolve the latest full 40-character commit SHA on upstream `main` that changed `src/data/videos.json`.
2. Compute and record the exact fetched bytes' SHA-256 for `src/data/videos.json`.
3. Fetch the raw file using the immutable commit SHA, never the moving `main` URL as the parsed input.
4. Require HTTPS and allow only the expected GitHub API/raw hosts.
5. Set a 30-second request timeout and a 5 MiB maximum response size.
6. Require HTTP 200 and a JSON array. Reject HTML, authentication pages, empty bodies, truncation, and redirects to an unapproved host.
7. Record response `ETag`, available `x-ratelimit-*` values, byte count, and retry diagnostics in the Action log. Put stable source provenance, transition counts, category drift, and canonical output hash in the job summary. Only stable source provenance belongs in `content/whatships.json`.

Use at most three bounded fetch attempts for transport errors and 5xx responses, with exponential backoff and jitter. For 403 or 429:

- honor `Retry-After` when it is present and no more than 60 seconds;
- otherwise stop and report the reset time from `x-ratelimit-reset`;
- do not continue hammering the endpoint; and
- do not fall back to scraping the WhatShips homepage.

The sitemap is a diagnostic only. A mismatch can result from deployment propagation and must never cause the importer to delete records or switch to HTML parsing.

## Input Validation

Require a complete top-level array, filter to `status === "published"`, and fully validate every published candidate. Every published candidate must have:

- non-empty `id`, `slug`, `title`, `product`, `company`, `category`, `tweetUrl`, `tweetId`, and `publishedAt`;
- a slug matching the accepted lower-case slug pattern;
- a decimal `tweetId` whose value exactly matches the `/status/{id}` segment in `tweetUrl`;
- an `https://x.com/.../status/{tweetId}` or explicitly normalized legacy Twitter URL;
- a parseable ISO timestamp;
- a nullable, zero, or positive numeric duration that normalizes to a positive integer or `null`; and
- a unique upstream `id`, `slug`, and `tweetId` across the full array.

The initial category normalization is:

```text
devtools -> developer-tools
unknown value -> other, with the original value preserved as source_category
```

Allowlisted normalized categories are:

```text
ai
consumer
design
developer-tools
hardware
motion
other
productivity
```

An unknown category does not block otherwise valid additions. Normalize it to `other`, preserve the lower-case source value in `source_category`, and report the drift in the Action summary so a later engineering change can add a deliberate category or alias. Never discard the source value silently.

Reject the whole run before writing when:

- the top-level value is not an array;
- the published set is empty;
- any stable id is duplicated;
- a required value is invalid;
- the source exceeds the size bound;
- any output field would contain HTML instead of plain text; or
- the source contains a field/type change that the parser does not explicitly understand.

Failing the whole run is preferable to publishing a partial snapshot whose missing rows look like legitimate upstream deletions.

## Normalization and Output

The output must be a deterministic transformation. For each published record:

1. Preserve the upstream `id` verbatim after plain-text validation and store the canonical `tweet_id` separately.
2. Normalize the source slug and derive `https://whatships.com/videos/{slug}/` locally.
3. Normalize the original post to `https://x.com/{handle}/status/{tweetId}` with no query string or fragment.
4. Trim plain-text labels without rewriting their meaning.
5. Apply the explicit category alias table; map any other unknown source category to `other` and retain `source_category`.
6. Normalize `publishedAt` to an ISO UTC instant.
7. Preserve a valid duration or store `null`.
8. Validate the source poster as `/posters/{safe-name}.webp` and derive its canonical `https://whatships.com/posters/{safe-name}.webp` URL.
9. Omit every non-allowlisted source field.
10. Sort records by `published_at` descending, then slug ascending.
11. Serialize with stable key order, two-space indentation, and one trailing newline.

Allowed per-item content is limited to:

- stable id;
- canonical `tweet_id`;
- source slug;
- short source title;
- product and company labels;
- normalized category;
- original `source_category` when normalization changed it;
- bounded plain-text tags and the upstream featured boolean;
- source publish time;
- nullable duration;
- derived WhatShips-hosted poster URL;
- derived WhatShips detail URL; and
- normalized original X URL.

Forbidden fields include:

- upstream `description`;
- `videoUrl` and `streamUrl`;
- copied, proxied, or arbitrary poster files/URLs; the canonical WhatShips-hosted `poster_url` is the only exception;
- author avatars;
- cached video, image, or profile assets; and
- arbitrary source HTML.

The snapshot-level provenance must include the upstream repository, commit SHA, blob/content hash, schema version, and a deterministic upstream commit timestamp. Do not rewrite a wall-clock `checked_at` value into the content file on every no-op run; put it in the Action summary instead.

## Idempotency Contract

The upstream `id` and canonical `tweet_id` are both retained and must each be unique. Transition/addition accounting uses `tweet_id`, which binds the record to the original post. Upstream slug, title, company, array position, and publication timestamp are mutable attributes and must not create a second item.

The implementation must satisfy:

- the same upstream blob plus the same existing snapshot produces a byte-for-byte identical file;
- running the sync twice creates no second commit;
- a moved item in the upstream array creates no diff;
- a category alias always normalizes the same way;
- an existing `tweetId` updates its allowlisted fields in place;
- a new `tweetId` creates exactly one item;
- a duplicate `tweetId`, even under a different slug, blocks the run; and
- snapshot comparison uses canonical content, not wall-clock metadata.

Store or report a SHA-256 of the canonical output. If the normalized published items equal the committed snapshot items, exit successfully as `no_change` before creating a commit or dispatching Deploy. A source-provenance-only change must not create a timestamp/hash churn commit when the published metadata is identical.

Do not create an empty commit, timestamp-only diff, tag, or release for a no-op run.

## Addition, Update, and Deletion Rules

Scheduled runs are additive and update-safe, not deletion-authorized.

### Additions

- Add all valid new published ids up to the normal batch ceiling of 200.
- More than 200 new ids in one run is a bulk-import event and requires manual review. Stop before writing unless a manual run uses a separately reviewed bootstrap/large-import flag.
- The initial 1,287-record bootstrap is necessarily a manual, explicitly reviewed exception to the normal ceiling.

### Updates

- Update only allowlisted reference metadata for an existing `tweetId`.
- Report the count of modified ids in the Action summary and commit body; use the version-controlled diff for exact old/new values.
- A changed `tweetId` is a delete plus add, not a rename, and therefore hits the deletion guard.
- Never replace a human-added VentureDex field because the canonical channel snapshot contains no such enrichment fields.

### Deletions and upstream unpublishing

- Compute `existing_ids - upstream_published_ids` before writing.
- If the set is non-empty, stop without changing `content/whatships.json`.
- Report the missing-id count and a bounded id sample without copying the raw source payload into logs.
- Do not infer that a transient fetch, upstream draft transition, slug change, or repository rewrite authorizes deletion.
- Handle an intentional removal through a separate human-reviewed change after checking the WhatShips entry, original X post, upstream Git history, and any rights/takedown context.

This fail-closed rule also prevents a partial upstream response from replacing a full snapshot. The last known-good snapshot remains the live source until the deletion is resolved.

## Validation Gates

Before creating or pushing the scheduled commit, run in this order:

1. Restore the exact lockfile dependencies with `npm ci`.
2. Fetch, normalize, and write the candidate snapshot atomically.
3. Run the WhatShips parser/snapshot contract tests, including forbidden-field and output-order checks.
4. Run `git diff --check`.
5. Prove that the only changed path is `content/whatships.json`.
6. Fetch `origin/main` and prove the local parent SHA still equals the current remote `main` SHA.

The existing Deploy workflow is the authoritative release gate after push. Its `workflow_dispatch` event makes `VENTUREDEX_VALIDATED_SHA` empty, so `scripts/manage.sh release` executes the complete `validate_release_artifacts` path: dependency audit, content validation, seed generation, tests, Astro sync, typecheck, and build, followed by exact-current-main and artifact guards before any remote mutation.

Fixture tests must cover normalization, deterministic reorder, unknown-category preservation, duplicate ids, deletion refusal, the 200-addition ceiling, the copied-field allowlist, and workflow discoverability. The actual no-op path must also be exercised against the pinned live-source resolver before activation. Expand fixture coverage whenever the fetch or input contract changes. Never make the normal VentureDex build or release gate fetch WhatShips live; the scheduled sync job owns the live-source contract test.

Do not mark the content released merely because the sync's focused checks passed or the commit reached `main`.

## Direct Main Push and Deploy Dispatch Contract

Create a commit only after the focused sync gates pass. The Action summary and commit body must include:

- upstream commit and raw content hash;
- previous and proposed record counts;
- added, updated, and missing counts;
- canonical item/output hash when available;
- parser/gate results;
- confirmation that no forbidden media/prose fields were copied; and
- the latest successful/no-op/failure timestamp in UTC.

Use the deterministic commit subject:

```text
content(whatships): sync launch channel
```

Push with this sequence:

1. Record the local parent SHA and fetch `origin/main` immediately before commit.
2. Refuse to continue unless the local parent exactly equals the fetched remote `main` SHA.
3. Refuse staged or unstaged changes outside `content/whatships.json`.
4. Create one commit. A no-diff run exits `no_change` without a commit or dispatch.
5. Push `HEAD:refs/heads/main` with the built-in `GITHUB_TOKEN`, without `--force`, `--force-with-lease`, merge, rebase, or retrying against a changed base.
6. Verify remote `refs/heads/main` equals the exact pushed SHA.
7. If remote `main` advanced after the push but before dispatch, fail closed. Do not silently return success or dispatch a newer unrelated SHA.
8. Call `workflow_dispatch` for `.github/workflows/deploy.yml` with `ref: main` using the same `GITHUB_TOKEN` and `actions: write` permission.
9. Treat an API rejection, disabled workflow, missing permission, or unexpected dispatch response as a failed run.
10. Observe, with a bounded wait when tooling permits, that a Deploy run started for the exact pushed/current `main` SHA.

GitHub's recursion protection is part of this design: the built-in-token push does not start the `on: push` Validate workflow, while an explicit `workflow_dispatch` is a documented exception that does create a run. Do not wait for or claim a Validate run from the push. The dispatched Deploy path performs its own complete release gate.

If branch protection, a ruleset, token scope, a concurrent writer, non-fast-forward, or dispatch permission blocks any step, do not bypass protection, overwrite `main`, or deploy manually inside the sync job. Report the exact layer and let the next scheduled run recompute from fresh `main`.

`sync_checked`, `main_pushed`, `deploy_dispatched`, `release_gate_passed`, `worker_published`, `d1_synced`, and `live_verified` are separate states. Never collapse them into “published.” The presence of `.github/workflows/sync-whatships.yml` in Git is not proof that GitHub has enabled or executed its schedule.

## Failure Handling Matrix

| Failure | Required behavior | Retry |
| --- | --- | --- |
| DNS, timeout, TLS, or GitHub 5xx | Keep snapshot unchanged; report source and attempt count. | Up to three bounded attempts with backoff. |
| HTTP 403/429 | Preserve snapshot; report remaining/reset/retry headers. | Respect a short `Retry-After`; otherwise stop until next schedule. |
| Invalid JSON, HTML response, empty/oversized body | Preserve snapshot; fail before normalization. | No same-run retry unless the transport was provably truncated. |
| Unknown category string | Normalize to `other`, preserve `source_category`, and report it. | Continue when the rest of the record is valid. |
| Structural or type schema drift | Preserve snapshot; report the unsupported contract change. | Manual mapper/test update only. |
| Duplicate or invalid stable id | Preserve snapshot; list offending ids without copying raw payloads into logs. | Manual upstream/mapper investigation. |
| Missing upstream ids | Preserve snapshot; activate deletion blocker. | Manual removal/rekey review. |
| More than 200 additions | Preserve snapshot; classify as bulk import. | Manual bootstrap/large-import review. |
| Parser, focused-test, or diff-scope failure | Do not commit or push. | Fix the implementation through human review, then rerun. |
| Remote `main` advances before the push | Let the non-force push fail; do not rebase or retry onto the changed base in the same run. | Next schedule starts from fresh `main`. |
| Branch protection, ruleset, or token scope rejects the push | Leave remote `main` unchanged; report the exact rejection layer. | Resolve repository policy separately; next schedule retries normally. |
| Push succeeds but `main` no longer equals the pushed SHA before dispatch | Exit nonzero without dispatching an unrelated SHA; record `main_pushed_dispatch_failed`. | Recover only if the pushed SHA is again proven to be exact current `main`; otherwise investigate the later commit. |
| Deploy dispatch is rejected, disabled, or unauthorized | Keep the pushed snapshot commit, record `main_pushed_dispatch_failed`, and do not claim release. | Retry dispatch only while the exact pushed SHA is still current `main`; otherwise fail for human review. |
| Schedule is delayed or dropped | No mutation and no synthetic backfill timestamps. | The next six-hour run catches up by id set. |
| Dispatched Deploy release gate or publication fails | The snapshot commit remains on `main`, while production stays at the last known-good release boundary. Do not auto-revert or claim publication. | Diagnose and recover through the existing exact-main release path. |

Do not fall back to the previous upstream commit and label it current. The last committed VentureDex snapshot is the explicit fallback and must be reported as stale when the newest sync fails.

## Manual Verification Checklist

For an initial enablement, large-import exception, incident recovery, or sampled scheduled-run audit:

- [ ] Confirm the schedule is visible and enabled in the remote repository; the checked-in YAML alone is insufficient evidence.
- [ ] Confirm the upstream commit and raw-file hash match the Action summary and snapshot provenance.
- [ ] Confirm only `content/whatships.json` changed in the data commit.
- [ ] Confirm additions, updates, and missing counts are plausible.
- [ ] Confirm there are no scheduled deletions and no large-import override.
- [ ] Search the snapshot for `videoUrl`, `streamUrl`, raw `poster`, `authorAvatar`, HTML tags, X media hosts, or poster hosts other than `whatships.com`; all must be absent.
- [ ] Confirm sampled `poster_url` values use `https://whatships.com/posters/{safe-name}.webp`, render in list cards, lazy-load below the fold, and fall back without breaking layout.
- [ ] Check at least the newest five records and five deterministic samples against their WhatShips and original X URLs.
- [ ] Confirm title, company, category, source time, duration, and links render as reference metadata rather than VentureDex funding claims.
- [ ] Confirm the WhatShips channel shows visible attribution and both outbound-link types use safe external-link attributes.
- [ ] Confirm the sync workflow's parser/snapshot tests and whitespace/diff-scope checks passed before the push.
- [ ] Record the pushed SHA and verify it became the exact remote `main` SHA.
- [ ] Verify the explicit Deploy dispatch created a run for that exact-current-main state; do not expect a Validate run from the built-in-token push.
- [ ] Verify the dispatched Deploy path reran the complete release gate and passed its normal live smoke checks.
- [ ] Verify the live channel, homepage navigation entry, source links, responsive layout, and client-side filtering/pagination.

A successful local preview, focused sync gate, `main` push, Deploy dispatch, release gate, remote publication, or live HTTP response proves only its own layer.

## Observability

Every scheduled run should emit one structured summary with:

- status: `no_change`, `main_pushed`, `deploy_dispatched`, `main_pushed_dispatch_failed`, or `blocked`;
- source commit, blob/hash, bytes, and HTTP attempt count;
- previous/proposed counts;
- additions, updates, and missing ids;
- category counts after normalization;
- output SHA-256;
- validation results;
- pushed commit SHA and Deploy run id or URL when available; and
- blocker category plus a concise redacted message on failure.

Never log raw access tokens, full response bodies, copied long descriptions, video URLs, or user/profile media URLs. A failed run must exit nonzero after writing the summary so repository notifications remain useful.

## Recovery and Rollback

### Recover a failed scheduled run

1. Read the latest Action summary and classify the failure before retrying.
2. Fetch `origin/main` and determine whether the snapshot commit reached the remote before the failure.
3. If no push occurred, rerun manually only after the transient condition or contract blocker is understood; the run must recompute from fresh `main`.
4. If push succeeded but dispatch failed, verify the exact pushed SHA is still current `main` before retrying only the Deploy dispatch. If `main` advanced, stop instead of dispatching the later SHA as recovery for the earlier run.
5. Confirm the snapshot hash and diff remain deterministic, and do not bypass source, deletion, push, or release gates.

### Roll back a bad published snapshot

1. Revert the exact snapshot commit through the normal human-reviewed repository process.
2. Run the complete validation gate.
3. Publish through the repository's normal exact-SHA Validate and Deploy path.
4. Verify the live channel and navigation.
5. Keep the scheduled workflow blocked until the parser/source cause is fixed, or it may recreate the bad diff.

Do not edit remote D1, manually upload a Worker, or force-push `main` as a substitute for a Git rollback.

## Revisit Triggers

Reconsider this architecture only when at least one of these is true:

- a documented WhatShips API/feed and explicit reuse licence becomes available;
- written permission allows copied posters, video embeds, or richer descriptions;
- measured product requirements need sub-hour freshness;
- the channel needs server-side personalization that cannot be served from a static snapshot; or
- the snapshot becomes too large for acceptable static/client performance after measured pagination and compression work.

Any move to Worker/D1 runtime sync requires a new schema, migration, API, cursor/idempotency state, monitoring, and failure-isolation design. It must not be added to the newsletter cron as an incidental side effect.
