# Investor profile research and refresh

Human-directed addition, 2026-09-09. This extends investor content maintenance; it does not change startup acceptance standards, the five-addition cap, browser ownership, screenshot approval, release, GSC or newsletter policy.

## Data and evidence

- Canonical identity and brand mapping remain in `content/investors.json` and `content/brand-assets.json`.
- Structured, source-linked research lives in `content/investor-profiles.json`. It is build-time editorial data, not a D1 schema migration.
- Every profile needs a meaningful summary, firm type and at least one other useful fact. Prefer investment stages, focus areas, geography, approach and founder support; add founding year and office locations only when supported. Omit unknown facts, rather than filling invented placeholders.
- Every summary/fact must bind to source IDs. Sources must be actually opened, substantive pages on the canonical official HTTPS domain (or its subdomains). Inspect the source content, not just its HTTP status. One detailed official firm page can support multiple facts; add additional pages when needed. News syndication is not independent confirmation.
- Record `reviewed_at` and every retained source's `checked_at` only after the full retained profile has been checked on that UTC calendar date. A changed page, new funding reference or successful build does not itself refresh research.
- Treat firm descriptions as firm-reported scope, not an endorsement. Do not infer investment mandate from VentureDex's sample. Never turn a company's round total into the investor's check size; do not infer AUM, returns, current dry powder, open application windows or investment availability.
- Distinguish location from investment geography and legal entity from brand. In particular, Lightspeed's official site distinguishes LSVP from LSIP. Historical aliases are not proof that the entities or their funds are interchangeable. Do not change historical round attribution without a separate source-by-source migration.

## Daily procedure

1. For each startup being prepared or updated in the fixed run, collect all explicitly named participants plus each reported lead. Ignore `undisclosed`; deduplicate across startups. Never infer lead status from ordering.
2. Match exact canonical names/aliases with the existing directory resolver. Inspect planner `identity_warnings` for composite leads and the known Lightspeed/LSIP historical alias; verify each named entity separately. A materially ambiguous identity stays unresolved; do not invent an alias to make validation pass.
3. Plan with `npm run investors:plan -- --startup <slug>` (repeat the flag for several saved startup records), or `--investor <canonical-slug>` during preparation. The planner is local and read-only. Unknown participant names are returned explicitly and need identity research before a new directory entry is created.
4. Follow the returned action:
   - `skip_fresh`: reviewed less than 90 days ago. Reuse the profile without rewriting its text or dates. A routine new portfolio mention is not a material change.
   - `research` / `review_due`: 90 days or more since review. Check the official overview and the specific pages underlying the retained facts; update only facts that changed.
   - `research` / `missing_profile`: supplement the existing legacy entry, or create a complete sourced profile with a new canonical investor. Remove a completed legacy slug from `legacy_unresearched`.
   - `retry_later`: honor the recorded cooldown, unless a genuinely new material signal has appeared.
5. A verified rebrand, merger, new fund mandate, material team/location change, broken official identity link, or a discovered factual error triggers early review via `--changed <slug>`. Record the exact trigger URL and correction in the learning log. The flag requests research; it does not certify that research succeeded.
6. If review fails, leave the old profile and `reviewed_at` unchanged. Add/update `attempts[slug]` with `attempted_at`, a 1–7 day `retry_after`, the exact attempted `source_urls` and a concise factual `reason`. Clear the attempt after a successful review. Existing legacy entries may remain pending. Do not fabricate a profile for a newly created investor: defer that unresolved addition when minimum identity/profile evidence cannot be obtained.
7. Run `npm run investors:validate`, then the unchanged full release gates. The investor check is also part of the full gate and build. Stage the investor directory, research sidecar and related official brand assets together when relevant. Never add new slugs to `legacy_unresearched` to bypass profile requirements; it is a migration exemption for the pre-existing directory only.
8. Include researched / fresh-skipped / retry-deferred / identity-unresolved counts in the existing run learning entry. This is not a second discovery cycle or an unbounded sweep of all investors. Use `--all` only for a separately requested backlog audit.

## Failure boundaries

- Source-bound funding participation can be recorded in `content/investor-participations.json` after checking the exact funding source. Each edge binds a published company's round date/stage/source URL, canonical investor slug, role and `verified_at`. This is additive discovery data; it does not change `lead_investor`, round totals, startup acceptance or profile freshness.
- Use `lead` only for an explicit lead, `participant` for an explicitly designated participant, and `role_unspecified` when the investment is confirmed but the lead/participant distinction is not given. Never infer a lead from name ordering. Unknown identities or unclear roles must not be guessed to fill an institution page.
- New edges are validated during the application build and tests. Existing company CSV names do not automatically become round-level participation evidence. The initial September 11 addition covers four Conveo participants only; it is not a historical portfolio backfill. The announcement's `DST Global Partners` is not automatically mapped to the `DST Global` firm without identity evidence.

- Check existing identity/brand evidence when matching a fresh profile; only repeat website research if the naming or brand is materially different. A cached reviewed profile does not excuse an identity mismatch.
- A funding source with no designated lead uses the existing `lead_investor: "undisclosed"` convention. It is not a new hard rejection condition. An unknown amount uses `amount: "undisclosed"`; do not replace a disclosed non-USD amount with `undisclosed` to hide a schema incompatibility.
- Do not change the frozen rejection block or mark a candidate accepted because investor enrichment succeeded.
- A failed investor refresh is not a statement that the startup or investor is low quality.
- The hub, detail-page robots policy and sitemap still share the existing requirement of at least one complete, source-linked distinct company. A research profile alone must not make an otherwise empty investor page indexable.

## Example

```bash
npm run investors:plan -- --investor a16z --investor accel
npm run investors:plan -- --startup airbound --startup ipronics
npm run investors:plan -- --investor lightspeed --changed lightspeed
npm run investors:validate
./scripts/manage.sh validate
```

The human-authorized September 11 backlog completion contains 265 researched firm profiles and zero legacy profile exemptions. The migration is deterministic and source-bound: it does not claim independent verification of firm-authored mandates, and future refreshes still follow the 90-day/material-change policy above.
