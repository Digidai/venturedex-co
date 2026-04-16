#!/bin/bash
# Build D1 seed SQL from content/startups/*.json files
# Run during deploy: generates d1/generated-seed.sql from JSON content files
# This is the bridge between "content as code" and D1 database

set -euo pipefail

CONTENT_DIR="content/startups"
OUTPUT="d1/generated-seed.sql"

echo "-- AUTO-GENERATED from content/startups/*.json" > "$OUTPUT"
echo "-- Do not edit manually. Modify the JSON files instead." >> "$OUTPUT"
echo "" >> "$OUTPUT"

count=0
for f in "$CONTENT_DIR"/*.json; do
  [ -f "$f" ] || continue

  python3 -c "
import json, sys

with open('$f') as fh:
    d = json.load(fh)

slug = d['slug']
domain = d['domain']
url = d.get('url', f\"https://{domain}\")
name = d['product_name'].replace(\"'\", \"''\")
summary = (d.get('summary') or '').replace(\"'\", \"''\")
note = (d.get('editor_note') or '').replace(\"'\", \"''\")
rating = d.get('editor_rating', 'NULL')
why = (d.get('why_featured') or '').replace(\"'\", \"''\")
ptype = d.get('product_type', '')
fstage = d.get('funding_stage', '')
fdisplay = d.get('funding_display', '')
fyear = d.get('founded_year', 'NULL')
tsize = d.get('team_size', '')
hq = d.get('hq_location', '')
region = d.get('region', '')
tags = d.get('tags', '')
investors = d.get('investors', '')
links = json.dumps(d.get('links', {})) if d.get('links') else ''
featured = 1 if d.get('is_featured') else 0
screenshot = f\"{slug}.webp\"

print(f\"INSERT OR REPLACE INTO sites (id, slug, domain, canonical_url, product_name, summary, editor_note, editor_rating, why_featured, product_type, funding_stage, funding_display, founded_year, team_size, hq_location, region, tags, investors, links_json, is_featured, screenshot_r2_key, screenshot_status, workflow_status, codex_stage, first_seen_at, published_at) VALUES ('s-{slug}', '{slug}', '{domain}', '{url}', '{name}', '{summary}', '{note}', {rating}, '{why}', '{ptype}', '{fstage}', '{fdisplay}', {fyear}, '{tsize}', '{hq}', '{region}', '{tags}', '{investors}', '{links.replace(chr(39), chr(39)+chr(39))}', {featured}, '{screenshot}', 'ready', 'published', 'manual', datetime('now'), datetime('now'));\")
" >> "$OUTPUT"

  count=$((count + 1))
done

# Build search index from the same data
echo "" >> "$OUTPUT"
echo "-- Search index" >> "$OUTPUT"
for f in "$CONTENT_DIR"/*.json; do
  [ -f "$f" ] || continue

  python3 -c "
import json
with open('$f') as fh:
    d = json.load(fh)
slug = d['slug']
sid = f's-{slug}'
terms = []
terms.append((d['product_name'].lower(), 'name', 100))
terms.append((d['domain'].lower(), 'domain', 80))
if d.get('product_type'):
    terms.append((d['product_type'].lower(), 'type', 30))
for tag in (d.get('tags') or '').split(','):
    tag = tag.strip().lower()
    if tag:
        terms.append((tag, 'tag', 50))
for t, typ, w in terms:
    t = t.replace(\"'\", \"''\")
    print(f\"INSERT OR IGNORE INTO search_index_terms (site_id, normalized_term, term_type, weight) VALUES ('{sid}', '{t}', '{typ}', {w});\")
" >> "$OUTPUT"
done

# Build collection links
echo "" >> "$OUTPUT"
echo "-- Collections" >> "$OUTPUT"
cat >> "$OUTPUT" << 'SQL'
INSERT OR IGNORE INTO collections (id, slug, title, description, type, published) VALUES
('c-001', 'ai', 'AI / ML', 'Startups pushing the boundaries of artificial intelligence.', 'editorial', 1),
('c-002', 'devtools', 'Developer Tools', 'Tools that make developers more productive.', 'editorial', 1),
('c-003', 'editors-picks', 'Editor''s Picks', 'The ones we think about most.', 'editorial', 1);

DELETE FROM collection_sites;
SQL

# Auto-assign to collections based on product_type and is_featured
for f in "$CONTENT_DIR"/*.json; do
  [ -f "$f" ] || continue
  python3 -c "
import json
with open('$f') as fh:
    d = json.load(fh)
slug = d['slug']
sid = f's-{slug}'
ptype = d.get('product_type', '')
featured = d.get('is_featured', False)
rank = 0
if 'AI' in ptype:
    rank += 1
    print(f\"INSERT OR IGNORE INTO collection_sites (collection_id, site_id, rank, pinned) VALUES ('c-001', '{sid}', {rank}, {1 if featured else 0});\")
if ptype in ('DevTools', 'SaaS'):
    rank += 1
    print(f\"INSERT OR IGNORE INTO collection_sites (collection_id, site_id, rank, pinned) VALUES ('c-002', '{sid}', {rank}, 0);\")
if featured:
    print(f\"INSERT OR IGNORE INTO collection_sites (collection_id, site_id, rank, pinned) VALUES ('c-003', '{sid}', {rank}, 1);\")
" >> "$OUTPUT"
done

# Build funding rounds from content/funding/*.json
FUNDING_DIR="content/funding"
echo "" >> "$OUTPUT"
echo "-- Funding rounds" >> "$OUTPUT"
funding_count=0
for f in "$FUNDING_DIR"/*.json; do
  [ -f "$f" ] || continue
  python3 -c "
import json, hashlib
with open('$f') as fh:
    d = json.load(fh)
name = d['company_name'].replace(\"'\", \"''\")
url = d.get('company_url', '')
slug = d.get('company_slug', '')
amount = d.get('amount', '')
stage = d.get('stage', '')
lead = d.get('lead_investor', '').replace(\"'\", \"''\")
date = d.get('date', '')
src_url = d.get('source_url', '')
src_name = d.get('source_name', 'TechCrunch')
rid = 'f-' + hashlib.md5(f'{name}{date}{stage}'.encode()).hexdigest()[:10]
print(f\"INSERT OR REPLACE INTO funding_rounds (id, company_name, company_slug, company_url, amount, stage, lead_investor, date, source_url, source_name) VALUES ('{rid}', '{name}', '{slug}', '{url}', '{amount}', '{stage}', '{lead}', '{date}', '{src_url}', '{src_name}');\")
" >> "$OUTPUT"
  funding_count=$((funding_count + 1))
done

echo ""
echo "Generated $OUTPUT with $count startups + $funding_count funding rounds"
