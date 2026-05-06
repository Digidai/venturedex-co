# VentureDex

VentureDex is an Astro and Cloudflare D1 directory for curated startup profiles, weekly picks, funding news, collections, and subscriber capture.

## Stack

- Astro 5
- Cloudflare adapter, D1, R2, and Wrangler
- File-backed content in `content/`
- Generated D1 seed SQL in `d1/generated-seed.sql`

## Setup

```bash
npm install
cp .env.example .env
```

Set `CLOUDFLARE_API_TOKEN` before using Cloudflare Browser Rendering, R2 upload, or remote D1 sync workflows.

## Common Commands

```bash
npm run dev              # Start local Astro dev server
npm run build            # Build the Cloudflare bundle
npm run check            # Validate content, verify local D1, then build
npm run content:validate # Validate startup, weekly, rejection, and brand asset data
npm run content:validate:urls # Validate content with remote URL reachability checks
npm run content:seed     # Regenerate d1/generated-seed.sql from content JSON
npm run content:manage   # Open the content management CLI
npm run db:schema:local  # Apply d1/schema.sql to the local D1 database
npm run db:seed:local    # Apply schema and generated seed SQL to local D1
npm run db:verify:local  # Apply schema+seed and verify local D1 counts
```

## Content Workflow

Startup records live in `content/startups/*.json`. Editorial standards and the operating checklist live in:

- `content/STANDARD.md`
- `content/CODEX_TASK.md`

After changing content, run:

```bash
npm run content:validate
npm run content:seed
npm run db:verify:local
```

`content/` and `public/` are the source of truth. The management CLI writes files, not D1 rows:

```bash
./scripts/manage.sh list
./scripts/manage.sh add
./scripts/manage.sh weekly
./scripts/manage.sh sync # validate, regenerate seed SQL, and seed local D1
```

Remote D1 sync is handled by the deploy workflow after validation, local D1 verification, and a successful build.

## Cover Images

Install the optional Python image dependencies once:

```bash
python3 -m pip install -r requirements-cover.txt
```

Generate a cover through the managed workflow:

```bash
./scripts/manage.sh cover solidroad https://www.solidroad.com https://startups.gallery/companies/solidroad
```

The final WebP is written to `public/screenshots/{slug}.webp`. Candidate manifests and contact sheets are generated under `output/`, which is intentionally ignored.

## Environment

Copy `.env.example` to `.env` for local use.

- `CLOUDFLARE_API_TOKEN`: required by screenshot, metadata scrape, R2 upload, and remote Cloudflare operations.
- `CLOUDFLARE_ACCOUNT_ID`: defaults to the VentureDex Cloudflare account ID used by the scripts.
- `SITE_URL`: canonical production URL.
- `VENTUREDEX_VALIDATE_URLS`: set to `1` for strict remote URL reachability checks.
