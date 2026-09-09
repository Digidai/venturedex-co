# Investor profiles: implementation design

Scope: the user requested substantive investor pages plus freshness-aware enrichment during Daily curation. They separately requested a deep review of curation logic.

## Decision

Use a versioned, source-linked content sidecar and prerendered component. Do not add D1 columns or infer firm facts from tracked funding. The existing canonical investor identity resolver and investor indexability rule remain authoritative.

Alternatives considered:

- Extend the base Investor/D1 entity: larger migration and parity surface without a runtime consumer needing those fields.
- Generate prose for all 254 firms: rapid visual density, but no trustworthy provenance or freshness.
- Selected source-checked profiles plus on-demand enrichment: chosen for evidence quality, backward compatibility and bounded maintenance.

## Testable steps

1. Audit source/decision ledger and document false-negative risks. Output: immutable audit snapshot and cited report; no changes to original decisions.
2. Add schema validation and deterministic 90-day planner. Test real dates, source IDs, official URLs, unknown identities, legacy/new boundaries, fresh/stale/change/cooldown behavior.
3. Enrich a bounded initial set from actually inspected official pages. Test all facts and dates against the contract.
4. Add editorial-style firm facts, citations and coverage metrics to existing pages. Preserve shared SEO eligibility; verify desktop and narrow layouts.
5. Add workflow docs and update the existing scheduled task, preserving its other fields. Until the code is on the selected origin revision, the prompt uses only supported fields and records structural enrichment as pending.
6. Run full repo gates. Report historical external-source failures separately; never equate a diagnostic build with a complete publish gate.

## Constraints

No new discovery run, no auto-accepted companies, no legacy digest rewrite, no source/investor-performance claims without evidence, no fabricated screenshot reviewer, no deployment/GSC/newsletter action, no unrequested subagents.
