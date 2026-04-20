#!/bin/bash
# VentureDex content management CLI aligned to the JSON-first workflow.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTENT_DIR="$REPO_ROOT/content/startups"
INVESTORS_FILE="$REPO_ROOT/content/investors.json"
BRAND_ASSETS_FILE="$REPO_ROOT/content/brand-assets.json"
COMPANY_LOGO_DIR="$REPO_ROOT/public/logos/companies"
INVESTOR_LOGO_DIR="$REPO_ROOT/public/logos/investors"
SCREENSHOT_DIR="$REPO_ROOT/public/screenshots"
DB_NAME="venturedex-db"
export REPO_ROOT

# shellcheck disable=SC1091
. "$SCRIPT_DIR/load-local-env.sh"

usage() {
  cat <<'EOF'
VentureDex Content Manager

Usage:
  ./scripts/manage.sh add                              Scaffold a new startup entry
  ./scripts/manage.sh screenshot <slug> [url]          Capture screenshot via CF API
  ./scripts/manage.sh list                             List startups from content/startups
  ./scripts/manage.sh validate                         Run validate + build-db + app build
  ./scripts/manage.sh sync [--skip-build]              Push d1/generated-seed.sql to remote D1
  ./scripts/manage.sh deploy                           Deploy the current worker
  ./scripts/manage.sh smoke <url>                      Smoke-check a deployed URL against remote D1
  ./scripts/manage.sh release                          Run validate -> sync -> deploy -> smoke
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

update_brand_asset() {
  local section="$1"
  local slug="$2"
  local name="$3"
  local local_path="$4"
  local source_page="$5"
  local source_url="$6"
  local shape="${7:-icon}"
  local verified_at
  verified_at="$(date '+%Y-%m-%d')"

  python3 - "$BRAND_ASSETS_FILE" "$section" "$slug" "$name" "$local_path" "$source_page" "$source_url" "$shape" "$verified_at" <<'PY'
import json
import sys
from pathlib import Path

manifest_path, section, slug, name, local_path, source_page, source_url, shape, verified_at = sys.argv[1:]
path = Path(manifest_path)
data = json.loads(path.read_text())
data["verified_at"] = verified_at
data.setdefault(section, {})[slug] = {
    "name": name,
    "shape": shape,
    "local_path": local_path,
    "source_page": source_page,
    "source_url": source_url,
}
path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
PY
}

update_company_brand_asset() {
  update_brand_asset "companies" "$@"
}

update_investor_brand_asset() {
  update_brand_asset "investors" "$@"
}

brand_asset_field() {
  local section="$1"
  local slug="$2"
  local field="$3"
  python3 - "$BRAND_ASSETS_FILE" "$section" "$slug" "$field" <<'PY'
import json
import sys

path, section, slug, field = sys.argv[1:]
with open(path) as f:
    data = json.load(f)
value = data.get(section, {}).get(slug, {}).get(field)
print("" if value is None else value)
PY
}

resolve_investor_slug() {
  local query="$1"
  python3 "$SCRIPT_DIR/investor_utils.py" resolve "$INVESTORS_FILE" "$query"
}

get_investor_field() {
  local slug="$1"
  local field="$2"
  python3 - "$INVESTORS_FILE" "$slug" "$field" <<'PY'
import json
import sys

path, slug, field = sys.argv[1:]
with open(path) as f:
    investors = json.load(f)
value = investors.get(slug, {}).get(field)
print("" if value is None else value)
PY
}

upsert_investor_directory_entry() {
  local slug="$1"
  local name="$2"
  local short_name="$3"
  local website="$4"
  local description="$5"

  python3 - "$INVESTORS_FILE" "$slug" "$name" "$short_name" "$website" "$description" <<'PY'
import json
import sys
from pathlib import Path

path, slug, name, short_name, website, description = sys.argv[1:]
investors_path = Path(path)
data = json.loads(investors_path.read_text())
data[slug] = {
    "name": name,
    "slug": slug,
    "short_name": short_name or None,
    "website": website,
    "description": description,
}
investors_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
PY
}

collect_referenced_investors() {
  local investors_csv="$1"
  local lead_investor="$2"
  python3 "$SCRIPT_DIR/investor_utils.py" collect "$investors_csv" "$lead_investor"
}

extract_wranger_json() {
  python3 -c '
import json
import sys

text = sys.stdin.read()
start = text.find("[")
if start == -1:
    raise SystemExit("Unable to parse Wrangler JSON output.")
json.loads(text[start:])
print(text[start:])
'
}

legacy_schema_needs_repair() {
  local output parsed
  if ! output="$(
    cd "$REPO_ROOT" && npx wrangler d1 execute "$DB_NAME" --remote --command "
SELECT name FROM sqlite_master
WHERE type='table'
  AND name IN ('sites','weekly_issue_sites','site_aliases','site_evidence','site_snapshots','collection_sites');
PRAGMA table_info(search_index_terms);
" 2>&1
  )"; then
    printf '%s\n' "$output" >&2
    return 1
  fi

  parsed="$(printf '%s\n' "$output" | extract_wranger_json)"
  python3 -c '
import json
import sys

payload = json.loads(sys.stdin.read())
legacy_tables = bool(payload[0]["results"])
columns = {row["name"] for row in payload[1]["results"]}
needs_repair = legacy_tables or ("site_id" in columns) or ("startup_id" not in columns)
print("true" if needs_repair else "false")
' <<<"$parsed"
}

repair_legacy_remote_schema() {
  (
    cd "$REPO_ROOT"
    echo "Repairing legacy remote schema..."
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
  )
}

remote_startup_count() {
  local output parsed
  if ! output="$(
    cd "$REPO_ROOT" && npx wrangler d1 execute "$DB_NAME" --remote --command \
      "SELECT COUNT(*) AS startup_count FROM startups WHERE workflow_status = 'published';" 2>&1
  )"; then
    printf '%s\n' "$output" >&2
    return 1
  fi
  parsed="$(printf '%s\n' "$output" | extract_wranger_json)"
  python3 -c '
import json
import sys

payload = json.loads(sys.stdin.read())
print(payload[0]["results"][0]["startup_count"])
' <<<"$parsed"
}

extract_first_url() {
  python3 -c '
import re
import sys

text = sys.stdin.read()
matches = [match.rstrip(")\"'\''.,") for match in re.findall(r"https://[^\s]+", text)]
workers_matches = [match for match in matches if "workers.dev" in match]
if workers_matches:
    print(workers_matches[0])
elif matches:
    print(matches[0])
else:
    print("")
'
}

default_site_url() {
  if [ -n "${VENTUREDEX_SMOKE_URL:-}" ]; then
    printf '%s\n' "$VENTUREDEX_SMOKE_URL"
    return 0
  fi

  python3 - "$REPO_ROOT/wrangler.toml" <<'PY'
import sys
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover
    import tomli as tomllib

config_path = Path(sys.argv[1])
data = tomllib.loads(config_path.read_text())
print(data.get("vars", {}).get("SITE_URL", ""))
PY
}

deploy_worker() {
  (
    cd "$REPO_ROOT"
    npx wrangler deploy 2>&1
  )
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
  local skip_build="${1:-}"
  require_token
  (
    cd "$REPO_ROOT"
    if [ "$skip_build" != "--skip-build" ]; then
      ./scripts/build-db.sh
    fi
    if [ "$(legacy_schema_needs_repair)" = "true" ]; then
      repair_legacy_remote_schema
    else
      echo "Remote schema already matches the current startup-first model."
    fi
    echo "Applying d1/generated-seed.sql to remote D1..."
    local output attempt=1 max_attempts=3
    while true; do
      if output="$(npx wrangler d1 execute "$DB_NAME" --remote --file=d1/generated-seed.sql 2>&1)"; then
        break
      fi

      printf '%s\n' "$output"

      if printf '%s' "$output" | rg -qi "timed out|network connectivity issues|slow network speeds"; then
        if [ "$attempt" -lt "$max_attempts" ]; then
          echo "Remote D1 sync timed out. Retrying ($attempt/$max_attempts)..." >&2
          attempt=$((attempt + 1))
          sleep 2
          continue
        fi
        cat <<'EOF' >&2

ERROR: Remote D1 sync failed after repeated timeout retries.
Cloudflare accepted the request path, but the upload/execute step timed out.
Retry once network conditions stabilize.
EOF
        exit 1
      fi

      if printf '%s' "$output" | rg -qi "10000|Authentication error|not authorized|permissions"; then
        cat <<'EOF' >&2

ERROR: Remote D1 sync failed due to Cloudflare permissions.
Recommended minimum scope in Cloudflare:
  Account -> D1 -> Edit
  User -> User Details -> Read
  User -> Memberships -> Read
EOF
        exit 1
      fi

      cat <<'EOF' >&2

ERROR: Remote D1 sync failed for a non-auth, non-timeout reason.
Inspect the Wrangler output above before retrying.
EOF
      exit 1
    done
    printf '%s\n' "$output"
  )
}

cmd_deploy() {
  require_token
  local output url
  if ! output="$(deploy_worker)"; then
    printf '%s\n' "$output"
    exit 1
  fi
  printf '%s\n' "$output"
  url="$(printf '%s\n' "$output" | extract_first_url)"
  if [ -z "$url" ]; then
    url="$(default_site_url)"
  fi
  if [ -n "$url" ]; then
    echo "Deployment URL: $url"
  else
    echo "WARN: Could not detect deployment URL from Wrangler output or wrangler.toml." >&2
  fi
}

cmd_smoke() {
  local url="${1:?Usage: manage.sh smoke <url>}"
  local startup_count html

  require_token
  startup_count="$(remote_startup_count)"
  html="$(curl -fsSL "$url")"

  if ! printf '%s' "$html" | rg -q "VentureDex"; then
    echo "ERROR: Smoke check failed. '$url' does not look like a VentureDex page." >&2
    exit 1
  fi

  if [ "$startup_count" -gt 0 ] && printf '%s' "$html" | rg -q "Coming soon"; then
    echo "ERROR: Smoke check failed. Remote D1 has published startups but the page still shows 'Coming soon'." >&2
    exit 1
  fi

  if [ "$startup_count" -gt 0 ] && ! printf '%s' "$html" | rg -q "/startups/"; then
    echo "ERROR: Smoke check failed. Remote D1 has published startups but the page has no startup links." >&2
    exit 1
  fi

  echo "Smoke check passed for $url (published startups: $startup_count)."
}

cmd_release() {
  local deploy_output deploy_url

  require_token
  cmd_validate
  cmd_sync --skip-build

  if ! deploy_output="$(deploy_worker)"; then
    printf '%s\n' "$deploy_output"
    exit 1
  fi
  printf '%s\n' "$deploy_output"

  deploy_url="$(printf '%s\n' "$deploy_output" | extract_first_url)"
  if [ -z "$deploy_url" ]; then
    deploy_url="$(default_site_url)"
  fi
  if [ -z "$deploy_url" ]; then
    echo "ERROR: Could not determine deployment URL from Wrangler output or wrangler.toml." >&2
    exit 1
  fi

  cmd_smoke "$deploy_url"
}

cmd_add() {
  mkdir -p "$COMPANY_LOGO_DIR" "$INVESTOR_LOGO_DIR"

  echo "=== Add New Startup ==="
  echo "This writes a new content/startups/<slug>.json entry and updates company + investor brand assets."
  echo

  local url product_name slug summary note rating why_featured product_type founded_year
  local team_size hq_location region tags investors github twitter linkedin producthunt
  local is_featured funding_amount funding_stage lead_investor funding_date source_url source_name
  local company_logo_asset_url company_logo_source_page company_logo_ext company_logo_path startup_file
  local domain payload_json canonical_investors canonical_lead_investor screenshot_path
  local investor_name investor_slug investor_short_name investor_website investor_description
  local investor_logo_asset_url investor_logo_source_page investor_logo_ext investor_logo_path
  local investor_asset_present
  local -a investor_list canonical_investor_list

  url="$(prompt_required "Product URL (official site)")"
  product_name="$(prompt_required "Product name")"
  slug="$(prompt_required "Slug" "$(slugify "$product_name")")"
  startup_file="$CONTENT_DIR/$slug.json"
  screenshot_path="$SCREENSHOT_DIR/$slug.webp"
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

  mapfile -t investor_list < <(collect_referenced_investors "$investors" "$lead_investor")
  if [ "${#investor_list[@]}" -eq 0 ]; then
    echo "ERROR: At least one investor must be provided for a publishable startup." >&2
    exit 1
  fi

  echo
  echo "Investor directory and brand assets:"
  for investor_name in "${investor_list[@]}"; do
    investor_slug="$(resolve_investor_slug "$investor_name")"
    if [ -n "$investor_slug" ]; then
      echo "  Reusing investor '$investor_name' as slug '$investor_slug'."
    else
      echo
      echo "Create investor directory entry for '$investor_name':"
      investor_name="$(prompt_required "Investor name" "$investor_name")"
      investor_slug="$(prompt_required "Investor slug" "$(slugify "$investor_name")")"
      if [ -n "$(get_investor_field "$investor_slug" "slug")" ]; then
        echo "ERROR: Investor slug '$investor_slug' already exists. Re-run and use the canonical name/slug." >&2
        exit 1
      fi
      investor_short_name="$(prompt "Investor short name")"
      investor_website="$(prompt_required "Investor website (official)")"
      investor_description="$(prompt_required "Investor description")"
      upsert_investor_directory_entry \
        "$investor_slug" \
        "$investor_name" \
        "$investor_short_name" \
        "$investor_website" \
        "$investor_description"
    fi

    investor_name="$(get_investor_field "$investor_slug" "name")"
    investor_asset_present="$(brand_asset_field "investors" "$investor_slug" "local_path")"

    if [ -z "$investor_asset_present" ]; then
      echo "  Investor brand asset missing for '$investor_name'. Add official source metadata:"
      investor_logo_asset_url="$(prompt_required "Investor logo asset URL")"
      investor_logo_source_page="$(prompt_required "Investor logo source page" "$(get_investor_field "$investor_slug" "website")")"
      investor_logo_ext="$(infer_extension "$investor_logo_asset_url")"
      investor_logo_path="$INVESTOR_LOGO_DIR/$investor_slug$investor_logo_ext"
      if [ -e "$investor_logo_path" ]; then
        echo "ERROR: Expected investor logo path already exists: $investor_logo_path" >&2
        exit 1
      fi
      curl -fsSL "$investor_logo_asset_url" -o "$investor_logo_path"
      update_investor_brand_asset \
        "$investor_slug" \
        "$investor_name" \
        "/logos/investors/$investor_slug$investor_logo_ext" \
        "$investor_logo_source_page" \
        "$investor_logo_asset_url"
    fi
  done

  canonical_investor_list=()
  for investor_name in "${investor_list[@]}"; do
    investor_slug="$(resolve_investor_slug "$investor_name")"
    canonical_investor_list+=("$(get_investor_field "$investor_slug" "name")")
  done
  canonical_investors=""
  for investor_name in "${canonical_investor_list[@]}"; do
    if [ -n "$canonical_investors" ]; then
      canonical_investors+=", "
    fi
    canonical_investors+="$investor_name"
  done
  canonical_lead_investor="$(get_investor_field "$(resolve_investor_slug "$lead_investor")" "name")"
  canonical_lead_investor="${canonical_lead_investor:-$lead_investor}"

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
  update_company_brand_asset \
    "$slug" \
    "$product_name" \
    "/logos/companies/$slug$company_logo_ext" \
    "$company_logo_source_page" \
    "$company_logo_asset_url"

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
  export VENTUREDEX_INVESTORS="$canonical_investors"
  export VENTUREDEX_IS_FEATURED="$is_featured"
  export VENTUREDEX_FUNDING_AMOUNT="$funding_amount"
  export VENTUREDEX_FUNDING_STAGE="$funding_stage"
  export VENTUREDEX_LEAD_INVESTOR="$canonical_lead_investor"
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
  echo "Screenshot saved to $screenshot_path"
  echo "Validation/build passed. Review the diff, then commit + push."
}

case "${1:-help}" in
  add) cmd_add ;;
  screenshot) shift; cmd_screenshot "$@" ;;
  list) cmd_list ;;
  validate) cmd_validate ;;
  sync) shift; cmd_sync "$@" ;;
  deploy) cmd_deploy ;;
  smoke) shift; cmd_smoke "$@" ;;
  release) cmd_release ;;
  *) usage ;;
esac
