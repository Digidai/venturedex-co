# Curation and investor backlog completion — 2026-09-11

Status: human-directed backlog audit and implementation. This document records local source review and code/data changes. It is not by itself proof of deployment, search indexing, newsletter delivery, independent product performance, or acceptance of a company into the public directory.

## Outcome first

The high apparent rejection/deferral rate was primarily a decision-model problem, not evidence that the candidate supply had suddenly become worse. The earlier audit found that 64.8% of recent F3 decisions were stage-related, while native currency, extensions and unnamed rounds were being mixed with actual quality decisions. After the source-preserving currency/extension repair, the remaining structural false-negative mechanism was the inability to represent a verified financing whose source did not name a round.

This completion adds a canonical `Unspecified` stage, publicly labeled “Stage undisclosed.” It can be used only when the financing event itself is verified and a structured `research.unnamed_round_assessment` binds the decision to at least three sources, including official and funding sources, and at least two product-evidence claims. `Growth`, `Late Stage`, invented Seed labels and other ambiguous mappings remain invalid. The change increases recall without pretending that VentureDex knows the company's maturity.

The 57-record review overlay now separates research completion from publication capacity:

| Current state | Count | Interpretation |
| --- | ---: | --- |
| `qualified_pending` | 39 | Product, funding, independence and taste review passed; queued behind bounded authoring, investor, screenshot and release gates |
| `evidence_pending` | 2 | One future financing-finality check and one hardware-demonstration check remain genuinely dependent on external evidence |
| `accepted` | 1 | Previously published through all gates |
| `policy_excluded` | 9 | Confirmed policy exclusions, including two finalized in this audit |
| `quality_rejected` | 6 | Evidence-backed product-quality outcomes, including one finalized in this audit |
| Access/schema blockers | 0 | The two former page-access blockers were resolved; the unnamed-round schema blocker was removed |

Of the 44 records that were previously incomplete, 43 received a source-by-source outcome on September 11: 39 qualified, three received terminal evidence-backed decisions, and Dawraty moved from access failure to a precise financing-finality wait. Bluecore Energy was already reviewed on September 10 and is not due until September 24. The unresolved research set therefore falls from 44 to 2. This is not a measured false-negative rate—the queue was governance-triggered and not a randomized comparison sample.

## Qualified queue

The exact evidence URLs, product observations, taste notes, funding status and attempt history are stored in `content/curation-reviews.json`. These 39 companies were not silently converted to accepted records:

- Aitan, Aslan, TrustedRouter, Easy Aerial, FamBot, Conveo, Guardio, Ultrahuman
- Chariot Claims, Elm AI, Prevalent AI, SentiCell, Zeit AI, PeopleX
- ALSO, Teragen Energy, Science4Beauty, HyImpulse, Airbility, xorlab, Cato
- Jaipur Robotics, Fluencify, Octave Energy, MOA Foodtech, Backbone, MineWatch
- Fundly.ai, Leinao AI, MegaWave Fusion, Split Pay, Moonwalk Biosciences
- Outline, BrainChild Bio, Keep Converting, Celero Communications
- DigitalPaani, Circolife, Veridue

Qualification means the audit found at least two inspectable, source-linked product observations and at least two passing taste dimensions under the relevant software, enterprise, developer, hardware or biotech rubric. It does not waive the five-addition ceiling, startup authoring, investor-identity research, official brand asset, independent screenshot review or guarded release path.

Representative primary/current evidence includes:

- [TrustedRouter documentation](https://trustedrouter.com/docs), [Conveo product](https://conveo.ai/product), [Elm AI product deck](https://product.elm-ai.com/), [Veridue launch](https://veridue.ai/blog/veridue-launches-4m-pre-seed)
- [SentiCell platform](https://www.senticell.bio/platform), [Moonwalk science](https://moonwalk.bio/science/), [BrainChild pipeline](https://brainchildbio.com/pipeline/), [peer-reviewed BrainChild-related Phase 1 evidence](https://www.nature.com/articles/s41591-024-03451-3)
- [HyImpulse SL1](https://hyimpulse.de/sl1), [Teragen Energy](https://www.teragenenergy.com/), [MegaWave Fusion products](https://www.megawavefusion.cn/pruduct), [Circolife business subscription](https://subscription.circolife.com/ac-for-business/new)
- [DigitalPaani company history](https://www.digitalpaani.com/about-us/), [Split Pay fee mechanics](https://splitpay.com/help/about-split-pay/how-split-pay-works/what-fees-does-split-pay-charge), [xorlab funding announcement](https://www.xorlab.com/en/blog/xorlab-raises-eur-5-million-to-build-europes-leading-sovereign-email-security-platform)

## Corrected and terminal decisions

### ALSO identity collision

The frozen rejection ledger pointed `also` to `https://also.com/`, which belongs to ALSO Holding AG, a technology distributor. The electric-mobility company consistently identifies itself at [ridealso.com](https://ridealso.com/) and publishes its product, company and financing material there. The rejection ledger remains byte-for-byte frozen; the overlay now carries `identity_correction` with the old URL, corrected canonical homepage and exact evidence. Validator coverage prevents an agent from changing a frozen identity without this old/new evidence contract.

### Emberos — policy exclusion

[Emberos](https://www.emberos.ai/) and its [funding announcement](https://www.emberos.ai/knowledge-hub/emberos-raises-5.5-million-seed-round) identify an AI-search brand visibility / GEO-AEO product. That is within the explicit search-optimization exclusion, so the outcome is `policy_excluded`, not a low-quality product claim.

### Socure — late-stage policy exclusion

[Socure's current announcement](https://www.socure.com/news-and-press/strategic-growth-investment-fravity-acquisition) reports a strategic growth investment at a $5.2B valuation, an acquisition, $364M company-reported ARR and more than 3,000 customers, after a [previous Series E](https://www.socure.com/news-and-press/socure-accelerates-mission-to-be-the-first-to-verify-100-of-identities-and-eliminate-identity-fraud-across-all-industries-with-a-450m-investment-led-by-accel-and-t-rowe-price-at-a-4-5b-valuation). Its product is inspectable, but the current transaction is mature expansion and did not clear this queue's selective late-stage exception. The reason is stage policy, not product quality.

### HydroSight — no inspectable product evidence

[HydroSight's official site](https://hydrosight-ai.com/) remains under construction, while [original reporting](https://www.calcalistech.com/ctechnews/article/syzscx2oge) supplies only a high-level product description. The review found no workflow, specification, demonstration or deployment artifact. This supports `quality_rejected/no_product_evidence` today, with a future new-product-evidence trigger remaining possible in the immutable historical policy.

## Genuine external dependencies

- **Dawraty:** page access is no longer the blocker. Current reporting describes an investment as part of a $2M Seed round, while the final close is expected by the end of November. The completed amount/finality is not yet established. It is scheduled for evidence review on 2026-10-11 and must not be presented as a closed $2M round before a source supports that claim. Sources: [official site](https://joindawraty.com/), [Sharikat Mubasher](https://en.sharikatmubasher.com/media-hub/news/21573497/kuwaiti-edtech-startup-dawraty-raises-2mn-seed-round?lang=en).
- **Bluecore Energy:** the September 10 review verified the reported Seed financing, physical barges/reactor and a compact maritime-system design, but did not find a fueled or operating power demonstration; regulatory review is ongoing. Its next evidence check remains 2026-09-24. Sources: [company](https://www.bluecore.energy/), [TechCrunch](https://techcrunch.com/2026/09/08/nuclear-startup-bluecore-energy-raises-50m-seed-round-just-two-months-after-launch/).

These are completed review outcomes with explicit external triggers, not forgotten queue items. Converting either to qualified or rejected without new evidence would reduce integrity rather than improve completion.

## Investor content completion

The investor sidecar now contains a structured, source-linked profile for every one of the 265 canonical directory firms; `legacy_unresearched` is empty. Each profile records a summary, firm type, supported focus/stage/geography/approach facts, source IDs and review dates. Firm-authored claims remain labeled by source type. Cross-domain evidence is restricted to approved official related entities, official portfolio companies or regulated disclosures; arbitrary third-party pages fail validation.

A live transport audit on September 11 rechecked all 295 retained source URLs: 277 returned a substantive body, 12 returned a successful JavaScript application shell, four were access-limited by the origin, two were transport-limited after a bounded retry, zero returned a confirmed 404/410, and zero redirected to an unrelated host. Application-shell and access/transport-limited results remain warnings rather than evidence of failure; the associated facts were checked against browser/index-visible primary material and were narrowed where the official surface did not support the older directory wording. The checked-in audit command is read-only and can be rerun without refreshing any profile date.

The directory also corrects AI2 to AI House, normalizes B Capital, BlackPeak, Camber, Norwest and Standard Capital identities, narrows Veredas, updates Z3, and adds the previously unresolved Vieira de Matos identity as **VDM Capital** with [official evidence](https://www.vdmcapital.pt/). New exact official local brand assets accompany the relevant records. Fresh profiles are skipped for 90 days unless a material change or factual error triggers early review; due or new institutions are researched as part of the same startup task.

## Safeguards added

1. Verified unnamed financing has a first-class representation; ambiguous stage labels still fail closed.
2. Unnamed-round records require source-bound reasoning and product evidence, preventing `Unspecified` from becoming a shortcut for mature generic companies.
3. Frozen company identities can only be corrected through a structured, evidence-backed overlay; history remains immutable.
4. Curation validation now reports `research_incomplete`, `qualified_queue` and `publication_blocked` separately instead of presenting all three as one opaque pending count.
5. Investor source types and cross-domain anchors are validated, and all 265 legacy exemptions have been removed.
6. Investor-source audit separates confirmed broken links from application shells, access controls and transient transport failures, and flags unrelated cross-host redirects.
7. The deterministic migration scripts reproduce the investor and review transformations and assert exact expected counts before writing.

## Local verification

The repository gate passed with 607/607 tests, content and generated-D1 validation, Astro type checking, screenshot and investor-profile validation, and a complete production build. Browser review covered B Capital as a normal sourced profile, Veredas as a cross-domain official-portfolio evidence case, and the newly resolved VDM Capital identity. At a 375-pixel mobile viewport the profile facts collapse to one column and the document has no horizontal overflow; the desktop layout also has no overflow.

## Release truth boundary

Passing local tests will prove schema/data consistency. A commit or push will not prove production. Production can only be reported after the guarded release succeeds, the deployed SHA is verified, and live HTTP/canonical/content checks match the released data. Search-engine submission, if applicable, proves only that a request was accepted; it does not prove indexing.
