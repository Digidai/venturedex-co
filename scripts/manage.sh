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
RELEASE_SEED_SHA256=""
RELEASE_DIST_SHA256=""
RELEASE_LOCK_DIR=""
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
  ./scripts/manage.sh check-seed                       Verify generated seed matches all source content
  ./scripts/manage.sh sync                             Refuse direct D1 mutation; use release
  ./scripts/manage.sh deploy                           Refuse direct Worker mutation; use release
  ./scripts/manage.sh smoke <url>                      Smoke-check a deployed URL against remote D1
  ./scripts/manage.sh release                          Run gate -> deploy -> D1 sync -> smoke
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

assert_remote_schema_migration_feasible() {
  local output parsed
  if ! output="$(
    cd "$REPO_ROOT" && npx wrangler d1 execute "$DB_NAME" --remote --command "
PRAGMA table_info(startups);
PRAGMA table_info(weekly_issues);
PRAGMA table_info(weekly_issue_startups);
PRAGMA table_info(funding_rounds);
PRAGMA table_info(investors);
PRAGMA table_info(search_index_terms);
PRAGMA table_info(collections);
PRAGMA table_info(collection_startups);
PRAGMA table_info(newsletter_subscriptions);
PRAGMA table_info(newsletter_sends);
PRAGMA table_info(newsletter_deliveries);
PRAGMA table_info(rate_limits);
SELECT 'startups.slug' AS constraint_name,
  EXISTS (
    SELECT 1
    FROM pragma_index_list('startups') AS indexes
    WHERE indexes.[unique] = 1
      AND (
        SELECT group_concat(name, ',')
        FROM (
          SELECT name
          FROM pragma_index_info(indexes.name)
          ORDER BY seqno
        )
      ) = 'slug'
  ) AS ok
UNION ALL
SELECT 'weekly_issues.issue_number',
  EXISTS (
    SELECT 1
    FROM pragma_index_list('weekly_issues') AS indexes
    WHERE indexes.[unique] = 1
      AND (
        SELECT group_concat(name, ',')
        FROM (
          SELECT name
          FROM pragma_index_info(indexes.name)
          ORDER BY seqno
        )
      ) = 'issue_number'
  )
UNION ALL
SELECT 'investors.slug',
  EXISTS (
    SELECT 1
    FROM pragma_index_list('investors') AS indexes
    WHERE indexes.[unique] = 1
      AND (
        SELECT group_concat(name, ',')
        FROM (
          SELECT name
          FROM pragma_index_info(indexes.name)
          ORDER BY seqno
        )
      ) = 'slug'
  )
UNION ALL
SELECT 'newsletter_subscriptions.email',
  EXISTS (
    SELECT 1
    FROM pragma_index_list('newsletter_subscriptions') AS indexes
    WHERE indexes.[unique] = 1
      AND (
        SELECT group_concat(name, ',')
        FROM (
          SELECT name
          FROM pragma_index_info(indexes.name)
          ORDER BY seqno
        )
      ) = 'email'
  )
UNION ALL
SELECT 'newsletter_sends.send_key',
  EXISTS (
    SELECT 1
    FROM pragma_index_list('newsletter_sends') AS indexes
    WHERE indexes.[unique] = 1
      AND (
        SELECT group_concat(name, ',')
        FROM (
          SELECT name
          FROM pragma_index_info(indexes.name)
          ORDER BY seqno
        )
      ) = 'send_key'
  )
UNION ALL
SELECT 'newsletter_deliveries.send_id,subscription_id',
  EXISTS (
    SELECT 1
    FROM pragma_index_list('newsletter_deliveries') AS indexes
    WHERE indexes.[unique] = 1
      AND (
        SELECT group_concat(name, ',')
        FROM (
          SELECT name
          FROM pragma_index_info(indexes.name)
          ORDER BY seqno
        )
      ) = 'send_id,subscription_id'
  );
" 2>&1
  )"; then
    printf '%s\n' "$output" >&2
    echo "ERROR: Remote D1 is not readable; release preflight cannot prove schema safety." >&2
    return 1
  fi

  parsed="$(printf '%s\n' "$output" | extract_wranger_json)"
  python3 -c '
import json
import sys

payload = json.loads(sys.stdin.read())
table_names = [
    "startups",
    "weekly_issues",
    "weekly_issue_startups",
    "funding_rounds",
    "investors",
    "search_index_terms",
    "collections",
    "collection_startups",
    "newsletter_subscriptions",
    "newsletter_sends",
    "newsletter_deliveries",
    "rate_limits",
]
if len(payload) != len(table_names) + 1:
    raise SystemExit(
        "ERROR: Remote D1 schema preflight returned an incomplete snapshot; "
        "refusing to deploy."
    )

columns = {
    table: {row.get("name") for row in payload[index].get("results", [])}
    for index, table in enumerate(table_names)
}
required_columns = {
    "startups": {
        "id", "slug", "domain", "canonical_url", "product_name", "summary",
        "editor_note", "editor_rating", "why_featured", "product_type",
        "funding_stage", "funding_display", "founded_year", "team_size",
        "hq_location", "region", "tags", "investors", "links_json",
        "is_featured", "screenshot_r2_key", "screenshot_status",
        "workflow_status", "codex_stage", "first_seen_at", "published_at",
        "created_at", "updated_at",
    },
    "weekly_issues": {
        "id", "issue_number", "title", "editorial_intro", "published_at", "status",
    },
    "weekly_issue_startups": {
        "issue_id", "startup_id", "display_order", "issue_note",
    },
    "funding_rounds": {
        "id", "company_name", "company_slug", "company_url", "amount", "stage",
        "lead_investor", "date", "source_url", "source_name",
    },
    "investors": {"id", "slug", "name", "short_name", "website", "description"},
    "search_index_terms": {"startup_id", "normalized_term", "term_type", "weight"},
    "collections": {"id", "slug", "title", "description", "type", "published"},
    "collection_startups": {"collection_id", "startup_id", "rank", "pinned"},
    "newsletter_subscriptions": {
        "id", "email", "status", "source", "created_at", "confirmed_at",
    },
    "rate_limits": {"bucket", "count", "window_start"},
}
optional_table_columns = {
    "newsletter_sends": {
        "id", "send_key", "newsletter_type", "status", "subject",
        "preview_text", "period_start", "period_end", "item_count",
        "recipient_count", "provider", "provider_batch_ids", "error_log",
        "created_at", "sent_at", "updated_at",
    },
    "newsletter_deliveries": {
        "id", "send_id", "subscription_id", "email", "status",
        "provider_message_id", "error_message", "created_at", "sent_at",
        "updated_at",
    },
}
supported_additions = {
    "startups": {"research_json"},
    "newsletter_subscriptions": {
        "preferences_json", "unsubscribe_token", "unsubscribed_at", "updated_at",
    },
    "newsletter_sends": {"html_main", "text_main"},
}

errors = []
plan = []
for table, required in required_columns.items():
    if not columns[table]:
        errors.append(f"missing required table {table}")
        continue
    missing = sorted(required - columns[table])
    if missing:
        errors.append(f"{table} missing required column(s): {'"'"','"'"'.join(missing)}")

for table, required in optional_table_columns.items():
    if not columns[table]:
        plan.append(f"create {table}")
        continue
    missing = sorted(required - columns[table])
    if missing:
        errors.append(f"{table} missing required column(s): {'"'"','"'"'.join(missing)}")

for table, additions in supported_additions.items():
    if columns[table]:
        missing = sorted(additions - columns[table])
        plan.extend(f"add {table}.{column}" for column in missing)

constraint_rows = payload[-1].get("results", [])
constraints = {
    row.get("constraint_name"): row.get("ok")
    for row in constraint_rows
}
required_constraints = {
    "startups.slug": "startups",
    "weekly_issues.issue_number": "weekly_issues",
    "investors.slug": "investors",
    "newsletter_subscriptions.email": "newsletter_subscriptions",
    "newsletter_sends.send_key": "newsletter_sends",
    "newsletter_deliveries.send_id,subscription_id": "newsletter_deliveries",
}
for constraint, table in required_constraints.items():
    if table in optional_table_columns and not columns[table]:
        continue
    if constraints.get(constraint) not in (1, True):
        errors.append(f"missing required unique constraint {constraint}")

if errors:
    rendered = "\n  - ".join(errors)
    raise SystemExit(
        "ERROR: Remote D1 schema is not safely migratable by the release path:\n"
        f"  - {rendered}\n"
        "Apply an explicit, reviewed schema migration before releasing."
    )

if plan:
    print("remote_schema_preflight: supported additive migration plan: " + ", ".join(plan))
else:
    print("remote_schema_preflight: current")
' <<<"$parsed"
}

assert_remote_schema_not_legacy() {
  local legacy_state
  if ! legacy_state="$(legacy_schema_needs_repair)"; then
    echo "ERROR: Could not determine whether remote D1 uses the legacy schema." >&2
    return 1
  fi
  case "$legacy_state" in
    false)
      echo "remote_schema_preflight: startup-first schema detected"
      ;;
    true)
      cat <<'EOF' >&2
ERROR: Remote D1 still uses the legacy site-first schema.
Automatic destructive legacy repair is disabled in the release path.
Apply and review an explicit migration before deploying a Worker or seed.
EOF
      return 1
      ;;
    *)
      echo "ERROR: Unexpected legacy-schema preflight result: $legacy_state" >&2
      return 1
      ;;
  esac
}

ensure_current_remote_schema() {
  local output parsed missing_startup_columns=() missing_newsletter_columns=()
  if ! output="$(
    cd "$REPO_ROOT" && npx wrangler d1 execute "$DB_NAME" --remote --command \
      "PRAGMA table_info(startups);" 2>&1
  )"; then
    printf '%s\n' "$output" >&2
    return 1
  fi

  parsed="$(printf '%s\n' "$output" | extract_wranger_json)"
  while IFS= read -r column; do
    [ -n "$column" ] && missing_startup_columns+=("$column")
  done < <(python3 -c '
import json
import sys

payload = json.loads(sys.stdin.read())
columns = {row["name"] for row in payload[0]["results"]}
for column in ["research_json"]:
    if column not in columns:
        print(column)
' <<<"$parsed")

  if [ "${#missing_startup_columns[@]}" -eq 0 ]; then
    echo "Remote schema already has current startup research columns."
  else
    for column in "${missing_startup_columns[@]}"; do
      case "$column" in
        research_json)
          echo "Adding remote startups.research_json column..."
          (
            cd "$REPO_ROOT"
            npx wrangler d1 execute "$DB_NAME" --remote --command \
              "ALTER TABLE startups ADD COLUMN research_json TEXT;" >/dev/null
          )
          ;;
        *)
          echo "ERROR: Unknown startup schema migration: $column" >&2
          exit 1
          ;;
      esac
    done
  fi

  if ! output="$(
    cd "$REPO_ROOT" && npx wrangler d1 execute "$DB_NAME" --remote --command \
      "PRAGMA table_info(newsletter_subscriptions);" 2>&1
  )"; then
    printf '%s\n' "$output" >&2
    return 1
  fi

  parsed="$(printf '%s\n' "$output" | extract_wranger_json)"
  while IFS= read -r column; do
    [ -n "$column" ] && missing_newsletter_columns+=("$column")
  done < <(python3 -c '
import json
import sys

payload = json.loads(sys.stdin.read())
columns = {row["name"] for row in payload[0]["results"]}
for column in ["preferences_json", "unsubscribe_token", "unsubscribed_at", "updated_at"]:
    if column not in columns:
        print(column)
' <<<"$parsed")

  if [ "${#missing_newsletter_columns[@]}" -eq 0 ]; then
    echo "Remote newsletter subscriptions already have current columns."
  else
    for column in "${missing_newsletter_columns[@]}"; do
      case "$column" in
        preferences_json)
          echo "Adding remote newsletter_subscriptions.preferences_json column..."
          (
            cd "$REPO_ROOT"
            npx wrangler d1 execute "$DB_NAME" --remote --command \
              "ALTER TABLE newsletter_subscriptions ADD COLUMN preferences_json TEXT;" >/dev/null
          )
          ;;
        unsubscribe_token)
          echo "Adding remote newsletter_subscriptions.unsubscribe_token column..."
          (
            cd "$REPO_ROOT"
            npx wrangler d1 execute "$DB_NAME" --remote --command \
              "ALTER TABLE newsletter_subscriptions ADD COLUMN unsubscribe_token TEXT;" >/dev/null
          )
          ;;
        unsubscribed_at)
          echo "Adding remote newsletter_subscriptions.unsubscribed_at column..."
          (
            cd "$REPO_ROOT"
            npx wrangler d1 execute "$DB_NAME" --remote --command \
              "ALTER TABLE newsletter_subscriptions ADD COLUMN unsubscribed_at TEXT;" >/dev/null
          )
          ;;
        updated_at)
          echo "Adding remote newsletter_subscriptions.updated_at column..."
          (
            cd "$REPO_ROOT"
            npx wrangler d1 execute "$DB_NAME" --remote --command \
              "ALTER TABLE newsletter_subscriptions ADD COLUMN updated_at TEXT;" >/dev/null
          )
          ;;
        *)
          echo "ERROR: Unknown newsletter schema migration: $column" >&2
          exit 1
          ;;
      esac
    done
  fi

  (
    cd "$REPO_ROOT"
    npx wrangler d1 execute "$DB_NAME" --remote --command "
UPDATE newsletter_subscriptions
SET preferences_json = COALESCE(preferences_json, '{\"daily\":true,\"weekly\":true}'),
    unsubscribe_token = COALESCE(NULLIF(unsubscribe_token, ''), lower(hex(randomblob(16)))),
    confirmed_at = COALESCE(confirmed_at, datetime('now')),
    updated_at = COALESCE(updated_at, datetime('now'))
WHERE status = 'confirmed';
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_unsubscribe_token
  ON newsletter_subscriptions(unsubscribe_token)
  WHERE unsubscribe_token IS NOT NULL AND unsubscribe_token != '';
CREATE TABLE IF NOT EXISTS newsletter_sends (
  id TEXT PRIMARY KEY,
  send_key TEXT UNIQUE NOT NULL,
  newsletter_type TEXT NOT NULL CHECK (newsletter_type IN ('daily','weekly')),
  status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','sent','skipped','failed')),
  subject TEXT,
  preview_text TEXT,
  html_main TEXT,
  text_main TEXT,
  period_start TEXT,
  period_end TEXT,
  item_count INTEGER DEFAULT 0,
  recipient_count INTEGER DEFAULT 0,
  provider TEXT DEFAULT 'cloudflare_email_service',
  provider_batch_ids TEXT,
  error_log TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  sent_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_newsletter_sends_type_period
  ON newsletter_sends(newsletter_type, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscriptions_status_created
  ON newsletter_subscriptions(status, created_at);
UPDATE newsletter_sends
SET provider = 'cloudflare_email_service'
WHERE provider IS NULL OR provider = 'resend';
CREATE TABLE IF NOT EXISTS newsletter_deliveries (
  id TEXT PRIMARY KEY,
  send_id TEXT NOT NULL REFERENCES newsletter_sends(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES newsletter_subscriptions(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','skipped','failed')),
  provider_message_id TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  sent_at TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(send_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_send
  ON newsletter_deliveries(send_id, status);
CREATE INDEX IF NOT EXISTS idx_funding_company_slug
  ON funding_rounds(company_slug, date DESC);
" >/dev/null
  )

  for column in html_main text_main; do
    if ! output="$(
      cd "$REPO_ROOT" && npx wrangler d1 execute "$DB_NAME" --remote --command \
        "PRAGMA table_info(newsletter_sends);" 2>&1
    )"; then
      printf '%s\n' "$output" >&2
      return 1
    fi
    parsed="$(printf '%s\n' "$output" | extract_wranger_json)"
    if ! python3 -c '
import json
import sys

payload = json.loads(sys.stdin.read())
column = sys.argv[1]
columns = {row["name"] for row in payload[0]["results"]}
raise SystemExit(0 if column in columns else 1)
' "$column" <<<"$parsed"; then
      (
        cd "$REPO_ROOT"
        npx wrangler d1 execute "$DB_NAME" --remote --command \
          "ALTER TABLE newsletter_sends ADD COLUMN $column TEXT;" >/dev/null
      )
    fi
  done
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

remote_manual_startup_slugs() {
  local output parsed
  if ! output="$(
    cd "$REPO_ROOT" && npx wrangler d1 execute "$DB_NAME" --remote --command \
      "SELECT slug FROM startups WHERE workflow_status = 'published' AND codex_stage = 'manual' ORDER BY slug;" 2>&1
  )"; then
    printf '%s\n' "$output" >&2
    return 1
  fi
  parsed="$(printf '%s\n' "$output" | extract_wranger_json)"
  python3 -c '
import json
import sys

payload = json.loads(sys.stdin.read())
rows = payload[0]["results"]
slugs = []
for row in rows:
    slug = row.get("slug")
    if not isinstance(slug, str) or not slug:
        raise SystemExit(f"ERROR: Invalid remote published/manual startup slug row: {row!r}")
    slugs.append(slug)
print(",".join(sorted(slugs)))
' <<<"$parsed"
}

remote_published_weekly_issue_numbers() {
  local output parsed
  if ! output="$(
    cd "$REPO_ROOT" && npx wrangler d1 execute "$DB_NAME" --remote --command \
      "SELECT issue_number FROM weekly_issues WHERE status = 'published' ORDER BY issue_number;" 2>&1
  )"; then
    printf '%s\n' "$output" >&2
    return 1
  fi
  parsed="$(printf '%s\n' "$output" | extract_wranger_json)"
  python3 -c '
import json
import sys

payload = json.loads(sys.stdin.read())
rows = payload[0]["results"]
numbers = []
for row in rows:
    number = row.get("issue_number")
    if not isinstance(number, int) or isinstance(number, bool) or number < 1:
        raise SystemExit(f"ERROR: Invalid remote published Weekly issue row: {row!r}")
    numbers.append(number)
print(",".join(str(number) for number in sorted(numbers)))
' <<<"$parsed"
}

local_startup_slugs() {
  python3 - "$REPO_ROOT" <<'PY'
import os
from pathlib import Path
import sys

repo_root = Path(sys.argv[1])
content_dir = Path(
    os.environ.get("VENTUREDEX_STARTUPS_DIR", repo_root / "content" / "startups")
)
print(",".join(sorted(path.stem for path in content_dir.glob("*.json"))))
PY
}

local_published_weekly_issue_numbers() {
  python3 - "$REPO_ROOT" <<'PY'
import json
import os
from pathlib import Path
import sys

repo_root = Path(sys.argv[1])
weekly_dir = Path(
    os.environ.get("VENTUREDEX_WEEKLY_DIR", repo_root / "content" / "weekly")
)
numbers = []
for path in sorted(weekly_dir.glob("*.json")):
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise SystemExit(f"ERROR: Invalid Weekly JSON in {path}: {exc}") from exc
    if data.get("status", "published") != "published":
        continue
    number = data.get("issue_number")
    if not isinstance(number, int) or isinstance(number, bool) or number < 1:
        raise SystemExit(
            f"ERROR: Published Weekly file {path} has invalid issue_number {number!r}."
        )
    numbers.append(number)

if len(numbers) != len(set(numbers)):
    raise SystemExit("ERROR: Published Weekly issue numbers must be unique.")
print(",".join(str(number) for number in sorted(numbers)))
PY
}

assert_remote_set_change_allowed() {
  local set_kind="$1"
  local remote_csv="$2"
  local local_csv="$3"
  local override_name="$4"

  python3 - "$set_kind" "$remote_csv" "$local_csv" "$override_name" <<'PY'
import os
import re
import sys

set_kind, remote_raw, local_raw, override_name = sys.argv[1:]

if set_kind == "startup":
    item_label = "remote startup slug"
    value_pattern = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    sort_key = lambda value: value
elif set_kind == "weekly":
    item_label = "published Weekly issue number"
    value_pattern = re.compile(r"^[1-9][0-9]*$")
    sort_key = lambda value: int(value)
else:
    raise SystemExit(f"ERROR: Unknown release set kind: {set_kind!r}.")


def parse_set(raw: str, source: str) -> set[str]:
    if raw == "":
        return set()
    values = raw.split(",")
    if any(not value or value.strip() != value for value in values):
        raise SystemExit(
            f"ERROR: {source} must be a comma-separated set without empty or padded values."
        )
    invalid = sorted(
        {value for value in values if not value_pattern.fullmatch(value)},
        key=sort_key,
    )
    if invalid:
        raise SystemExit(
            f"ERROR: {source} contains invalid {item_label} values: {','.join(invalid)}."
        )
    if len(values) != len(set(values)):
        raise SystemExit(f"ERROR: {source} contains duplicate values.")
    return set(values)


remote_values = parse_set(remote_raw, f"remote {set_kind} set")
local_values = parse_set(local_raw, f"local {set_kind} set")
missing = sorted(remote_values - local_values, key=sort_key)
added = sorted(local_values - remote_values, key=sort_key)
override_raw = os.environ.get(override_name, "")

if not missing:
    if override_raw:
        raise SystemExit(
            f"ERROR: {override_name} is set but this release removes no {item_label}s. "
            "Clear the stale override before syncing."
        )
    print(
        f"{set_kind}_set_guard: safe "
        f"({len(remote_values)} remote, {len(local_values)} local, {len(added)} added)"
    )
    raise SystemExit(0)

expected = ",".join(missing)
if not override_raw:
    raise SystemExit(
        f"ERROR: Refusing to remove {item_label}(s) present in remote D1 but "
        f"missing locally: {expected}. If this exact removal set is human-reviewed, "
        f"rerun with {override_name}={expected}."
    )

override_values = parse_set(override_raw, override_name)
if override_values != set(missing):
    raise SystemExit(
        f"ERROR: {override_name} does not exactly match the remote-only "
        f"{item_label} set. Expected: {expected}."
    )

print(
    f"{set_kind}_set_guard: explicit removals authorized "
    f"({expected}; {len(added)} additions)"
)
PY
}

assert_catalog_slug_change_allowed() {
  assert_remote_set_change_allowed \
    "startup" "$1" "$2" "VENTUREDEX_ALLOW_STARTUP_REMOVALS"
}

assert_weekly_issue_change_allowed() {
  assert_remote_set_change_allowed \
    "weekly" "$1" "$2" "VENTUREDEX_ALLOW_WEEKLY_ISSUE_REMOVALS"
}

assert_generated_seed_fresh() {
  python3 - "$REPO_ROOT" <<'PY'
import hashlib
import os
import re
from pathlib import Path
import sys

repo_root = Path(sys.argv[1])
content_dir = Path(
    os.environ.get("VENTUREDEX_STARTUPS_DIR", repo_root / "content" / "startups")
)
timestamps_file = Path(
    os.environ.get("VENTUREDEX_TIMESTAMPS_FILE", repo_root / "content" / "timestamps.json")
)
weekly_dir = Path(
    os.environ.get("VENTUREDEX_WEEKLY_DIR", repo_root / "content" / "weekly")
)
seed_path = Path(
    os.environ.get("VENTUREDEX_SEED_OUTPUT", repo_root / "d1" / "generated-seed.sql")
)
startup_files = sorted(content_dir.glob("*.json"))
weekly_files = sorted(weekly_dir.glob("*.json"))
content_count = len(startup_files)

if content_count == 0:
    raise SystemExit(
        "ERROR: No startup files found; refusing to accept an empty generated seed."
    )

if not seed_path.exists():
    raise SystemExit(f"ERROR: {seed_path} is missing; run ./scripts/build-db.sh first")

seed_text = seed_path.read_text()
seed_startups = len(re.findall(r"^INSERT INTO startups \(", seed_text, flags=re.MULTILINE))

if seed_startups != content_count:
    raise SystemExit(
        "ERROR: d1/generated-seed.sql is stale: "
        f"{seed_startups} startup inserts for {content_count} content files. "
        "Run ./scripts/build-db.sh before syncing remote D1."
    )

sources = [
    ("scripts/build-db.sh", repo_root / "scripts" / "build-db.sh"),
    ("d1/schema.sql", repo_root / "d1" / "schema.sql"),
    ("content/timestamps.json", timestamps_file),
    ("content/investors.json", repo_root / "content" / "investors.json"),
    ("content/collections.json", repo_root / "content" / "collections.json"),
]
sources.extend((f"content/startups/{path.name}", path) for path in startup_files)
sources.extend((f"content/weekly/{path.name}", path) for path in weekly_files)

digest = hashlib.sha256()
digest.update(b"venturedex-seed-source-v1\0")
for label, path in sources:
    digest.update(label.encode("utf-8"))
    digest.update(b"\0")
    digest.update(path.read_bytes())
    digest.update(b"\0")
expected_fingerprint = digest.hexdigest()

match = re.search(
    r"^-- Source fingerprint: sha256:([a-f0-9]{64})$",
    seed_text,
    flags=re.MULTILINE,
)
if not match:
    raise SystemExit(
        "ERROR: generated seed has no source fingerprint; "
        "run ./scripts/build-db.sh before syncing remote D1."
    )
if match.group(1) != expected_fingerprint:
    raise SystemExit(
        "ERROR: generated seed fingerprint is stale for the current source content. "
        "Run ./scripts/build-db.sh before syncing remote D1."
    )

print(
    f"generated_seed: fresh ({seed_startups} startups, "
    f"sha256:{expected_fingerprint[:12]}...)"
)
PY
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

html_contains() {
  local pattern="$1"
  if command -v rg >/dev/null 2>&1; then
    rg -q "$pattern"
  else
    grep -E -q "$pattern"
  fi
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

# The Cloudflare adapter emits the deployable Worker + its wrangler config under dist/server
# (assets live in dist/client). Deploy with that generated config rather than the
# root wrangler.toml, whose `main` now points at the source entry for the build.
ADAPTER_WRANGLER_CONFIG="dist/server/wrangler.json"

deploy_worker() {
  (
    cd "$REPO_ROOT"
    if [ ! -f "$ADAPTER_WRANGLER_CONFIG" ]; then
      echo "ERROR: $ADAPTER_WRANGLER_CONFIG missing — run 'npm run build' first." >&2
      exit 1
    fi
    npx wrangler deploy -c "$ADAPTER_WRANGLER_CONFIG" 2>&1
  )
}

check_newsletter_release_preflight() {
  local dry_run_output secrets_output
  (
    cd "$REPO_ROOT"
    dry_run_output="$(npx wrangler deploy -c "$ADAPTER_WRANGLER_CONFIG" --dry-run --outdir /tmp/venturedex-newsletter-preflight 2>&1)"
    printf '%s\n' "$dry_run_output"
    if ! printf '%s\n' "$dry_run_output" | grep -F -q "env.EMAIL"; then
      echo "ERROR: Newsletter preflight did not find Cloudflare Email binding env.EMAIL." >&2
      exit 1
    fi
    if ! printf '%s\n' "$dry_run_output" | grep -F -q "env.NEWSLETTER_DELIVERY_QUEUE"; then
      echo "ERROR: Newsletter preflight did not find Queue binding env.NEWSLETTER_DELIVERY_QUEUE." >&2
      exit 1
    fi

    secrets_output="$(npx wrangler secret list --format json 2>&1)"
    if ! printf '%s\n' "$secrets_output" | grep -F -q '"NEWSLETTER_ADMIN_TOKEN"'; then
      echo "ERROR: Missing Cloudflare secret NEWSLETTER_ADMIN_TOKEN." >&2
      exit 1
    fi
    if ! printf '%s\n' "$secrets_output" | grep -F -q '"NEWSLETTER_MAILING_ADDRESS"'; then
      echo "ERROR: Missing Cloudflare secret NEWSLETTER_MAILING_ADDRESS." >&2
      exit 1
    fi
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
    npm audit --audit-level=high
    ./scripts/validate.sh
    ./scripts/build-db.sh
    npm run test:newsletter
    npx astro sync
    npm run typecheck
    npm run build
  )
}

assert_release_expected_sha_matches_head() {
  local release_sha="${VENTUREDEX_RELEASE_SHA:-}"
  local validated_sha="${VENTUREDEX_VALIDATED_SHA:-}"
  local current_sha

  if ! current_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"; then
    echo "ERROR: Could not resolve the checked-out release HEAD." >&2
    return 1
  fi
  if [ -n "$release_sha" ] && [ "$current_sha" != "$release_sha" ]; then
    echo "ERROR: Release SHA $release_sha does not match checked-out SHA $current_sha." >&2
    return 1
  fi
  if [ -n "$validated_sha" ] && [ "$current_sha" != "$validated_sha" ]; then
    echo "ERROR: Validated SHA $validated_sha does not match checked-out SHA $current_sha." >&2
    return 1
  fi
}

assert_release_head_is_current_main() {
  local current_sha remote_main_sha

  assert_release_expected_sha_matches_head
  current_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"

  if ! remote_main_sha="$(git -C "$REPO_ROOT" ls-remote origin refs/heads/main | awk '{print $1}')"; then
    echo "ERROR: Could not resolve origin/main before release." >&2
    return 1
  fi
  if [ -z "$remote_main_sha" ] || [ "$remote_main_sha" != "$current_sha" ]; then
    echo "ERROR: Release HEAD $current_sha is not the current origin/main SHA ($remote_main_sha)." >&2
    return 1
  fi
}

assert_release_source_clean() {
  local status
  status="$(git -C "$REPO_ROOT" status --porcelain --untracked-files=all)"
  if [ -n "$status" ]; then
    echo "ERROR: Production release source is not a clean checkout of origin/main." >&2
    printf '%s\n' "$status" >&2
    return 1
  fi
}

release_lock_cleanup() {
  if [ -z "$RELEASE_LOCK_DIR" ]; then
    return 0
  fi

  if [ -f "$RELEASE_LOCK_DIR/pid" ]; then
    unlink "$RELEASE_LOCK_DIR/pid" 2>/dev/null || true
  fi
  if ! rmdir "$RELEASE_LOCK_DIR" 2>/dev/null; then
    echo "WARNING: Release lock directory could not be removed cleanly: $RELEASE_LOCK_DIR" >&2
  fi
  RELEASE_LOCK_DIR=""
}

acquire_release_lock() {
  local git_common_dir lock_owner

  if ! git_common_dir="$(git -C "$REPO_ROOT" rev-parse --git-common-dir)"; then
    echo "ERROR: Could not resolve the Git common directory for the release lock." >&2
    return 1
  fi
  case "$git_common_dir" in
    /*) ;;
    *) git_common_dir="$REPO_ROOT/$git_common_dir" ;;
  esac

  RELEASE_LOCK_DIR="$git_common_dir/venturedex-release.lock"
  if ! mkdir "$RELEASE_LOCK_DIR" 2>/dev/null; then
    lock_owner=""
    if [ -f "$RELEASE_LOCK_DIR/pid" ]; then
      lock_owner="$(sed -n '1p' "$RELEASE_LOCK_DIR/pid")"
    fi
    echo "ERROR: Another release owns $RELEASE_LOCK_DIR${lock_owner:+ (pid $lock_owner)}." >&2
    echo "If no release is active, inspect the recorded process before removing the stale lock." >&2
    RELEASE_LOCK_DIR=""
    return 1
  fi

  trap release_lock_cleanup EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  printf '%s\n' "$$" > "$RELEASE_LOCK_DIR/pid"
}

sha256_file() {
  local path="$1"
  python3 - "$path" <<'PY'
import hashlib
from pathlib import Path
import sys

path = Path(sys.argv[1])
if not path.is_file():
    print(f"Missing release artifact file: {path}", file=sys.stderr)
    raise SystemExit(1)

digest = hashlib.sha256()
with path.open("rb") as artifact:
    for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
        digest.update(chunk)
print(digest.hexdigest())
PY
}

sha256_tree() {
  local path="$1"
  python3 - "$path" <<'PY'
import hashlib
from pathlib import Path
import sys

root = Path(sys.argv[1])
if not root.is_dir():
    print(f"Missing release artifact directory: {root}", file=sys.stderr)
    raise SystemExit(1)

digest = hashlib.sha256()
for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
    relative = path.relative_to(root).as_posix().encode("utf-8")
    if path.is_symlink():
        digest.update(b"L\0" + relative + b"\0" + path.readlink().as_posix().encode("utf-8") + b"\0")
    elif path.is_file():
        digest.update(b"F\0" + relative + b"\0")
        with path.open("rb") as artifact:
            for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
                digest.update(chunk)
        digest.update(b"\0")
print(digest.hexdigest())
PY
}

capture_release_artifact_hashes() {
  VENTUREDEX_SEED_OUTPUT="$REPO_ROOT/d1/generated-seed.sql" assert_generated_seed_fresh
  RELEASE_SEED_SHA256="$(sha256_file "$REPO_ROOT/d1/generated-seed.sql")"
  RELEASE_DIST_SHA256="$(sha256_tree "$REPO_ROOT/dist")"
  echo "Locked release seed sha256:$RELEASE_SEED_SHA256"
  echo "Locked release dist sha256:$RELEASE_DIST_SHA256"
}

assert_release_seed_hash_unchanged() {
  local expected_sha="${1:-$RELEASE_SEED_SHA256}"
  local current_sha

  if [ -z "$expected_sha" ]; then
    echo "ERROR: No build-time D1 seed hash is locked for this release." >&2
    return 1
  fi
  current_sha="$(sha256_file "$REPO_ROOT/d1/generated-seed.sql")"
  if [ "$current_sha" != "$expected_sha" ]; then
    echo "ERROR: D1 seed changed after the release build." >&2
    echo "Expected sha256:$expected_sha; found sha256:$current_sha." >&2
    return 1
  fi
}

assert_release_artifact_hashes_unchanged() {
  local current_dist_sha

  assert_release_seed_hash_unchanged
  if [ -z "$RELEASE_DIST_SHA256" ]; then
    echo "ERROR: No build-time dist hash is locked for this release." >&2
    return 1
  fi
  current_dist_sha="$(sha256_tree "$REPO_ROOT/dist")"
  if [ "$current_dist_sha" != "$RELEASE_DIST_SHA256" ]; then
    echo "ERROR: Deployable dist changed after the release build." >&2
    echo "Expected sha256:$RELEASE_DIST_SHA256; found sha256:$current_dist_sha." >&2
    return 1
  fi
}

assert_release_post_build_source_clean() {
  local unexpected_status

  if ! unexpected_status="$(
    python3 - "$REPO_ROOT" <<'PY'
import json
from pathlib import Path
import subprocess
import sys

repo_root = Path(sys.argv[1])
weekly_dir = repo_root / "content" / "weekly"
allowed_og_paths = set()

try:
    for weekly_file in weekly_dir.glob("*.json"):
        issue = json.loads(weekly_file.read_text(encoding="utf-8"))
        issue_number = issue.get("issue_number")
        status = issue.get("status", "published")
        if (
            status == "published"
            and isinstance(issue_number, int)
            and not isinstance(issue_number, bool)
            and issue_number > 0
        ):
            allowed_og_paths.add(f"public/og/weekly-{issue_number}.png")
except (OSError, ValueError, TypeError) as exc:
    print(f"Could not resolve generated Weekly OG allowlist: {exc}", file=sys.stderr)
    raise SystemExit(2)

status_result = subprocess.run(
    [
        "git",
        "-C",
        str(repo_root),
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
    ],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    check=False,
)
if status_result.returncode != 0:
    sys.stderr.buffer.write(status_result.stderr)
    raise SystemExit(status_result.returncode)

unexpected = []
for raw_record in status_result.stdout.split(b"\0"):
    if not raw_record:
        continue
    if len(raw_record) < 4 or raw_record[2:3] != b" ":
        unexpected.append(f"?? {raw_record.decode('utf-8', errors='replace')}")
        continue

    change = raw_record[:2].decode("ascii", errors="replace")
    path = raw_record[3:].decode("utf-8", errors="replace")

    # build-db.sh is the only release step allowed to alter a tracked file.
    # It writes the seed without staging it; staged/deleted/renamed seed states
    # are therefore unexpected and remain fail-closed.
    if change == " M" and path == "d1/generated-seed.sql":
        continue

    # weekly:og deterministically rewrites both tracked and previously missing
    # published issue-number assets. Requiring the issue to exist, and allowing
    # only unstaged modifications or untracked files, prevents a broad
    # public/og glob from hiding arbitrary, staged, deleted, or renamed payloads.
    if change in {" M", "??"} and path in allowed_og_paths:
        continue

    unexpected.append(f"{change} {path}")

if unexpected:
    print("\n".join(unexpected))
    raise SystemExit(1)
PY
  )"; then
    echo "ERROR: Release source changed after validation/build; refusing to deploy mixed artifacts." >&2
    if [ -n "$unexpected_status" ]; then
      printf '%s\n' "$unexpected_status" >&2
    fi
    return 1
  fi
}

prepare_release_artifacts() {
  local validated_sha="${VENTUREDEX_VALIDATED_SHA:-}"
  local current_sha

  if [ -z "$validated_sha" ]; then
    cmd_validate
    return 0
  fi

  if [ "${GITHUB_ACTIONS:-}" != "true" ] || [ "${GITHUB_EVENT_NAME:-}" != "workflow_run" ]; then
    echo "ERROR: VENTUREDEX_VALIDATED_SHA may only be consumed by a workflow_run release." >&2
    exit 1
  fi

  current_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"
  if [ "$current_sha" != "$validated_sha" ]; then
    echo "ERROR: Validated SHA $validated_sha does not match checked-out SHA $current_sha." >&2
    exit 1
  fi

  echo "Using successful Validate result for exact SHA $current_sha."
  (
    cd "$REPO_ROOT"
    ./scripts/build-db.sh
    assert_generated_seed_fresh
    npx astro sync
    npm run build
  )
}

remote_sync_preflight() {
  local remote_manual_slugs local_slugs remote_weekly_issues local_weekly_issues

  require_token
  VENTUREDEX_SEED_OUTPUT="$REPO_ROOT/d1/generated-seed.sql" assert_generated_seed_fresh
  assert_release_seed_hash_unchanged
  assert_remote_schema_not_legacy
  assert_remote_schema_migration_feasible

  remote_manual_slugs="$(remote_manual_startup_slugs)"
  local_slugs="$(local_startup_slugs)"
  assert_catalog_slug_change_allowed "$remote_manual_slugs" "$local_slugs"

  remote_weekly_issues="$(remote_published_weekly_issue_numbers)"
  local_weekly_issues="$(local_published_weekly_issue_numbers)"
  assert_weekly_issue_change_allowed "$remote_weekly_issues" "$local_weekly_issues"

  echo "remote_sync_preflight: read-only guards passed"
}

deploy_worker_after_remote_sync_preflight() {
  remote_sync_preflight
  deploy_worker
}

cmd_sync_internal() {
  local skip_build="${1:-}"
  require_token
  (
    cd "$REPO_ROOT"
    if [ "$skip_build" != "--skip-build" ]; then
      ./scripts/build-db.sh
    fi
    remote_sync_preflight
    ensure_current_remote_schema
    # Schema migration is the first allowed remote mutation. Re-read the
    # schema, complete remote sets, exact removal overrides, and locked seed
    # before applying the generated seed.
    remote_sync_preflight
    assert_release_seed_hash_unchanged
    echo "Applying d1/generated-seed.sql to remote D1..."
    local output attempt=1 max_attempts=3
    while true; do
      if output="$(npx wrangler d1 execute "$DB_NAME" --remote --file=d1/generated-seed.sql 2>&1)"; then
        break
      fi

      printf '%s\n' "$output"

      if printf '%s' "$output" | grep -E -qi "timed out|network connectivity issues|slow network speeds"; then
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

      if printf '%s' "$output" | grep -E -qi "10000|Authentication error|not authorized|permissions"; then
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

refuse_direct_production_mutation() {
  local command_name="$1"

  # Check local identity and source cleanliness before the remote-main lookup so
  # an obviously wrong SHA or dirty source fails before any network operation.
  assert_release_expected_sha_matches_head
  assert_release_source_clean
  assert_release_head_is_current_main
  echo "ERROR: Direct production '$command_name' is disabled; use 'scripts/manage.sh release'." >&2
  echo "The unified release flow is the only path allowed to mutate Worker or D1 state." >&2
  return 1
}

cmd_sync_public() {
  refuse_direct_production_mutation "sync"
}

cmd_deploy_public() {
  refuse_direct_production_mutation "deploy"
}

cmd_smoke() {
  local url="${1:?Usage: manage.sh smoke <url>}"
  local startup_count

  require_token
  if ! startup_count="$(remote_startup_count)"; then
    echo "ERROR: Could not read the remote startup count for live smoke." >&2
    return 2
  fi
  python3 "$SCRIPT_DIR/smoke-live.py" "$url" --expected-startups "$startup_count"
}

smoke_with_retry() {
  local url="$1"
  local max_attempts="${VENTUREDEX_SMOKE_ATTEMPTS:-4}"
  local attempt=1
  local delay=4
  local status

  if ! [[ "$max_attempts" =~ ^[1-9][0-9]*$ ]]; then
    echo "ERROR: VENTUREDEX_SMOKE_ATTEMPTS must be a positive integer." >&2
    return 1
  fi

  while true; do
    echo "Live smoke attempt $attempt/$max_attempts: $url"
    if cmd_smoke "$url"; then
      return 0
    else
      status=$?
    fi
    if [ "$status" -eq 2 ]; then
      echo "ERROR: Live smoke precondition failed; refusing a blind retry." >&2
      return "$status"
    fi
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "ERROR: Live smoke failed after $max_attempts attempts: $url" >&2
      return 1
    fi
    echo "Live HTTP/content smoke is not successful yet; retrying in ${delay}s..." >&2
    sleep "$delay"
    attempt=$((attempt + 1))
    if [ "$delay" -lt 16 ]; then
      delay=$((delay * 2))
    fi
  done
}

cmd_release() {
  local deploy_output deploy_url site_url

  assert_release_expected_sha_matches_head
  assert_release_source_clean
  acquire_release_lock
  assert_release_head_is_current_main
  require_token
  prepare_release_artifacts
  capture_release_artifact_hashes
  check_newsletter_release_preflight
  assert_release_head_is_current_main
  assert_release_post_build_source_clean
  assert_release_artifact_hashes_unchanged

  if ! deploy_output="$(deploy_worker_after_remote_sync_preflight)"; then
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

  # Publish the static/Worker version before mutating runtime D1. This keeps the
  # public site from observing database rows newer than the deployed pages.
  assert_release_head_is_current_main
  assert_release_post_build_source_clean
  assert_release_seed_hash_unchanged
  cmd_sync_internal --skip-build

  smoke_with_retry "$deploy_url"
  site_url="$(default_site_url)"
  if [ -n "$site_url" ] && [ "$site_url" != "$deploy_url" ]; then
    smoke_with_retry "$site_url"
  fi
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
  python3 "$SCRIPT_DIR/backfill-research.py" "$slug"

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
  check-seed) assert_generated_seed_fresh ;;
  __test-catalog-slugs) shift; assert_catalog_slug_change_allowed "$@" ;;
  __test-weekly-issues) shift; assert_weekly_issue_change_allowed "$@" ;;
  __test-post-build-source-clean) assert_release_post_build_source_clean ;;
  __test-seed-hash) shift; RELEASE_SEED_SHA256="${1:-}"; assert_release_seed_hash_unchanged ;;
  __test-extract-first-url) extract_first_url ;;
  __test-release-lock) acquire_release_lock ;;
  __test-release-lock-signal) acquire_release_lock; kill -TERM "$$" ;;
  __test-preflight-deploy)
    shift
    RELEASE_SEED_SHA256="${1:-}"
    deploy_worker_after_remote_sync_preflight
    ;;
  sync) shift; cmd_sync_public "$@" ;;
  deploy) cmd_deploy_public ;;
  smoke) shift; cmd_smoke "$@" ;;
  release) cmd_release ;;
  *) usage ;;
esac
