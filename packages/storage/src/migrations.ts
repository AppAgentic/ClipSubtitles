export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Forward-only migrations. Timestamps are ISO-8601 TEXT (lexicographically
 * ordered). JSON columns hold validated contract objects.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial',
    sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  name TEXT NOT NULL,
  retention_source_days INTEGER NOT NULL DEFAULT 30,
  retention_export_days INTEGER NOT NULL DEFAULT 7,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  idp_session_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE oauth_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  client_id TEXT NOT NULL,
  client_name TEXT,
  scopes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  UNIQUE(user_id, client_id)
);

CREATE TABLE revoked_tokens (
  jti TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT NOT NULL,
  language TEXT,
  source_asset_id TEXT,
  current_revision_id TEXT,
  style_json TEXT NOT NULL,
  segmentation_json TEXT NOT NULL,
  pages_json TEXT NOT NULL,
  manual_breaks_json TEXT NOT NULL DEFAULT '[]',
  manual_joins_json TEXT NOT NULL DEFAULT '[]',
  qa_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX projects_workspace ON projects(workspace_id, deleted_at, updated_at);

CREATE TABLE source_assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL,
  origin TEXT NOT NULL,
  storage_key TEXT,
  file_name TEXT,
  mime_type TEXT,
  bytes INTEGER,
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  fps REAL,
  has_audio INTEGER,
  sha256 TEXT,
  source_url TEXT,
  truth_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  purged_at TEXT
);
CREATE INDEX assets_project ON source_assets(project_id);
CREATE INDEX assets_expiry ON source_assets(expires_at, purged_at);

CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  asset_id TEXT NOT NULL REFERENCES source_assets(id),
  token_hash TEXT NOT NULL UNIQUE,
  max_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE transcript_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  revision_number INTEGER NOT NULL,
  source TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  language TEXT NOT NULL,
  words_json TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  fallback_from TEXT,
  parent_revision_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, revision_number)
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  stage TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  idempotency_key TEXT,
  input_json TEXT NOT NULL,
  result_json TEXT,
  error_json TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_expires_at TEXT,
  run_after TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX tasks_queue ON tasks(status, run_after);
CREATE INDEX tasks_workspace ON tasks(workspace_id, created_at);
CREATE INDEX tasks_project ON tasks(project_id, created_at);
CREATE UNIQUE INDEX tasks_idempotency ON tasks(workspace_id, kind, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE render_quotes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  project_version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  expected_outputs_json TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  billable_minutes REAL NOT NULL,
  credit_cost INTEGER NOT NULL,
  price_version TEXT NOT NULL,
  status TEXT NOT NULL,
  invalidated_reason TEXT,
  consumed_by_task_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX quotes_project ON render_quotes(project_id, status);

CREATE TABLE credit_accounts (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
  available INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE credit_reservations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  quote_id TEXT NOT NULL UNIQUE,
  task_id TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL,
  settled_amount INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE credit_ledger (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  available_after INTEGER NOT NULL,
  reserved_after INTEGER NOT NULL,
  task_id TEXT,
  quote_id TEXT,
  reservation_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ledger_workspace ON credit_ledger(workspace_id, created_at);

CREATE TABLE exports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  project_version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  purged_at TEXT
);
CREATE INDEX exports_project ON exports(project_id, created_at);
CREATE INDEX exports_task ON exports(task_id);
CREATE INDEX exports_expiry ON exports(expires_at, purged_at);

CREATE TABLE idempotency_keys (
  workspace_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL,
  status_code INTEGER,
  response_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, scope, key)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  outcome TEXT NOT NULL,
  error_ref TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX audit_workspace ON audit_events(workspace_id, created_at);
`,
  },
  {
    version: 2,
    name: 'ledger_idempotency_per_workspace',
    // idempotency_key was globally UNIQUE, so one workspace's legitimate provider
    // key (promo code, webhook event id) silently denied the same key in another
    // workspace. SQLite cannot alter a constraint in place: rebuild the table.
    sql: `
CREATE TABLE credit_ledger_v2 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  available_after INTEGER NOT NULL,
  reserved_after INTEGER NOT NULL,
  task_id TEXT,
  quote_id TEXT,
  reservation_id TEXT,
  idempotency_key TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, idempotency_key)
);
INSERT INTO credit_ledger_v2 (id, workspace_id, kind, amount, available_after, reserved_after, task_id, quote_id, reservation_id, idempotency_key, note, created_at)
  SELECT id, workspace_id, kind, amount, available_after, reserved_after, task_id, quote_id, reservation_id, idempotency_key, note, created_at
  FROM credit_ledger ORDER BY rowid;
DROP TABLE credit_ledger;
ALTER TABLE credit_ledger_v2 RENAME TO credit_ledger;
CREATE INDEX ledger_workspace ON credit_ledger(workspace_id, created_at);
`,
  },
  {
    version: 3,
    name: 'task_dispatch_outbox',
    sql: `
CREATE TABLE task_dispatch_outbox (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  available_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX task_dispatch_pending ON task_dispatch_outbox(delivered_at, available_at, updated_at);
INSERT INTO task_dispatch_outbox (task_id, available_at, created_at, updated_at)
  SELECT id, run_after, created_at, updated_at FROM tasks WHERE status = 'queued';
`,
  },
  {
    version: 4,
    name: 'task_dispatch_generations',
    sql: `
ALTER TABLE task_dispatch_outbox ADD COLUMN generation INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    version: 5,
    name: 'hardened_direct_uploads',
    sql: `
ALTER TABLE uploads ADD COLUMN transport TEXT NOT NULL DEFAULT 'proxy';
ALTER TABLE uploads ADD COLUMN storage_key TEXT;
ALTER TABLE uploads ADD COLUMN expected_bytes INTEGER;
ALTER TABLE uploads ADD COLUMN expected_mime_type TEXT;
ALTER TABLE uploads ADD COLUMN expected_sha256 TEXT;
ALTER TABLE uploads ADD COLUMN purged_at TEXT;
CREATE INDEX uploads_expired_direct ON uploads(transport, completed_at, purged_at, expires_at);
`,
  },
  {
    version: 6,
    name: 'billing_catalog_and_credit_pools',
    sql: `
CREATE TABLE billing_accounts (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
  plan_id TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'free',
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE credit_pools (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind TEXT NOT NULL,
  original_amount INTEGER NOT NULL CHECK (original_amount >= 0),
  available INTEGER NOT NULL CHECK (available >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  expires_at TEXT,
  idempotency_key TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, idempotency_key)
);
CREATE INDEX credit_pools_spend_order ON credit_pools(workspace_id, expires_at, created_at);

CREATE TABLE credit_reservation_allocations (
  reservation_id TEXT NOT NULL REFERENCES credit_reservations(id) ON DELETE CASCADE,
  pool_id TEXT NOT NULL REFERENCES credit_pools(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  PRIMARY KEY (reservation_id, pool_id)
);

CREATE TABLE billing_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  workspace_id TEXT,
  status TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  PRIMARY KEY (provider, event_id)
);

INSERT INTO billing_accounts (workspace_id, plan_id, status, updated_at)
  SELECT id, 'free', 'free', updated_at FROM workspaces;

INSERT INTO credit_pools (id, workspace_id, kind, original_amount, available, reserved, idempotency_key, note, created_at)
  SELECT 'pool_' || substr(replace(workspace_id, 'ws_', ''), 1, 26), workspace_id, 'admin', available + reserved, available, reserved,
         'migration:aggregate:v6', 'Balance migrated into the pooled credit ledger', updated_at
  FROM credit_accounts WHERE available + reserved > 0;
`,
  },
  {
    version: 7,
    name: 'billing_provider_event_ordering',
    sql: `
ALTER TABLE billing_accounts ADD COLUMN provider_event_at TEXT;
`,
  },
  {
    version: 8,
    name: 'identity_linked_analytics',
    sql: `
CREATE TABLE analytics_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  workspace_id TEXT REFERENCES workspaces(id),
  source TEXT NOT NULL,
  medium TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  adset_id TEXT,
  ad_id TEXT,
  creative_id TEXT,
  apprefer_click_id TEXT,
  landing_url TEXT,
  referrer TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX analytics_sessions_user ON analytics_sessions(user_id, last_seen_at);
CREATE INDEX analytics_sessions_source ON analytics_sessions(source, first_seen_at);

CREATE TABLE analytics_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES analytics_sessions(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  workspace_id TEXT REFERENCES workspaces(id),
  event TEXT NOT NULL,
  surface TEXT NOT NULL,
  project_id TEXT,
  task_id TEXT,
  properties_json TEXT,
  occurred_at TEXT NOT NULL,
  UNIQUE(session_id, event, project_id, task_id)
);
CREATE INDEX analytics_events_time ON analytics_events(occurred_at, event);
CREATE INDEX analytics_events_user ON analytics_events(user_id, occurred_at);
CREATE INDEX analytics_events_workspace ON analytics_events(workspace_id, occurred_at);
CREATE UNIQUE INDEX analytics_events_dedupe ON analytics_events(
  session_id, event, COALESCE(project_id, ''), COALESCE(task_id, '')
);

CREATE TABLE analytics_daily_rollups (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  source TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  session_count INTEGER NOT NULL,
  user_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, event, source)
);
`,
  },
];
