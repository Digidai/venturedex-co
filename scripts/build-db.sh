#!/bin/bash
# Build D1 seed SQL from content/startups/*.json
# Single source of truth: startup JSON contains funding rounds.
# Generates: sites, search_index, collections, funding_rounds, weekly_issues

set -euo pipefail

CONTENT_DIR="content/startups"
WEEKLY_DIR="content/weekly"
OUTPUT="d1/generated-seed.sql"

echo "-- AUTO-GENERATED from content/startups/*.json" > "$OUTPUT"
echo "-- Do not edit manually. Modify the JSON files instead." >> "$OUTPUT"
echo "" >> "$OUTPUT"

count=0
funding_count=0

for f in "$CONTENT_DIR"/*.json; do
  [ -f "$f" ] || continue

  python3 -c "
import json, sys, hashlib

with open('$f') as fh:
    d = json.load(fh)

slug = d['slug']
domain = d['domain']
url = d.get('url', f'https://{domain}')
name = d['product_name'].replace(\"'\", \"''\")
summary = (d.get('summary') or '').replace(\"'\", \"''\")
note = (d.get('editor_note') or '').replace(\"'\", \"''\")
rating = d.get('editor_rating', 'NULL')
why = (d.get('why_featured') or '').replace(\"'\", \"''\")
ptype = d.get('product_type', '')
fyear = d.get('founded_year', 'NULL')
tsize = d.get('team_size', '')
hq = d.get('hq_location', '')
region = d.get('region', '')
tags = d.get('tags', '')
investors = d.get('investors', '')
links = json.dumps(d.get('links', {})) if d.get('links') else ''
featured = 1 if d.get('is_featured') else 0
screenshot = f'{slug}.webp'

# Derive funding_stage and funding_display from latest funding round
funding = d.get('funding', [])
fstage = ''
fdisplay = ''
if funding:
    latest = sorted(funding, key=lambda r: r.get('date',''), reverse=True)[0]
    fstage = latest.get('stage', '')
    fdisplay = latest.get('amount', '')

print(f\"INSERT OR REPLACE INTO startups (id, slug, domain, canonical_url, product_name, summary, editor_note, editor_rating, why_featured, product_type, funding_stage, funding_display, founded_year, team_size, hq_location, region, tags, investors, links_json, is_featured, screenshot_r2_key, screenshot_status, workflow_status, codex_stage, first_seen_at, published_at) VALUES ('startup-{slug}', '{slug}', '{domain}', '{url}', '{name}', '{summary}', '{note}', {rating}, '{why}', '{ptype}', '{fstage}', '{fdisplay}', {fyear}, '{tsize}', '{hq}', '{region}', '{tags}', '{investors}', '{links.replace(chr(39), chr(39)+chr(39))}', {featured}, '{screenshot}', 'ready', 'published', 'manual', datetime('now'), datetime('now'));\")

# Generate funding_rounds from the funding array
for rnd in funding:
    rname = name
    ramount = rnd.get('amount', '')
    rstage = rnd.get('stage', '')
    rlead = rnd.get('lead_investor', '').replace(\"'\", \"''\")
    rdate = rnd.get('date', '')
    rsrc = rnd.get('source_url', '')
    rsrc_name = rnd.get('source_name', '')
    rid = 'f-' + hashlib.md5(f'{slug}{rdate}{rstage}'.encode()).hexdigest()[:10]
    print(f\"INSERT OR REPLACE INTO funding_rounds (id, company_name, company_slug, company_url, amount, stage, lead_investor, date, source_url, source_name) VALUES ('{rid}', '{rname}', '{slug}', '{url}', '{ramount}', '{rstage}', '{rlead}', '{rdate}', '{rsrc}', '{rsrc_name}');\")
" >> "$OUTPUT"

  # Count funding rounds
  fc=$(python3 -c "import json; print(len(json.load(open('$f')).get('funding',[])))")
  funding_count=$((funding_count + fc))
  count=$((count + 1))
done

# Investors
INVESTORS_FILE="content/investors.json"
if [ -f "$INVESTORS_FILE" ]; then
  echo "" >> "$OUTPUT"
  echo "-- Investors" >> "$OUTPUT"
  python3 -c "
import json
with open('$INVESTORS_FILE') as f:
    data = json.load(f)
for key, inv in data.items():
    slug = inv['slug']
    name = inv['name'].replace(\"'\", \"''\")
    short = (inv.get('short_name') or '').replace(\"'\", \"''\")
    website = inv.get('website', '')
    desc = (inv.get('description') or '').replace(\"'\", \"''\")
    print(f\"INSERT OR REPLACE INTO investors (id, slug, name, short_name, website, description) VALUES ('inv-{slug}', '{slug}', '{name}', '{short}', '{website}', '{desc}');\")
" >> "$OUTPUT"
fi

# Search index
echo "" >> "$OUTPUT"
echo "-- Search index" >> "$OUTPUT"
for f in "$CONTENT_DIR"/*.json; do
  [ -f "$f" ] || continue
  python3 -c "
import json
with open('$f') as fh:
    d = json.load(fh)
slug = d['slug']
sid = f'startup-{slug}'
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
    print(f\"INSERT OR IGNORE INTO search_index_terms (startup_id, normalized_term, term_type, weight) VALUES ('{sid}', '{t}', '{typ}', {w});\")
" >> "$OUTPUT"
done

# Collections
echo "" >> "$OUTPUT"
echo "-- Collections" >> "$OUTPUT"
cat >> "$OUTPUT" << 'SQL'
INSERT OR IGNORE INTO collections (id, slug, title, description, type, published) VALUES
('c-001', 'ai', 'AI / ML', 'Startups pushing the boundaries of artificial intelligence.', 'editorial', 1),
('c-002', 'devtools', 'Developer Tools', 'Tools that make developers more productive.', 'editorial', 1),
('c-003', 'editors-picks', 'Editor''s Picks', 'The ones we think about most.', 'editorial', 1);

DELETE FROM collection_startups;
SQL

for f in "$CONTENT_DIR"/*.json; do
  [ -f "$f" ] || continue
  python3 -c "
import json
with open('$f') as fh:
    d = json.load(fh)
slug = d['slug']
sid = f'startup-{slug}'
ptype = d.get('product_type', '')
featured = d.get('is_featured', False)
rank = 0
if 'AI' in ptype:
    rank += 1
    print(f\"INSERT OR IGNORE INTO collection_startups (collection_id, startup_id, rank, pinned) VALUES ('c-001', '{sid}', {rank}, {1 if featured else 0});\")
if ptype in ('DevTools', 'SaaS'):
    rank += 1
    print(f\"INSERT OR IGNORE INTO collection_startups (collection_id, startup_id, rank, pinned) VALUES ('c-002', '{sid}', {rank}, 0);\")
if featured:
    print(f\"INSERT OR IGNORE INTO collection_startups (collection_id, startup_id, rank, pinned) VALUES ('c-003', '{sid}', {rank}, 1);\")
" >> "$OUTPUT"
done

# Weekly issues
echo "" >> "$OUTPUT"
echo "-- Weekly issues" >> "$OUTPUT"
for f in "$WEEKLY_DIR"/*.json; do
  [ -f "$f" ] || continue
  python3 -c "
import json
with open('$f') as fh:
    d = json.load(fh)
num = d['issue_number']
title = d['title'].replace(\"'\", \"''\")
intro = (d.get('editorial_intro') or '').replace(\"'\", \"''\")
picks = d.get('picks', [])
wid = f'w-{num}'
print(f\"INSERT OR REPLACE INTO weekly_issues (id, issue_number, title, editorial_intro, published_at, status) VALUES ('{wid}', {num}, '{title}', '{intro}', datetime('now'), 'published');\")
for i, slug in enumerate(picks):
    sid = f'startup-{slug}'
    print(f\"INSERT OR IGNORE INTO weekly_issue_startups (issue_id, startup_id, display_order) VALUES ('{wid}', '{sid}', {i+1});\")
" >> "$OUTPUT"
done

echo ""
echo "Generated $OUTPUT with $count startups, $funding_count funding rounds"
