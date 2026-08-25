# Backlink acquisition ledger

This directory records white-hat citation and referral opportunities for VentureDex. The objective is independently useful coverage from relevant sites—not a raw link count.

## Status semantics

- `researched`: current policy, fit, and access requirements were verified; execution still needs a matching pitch, account, or named sender.
- `ready`: the target accepts this resource type and the VentureDex asset is ready, but no submission has been made.
- `submitted`: a form, pull request, or editorial response has been sent and an exact receipt or URL is recorded.
- `accepted`: the publisher approved the submission. This is still not `live` unless the evidence URL resolves from the publisher's public surface.
- `rejected`: the publisher declined the specific submission.
- `blocked`: a required research asset, license decision, identity, or other prerequisite is missing.

`submitted` never means acquired. Acceptance, public HTTP availability, link context, `rel` value, indexability, indexing, and referral traffic must be verified separately. A `nofollow` or `ugc` link may still create qualified discovery and referrals, but it is not represented as a PageRank transfer.

## Guardrails

- Exclude purchased dofollow links, private blog networks, bulk directory services, automated placement, link exchanges, and keyword-rich sitewide widgets.
- Disclose affiliation wherever VentureDex is submitted by its maintainer.
- Use the natural brand or research title as anchor text; do not request a particular link attribute.
- Respond to journalist requests only when a real person can provide relevant, original expertise or data.
- Upload to research repositories only after the underlying dataset, redistribution rights, privacy review, data dictionary, and license are ready.
- Review `ready` and `submitted` rows weekly; re-check all other policies monthly because submission rules can change.

## Explicit exclusions

- BetaList: paid placement is currently marketed with a dofollow backlink benefit.
- OSF Projects: new-project service is being discontinued.
- Generic “submit to 100/200 directories” packages, guest-post marketplaces, PBNs, and reciprocal-link schemes.

The canonical opportunity file is [`2026-08-25-prospects.tsv`](2026-08-25-prospects.tsv).
