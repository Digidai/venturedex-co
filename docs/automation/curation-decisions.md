# Evidence-led decisions and bounded corrections

Human-authorized policy repair, 2026-09-09. `content/STANDARD.md` remains editorial authority. This contract removes the rejection quota, not the product/research/brand/screenshot/release gates. Never rewrite the frozen rejection history to make metrics look better.

## Immutable batches, complete accounting

1. Validate and run `npm run curation:plan -- --today YYYY-MM-DD` (read-only; default page 10; `--limit N` accepts any positive size, `--all` selects every due review). Select due reviews before fresh discovery. A page is not a task/publication cap. Re-review is not automatic acceptance. Follow [throughput and completion](throughput-and-completion.md) for scheduled versus human catch-up scope.
2. Fresh discovery covers the last 30 days of announcements. Prefer three complementary non-aggregator source families: `company`, `investor`, `original_media`, `regional_media`, `industry_media`, `research`. This is coverage guidance, not a required number of searches before publishing an already-verified company. `discovery` is permitted as a pointer, not primary verification. Log actual queries and results, including no-results; backlog-only batches need no new search. Do not require a regional/industry acceptance quota or treat syndicated copies as independent sources.
3. Deduplicate via `npm run curation:lookup -- --slug company-slug`: accepted content first, then validated overlay, then historical rejection. A prior rejection needs a specific new funding/product/company-status/governance trigger; a pending review needs its due date. The 2026-09-09 human audit is an explicit governance trigger for its queued cases, not a blanket reopening of all history.
4. Lock the selected unique companies in `content/curation-runs/{run_id}.json` before screening. A batch of 10–20 is a planning aid, not a minimum or maximum; one candidate or a documented empty search is valid. Preserve locked identity fields and hash through recovery; change only evidence and outcomes. Additional batches within the frozen task scope use new manifests linked by `task_run_id`, never overwrite an old pool or restart discovery after interruption. Deduplicate across the task's batches.
5. Account for every candidate with one state below. Publish all that clear every gate and fit the real available execution budget, with no numeric ceiling or forced rejections. Record actual budget/dependency stops and resume points, not artificial five-item overflow.

| State | Meaning | Re-review |
| --- | --- | --- |
| `evidence_pending` | Identity, funding or product evidence remains incomplete | 1-30 days |
| `access_blocked` | Page access or transport prevents inspection; not proof of poor product | 1-7 days |
| `schema_deferred` | Source terms genuinely cannot be represented; not native currency or a supported extension | 1-30 days |
| `qualified_pending` | Evidence and taste pass; actual run budget or an explicit release schedule prevents completion | 1-30 days or an explicit earlier human trigger |
| `publication_blocked` | Qualified product awaits screenshot, release or associated-investor gate | 1-30 days |
| `quality_rejected` | Adequate industry-specific evidence supports a concrete negative product judgment | Only a new documented trigger |
| `policy_excluded` | Confirmed independence/category/window/late-stage policy exclusion | Only a new documented trigger |
| `accepted` | A real startup record exists and all qualification/publication gates passed | Normal content maintenance |

Sixty seconds is routing time, not a deadline to prove a negative. Check the product through the appropriate rubric: software workflow; enterprise integration/deployment; developer API/docs/error handling; hardware specifications/tests/field demonstration; or disclosed medical validation and operating workflow. A vendor claim is labeled as such, not promoted to independent proof. Login walls, a plain website, an undisclosed lead, native currency and named early/extension stages are not rejection reasons. A verified financing whose source does not state a round name is represented as `Unspecified` with the source-bound `research.unnamed_round_assessment` required by `funding-terms.md`; an unverified financing remains `evidence_pending`, while ambiguous labels such as Growth or Late Stage are never silently converted. Do not bypass login or register for paid, contractual or regulated access without authority.

## Review overlay

`content/curation-reviews.json` has `schema_version: 1` and `reviews`. Each record requires:

- `slug`, verified `company_url`, `state`, state-specific `reason_code`, specific `reason` (30+ characters), `reviewed_at` (actual review date), `next_review_at` (future relative to review, null for terminal states), `priority` (1 highest, 2 normal, 3 low), exact public `sources`, and ordered `attempts`.
- If the slug appears in `rejected.jsonl`, `original: {"ledger":"rejected.jsonl","sha256":"…"}` must match SHA-256 of the original trimmed JSONL line. Preserve the line byte-for-byte, including the frozen v1 block. Do not change frozen digests. For v2, official company identity must also match. A proven historical entity collision may change `company_url` only with `identity_correction: {previous_company_url, reason, evidence_urls}`: the previous URL must match frozen history, reason must explain the mismatch, and at least two unique old/new public evidence URLs must include the new canonical homepage. This corrects the overlay; it never rewrites history.
- Each actual follow-up appends `{date, outcome, note}`; note includes new evidence or exact blocker. No same-day blind retries, invented research or reset of history. Preserve the ordered history even beyond 30 attempts. A planner invocation is not a research attempt and changes nothing.
- `accepted`, `qualified_pending` and `publication_blocked` require `evaluation`: `rubric` (software/enterprise/developer/hardware/biotech/other), `independent: true`, `funding_verified: true`, at least two `{url,note}` product observations, and `taste` with `bet`, `craft`, `specificity`, each `{pass:boolean,note}`. Notes require 20+ characters. At least two dimensions must pass. This supplements, never replaces, complete startup `research`, late-stage exception and publication gates.

Example pending record (illustrative, not a company to publish):

```json
{
  "slug": "example", "company_url": "https://example.com/",
  "state": "evidence_pending", "reason_code": "funding_evidence_gap",
  "reason": "The inspected announcement confirms financing but not its named stage; a source follow-up is needed.",
  "reviewed_at": "2026-09-09", "next_review_at": "2026-09-10",
  "priority": 2, "sources": ["https://example.com/news"], "attempts": []
}
```

Use `scripts/curation.py` for the exact allowed reason-code mapping. New reviews are authoritative; a historical row may additionally be appended only for confirmed quality/policy negatives, then bound by its hash. Existing v2 superseded rows remain compatible. New accepted corrections use the validated overlay, with a real startup in the same release; they do not mutate old rows. A pending/negative overlay cannot coexist with a published startup.

## Manifest schema

Required top-level fields: `schema_version: 1`, `run_id` (`venturedex-daily-YYYYMMDDTHHMMSSZ`), `locked_at` (YYYY-MM-DD), `pool_sha256`, `source_coverage`, `candidates`.

New batches also set `task_run_id` to the durable root run ID (same format), including the first batch. It is optional in schema v1 solely for backward compatibility. The task receipt lists its manifests, immutable hashes and completed slugs; old manifests must not be rewritten to manufacture missing provenance. `source_coverage` may be empty for a revisit-only batch, but fresh/empty-search batches require actual attempts. Search breadth is reviewed qualitatively; per-company original-source funding and product evidence remain mandatory.

Each coverage item is `{type,query,outcome}`. Each candidate requires `slug`, `company_url`, `source_url`, `source_type`, `announced_at` (exact source date or null when pending), `region`, `industry`, `discovery_mode` (`fresh` or `revisit`), `state`, `reason`; qualified/blocked/accepted candidates also require the same `evaluation` above. Use `undisclosed` for unknown region/industry, not guesses. Fresh qualified candidates require a source date within 30 days of pool lock. Revisits require a durable review record with the actual trigger; do not relabel an old announcement as fresh.

`pool_sha256` is SHA-256 of UTF-8 compact JSON containing the candidate-order list of `{slug,company_url,source_url}`, with each object's keys sorted lexicographically and Unicode unescaped. Store this hash before evaluation and preserve it in recovery evidence. The validator detects identity drift against the saved hash; it is not a substitute for checking Git/checkpoint history against an attempted replacement of both pool and hash. Run `npm run curation:validate` before the full local gate; build also validates the overlay and manifests.

Report all eight outcome counts against the unique locked-pool denominator. Quality rejection rate means quality_rejected / all unique candidates, never all unpublished / accepted. Also report source coverage, due backlog and oldest due date, actual re-reviews and corrected decisions. There is no measurable false-negative rate without a defensible reviewed comparison sample; the audit identified risks and candidates, not a proven number of high-quality missed companies.

For a multi-batch task, run `python3 scripts/curation.py summary --run-id EXACT_BATCH_ID` with repeated `--run-id` arguments for all its manifests. This read-only summary separates historical candidate observations from unique slugs and applies the current validated review overlay; its basis is current effective state, not a reconstruction of historical state. Do not sum each batch's old `qualified_pending` counts into a fictitious current backlog. Check selected manifest IDs against the durable task receipt.

## Existing interrupted run

The 2026-09-09 audit queue includes 13 draft outcomes from the interrupted Daily without copying them into the committed rejection ledger. Their audit evidence is retained in `docs/research/2026-09-09-curation-audit.json`; `reviewed_at` denotes audit routing, not new product verification. Resume must reconcile these with the overlay before staging, preserve its original fixed pool and independently verify its final screenshots. The maintenance rollout does not turn four provisional additions into published companies or erase the blocked run's artifacts.
