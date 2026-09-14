# Throughput, task scope and completion

Human-directed policy correction, 2026-09-14. This replaces numeric Daily throughput ceilings, not editorial or release quality gates. See [the audit](../research/2026-09-14-automation-policy-review.md) for evidence and tradeoffs.

## Authority and finite scope

- The latest explicit human instruction determines the task's goal and scope. Scheduled defaults are not a veto on an authorized catch-up. They do not authorize unrelated mutations, weaker evidence, duplicate actions, destructive Git operations or newsletter sends.
- A scheduled run freezes its due-review snapshot and a finite fresh-discovery plan (queries/source families) before evaluation. Prefer complementary sources; three families and batches of 10–20 are planning suggestions, not pass/fail counts. Log actual searches, including no-results. A backlog-only run does not need fresh discovery or filler candidates.
- A human catch-up such as “process all remaining” freezes the named backlog and processes it to disposition, across as many finite batches as needed. This is not permission for unbounded fresh discovery. A specific human revisit is a valid trigger before an old due date.
- One active task/lease is the concurrency boundary. A task can have multiple immutable batch manifests: each has its own timestamp `run_id`, optional `task_run_id` linking to the durable root run, fixed identity hash and complete outcomes. New manifests must set `task_run_id`; old schema-v1 manifests remain historical evidence. Persist the manifest list and completed slugs in the task receipt; deduplicate across all batches and published content. Resume the first unfinished batch; a lost handle is never a reason to re-search or re-publish.
- There is no candidate minimum, publication maximum, rejection quota, or mandatory three-review cutoff. Evaluate every selected company individually. A one-company or zero-result search is valid when evidence is recorded. Publish every selected company that clears all gates and fits the actual available execution budget; do not invent pending status merely because five passed.

## Budget and stop rules

Before expensive work, record the selected finite scope, available runtime/resource budget if known, and reserve time for one final gate, deploy verification, receipts and safe cleanup based on recent measured durations. Do not invent a universal time/cost ceiling or imply an unknown budget is known. At each batch boundary, check actual progress and remaining resources.

Stop intake when the frozen scope is exhausted, a genuine dependency prevents progress, available resources cannot safely cover another batch plus closeout, or the user changes the task. Persist exact unfinished candidates, reason, next action and due date. `qualified_pending` uses `run_budget` or `scheduled_release` for an actual constraint; legacy `publication_capacity` remains readable but must not be used to resurrect the retired five-item cap. A blocked candidate need not block unrelated qualified candidates. Do not drop old review attempts when a history exceeds 30 entries.

## Validate inputs once, then verify their release

- Keep per-company facts, taste, brand, research, exact-hash screenshot and UI review. Run focused checks while editing; run the full `manage.sh validate` gate on the final content/code inputs before push. Changed inputs invalidate dependent checks; rerun those checks and the final gate when required. Do not rerun the same full suite just to record a result or because an old process handle disappeared.
- Production still requires successful Validate for the **exact release SHA**, serialized Deploy and live smoke. No branch/release/remote-data protection is removed.
- A concurrency-canceled ancestor job is not an automatic failure of already-published content. If a later deployed commit contains the task, record both SHAs and prove coverage:

  ```bash
  python3 scripts/verify-release-coverage.py \
    --base-sha FULL_TASK_BASE_SHA --source-sha FULL_TASK_SHA \
    --release-sha FULL_SUCCESSFULLY_DEPLOYED_SHA
  ```

  The helper requires ancestry and byte/mode-equivalent task paths. It proves Git coverage only, never CI/deploy/health. Independently verify successful Validate, Deploy and live checks for that exact successor. A changed task path requires review and verification of its new version; ancestry alone never proves preservation. Do not rerun an obsolete deploy simply to make an ancestor badge green.
- A non-fast-forward push means refresh refs and inspect the overlap. A clean rebase in the owned worktree is allowed; revalidate the resulting final inputs. Conflicts or uncertain ownership require resolution, not force-push or modifying the user's checkout.

## Separate outcomes

Record these independently, without calling all of them “published” or “failed”:

| Dimension | Evidence and result |
| --- | --- |
| Curation | Unique candidates, all eight dispositions, pending reasons and actual corrections |
| Publication | Content SHA, validated/deployed SHA, any coverage proof, Worker/D1 and live assertions |
| Discovery/indexing | IndexNow receipt; GSC per-URL requested/retry/unknown state; actual indexing only if separately observed |
| Newsletter | Existing Cron eligibility/delivery state; waiting for its configured delay is expected |
| Operations | Transport warnings, measured gate/runtime cost, durable receipts and cleanup outcome |

`complete` means the scoped core work has reached a truthful disposition and safe closeout, with external follow-ups durably queued. `blocked` means required core work cannot finish, an unsafe/unknown core state remains, or cleanup cannot safely complete. Published content with a zero-click GSC backlog can be **complete with indexing follow-up**; never claim the indexing request succeeded. If the user specifically asked for completed GSC requests, that narrower objective remains blocked. Post-click uncertainty remains an explicit no-retry follow-up, never reset to `retry_pending`.

Transport errors such as `IncompleteRead` are probe failures, not proven content mismatches. Preserve them as warnings alongside any independent successful live evidence. If no adequate live check succeeded, release verification remains blocked. Do not turn an observed content/security/data assertion failure into a transport warning.

## Evidence without a deploy loop

Each run writes a concise receipt and current time to the central automation memory; use durable per-run artifacts for detailed evidence. Append to the versioned learning log only for a material new lesson, policy change or correction. Include known evidence before the scoped commit, then store final SHA/CI/live receipts externally. Do not create a second docs-only commit, full validation and production deploy solely to say the first deploy succeeded. Governance/code changes still receive their appropriate full review and tests.

Replace the arbitrary reward sum with observable dimensions above. Keep historical scores, but do not compare them with new runs. A test catching a bug before push is useful evidence, not a quality penalty; track its diagnosis cost separately. Heuristic changes may simplify or remove redundant steps when supported by evidence, while automated self-edits still cannot weaken hard safety/quality gates.

If a previous blocked classification is disproved by verified human authority or release evidence, append a correction with the original record reference before updating the terminal checkpoint under its normal lease/CAS protocol. Never erase the original audit or falsely relabel unfinished work.
