# Evidence-led decisions and bounded corrections

Human-authorized policy repair, 2026-09-09. `content/STANDARD.md` remains editorial authority. This contract removes the rejection quota, not the product/research/brand/screenshot/release gates. Never rewrite the frozen rejection history to make metrics look better.

## One pool, complete accounting

1. Validate and run `npm run curation:plan -- --today YYYY-MM-DD` (read-only; default three, never select more than three in Daily). Select due reviews before fresh discovery. Re-review is not automatic acceptance.
2. Search the last 30 days of funding announcements across at least three complementary non-aggregator source families: `company`, `investor`, `original_media`, `regional_media`, `industry_media`, `research`. `discovery` is permitted as a pointer, not primary verification. Log each query and result, including no-results. Do not require a regional/industry acceptance quota or treat syndicated copies as independent sources.
3. Deduplicate via `npm run curation:lookup -- --slug company-slug`: accepted content first, then validated overlay, then historical rejection. A prior rejection needs a specific new funding/product/company-status/governance trigger; a pending review needs its due date. The 2026-09-09 human audit is an explicit governance trigger for its queued cases, not a blanket reopening of all history.
4. Lock 10-20 unique companies including carry-over in `content/curation-runs/{run_id}.json` before screening. Never expand the pool to meet a rejection target. Preserve locked identity fields and hash through the run and resume; change only evidence and outcomes. A second discovery cycle is not a recovery step. If fewer than ten credible candidates exist after bounded complementary searches, preserve the attempted search evidence, report incomplete intake and stop; do not invent candidates.
5. Account for every candidate with one state below. Publish at most five that clear every gate; retain other qualified companies for a later run. A pool with five accepted, two qualified pending and no quality rejection is valid.

| State | Meaning | Re-review |
| --- | --- | --- |
| `evidence_pending` | Identity, funding or product evidence remains incomplete | 1-30 days |
| `access_blocked` | Page access or transport prevents inspection; not proof of poor product | 1-7 days |
| `schema_deferred` | Source terms genuinely cannot be represented; not native currency or a supported extension | 1-30 days |
| `qualified_pending` | Evidence and taste pass, but this pool's publication capacity is exhausted | 1-30 days |
| `publication_blocked` | Qualified product awaits screenshot, release or associated-investor gate | 1-30 days |
| `quality_rejected` | Adequate industry-specific evidence supports a concrete negative product judgment | Only a new documented trigger |
| `policy_excluded` | Confirmed independence/category/window/late-stage policy exclusion | Only a new documented trigger |
| `accepted` | A real startup record exists and all qualification/publication gates passed | Normal content maintenance |

Sixty seconds is routing time, not a deadline to prove a negative. Check the product through the appropriate rubric: software workflow; enterprise integration/deployment; developer API/docs/error handling; hardware specifications/tests/field demonstration; or disclosed medical validation and operating workflow. A vendor claim is labeled as such, not promoted to independent proof. Login walls, a plain website, an undisclosed lead, native currency and named early/extension stages are not rejection reasons. Do not bypass login or register for paid, contractual or regulated access without authority.

## Review overlay

`content/curation-reviews.json` has `schema_version: 1` and `reviews`. Each record requires:

- `slug`, verified `company_url`, `state`, state-specific `reason_code`, specific `reason` (30+ characters), `reviewed_at` (actual review date), `next_review_at` (future relative to review, null for terminal states), `priority` (1 highest, 2 normal, 3 low), exact public `sources`, and ordered `attempts`.
- If the slug appears in `rejected.jsonl`, `original: {"ledger":"rejected.jsonl","sha256":"…"}` must match SHA-256 of the original trimmed JSONL line. Preserve the line byte-for-byte, including the frozen v1 block. Do not change frozen digests. For v2, official company identity must also match; resolve genuine identity corrections explicitly before overriding.
- Each actual follow-up appends `{date, outcome, note}`; note includes new evidence or exact blocker. No same-day blind retries, invented research or reset of history. Keep at most 30 attempts; reaching the limit requires a reviewed archival-policy change, not dropping history. A planner invocation is not a research attempt and changes nothing.
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

Each coverage item is `{type,query,outcome}`. Each candidate requires `slug`, `company_url`, `source_url`, `source_type`, `announced_at` (exact source date or null when pending), `region`, `industry`, `discovery_mode` (`fresh` or `revisit`), `state`, `reason`; qualified/blocked/accepted candidates also require the same `evaluation` above. Use `undisclosed` for unknown region/industry, not guesses. Fresh qualified candidates require a source date within 30 days of pool lock. Revisits require a durable review record with the actual trigger; do not relabel an old announcement as fresh.

`pool_sha256` is SHA-256 of UTF-8 compact JSON containing the candidate-order list of `{slug,company_url,source_url}`, with each object's keys sorted lexicographically and Unicode unescaped. Store this hash before evaluation and preserve it in recovery evidence. The validator detects identity drift against the saved hash; it is not a substitute for checking Git/checkpoint history against an attempted replacement of both pool and hash. Run `npm run curation:validate` before the full local gate; build also validates the overlay and manifests.

Report all eight outcome counts against the unique locked-pool denominator. Quality rejection rate means quality_rejected / all unique candidates, never all unpublished / accepted. Also report source coverage, due backlog and oldest due date, actual re-reviews and corrected decisions. There is no measurable false-negative rate without a defensible reviewed comparison sample; the audit identified risks and candidates, not a proven number of high-quality missed companies.

## Existing interrupted run

The 2026-09-09 audit queue includes 13 draft outcomes from the interrupted Daily without copying them into the committed rejection ledger. Their audit evidence is retained in `docs/research/2026-09-09-curation-audit.json`; `reviewed_at` denotes audit routing, not new product verification. Resume must reconcile these with the overlay before staging, preserve its original fixed pool and independently verify its final screenshots. The maintenance rollout does not turn four provisional additions into published companies or erase the blocked run's artifacts.
