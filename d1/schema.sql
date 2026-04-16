-- VentureDex D1 Schema
-- workflow_status: draft / published / archived (3-state, per CEO Review)
-- codex_stage: internal pipeline tracking (per Eng Review)

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  domain TEXT NOT NULL,
  canonical_url TEXT,
  product_name TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  long_description TEXT,
  editor_note TEXT,
  editor_rating INTEGER CHECK (editor_rating BETWEEN 1 AND 5),
  why_featured TEXT,
  curator TEXT DEFAULT 'dai',
  product_type TEXT,
  funding_stage TEXT,
  funding_display TEXT,
  founded_year INTEGER,
  team_size TEXT,
  hq_location TEXT,
  region TEXT,
  framework TEXT,
  runtime_status TEXT DEFAULT 'live' CHECK (runtime_status IN ('live','redirect','parked','dead')),
  workflow_status TEXT DEFAULT 'draft' CHECK (workflow_status IN ('draft','published','archived')),
  codex_stage TEXT DEFAULT 'manual' CHECK (codex_stage IN ('manual','discovered','enriching','enriched','screenshot_pending','ready_for_review')),
  screenshot_r2_key TEXT,
  screenshot_status TEXT DEFAULT 'pending' CHECK (screenshot_status IN ('pending','ready','failed')),
  og_image_r2_key TEXT,
  founder_name TEXT,
  founder_email TEXT,
  founder_quote TEXT,
  founder_responded_at TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_checked_at TEXT,
  published_at TEXT,
  investors TEXT,
  links_json TEXT,
  tags TEXT,
  is_featured INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sites_published ON sites(workflow_status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_sites_type ON sites(product_type) WHERE workflow_status = 'published';
CREATE INDEX IF NOT EXISTS idx_sites_slug ON sites(slug);

CREATE TABLE IF NOT EXISTS site_evidence (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  raw_value TEXT,
  weight INTEGER DEFAULT 50,
  source TEXT DEFAULT 'manual',
  detected_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_site ON site_evidence(site_id);

CREATE TABLE IF NOT EXISTS site_aliases (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  alias_hostname TEXT NOT NULL,
  alias_url TEXT,
  alias_type TEXT DEFAULT 'canonical',
  is_active INTEGER DEFAULT 1,
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS site_snapshots (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  canonical_url TEXT,
  title TEXT,
  description TEXT,
  screenshot_r2_key TEXT,
  html_r2_key TEXT,
  headers_json TEXT,
  dns_json TEXT,
  runtime_status TEXT,
  diff_summary TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_snapshots_site ON site_snapshots(site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS weekly_issues (
  id TEXT PRIMARY KEY,
  issue_number INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  editorial_intro TEXT,
  anti_pick_name TEXT,
  anti_pick_url TEXT,
  anti_pick_reason TEXT,
  og_image_r2_key TEXT,
  published_at TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weekly_issue_sites (
  issue_id TEXT NOT NULL REFERENCES weekly_issues(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  issue_note TEXT,
  PRIMARY KEY (issue_id, site_id)
);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'editorial' CHECK (type IN ('auto','editorial')),
  query_json TEXT,
  hero_r2_key TEXT,
  published INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collection_sites (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  rank INTEGER DEFAULT 0,
  pinned INTEGER DEFAULT 0,
  PRIMARY KEY (collection_id, site_id)
);

CREATE TABLE IF NOT EXISTS research_posts (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  body_md TEXT,
  cover_r2_key TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('idea','draft','edited','scheduled','published','unpublished','archived')),
  author TEXT DEFAULT 'dai',
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS submission_queue (
  id TEXT PRIMARY KEY,
  submission_key TEXT UNIQUE NOT NULL,
  canonical_hostname TEXT,
  submitted_url TEXT NOT NULL,
  submitted_name TEXT,
  submitted_description TEXT,
  submitter_email TEXT,
  note TEXT,
  dedupe_result TEXT,
  workflow_status TEXT DEFAULT 'pending' CHECK (workflow_status IN ('pending','processing','approved','rejected','duplicate')),
  attempt_count INTEGER DEFAULT 0,
  claim_token TEXT,
  lease_owner TEXT,
  lease_expires_at TEXT,
  processed_at TEXT,
  linked_site_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS search_index_terms (
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  normalized_term TEXT NOT NULL,
  term_type TEXT NOT NULL,
  weight INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (site_id, normalized_term, term_type)
);

CREATE INDEX IF NOT EXISTS idx_search_term ON search_index_terms(normalized_term);

CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  interests_json TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','unsubscribed')),
  source TEXT DEFAULT 'website',
  created_at TEXT DEFAULT (datetime('now')),
  confirmed_at TEXT
);

CREATE TABLE IF NOT EXISTS sponsor_leads (
  id TEXT PRIMARY KEY,
  company_name TEXT,
  contact_name TEXT,
  email TEXT NOT NULL,
  budget_range TEXT,
  notes TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new','contacted','negotiating','closed','declined')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS screenshot_jobs (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  mode TEXT DEFAULT 'detail' CHECK (mode IN ('detail','refresh','manual')),
  idempotency_key TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','failed')),
  attempts INTEGER DEFAULT 0,
  error_message TEXT,
  requested_by TEXT DEFAULT 'manual',
  created_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS investors (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT,
  website TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS funding_rounds (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  company_slug TEXT,
  company_url TEXT,
  amount TEXT,
  stage TEXT NOT NULL,
  lead_investor TEXT,
  date TEXT NOT NULL,
  source_url TEXT,
  source_name TEXT DEFAULT 'TechCrunch',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_funding_date ON funding_rounds(date DESC);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  started_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT DEFAULT 'running' CHECK (status IN ('running','success','failed','aborted')),
  items_processed INTEGER DEFAULT 0,
  summary_md TEXT,
  error_log TEXT
);
