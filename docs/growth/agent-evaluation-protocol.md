# Agent retrieval and answer evaluation

The September 8 set contains 10 company questions, 6 topic questions and 4 cross-page questions. It is a **wave-2 release acceptance set**, deliberately designed around the content being added. Its pass count is not an independent website score, market benchmark, answer accuracy, search ranking or AI citation share.

## Reproduce the bounded technical check

```sh
npx tsx scripts/promotion/agent-retrieval-benchmark.ts http://127.0.0.1:4331 /tmp/venturedex-wave2-local-result.json
npx tsx scripts/promotion/agent-retrieval-benchmark.ts https://venturedex.co /tmp/venturedex-wave2-live-result.json
```

Use a new output filename: the script refuses to overwrite evidence. It makes 20 sequential read-only GET requests, without cookies, third-party source fetches, login or form submissions. It checks HTTP status, MIME, canonical hints where appropriate, necessary content markers, claim/source-reference completeness, and recorded dates. Markers are necessary retrieval prerequisites, not semantic validation of an answer. `answer_accuracy` and `external_ai_citation_rate` remain null.

E01–E10 intentionally require this partial review to preserve earlier whole-profile review dates. X04 is a point-in-time post-release check that the 10 authored updates are in the latest-50-event feed. As legitimate future events displace them, use the compact index and individual resources to reconcile them; absence from that bounded feed is not deletion. A later complete profile review or later feed contents require a new, separately versioned acceptance set—not rewriting the September 8 evidence.

## Separate external answer/citation study

No ChatGPT, Perplexity, Google AI feature or other external-engine answer run is claimed by the technical script. A real answer study must record:

1. The unchanged question from `agent-retrieval-cases.json`, a fresh conversation/session, engine/model, visible mode, date, locale and region where known. Do not seed the discovery prompt with VentureDex URLs; use a separately labelled direct-URL retrieval test if needed.
2. The actual answer, exact cited URLs, whether VentureDex was retrieved/cited, which original sources were cited, and unsupported assertions or omitted caveats against the saved answer rubric.
3. A reviewer verdict distinct from the automated transport verdict. Unknown or untested remains unknown. Do not create fake screenshots, cached answers or estimated citation counts.
4. Comparable repeated observations; a single answer can vary and is not stable citation share. Preserve failed answers and zero-citation runs, not only successes.

## Traffic readout after a real observation window

Keep the 10 updated company URLs, 2 deepened topic URLs and 1 new research URL as a fixed cohort. Compare complete 28-day windows with the preceding period; show absolute counts next to percentages, especially for small samples. Separate Web clicks/impressions, observed AI-feature impressions, referral visits and confirmed newsletter subscriptions. The research CTA passes `source=research-brief` into the existing subscription flow; reaching the form is not a confirmed subscription.

Use a nearby unchanged cohort for context and note differing company-news demand. Do not infer causality from before/after alone. Deployment success, IndexNow accepted, search indexing, external citations, visits and conversions are separate stages. No traffic-uplift claim should be made on release day.

This document creates no scheduled job and changes no existing Daily, Weekly, newsletter, GSC or browser-ownership automation.
