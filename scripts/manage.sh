#!/bin/bash
# VentureDex content management CLI aligned to the JSON-first workflow.
# Usage:
#   ./scripts/manage.sh add         — Scaffold a new startup JSON + company brand asset
#   ./scripts/manage.sh screenshot  — Capture screenshot for an existing startup JSON
#   ./scripts/manage.sh list        — List startups from content/startups/*.json
#   ./scripts/manage.sh validate    — Run validate + build-db + app build
#   ./scripts/manage.sh sync        — Apply d1/generated-seed.sql to remote D1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTENT_DIR="$REPO_ROOT/content/startups"
BRAND_ASSETS_FILE="$REPO_ROOT/content/brand-assets.json"
COMPANY_LOGO_DIR="$REPO_ROOT/public/logos/companies"
DB_NAME="venturedex-db"

# Load repo-local secrets without committing them.
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.env"
  set +a
fi

usage() {
  cat <<'EOF'
VentureDex Content Manager

Usage:
  ./scripts/manage.sh add                              Scaffold a new startup entry
  ./scripts/manage.sh screenshot <slug> [url]          Capture screenshot via CF API
  ./scripts/manage.sh list                             List startups from content/startups
  ./scripts/manage.sh validate                         Run validate + build-db + app build
  ./scripts/manage.sh sync                             Push d1/generated-seed.sql to remote D1
EOF
}

require_file() {
  local path="$1"
  if [ ! -f "$path" ]; then
    echo "ERROR: Missing file: $path" >&2
    exit 1
  fi
}

require_token() {
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
    echo "ERROR: CLOUDFLARE_API_TOKEN is required." >&2
    exit 1
  fi
}

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9]/-/g' \
    | sed 's/--*/-/g' \
    | sed 's/^-//;s/-$//'
}

prompt() {
  local label="$1"
  local default="${2:-}"
  local value

  if [ -n "$default" ]; then
    read -r -p "$label [$default]: " value
    printf '%s' "${value:-$default}"
  else
    read -r -p "$label: " value
    printf '%s' "$value"
  fi
}

prompt_required() {
  local label="$1"
  local default="${2:-}"
  local value

  while true; do
    value="$(prompt "$label" "$default")"
    if [ -n "$value" ]; then
      printf '%s' "$value"
      return 0
    fi
    echo "  This field is required."
  done
}

prompt_optional_int() {
  local label="$1"
  local value
  while true; do
    read -r -p "$label (blank allowed): " value
    if [ -z "$value" ]; then
      printf ''
      return 0
    fi
    if [[ "$value" =~ ^[0-9]+$ ]]; then
      printf '%s' "$value"
      return 0
    fi
    echo "  Enter digits only, or leave blank."
  done
}

prompt_yes_no() {
  local label="$1"
  local default="${2:-n}"
  local value
  while true; do
    read -r -p "$label [${default}]: " value
    value="${value:-$default}"
    case "$value" in
      y|Y|yes|YES) printf 'true'; return 0 ;;
      n|N|no|NO) printf 'false'; return 0 ;;
    esac
    echo "  Enter y or n."
  done
}

json_get() {
  local file="$1"
  local key="$2"
  python3 - "$file" "$key" <<'PY'
import json
import sys

path, key = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)
value = data
for part in key.split('.'):
    value = value.get(part) if isinstance(value, dict) else None
    if value is None:
        break
if isinstance(value, bool):
    print("true" if value else "false")
elif value is None:
    print("")
else:
    print(value)
PY
}

list_startups() {
  python3 - "$CONTENT_DIR" <<'PY'
import json
import pathlib
import sys

content_dir = pathlib.Path(sys.argv[1])
rows = []
for path in sorted(content_dir.glob("*.json")):
    data = json.loads(path.read_text())
    latest = (data.get("funding") or [{}])[0]
    rows.append((
        data.get("slug", path.stem),
        data.get("product_name", ""),
        latest.get("stage", ""),
        data.get("product_type", ""),
    ))

print(f"{'SLUG':<20} {'NAME':<24} {'STAGE':<10} TYPE")
print(f"{'-'*20:<20} {'-'*24:<24} {'-'*10:<10} {'-'*12}")
for slug, name, stage, product_type in rows:
    print(f"{slug:<20} {name[:24]:<24} {stage:<10} {product_type}")
PY
}

infer_extension() {
  python3 - "$1" <<'PY'
from pathlib import Path
from urllib.parse import urlparse
import sys

source_url = sys.argv[1]
path = Path(urlparse(source_url).path)
suffix = path.suffix.lower()
allowed = {".png", ".svg", ".ico", ".jpg", ".jpeg", ".webp"}
print(suffix if suffix in allowed else ".png")
PY
}

update_company_brand_asset() {
  local slug="$1"
  local name="$2"
  local local_path="$3"
  local source_page="$4"
  local source_url="$5"
  local verified_at
  verified_at="$(date '+%Y-%m-%d')"

  python3 - "$BRAND_ASSETS_FILE" "$slug" "$name" "$local_path" "$source_page" "$source_url" "$verified_at" <<'PY'
import json
import sys
from pathlib import Path

manifest_path, slug, name, local_path, source_page, source_url, verified_at = sys.argv[1:]
path = Path(manifest_path)
data = json.loads(path.read_text())
data["verified_at"] = verified_at
data.setdefault("companies", {})[slug] = {
    "name": name,
    "shape": "icon",
    "local_path": local_path,
    "source_page": source_page,
    "source_url": source_url,
}
path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
PY
}

write_startup_json() {
  local output="$1"
  local payload_json="$2"
  python3 - "$output" "$payload_json" <<'PY'
import json
import sys
from pathlib import Path

output_path = Path(sys.argv[1])
payload = json.loads(sys.argv[2])
output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
PY
}

cmd_list() {
  list_startups
}

cmd_screenshot() {
  local slug="${1:?Usage: manage.sh screenshot <slug> [url]}"
  local startup_file="$CONTENT_DIR/$slug.json"
  local url="${2:-}"

  if [ -z "$url" ]; then
    require_file "$startup_file"
    url="$(json_get "$startup_file" "url")"
  fi

  if [ -z "$url" ]; then
    echo "ERROR: Could not determine URL for '$slug'." >&2
    exit 1
  fi

  require_token
  "$SCRIPT_DIR/screenshot.sh" "$slug" "$url"
}

cmd_validate() {
  (
    cd "$REPO_ROOT"
    ./scripts/validate.sh
    ./scripts/build-db.sh
    npm run build
  )
}

cmd_sync() {
  require_token
  (
    cd "$REPO_ROOT"
    ./scripts/build-db.sh
    echo "Repairing legacy remote schema if needed..."
    npx wrangler d1 execute "$DB_NAME" --remote --command "
DROP TABLE IF EXISTS search_index_terms;
DROP TABLE IF EXISTS collection_sites;
DROP TABLE IF EXISTS weekly_issue_sites;
DROP TABLE IF EXISTS site_aliases;
DROP TABLE IF EXISTS site_evidence;
DROP TABLE IF EXISTS site_snapshots;
DROP TABLE IF EXISTS sites;
" >/dev/null
    npx wrangler d1 execute "$DB_NAME" --remote --file=d1/schema.sql >/dev/null
    echo "Applying d1/generated-seed.sql to remote D1..."
    local output
    if ! output="$(npx wrangler d1 execute "$DB_NAME" --remote --file=d1/generated-seed.sql 2>&1)"; then
      printf '%s\n' "$output"
      cat <<'EOF' >&2

ERROR: Remote D1 sync failed.
This command needs a Cloudflare API token that can edit the D1 database.
Recommended minimum scope in Cloudflare:
  Account -> D1 -> Edit
EOF
      exit 1
    fi
    printf '%s\n' "$output"
  )
}

cmd_add() {
  mkdir -p "$COMPANY_LOGO_DIR"

  echo "=== Add New Startup ==="
  echo "This writes a new content/startups/<slug>.json entry and updates company brand assets."
  echo

  local url product_name slug summary note rating why_featured product_type founded_year
  local team_size hq_location region tags investors github twitter linkedin producthunt
  local is_featured funding_amount funding_stage lead_investor funding_date source_url source_name
  local company_logo_asset_url company_logo_source_page company_logo_ext company_logo_path startup_file
  local domain payload_json

  url="$(prompt_required "Product URL (official site)")"
  product_name="$(prompt_required "Product name")"
  slug="$(prompt_required "Slug" "$(slugify "$product_name")")"
  startup_file="$CONTENT_DIR/$slug.json"
  if [ -e "$startup_file" ]; then
    echo "ERROR: $startup_file already exists." >&2
    exit 1
  fi

  summary="$(prompt_required "Summary (<=100 chars)")"
  note="$(prompt_required "Editor note (150-500 chars)")"
  rating="$(prompt_required "Editor rating (1-5)")"
  why_featured="$(prompt_required "Why featured (<=40 chars)")"
  product_type="$(prompt_required "Product type")"
  founded_year="$(prompt_optional_int "Founded year")"
  team_size="$(prompt_required "Team size (e.g. 10-30)")"
  hq_location="$(prompt_required "HQ location")"
  region="$(prompt_required "Region")"
  tags="$(prompt_required "Tags (comma-separated 3-6)")"
  investors="$(prompt_required "Investors (comma-separated)")"

  echo
  echo "Optional links:"
  github="$(prompt "GitHub URL")"
  twitter="$(prompt "Twitter/X URL")"
  linkedin="$(prompt "LinkedIn URL")"
  producthunt="$(prompt "Product Hunt URL")"
  is_featured="$(prompt_yes_no "is_featured" "n")"

  echo
  echo "Funding:"
  funding_amount="$(prompt_required "Amount (e.g. \$20M or undisclosed)")"
  funding_stage="$(prompt_required "Stage (Seed / Series A / Series B / Series C)")"
  lead_investor="$(prompt_required "Lead investor")"
  funding_date="$(prompt_required "Funding date (YYYY-MM-DD)")"
  source_url="$(prompt_required "Source article URL")"
  source_name="$(prompt_required "Source name" "TechCrunch")"

  echo
  echo "Company brand asset (official source only):"
  company_logo_asset_url="$(prompt_required "Logo asset URL")"
  company_logo_source_page="$(prompt_required "Logo source page" "$url")"

  domain="$(python3 - "$url" <<'PY'
from urllib.parse import urlparse
import sys
print(urlparse(sys.argv[1]).netloc)
PY
)"

  company_logo_ext="$(infer_extension "$company_logo_asset_url")"
  company_logo_path="$COMPANY_LOGO_DIR/$slug$company_logo_ext"
  curl -fsSL "$company_logo_asset_url" -o "$company_logo_path"
  update_company_brand_asset "$slug" "$product_name" "/logos/companies/$slug$company_logo_ext" "$company_logo_source_page" "$company_logo_asset_url"

  export VENTUREDEX_SLUG="$slug"
  export VENTUREDEX_DOMAIN="$domain"
  export VENTUREDEX_URL="$url"
  export VENTUREDEX_PRODUCT_NAME="$product_name"
  export VENTUREDEX_SUMMARY="$summary"
  export VENTUREDEX_EDITOR_NOTE="$note"
  export VENTUREDEX_EDITOR_RATING="$rating"
  export VENTUREDEX_WHY_FEATURED="$why_featured"
  export VENTUREDEX_PRODUCT_TYPE="$product_type"
  export VENTUREDEX_FOUNDED_YEAR="$founded_year"
  export VENTUREDEX_TEAM_SIZE="$team_size"
  export VENTUREDEX_HQ_LOCATION="$hq_location"
  export VENTUREDEX_REGION="$region"
  export VENTUREDEX_TAGS="$tags"
  export VENTUREDEX_INVESTORS="$investors"
  export VENTUREDEX_IS_FEATURED="$is_featured"
  export VENTUREDEX_FUNDING_AMOUNT="$funding_amount"
  export VENTUREDEX_FUNDING_STAGE="$funding_stage"
  export VENTUREDEX_LEAD_INVESTOR="$lead_investor"
  export VENTUREDEX_FUNDING_DATE="$funding_date"
  export VENTUREDEX_SOURCE_URL="$source_url"
  export VENTUREDEX_SOURCE_NAME="$source_name"
  export VENTUREDEX_GITHUB="$github"
  export VENTUREDEX_TWITTER="$twitter"
  export VENTUREDEX_LINKEDIN="$linkedin"
  export VENTUREDEX_PRODUCTHUNT="$producthunt"

  payload_json="$(python3 - <<'PY'
import json
import os

links = {}
for key in ("github", "twitter", "linkedin", "producthunt"):
    value = os.environ.get(f"VENTUREDEX_{key.upper()}", "")
    if value:
        links[key] = value

payload = {
    "slug": os.environ["VENTUREDEX_SLUG"],
    "domain": os.environ["VENTUREDEX_DOMAIN"],
    "url": os.environ["VENTUREDEX_URL"],
    "product_name": os.environ["VENTUREDEX_PRODUCT_NAME"],
    "summary": os.environ["VENTUREDEX_SUMMARY"],
    "editor_note": os.environ["VENTUREDEX_EDITOR_NOTE"],
    "editor_rating": int(os.environ["VENTUREDEX_EDITOR_RATING"]),
    "why_featured": os.environ["VENTUREDEX_WHY_FEATURED"],
    "product_type": os.environ["VENTUREDEX_PRODUCT_TYPE"],
    "founded_year": int(os.environ["VENTUREDEX_FOUNDED_YEAR"]) if os.environ.get("VENTUREDEX_FOUNDED_YEAR") else None,
    "team_size": os.environ["VENTUREDEX_TEAM_SIZE"],
    "hq_location": os.environ["VENTUREDEX_HQ_LOCATION"],
    "region": os.environ["VENTUREDEX_REGION"],
    "tags": os.environ["VENTUREDEX_TAGS"],
    "investors": os.environ["VENTUREDEX_INVESTORS"],
    "links": links,
    "is_featured": os.environ["VENTUREDEX_IS_FEATURED"] == "true",
    "funding": [
        {
            "amount": os.environ["VENTUREDEX_FUNDING_AMOUNT"],
            "stage": os.environ["VENTUREDEX_FUNDING_STAGE"],
            "lead_investor": os.environ["VENTUREDEX_LEAD_INVESTOR"],
            "date": os.environ["VENTUREDEX_FUNDING_DATE"],
            "source_url": os.environ["VENTUREDEX_SOURCE_URL"],
            "source_name": os.environ["VENTUREDEX_SOURCE_NAME"],
        }
    ],
}
print(json.dumps(payload, ensure_ascii=False))
PY
)"

  write_startup_json "$startup_file" "$payload_json"

  require_token
  "$SCRIPT_DIR/screenshot.sh" "$slug" "$url"
  cmd_validate

  echo
  echo "Created $startup_file"
  echo "Company logo saved to $company_logo_path"
  echo "Validation/build passed. Review the diff, then commit + push."
}

case "${1:-help}" in
  add) cmd_add ;;
  screenshot) shift; cmd_screenshot "$@" ;;
  list) cmd_list ;;
  validate) cmd_validate ;;
  sync) cmd_sync ;;
  *) usage ;;
esac
