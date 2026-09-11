# Screenshot-first discovery design

## Approved direction

The September 11 discussion approved the research recommendations except separate covers. Use only existing, reviewed official-site screenshots. Do not introduce cover fields, third-party media, new captures, image cropping, or a new media workflow. Preserve the current editorial typography, colors, source evidence and startup acceptance rules.

## Experience

1. Compact homepage introduction, visible search and topic shortcuts, then 18 recent company cards. Three desktop columns and one phone column. First three screenshots use the existing priority prop. Topics, funding updates and subscription context follow the gallery.
2. Keep the complete directory and existing query links. Add keyword matching to its existing facet/sort system, with one visible search field, reset and live result count. Restore URL state on history navigation.
3. Reduce desktop navigation to Directory, Investors, News and a native More disclosure. A native phone Menu retains every destination without a second navigation row.
4. Related companies require specific shared product tags or a matching researched category. Region and funding stage alone never qualify a company. Return fewer than four rather than unrelated filler.
5. Preserve structured investor profiles and their existing 90-day refresh policy. Add a small source-bound participation sidecar keyed by a published company's exact funding round, canonical investor slug and evidence URL. Separate explicit lead, explicit participant and lead-role-unspecified records. The hub, detail pages, links and sitemap must share the same source-linked coverage decision. Never infer participants from name ordering or scrape free-text names into lead attribution.

## Safety and scope

No screenshot bytes/review records, startup membership, funding amounts, lead fields, newsletter schedule, curation state or external automation configuration will change. Investor participation evidence is additive and separately validated. Initially cover the directly verified Conveo announcement; do not claim full historical participation backfill. No fresh institutional profile is re-researched merely because an association was added.

Browser verification found an existing identity mismatch: Conveo's announcement names DST Global Partners, while the company record linked DST Global. Correct this one display name to the source wording, leave it unlinked, and record an authored update timestamp without changing publication time or inventing a new institutional profile.

## Verification

Unit tests cover query round-trips, text and facet composition, unrelated-region rejection, deterministic ranking, and evidence/identity/deduplication failures. Static contracts cover screenshot-only rendering and synchronized investor consumers. Full repository gates remain unchanged. Browser checks cover desktop, 375/390/414 phone widths, dark mode, menu, search, clear, back, related cards and investor links. Recheck the deployed pages after the normal exact-SHA release.
