# VentureDex GEO and AI discovery system upgrade - 2026-06-25

Date: 2026-06-25 Asia/Shanghai
Scope: Generative Engine Optimization (GEO), AI retrieval visibility, structured AI surfaces, crawler policy, and repeatable discovery operations for `venturedex.co`.

## Executive summary

VentureDex should optimize for being retrieved, cited, and reused by AI answer engines and agentic research tools. This is not the same as asking every model-training crawler to ingest the site. The safer high-leverage path is:

1. Keep search and answer-engine crawlers allowed.
2. Keep training/model-ingestion crawlers explicitly opted out unless the owner makes a separate licensing decision.
3. Publish first-class AI-readable context files at stable root URLs.
4. Expose typed structured data for RAG, agents, and dataset consumers.
5. Keep canonical pages, source trails, JSON-LD, RSS, sitemap, IndexNow, and GSC evidence separate in reporting.

This upgrade adds two public machine-readable surfaces:

- `/llms-full.txt`: a complete markdown context file with startup summaries, evidence notes, risk notes, source trails, weekly issues, topics, and collections.
- `/ai-index.json`: a typed structured AI index for retrieval apps, agents, and downstream dataset consumers.

It also wires these surfaces into `/llms.txt`, `robots.txt`, `<link rel="alternate">`, JSON-LD `Dataset`, cache policy, IndexNow collection, growth reporting, and tests.

## External research findings

### llms.txt is a navigation layer, not a crawler guarantee

The llms.txt proposal defines a root `/llms.txt` markdown file that gives LLMs concise site background and links to detailed markdown files. It also suggests clean markdown variants for pages and expanded context files when applications need more content. Source: https://llmstxt.org/

Implication for VentureDex:

- Keep `/llms.txt` compact.
- Add `/llms-full.txt` for a single large retrieval context.
- Do not treat llms.txt as a ranking guarantee; it is a retrieval affordance.

### OpenAI separates search visibility from training

OpenAI documents separate crawler purposes. `OAI-SearchBot` is used for ChatGPT search features, while `GPTBot` is associated with model training. OpenAI says these robots settings are independent and recommends allowing `OAI-SearchBot` if a site should appear in ChatGPT search results. Source: https://developers.openai.com/api/docs/bots

Implication for VentureDex:

- Allow `OAI-SearchBot` and `ChatGPT-User`.
- Keep `GPTBot` blocked unless the owner explicitly wants model-training ingestion.

### Anthropic also separates user retrieval, search, and training

Anthropic documents `ClaudeBot`, `Claude-User`, and `Claude-SearchBot`. It states that disabling `Claude-User` can reduce visibility for user-directed web search, and disabling `Claude-SearchBot` can reduce search result visibility and accuracy. Source: https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler

Implication for VentureDex:

- Allow `Claude-User` and `Claude-SearchBot`.
- Keep `ClaudeBot` blocked unless training permission changes.

### Google AI visibility still depends on normal crawl and preview eligibility

Google's robots meta documentation states that `nosnippet` prevents content from being used as direct input for AI Overviews and AI Mode; `max-snippet` can limit how much content is used. Source: https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag

Implication for VentureDex:

- Do not use `nosnippet`.
- Keep `max-image-preview:large`.
- Preserve crawlable source-backed pages and canonical metadata.

### IndexNow is a push signal, not proof of indexing

IndexNow accepts URL submissions and a successful 200 means the search engine received the URL set. The protocol recommends automating URL notification when content is added, updated, or deleted. Source: https://www.indexnow.org/documentation

Implication for VentureDex:

- Add AI surfaces to IndexNow submissions.
- Keep reports explicit: IndexNow submitted does not mean indexed or cited.

### Structured data should expose the dataset, not only pages

Schema.org `Dataset` represents a body of structured information and supports `distribution` entries for downloadable forms. Source: https://schema.org/Dataset

Implication for VentureDex:

- Add a `Dataset` JSON-LD node on the homepage.
- Point distributions at `/llms-full.txt`, `/ai-index.json`, and `/feed.xml`.

## GEO system architecture

### Layer 1: Crawl permission

Truth surface: `src/pages/robots.txt.ts`

Current policy:

- Public editorial pages are allowed for search, answer engines, and user-triggered citation fetchers.
- `/api/` is blocked.
- Training/model-ingestion crawlers remain blocked.
- AI-readable entry points are now listed as comments for humans and tools inspecting crawler policy.

### Layer 2: AI-readable navigation

Truth surface: `src/pages/llms.txt.ts`

Role:

- Compact site overview.
- Key canonical links.
- Startup, weekly, collection, and topic navigation.
- Citation guidance.
- Pointers to `/llms-full.txt` and `/ai-index.json`.

### Layer 3: Full LLM context

Truth surface: `src/pages/llms-full.txt.ts`

Role:

- Single markdown context file for AI assistants, agent browsers, and RAG tools.
- Includes complete startup entries with source trails, evidence notes, risks, market context, weekly issues, collections, and topics.
- Explicitly says it does not grant model training rights.

### Layer 4: Typed AI index

Truth surface: `src/pages/ai-index.json.ts`

Role:

- Stable JSON for programmatic consumers.
- Includes site policy, counts, discovery URLs, canonical routes, startups, weekly issues, topics, collections, source trails, and citation policy.
- Uses canonical `https://venturedex.co/...` URLs.

### Layer 5: Embedded discovery

Truth surfaces:

- `src/layouts/Base.astro`
- `src/lib/seo.ts`

Role:

- HTML pages expose alternate links to RSS, `llms.txt`, `llms-full.txt`, and `ai-index.json`.
- Homepage JSON-LD includes `Dataset` with `DataDownload` distributions.

### Layer 6: Push and reporting

Truth surfaces:

- `scripts/promotion/indexnow.ts`
- `scripts/promotion/growth-report.ts`
- `package.json`

Role:

- `npm run geo:indexnow` submits `/llms.txt`, `/llms-full.txt`, and `/ai-index.json`.
- `npm run seo:indexnow:structure` includes AI surfaces with hubs, collections, and topics.
- Growth report now separates AI surface coverage from daily/weekly, hub, and collection coverage.

## Operating rules

1. After content or structure changes deploy, run the relevant IndexNow script.
2. After llms/AI-index/crawler changes deploy, run `npm run geo:indexnow`.
3. Do not claim AI citation success from IndexNow alone.
4. Do not claim Google AI visibility if GSC ledger remains missing or blocked.
5. Keep training permission separate from search/retrieval permission.
6. Review `/llms-full.txt` size monthly; if it grows too large, split into `/llms-startups.txt`, `/llms-weekly.txt`, and `/llms-sources.txt`.

## Future upgrade backlog

High confidence:

- Add `.md` variants for startup, weekly, collection, and topic pages.
- Add an RSS or JSON feed specifically for newly published startup profiles.
- Add source-health fields to `/ai-index.json` so consumers can prefer official/funding sources.
- Add a weekly automated report for AI surface HTTP status, size, cache headers, and IndexNow coverage.

Requires policy decision:

- Whether to allow `GPTBot`, `ClaudeBot`, or other training crawlers.
- Whether to license the dataset for commercial AI ingestion.
- Whether to expose a public downloadable CSV/JSONL dataset.
