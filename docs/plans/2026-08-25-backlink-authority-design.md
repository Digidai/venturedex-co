# VentureDex Backlink Authority Design

Date: 2026-08-25 Asia/Shanghai

## Outcome

Create one canonical resource that editors, founders, investors, researchers, and resource-list maintainers can cite without relying on VentureDex marketing claims. Pair that resource with transparent methodology, machine-readable distributions, GitHub citation metadata, and a status-based outreach ledger.

The durable landing page will be `https://venturedex.co/research`. It will describe VentureDex as an evidence index, not an exhaustive private-market database. Its numbers are calculated from version-controlled published content at build time, so the page and structured data cannot drift from the product inventory.

## Baseline

The 2026-08-25 repository snapshot contains 290 published startup profiles, 241 investor records, 1,402 launch records, 921 research sources, 755 source-bound product-evidence statements, and 301 editorial risks or open questions. Current Cloudflare RUM reports 36 visits in the last seven days, of which 34 were direct and two came from Google surfaces. Search-engine mention checks found only a small owned/adjacent footprint, so the constraint is external distribution rather than another generic metadata pass.

## Product Design

The research page uses an editorial data-ledger aesthetic within the existing VentureDex type, color, and spacing system. A compact masthead establishes the scope and as-of date. Large ledger figures expose inventory and evidence coverage. Horizontal distributions show funding stages and source types without presenting them as market-share estimates. The methodology explains selection, verification, update cadence, limitations, corrections, and citation boundaries. A citation block gives a stable human citation and links to the JSON and Markdown distributions that already exist.

The page must be useful with JavaScript disabled, responsive at 390px, accessible by keyboard, canonical, indexable, and reachable from the homepage and footer. It must not imply investment advice, exhaustive market coverage, open-data licensing, or model-training permission.

## Data Architecture

`src/lib/evidence-index.ts` will be a pure aggregator over normalized `Startup` records plus explicit investor, launch, and weekly counts. It will parse `research_json`, count unique source URLs, evidence statements, risk notes, source types, funding stages, top editorial tags, and the newest verified/published date. Invalid or absent research blocks degrade to zero rather than leaking `undefined` into the page.

`src/pages/research.astro` will consume the aggregate and render the page. A dedicated JSON-LD builder will publish `Dataset`, `WebPage`, `BreadcrumbList`, and organization/website nodes, with `/research` as the dataset URL and the existing `/ai-index.json`, `/llms-full.txt`, and `/feed.xml` endpoints as distributions. The route will be added to the sitemap and IndexNow hub set.

## Authority Acquisition

The first earned-link targets are narrowly relevant, editorially reviewed startup resource lists and founder market-research collections. Submissions must link to the canonical research page, use descriptive branded copy, disclose the VentureDex affiliation, and remain one focused entry per pull request. GitHub repository metadata, `README.md`, and `CITATION.cff` create a separate public discovery/citation surface immediately after merge.

Company and investor outreach remains correction-led: tell the subject that a source-backed profile exists, invite factual corrections, and provide an optional share link. Do not require, buy, trade, or automate links. Account- or identity-gated messages remain prepared until the sender identity is explicitly selected.

## Measurement

Every prospect is tracked as one of `researched`, `ready`, `submitted`, `accepted`, `rejected`, or `blocked`. A submitted pull request is not an accepted backlink. A live page is not indexed. An IndexNow HTTP 200 is a discovery receipt, not an indexing or ranking result. Weekly review will record live referring pages, referral visits, exact landing pages, and accepted editorial links separately.

Success for this implementation is: the citation page is deployed and passes full gates; GitHub exposes the canonical website and citation prompt; at least two relevant external submissions are opened with disclosure; and the ledger makes pending versus acquired links unambiguous.
