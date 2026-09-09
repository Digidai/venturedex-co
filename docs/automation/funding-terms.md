# Source-preserving funding terms

Effective with the human-authorized 2026-09-09 curation repair. Missing lead, native currency and named early/extension rounds must not become quality rejection reasons.

## Authoring contract

- Keep required `amount`, `stage`, `date`, `lead_investor`, `source_url`, `source_name`. Verify each against the original announcement/report. Use literal `undisclosed` for an undisclosed amount or lead; never infer lead from participant order.
- Canonical stages: `Pre-Seed`, `Seed`, `Pre-Series A`, `Series A` through `Series Z`. Default editorial scope ends at C; D+ still needs the existing source-bound breakout exception.
- Preserve an explicit extension in `stage_raw`, such as `Series A+` or `Seed extension`; its normalized value must equal `stage`. Do not map ambiguous `Growth`, `Late Stage`, `Series AA`, an unnamed round, or a guessed stage into this schema. Queue evidence or a real schema limitation instead.
- For new research, specify `currency` when disclosed. `$10M` and `USD 10M` mean USD. Other currencies use an ISO code prefix, such as `EUR 6.5M`, with the matching `currency`. Unqualified non-USD dollar/yen/rupee symbols must be resolved from the source before authoring. No automatic FX conversions or cross-currency totals.
- The supported ISO 4217 currency snapshot in `src/lib/funding-currencies.json` is sourced from SIX, not an FX feed. Test/precious-metal/no-currency codes are excluded. A new official currency code needs a reviewed snapshot update, not a company rejection.
- Optional `instrument`: `equity`, `debt`, `mixed`, `grant`, `undisclosed`. Never infer an equity/debt split, treat a mixed total as equity, or combine a grant and a named round without source support. Instruments do not waive the named-stage/evidence rules.
- `date` is the actual source announcement/publication date, not a crawl, relative search label or review date. Invalid/future dates fail validation.

Illustrative round (not publication data):

```json
{
  "amount": "EUR 6.5M", "currency": "EUR",
  "stage": "Series A", "stage_raw": "Series A+", "instrument": "mixed",
  "date": "2026-09-09", "lead_investor": "undisclosed",
  "source_url": "https://example.com/announcement", "source_name": "Company announcement"
}
```

Legacy USD/Seed/Series records remain valid without the optional metadata. Absence means not recorded, not independently verified equity. Do not bulk-normalize old amounts or invent metadata just to fill columns.

## Storage and release

The content schema, Python validator, deterministic seed, TypeScript readers, D1, funding views, investor views, startup pages, newsletter and machine-readable resources preserve the same optional metadata. Public display uses original stage labels and labels debt/mixed/grant amounts. Filters use canonical stages.

D1 gains three nullable TEXT columns (`currency`, `stage_raw`, `instrument`). Existing values and relationships are not rewritten by the migration. `manage.sh release` probes the remote schema, fails closed on an incomplete probe, and performs only these allowlisted additive alterations inside the existing exact-main guarded release. The Worker remains compatible with missing optional fields while the schema/seed catches up. Local `npm run db:migrate` includes the same additive local funding migration. Do not manually synchronize or deploy around the guarded release path.

Regression tests cover positive native amounts, currency mismatch, canonical/raw consistency, invalid dates, undisclosed leads, mixed display, content/seed parity, and rejection/pending separation. A passing schema test proves representability, not that a company clears editorial review.
