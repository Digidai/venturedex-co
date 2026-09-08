# Wave 2: workflow-based topic evidence

Research check date: 2026-09-08. Local implementation; this note does not establish deployment, indexing, citation, or traffic growth.

## Scope and editorial decisions

The AI-agent and developer-tools routes now have four deliberately selected examples each, ahead of the existing latest-profile funding comparison. The other four topic routes, all profile lists, matching rules, and funding data remain intact. The selection is neither a ranking nor a market census. A related link points to `/research/coding-agent-verification-stack`.

- AI agents: Dust (internal knowledge), Vapi (voice infrastructure), Arcade (authorized actions), Scaled Cognition (specified customer-service execution). These illustrate different purchasing needs, not four direct substitutes.
- Developer tools: Niteshift (coding-agent runtime), Meticulous (frontend behavioral replay), Weave (engineering observation), Mage Pro (data-pipeline operations). The page explicitly separates execution, checking behavior, measuring activity, and operating data infrastructure.
- Gray Swan was not forced into the AI-agent topic: its security-focused profile does not meet the current inclusion match. No extra topic or company record was created.
- Existing company facts were not edited by this task. Profile-review dates are read from the existing records at render time; the new comparison check is stored separately.

The content standard and SEO skill guided this change toward workflow-specific answers, inspectable official sources, and clear limitations rather than additional generic FAQ or a larger keyword list. The public table does not expose internal matching or pipeline terminology.

## Evidence method and boundaries

Reviewed public official documentation, product pages, pricing pages, and the vendor-owned Weave repository. No account was created, trial activated, integration installed, model run, customer contacted, or purchase made. The Codex in-app browser returned `Browser is not available: iab`; following the content standard, this task did not switch to an external shared browser. Document retrieval was possible, but interactive UI/product and mobile-layout verification remain for the root task's usable environment.

Every comparison field stores its own `source_ids`; sources have exact URLs, titles, and a check date. The guide's fit statements and suggested pilot checks are editorial inferences, visibly labeled as such. Official documentation establishes what the vendor documents, not independent performance or security validation. We omit benchmark/savings claims, hallucination guarantees as facts, customer-count comparisons, and funding-derived quality scores.

## Primary-source ledger

All below checked on 2026-09-08. The authored text and per-field mappings are in `content/topic-research.json`; the links below identify the review scope.

| Product | Official sources | Boundary retained |
| --- | --- | --- |
| Dust | [Agent creation](https://docs.dust.tt/docs/user-documentation/agents/create-your-first-agent), [administrator setup](https://docs.dust.tt/docs/user-documentation/admins/quickstart), [billing](https://docs.dust.tt/docs/user-documentation/admins/billing/subscriptions-and-payments), [credits](https://docs.dust.tt/docs/user-documentation/admins/usage-seats-and-credits/credits) | Seat and credit model documented; exact paid-seat rates not confirmed by this review. Pricing landing-page extraction was empty. The detailed credit page distinguishes one-time free credits from paid monthly credits; we do not repeat the billing page's conflicting broad monthly-allocation wording. |
| Vapi | [Introduction](https://docs.vapi.ai/quickstart/introduction), [pricing](https://vapi.ai/pricing) | Hosting charges exclude model-provider charges; no all-in cost per successful call or latency result inferred. |
| Arcade | [Tool-call quickstart](https://docs.arcade.dev/en/get-started/quickstarts/call-tool-agent), [hosting options](https://docs.arcade.dev/en/operate/deploy), [pricing](https://www.arcade.dev/pricing/) | Authorization and tool execution are not a finished agent application or proof of correct action selection. Hosting and enterprise commercial terms are distinct. |
| Scaled Cognition | [Platform](https://www.scaledcognition.com/product/explore-platform), [APT](https://www.scaledcognition.com/product/meet-apt-1) | Numerical price/billing unit not confirmed. Determinism and no-hallucination language remains explicitly vendor assertion; no independent acceptance of those claims. |
| Niteshift | [Introduction](https://docs.niteshift.dev/introduction), [environment configuration](https://docs.niteshift.dev/environment-configuration/overview), [pricing](https://niteshift.dev/pricing) | Credits cover active agent time, provider tokens are separate; a runnable preview or PR is not a passed release. |
| Meticulous | [Architecture](https://app.meticulous.ai/docs/concepts/architecture-overview), [setup](https://app.meticulous.ai/docs), [homepage](https://www.meticulous.ai/), [network recording](https://app.meticulous.ai/docs/concepts/network-recording-and-patching) | Default recorded-response replay does not establish backend correctness; network stubbing is configurable and server-rendered requests need explicit inspection. Price remains unconfirmed; a failed `/pricing` fetch was not treated as proof that no price exists. Accessibility beta and older architecture text differ, so no broad unsupported accessibility exclusion was added. |
| Weave | [Agent observability](https://weaveos.com/product-pages/agent-observability), [homepage](https://weaveos.com/), [router repository](https://github.com/weave-os/router), [pricing](https://weaveos.com/pricing), [enterprise-deployment announcement](https://weaveos.com/blog/weave-raises-13.5m-series-a-to-build-engineering-and-token-intelligence) | Analytics pricing does not establish Prompt Router pricing. Static monthly/yearly selection was not unambiguously resolved, so no monthly amount is claimed. Enterprise self-hosting is attributed to a company announcement, while router setup remains a separate deployment. No savings or employee-performance conclusion inferred. |
| Mage | [Mage Pro documentation](https://docs.mage.ai/production/mage/pro), [pricing](https://www.mage.ai/pricing) | Commercial Mage Pro pricing is separate from self-running the open-source project; workload sizing and private-deployment commercial terms remain to be confirmed. |

## Implementation

- `content/topic-research.json`: two source-mapped decision guides, four products each, five dimensions per product, 25 official source records.
- `src/lib/topic-research.ts`: validates all authored source references, dimensions, dates, identifiers, and decision links; refuses choices that are no longer published topic members. Does not silently prune failed rows.
- `src/pages/topics/[slug].astro`: semantic tables, row/column headers, visible public-document methodology, source links per field, expandable full source ledger, separate profile and comparison review dates, local keyboard-focusable horizontal scrolling, and related research link.
- `content/topic-pages.json`: two descriptions now reflect the specific comparisons. Slugs and inclusion logic unchanged.
- `tests/topic-research.test.ts`: positive/negative data and render-contract cases, including membership, unsafe URLs, date validation, missing evidence, commercial scope, and no fabricated review dates.

## Verification

- New targeted topic-research tests: 9/9 passed.
- Combined `tsx --test tests/topic-research.test.ts tests/topic-pages.test.ts`: an initial 21/22 run revealed that Enzo's revised short summary no longer included AI, while its tags lacked a specific AI term. The evidence reviewer confirmed official AI intake, scribe, and QA pages; this was lost classification metadata, not absent AI evidence. Root added the fact-backed `ai scribe` tag. The existing positive fixture and strict matching rules remain unchanged.
- Final regression `tsx --test tests/topic-research.test.ts tests/topic-pages.test.ts tests/ai-discovery.test.ts`: 26/26 passed, including the unchanged Enzo positive fixture and the configurable Meticulous replay boundary.
- Targeted strict TypeScript check with Astro client types: passed. An initial standalone check without Astro types reported only missing `ImportMeta.glob`; rerun included `--types astro/client,node`.
- `git diff --check`: passed at the time of local review.
- Astro 7 compiler (`@astrojs/compiler-rs`) transformed the topic template with no diagnostics. This is a syntax/compiler check, not a browser or full-build acceptance.
- No full build, commit, push, deployment, indexing submission, or live smoke was performed by this task. Root owns full integration QA and release.

## Follow-up verification

Root should check both guides at desktop/mobile widths, direct source anchors, the related research URL, and remaining four topic routes. The topic sitemap lastmod should include each guide's `checked_at`, without changing unrelated topics' dates. Before future price refreshes, update only actually rechecked source dates and preserve original profile review dates. Future growth measurements should use page/query traffic and citation evidence rather than page count or existence of the guide.
