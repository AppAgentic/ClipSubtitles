import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from 'pg';

export interface PostgresMigration {
  version: number;
  name: string;
  sql: string;
}

export interface OpenPostgresOptions extends PoolConfig {
  migrate?: boolean;
}

/** Executor: either the pool (autocommit) or the client pinned to a transaction. */
export type PostgresExecutor = Pool | PoolClient;

/** PostgreSQL error code for a unique-constraint violation. */
export const PG_UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === PG_UNIQUE_VIOLATION;
}

export class PostgresDb {
  readonly pool: Pool;
  private readonly pinned = new AsyncLocalStorage<PoolClient>();

  private constructor(pool: Pool) {
    this.pool = pool;
  }

  static async open(options: OpenPostgresOptions): Promise<PostgresDb> {
    const { migrate: shouldMigrate = true, ...poolConfig } = options;
    const db = new PostgresDb(new Pool(poolConfig));
    try {
      await db.pool.query('SELECT 1');
      if (shouldMigrate) await migratePostgres(db.pool);
      return db;
    } catch (err) {
      await db.pool.end().catch(() => undefined);
      throw err;
    }
  }

  /**
   * The connection the current async context must use. Inside `transaction`
   * this is the checked-out client, so every nested read and write — however
   * deep the await chain — sees and extends that transaction.
   */
  executor(): PostgresExecutor {
    return this.pinned.getStore() ?? this.pool;
  }

  inTransaction(): boolean {
    return this.pinned.getStore() !== undefined;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Run `fn` inside a transaction on one checked-out client. Nested calls
   * reuse the pinned client instead of opening a second transaction, matching
   * the SQLite adapter (a nested call joins the outer transaction, so an inner
   * failure rolls the whole unit back).
   */
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const existing = this.pinned.getStore();
    if (existing) return fn(existing);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.pinned.run(client, () => fn(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

export async function postgresOne<T extends QueryResultRow>(
  client: PostgresExecutor,
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | undefined> {
  const result = await client.query<T>(sql, [...params]);
  return result.rows[0];
}

export async function postgresMany<T extends QueryResultRow>(
  client: PostgresExecutor,
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  return (await client.query<T>(sql, [...params])).rows;
}

export async function postgresRun(
  client: PostgresExecutor,
  sql: string,
  params: readonly unknown[] = [],
): Promise<{ changes: number }> {
  const result = await client.query(sql, [...params]);
  return { changes: result.rowCount ?? 0 };
}

export async function migratePostgres(pool: Pool): Promise<number> {
  const client = await pool.connect();
  try {
    // One migrator per database. The lock is session-scoped and survives the
    // per-migration transaction boundaries below.
    await client.query("SELECT pg_advisory_lock(hashtext('clipsubtitles:migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
    const applied = new Set(
      (await client.query<{ version: number }>('SELECT version FROM schema_migrations')).rows.map(
        (row) => row.version,
      ),
    );
    let count = 0;
    for (const migration of POSTGRES_MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, $3)',
          [migration.version, migration.name, new Date().toISOString()],
        );
        await client.query('COMMIT');
        count += 1;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    }
    return count;
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext('clipsubtitles:migrations'))")
      .catch(() => undefined);
    client.release();
  }
}

/**
 * PostgreSQL starts from the current logical schema rather than replaying the
 * SQLite-only table rebuild used by migration 2. Timestamps and validated JSON
 * intentionally remain TEXT during the cutover so public record mapping stays
 * byte-compatible; typed columns can be introduced in a later online migration.
 *
 * `credit_ledger.seq` and `audit_events.seq` replace SQLite's `rowid` as the
 * insertion-order tiebreaker for descending listings.
 */
export const POSTGRES_MIGRATIONS: PostgresMigration[] = [
  {
    version: 1,
    name: 'initial_current_schema',
    sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY, subject TEXT NOT NULL UNIQUE, email TEXT, display_name TEXT, created_at TEXT NOT NULL
);
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL UNIQUE REFERENCES users(id), name TEXT NOT NULL,
  retention_source_days INTEGER NOT NULL DEFAULT 30, retention_export_days INTEGER NOT NULL DEFAULT 7,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id), idp_session_id TEXT, created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL, last_seen_at TEXT, revoked_at TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE oauth_grants (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  client_id TEXT NOT NULL, client_name TEXT, scopes_json TEXT NOT NULL, created_at TEXT NOT NULL,
  last_used_at TEXT, revoked_at TEXT, UNIQUE(user_id, client_id)
);
CREATE TABLE revoked_tokens (jti TEXT PRIMARY KEY, expires_at TEXT NOT NULL);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), title TEXT NOT NULL, status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, content_hash TEXT NOT NULL, language TEXT, source_asset_id TEXT,
  current_revision_id TEXT, style_json TEXT NOT NULL, segmentation_json TEXT NOT NULL, pages_json TEXT NOT NULL,
  manual_breaks_json TEXT NOT NULL DEFAULT '[]', manual_joins_json TEXT NOT NULL DEFAULT '[]', qa_json TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX projects_workspace ON projects(workspace_id, deleted_at, updated_at);
CREATE TABLE source_assets (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL, origin TEXT NOT NULL, storage_key TEXT, file_name TEXT, mime_type TEXT, bytes BIGINT,
  duration_ms INTEGER, width INTEGER, height INTEGER, fps DOUBLE PRECISION, has_audio INTEGER, sha256 TEXT,
  source_url TEXT, truth_key TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT, purged_at TEXT
);
CREATE INDEX assets_project ON source_assets(project_id);
CREATE INDEX assets_expiry ON source_assets(expires_at, purged_at);
CREATE TABLE uploads (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), project_id TEXT NOT NULL REFERENCES projects(id),
  asset_id TEXT NOT NULL REFERENCES source_assets(id), token_hash TEXT NOT NULL UNIQUE, max_bytes BIGINT NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, completed_at TEXT
);
CREATE TABLE transcript_revisions (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), revision_number INTEGER NOT NULL,
  source TEXT NOT NULL, provider TEXT NOT NULL, model TEXT, language TEXT NOT NULL, words_json TEXT NOT NULL,
  word_count INTEGER NOT NULL, duration_ms INTEGER NOT NULL, fallback_from TEXT, parent_revision_id TEXT,
  created_at TEXT NOT NULL, UNIQUE(project_id, revision_number)
);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), project_id TEXT, kind TEXT NOT NULL,
  status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, stage TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3, idempotency_key TEXT, input_json TEXT NOT NULL, result_json TEXT,
  error_json TEXT, cancel_requested INTEGER NOT NULL DEFAULT 0, lease_owner TEXT, lease_expires_at TEXT,
  run_after TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, started_at TEXT, finished_at TEXT
);
CREATE INDEX tasks_queue ON tasks(status, run_after);
CREATE INDEX tasks_workspace ON tasks(workspace_id, created_at);
CREATE INDEX tasks_project ON tasks(project_id, created_at);
CREATE UNIQUE INDEX tasks_idempotency ON tasks(workspace_id, kind, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE render_quotes (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), project_id TEXT NOT NULL REFERENCES projects(id),
  project_version INTEGER NOT NULL, content_hash TEXT NOT NULL, settings_json TEXT NOT NULL,
  expected_outputs_json TEXT NOT NULL, duration_ms INTEGER NOT NULL, billable_minutes DOUBLE PRECISION NOT NULL,
  credit_cost INTEGER NOT NULL, price_version TEXT NOT NULL, status TEXT NOT NULL, invalidated_reason TEXT,
  consumed_by_task_id TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX quotes_project ON render_quotes(project_id, status);
CREATE TABLE credit_accounts (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id), available INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0), updated_at TEXT NOT NULL
);
CREATE TABLE credit_reservations (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), quote_id TEXT NOT NULL UNIQUE,
  task_id TEXT NOT NULL UNIQUE, amount INTEGER NOT NULL CHECK (amount >= 0), status TEXT NOT NULL,
  settled_amount INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE credit_ledger (
  id TEXT PRIMARY KEY, seq BIGSERIAL, workspace_id TEXT NOT NULL REFERENCES workspaces(id), kind TEXT NOT NULL,
  amount INTEGER NOT NULL, available_after INTEGER NOT NULL, reserved_after INTEGER NOT NULL, task_id TEXT,
  quote_id TEXT, reservation_id TEXT, idempotency_key TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL,
  UNIQUE(workspace_id, idempotency_key)
);
CREATE INDEX ledger_workspace ON credit_ledger(workspace_id, created_at);
CREATE TABLE exports (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), project_id TEXT NOT NULL REFERENCES projects(id),
  task_id TEXT NOT NULL, kind TEXT NOT NULL, storage_key TEXT NOT NULL, file_name TEXT NOT NULL, mime_type TEXT NOT NULL,
  bytes BIGINT NOT NULL, sha256 TEXT NOT NULL, width INTEGER, height INTEGER, duration_ms INTEGER,
  project_version INTEGER NOT NULL, content_hash TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL, purged_at TEXT
);
CREATE INDEX exports_project ON exports(project_id, created_at);
CREATE INDEX exports_task ON exports(task_id);
CREATE INDEX exports_expiry ON exports(expires_at, purged_at);
CREATE TABLE idempotency_keys (
  workspace_id TEXT NOT NULL, scope TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL,
  status TEXT NOT NULL, status_code INTEGER, response_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, scope, key)
);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY, seq BIGSERIAL, workspace_id TEXT, actor_type TEXT NOT NULL, actor_id TEXT, action TEXT NOT NULL,
  target_type TEXT, target_id TEXT, outcome TEXT NOT NULL, error_ref TEXT, metadata_json TEXT, created_at TEXT NOT NULL
);
CREATE INDEX audit_workspace ON audit_events(workspace_id, created_at);
CREATE TABLE task_dispatch_outbox (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE, available_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, last_error_code TEXT, delivered_at TEXT, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX task_dispatch_pending ON task_dispatch_outbox(delivered_at, available_at, updated_at);
`,
  },
  {
    version: 2,
    name: 'hardened_direct_uploads',
    sql: `
ALTER TABLE uploads ADD COLUMN transport TEXT NOT NULL DEFAULT 'proxy';
ALTER TABLE uploads ADD COLUMN storage_key TEXT;
ALTER TABLE uploads ADD COLUMN expected_bytes BIGINT;
ALTER TABLE uploads ADD COLUMN expected_mime_type TEXT;
ALTER TABLE uploads ADD COLUMN expected_sha256 TEXT;
ALTER TABLE uploads ADD COLUMN purged_at TEXT;
CREATE INDEX uploads_expired_direct ON uploads(transport, completed_at, purged_at, expires_at);
`,
  },
];
