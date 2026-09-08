# Evidence growth wave 2

User request: continue executing the next work in the September 8 growth plan.

Base: f06241c (current origin/main at intake). This is user-directed product/editorial work, not a Daily curator run. Existing automation, newsletters, rejection records and publication timestamps remain outside scope.

## Outcomes and ownership

1. Two independent researchers audit five existing demand-signalled profiles each. Source-backed corrections only; a partial check does not reset a whole-profile review date.
2. A topic researcher adds four documented product examples to each of AI agents and developer tools, with workflow, access, pricing limits and source IDs. Unknown is an acceptable answer.
3. Root publishes a small original research brief comparing runtime, frontend replay and engineering telemetry. The three products are adjacent layers, not a ranking or exhaustive market sample.
4. Root creates a fixed 20-task retrieval/answer benchmark and a ten-target distribution draft pack. Retrieval checks are not evidence of real AI citations; no messages or paid promotion are sent.
5. Run targeted tests, full release gate, independent source/UI review, exact-commit CI, normal main release, and live checks. Preserve original IndexNow receipt semantics.

## Architecture decision

Chosen: versioned research-brief JSON -> validated TypeScript model -> prerendered HTML / JSON / Markdown. Add contextual discovery from research, topics and relevant profiles plus sitemap and llms navigation. Keep the first release to one brief.

Alternatives considered: a one-off hardcoded Astro article would duplicate structured outputs; using a Weekly issue would couple evergreen research to issue allocation and an existing delayed newsletter route. Neither is needed for this request.

## Acceptance

- Every sampled product fact resolves to a checked source; editorial conclusions are labelled.
- Stable canonical HTML, correct resource MIME, non-existent resources remain 404.
- No fabricated prices, independently verified outcomes, market shares or traffic uplift.
- Existing 304-profile directory and seven funding pages remain complete.
- No new automatic performance claim: observe the fixed cohort over a real rolling 28-day window.

Implementation complete; release validation in progress. Evidence reports are stored under docs/growth/wave2-*. Ten outreach targets and drafts were prepared and moved to the local delivery folder, outside this public repository; nothing was sent. The technical benchmark's limitations and the separate answer/traffic protocol are in docs/growth/agent-evaluation-protocol.md. Final production evidence will be delivered separately from code gates.
