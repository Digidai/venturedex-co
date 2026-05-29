#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_NAME="venturedex-db"
MODE="${1:---local}"

if [ "$MODE" != "--local" ] && [ "$MODE" != "--remote" ]; then
  echo "Usage: scripts/migrate-newsletter.sh [--local|--remote]" >&2
  exit 1
fi

execute() {
  local sql="$1"
  (
    cd "$REPO_ROOT"
    npx wrangler d1 execute "$DB_NAME" "$MODE" --command "$sql" >/dev/null
  )
}

column_exists() {
  local table="$1"
  local column="$2"
  local output
  output="$(
    cd "$REPO_ROOT"
    npx wrangler d1 execute "$DB_NAME" "$MODE" --command "PRAGMA table_info($table);" 2>/dev/null || true
  )"
  COLUMN_EXISTS_OUTPUT="$output" python3 - "$column" <<'PY'
import json
import os
import re
import sys

column = sys.argv[1]
text = os.environ.get("COLUMN_EXISTS_OUTPUT", "")
match = re.search(r"(\[\s*\{.*)", text, re.S)
if not match:
    raise SystemExit(1)
payload = json.loads(match.group(1))
columns = {row.get("name") for row in payload[0].get("results", [])}
raise SystemExit(0 if column in columns else 1)
PY
}

execute "
CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  preferences_json TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','unsubscribed')),
  source TEXT DEFAULT 'website',
  unsubscribe_token TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
"

for column in preferences_json unsubscribe_token unsubscribed_at updated_at; do
  if ! column_exists newsletter_subscriptions "$column"; then
    execute "ALTER TABLE newsletter_subscriptions ADD COLUMN $column TEXT;"
  fi
done

execute "
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
"

for column in html_main text_main; do
  if ! column_exists newsletter_sends "$column"; then
    execute "ALTER TABLE newsletter_sends ADD COLUMN $column TEXT;"
  fi
done

execute "
CREATE INDEX IF NOT EXISTS idx_funding_company_slug ON funding_rounds(company_slug, date DESC);
"

echo "newsletter_migration: ok ($MODE)"
