# Company Cover Generator

This repo now includes a cover-selection CLI that follows the pattern we saw on `startups.gallery`.

## Research Summary

From the three reference companies we checked on April 18, 2026:

- `Loop`
  - `startups.gallery` cover matches the official homepage `og:image`.
- `Resolve AI`
  - `startups.gallery` cover matches the official homepage `og:image`, re-encoded as WebP.
- `Solidroad`
  - `startups.gallery` does not use the current homepage `og:image`.
  - It uses the older roadrunner brand / funding visual system from official Solidroad pages and brand work.

That gives a practical sourcing order:

1. `startups.gallery` company page hero, when you want to mimic it exactly.
2. Official funding / launch / press / news page cover images.
3. Official homepage `og:image`.
4. Other large official hero images.

The script encodes that order with scoring, then normalizes the selected image into a repo-ready WebP.

## What It Does

`scripts/generate_cover.py`:

- accepts a company site URL or a `startups.gallery` company URL
- discovers related official pages from the homepage and `sitemap.xml`, including official subdomains like `blog.` or `resources.`
- extracts `og:image`, `twitter:image`, preload images, body images, and raw image URLs
- scores candidates by page relevance, source type, resolution, aspect ratio, and visual richness
- penalizes flat logo-card images when richer branded art exists
- writes:
  - a final cover image
  - a JSON manifest with ranked candidates
  - a contact sheet preview

## Install

Install the Python packages once per environment:

```bash
python3 -m pip install -r requirements-cover.txt
```

## Usage

Use the managed workflow:

```bash
./scripts/manage.sh cover solidroad https://www.solidroad.com https://startups.gallery/companies/solidroad
```

That command writes `public/screenshots/solidroad.webp`. The generated D1 seed derives `startups.screenshot_r2_key` from the slug when you run `npm run content:seed`.

Generate directly from a company site:

```bash
python3 scripts/generate_cover.py https://www.loop.com --slug loop
```

Use a `startups.gallery` page as the strongest hint:

```bash
python3 scripts/generate_cover.py \
  --slug solidroad \
  --site-url https://www.solidroad.com \
  --gallery-url https://startups.gallery/companies/solidroad
```

Pick a non-top candidate after reviewing the contact sheet:

```bash
python3 scripts/generate_cover.py https://www.solidroad.com --slug solidroad --pick 2
```

Write to a custom path:

```bash
python3 scripts/generate_cover.py \
  https://resolve.ai \
  --slug resolve-ai \
  --output output/covers/resolve-ai.webp
```

## Defaults

- final cover: `public/screenshots/{slug}.webp`
- manifest: `output/covers/{slug}.json`
- contact sheet: `output/covers/{slug}-contact-sheet.webp`
- size: `1440x900`

That default size matches the existing VentureDex screenshot footprint closely enough that you can swap the file in place.
