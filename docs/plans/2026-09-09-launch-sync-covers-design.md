# Launch sync recovery and instant covers

Authorized outcome: recover stale launches, keep native VentureDex pages, and make the first viewport video-first with cohesive compact cards.

## Decisions

- Replace list MP4 decoding with versioned, first-party 640 × 360 WebP frames derived from the allowlisted original video. No copied catalog posters, descriptions, or stored videos. Image filenames include the source/recipe hash; immutable caching is safe. Missing originals retain a deliberate fallback and are retried on later runs.
- Preserve server-rendered cards when the search index arrives. Eager-load only the first row, lazy-load the rest, and do not download videos on the list. Reuse covers on detail players and in video/social metadata.
- Reduce page-header and card-title scale, remove duplicate section headings and surplus card footer space. Keep keyboard navigation, search, categories, pagination, and reduced motion.
- Validate the complete upstream inventory before selecting a bounded 200-addition batch. Keep every existing record and refuse deletions. Report pending additions so later six-hour runs drain backlog rather than failing forever. This reviewed recovery imports the current full inventory once.
- Persist the last successfully published/notified snapshot in an Actions checkpoint. Even on metadata no-op, verify/recover the exact-main Deploy and compare live catalog fingerprints before notification. Advance the checkpoint only after IndexNow accepts the pending URLs.
- Keep original videos remote. Generated covers are the only newly stored media; source metadata and image artifacts are reproducible and versioned together.

## Alternatives considered

Keeping MP4 previews retains network/decoder contention. Hotlinking catalog posters adds an external runtime dependency and violates the existing source boundary. A new image service adds credentials, runtime failure modes, and cost. Static derived covers fit the existing audited Cloudflare release path.

## Verification

Test batch draining/deletion refusal, deterministic cover keys and file contracts, checkpoint recovery/no-op behavior, and public source boundaries. Measure zero list MP4 requests, first-row cover readiness/bytes, retained SSR nodes, desktop/mobile first-card position, filtering and actual detail playback. Run the complete release gate, then verify exact-SHA CI, deployment, live inventory, cache headers, and a manual scheduled-workflow no-op. Notification receipts are not indexing proof.

## Local acceptance results

- Recovered 601 additions: 1,402 → 2,003 published entries, with no existing entries deleted. Pinned upstream commit: `2e3157c9630531259c7e4c3777c6741d35d75776`.
- Generated 1,986 unique stills covering 1,993 entries (99.5%). Ten historical originals could not provide a usable frame within the bounded attempts; they retain a product fallback and scheduled retry eligibility. All latest 24 entries have covers.
- First four cover files total 27,532 bytes. Browser requests on the list: zero MP4s; no video elements or decoding on the list.
- Desktop at 1,440 × 900: 32 px page title, first card begins at 263 px, four cohesive columns and no horizontal overflow. At 390 × 844: 26.4 px list title, first complete card visible from 356–679 px; detail title is 24 px and video occupies 334–526 px.
- Category filtering (157 Design entries), search, empty state, page 2 of 84, delayed-index SSR preservation, JavaScript-disabled covers, failed-index fallback, and actual original-video playback were exercised in a browser. The full catalog remains independently discoverable through the sitemap and machine surfaces.
- Remote schedule was confirmed active, not merely declared in Git. Production acceptance still requires the exact merged SHA to pass CI/Deploy plus live fingerprint verification and a successful manual run of the existing sync workflow; record that evidence in the release handoff.
