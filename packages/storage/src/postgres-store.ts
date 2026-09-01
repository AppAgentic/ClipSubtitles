import type { LedgerEntry, TaskError, TaskKind } from '@clipsubtitles/contracts';
import { newId } from '@clipsubtitles/core';
import type { Row } from './db';
import { StorageError } from './errors';
import {
  PostgresDb,
  postgresMany,
  postgresOne,
  postgresRun,
  type OpenPostgresOptions,
  type PostgresExecutor,
} from './postgres';
import {
  toAsset,
  toUpload,
  type AssetPatch,
  type AssetRecord,
  type UploadRecord,
} from './repos/assets';
import { toEvent, type AuditEventInput, type AuditEventRecord } from './repos/audit';
import {
  toBillingAccount,
  toBillingEvent,
  toCreditPool,
  type BillingAccountRecord,
  type BillingEventRecord,
  type CreditPoolRecord,
} from './repos/billing';
import {
  toLedger,
  toReservation,
  type CreditBalanceRecord,
  type ReservationRecord,
} from './repos/credits';
import { toExport, type ExportRecord } from './repos/exports';
import type { IdempotencyBegin } from './repos/idempotency';
import {
  toGrant,
  toSession,
  toUser,
  toWorkspace,
  type GrantRecord,
  type SessionRecord,
  type UserRecord,
  type WorkspaceRecord,
} from './repos/identity';
import { toProject, toRevision, type ProjectRecord, type RevisionRecord } from './repos/projects';
import { effectiveStatus, toQuote, type QuoteRecord } from './repos/quotes';
import {
  toDispatchOutbox,
  toTask,
  type DispatchOutboxRecord,
  type TaskRecord,
} from './repos/tasks';
import type { DataStore } from './store';

/**
 * `int8` columns arrive as strings from `pg` (they can exceed Number.MAX_SAFE_INTEGER).
 * Every one of ours is a byte count or a monotonic sequence well inside the safe
 * range, so they are narrowed here and the shared row mappers stay driver-agnostic.
 */
const BIGINT_COLUMNS = new Set(['bytes', 'max_bytes', 'expected_bytes', 'seq']);

/** Normalize node-postgres `int8` strings before shared row mapping. */
export function normalizePostgresRow(row: Record<string, unknown>): Row {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] =
      typeof value === 'bigint'
        ? Number(value)
        : typeof value === 'string' && BIGINT_COLUMNS.has(key)
          ? Number(value)
          : value;
  }
  return out as Row;
}

const pgRow = normalizePostgresRow;

function pgRows(rows: Array<Record<string, unknown>>): Row[] {
  return rows.map(normalizePostgresRow);
}

function maybe<T>(row: Record<string, unknown> | undefined, map: (r: Row) => T): T | null {
  return row ? map(normalizePostgresRow(row)) : null;
}

type Sql = Record<string, unknown>;

/**
 * PostgreSQL adapter.
 *
 * Every invariant that SQLite enforced through a single-writer `BEGIN
 * IMMEDIATE` is enforced here explicitly: guarded updates (`WHERE status = …`)
 * for single-transition claims, `SELECT … FOR UPDATE` where a read-modify-write
 * must not lose an update, `FOR UPDATE SKIP LOCKED` where concurrent workers
 * must take disjoint rows, and unique indexes plus `ON CONFLICT` for
 * idempotent inserts.
 */
export class PostgresStore implements DataStore {
  readonly driver = 'postgres' as const;

  constructor(readonly db: PostgresDb) {}

  static async open(options: OpenPostgresOptions): Promise<PostgresStore> {
    return new PostgresStore(await PostgresDb.open(options));
  }

  private get x(): PostgresExecutor {
    return this.db.executor();
  }

  transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.db.transaction(() => fn());
  }

  close(): Promise<void> {
    return this.db.close();
  }

  private one<T extends Sql>(sql: string, params: readonly unknown[] = []) {
    return postgresOne<T>(this.x, sql, params);
  }

  private many<T extends Sql>(sql: string, params: readonly unknown[] = []) {
    return postgresMany<T>(this.x, sql, params);
  }

  private run(sql: string, params: readonly unknown[] = []) {
    return postgresRun(this.x, sql, params);
  }

  // --- identity ---------------------------------------------------------------

  async ensureUserWorkspace(
    input: Parameters<DataStore['ensureUserWorkspace']>[0],
  ): Promise<{ user: UserRecord; workspace: WorkspaceRecord; created: boolean }> {
    return this.transaction(async () => {
      // Concurrent first sign-ins for one subject: the loser's insert waits on
      // the unique index, then reads the winner's committed rows.
      const inserted = await this.one<Sql>(
        `INSERT INTO users (id, subject, email, display_name, created_at)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (subject) DO NOTHING RETURNING *`,
        [newId('user'), input.subject, input.email ?? null, input.displayName ?? null, input.now],
      );
      if (!inserted) {
        const existing = await this.one<Sql>('SELECT * FROM users WHERE subject = $1', [
          input.subject,
        ]);
        if (!existing) throw new StorageError('INVALID_STATE', 'User vanished during sign-in.');
        const user = toUser(pgRow(existing));
        const ws = await this.one<Sql>('SELECT * FROM workspaces WHERE owner_user_id = $1', [
          user.id,
        ]);
        if (!ws) throw new StorageError('INVALID_STATE', 'User exists without a workspace.');
        return { user, workspace: toWorkspace(pgRow(ws)), created: false };
      }
      const user = toUser(pgRow(inserted));
      const workspaceId = newId('workspace');
      const retention = input.defaultRetention ?? { sourceDays: 30, exportDays: 7 };
      const ws = await this.one<Sql>(
        `INSERT INTO workspaces (id, owner_user_id, name, retention_source_days, retention_export_days, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING *`,
        [
          workspaceId,
          user.id,
          input.workspaceName ?? 'Personal workspace',
          retention.sourceDays,
          retention.exportDays,
          input.now,
        ],
      );
      await this.run(
        'INSERT INTO credit_accounts (workspace_id, available, reserved, updated_at) VALUES ($1, $2, 0, $3)',
        [workspaceId, input.initialCredits, input.now],
      );
      await this.run(
        "INSERT INTO billing_accounts (workspace_id, plan_id, status, updated_at) VALUES ($1, 'free', 'free', $2)",
        [workspaceId, input.now],
      );
      if (input.initialCredits > 0) {
        await this.run(
          `INSERT INTO credit_pools (id, workspace_id, kind, original_amount, available, reserved, idempotency_key, note, created_at)
           VALUES ($1, $2, 'free', $3, $3, 0, $4, $5, $6)`,
          [newId('pool'), workspaceId, input.initialCredits, `grant:initial:${workspaceId}`, 'Free lifetime credit grant', input.now],
        );
        await this.run(
          `INSERT INTO credit_ledger (id, workspace_id, kind, amount, available_after, reserved_after, idempotency_key, note, created_at)
           VALUES ($1, $2, 'grant', $3, $3, 0, $4, $5, $6)`,
          [
            newId('ledger'),
            workspaceId,
            input.initialCredits,
            `grant:initial:${workspaceId}`,
            'Free lifetime credit grant',
            input.now,
          ],
        );
      }
      return { user, workspace: toWorkspace(pgRow(ws as Sql)), created: true };
    });
  }

  async getUser(userId: string): Promise<UserRecord | null> {
    return maybe(await this.one<Sql>('SELECT * FROM users WHERE id = $1', [userId]), toUser);
  }

  async getUserBySubject(subject: string): Promise<UserRecord | null> {
    return maybe(await this.one<Sql>('SELECT * FROM users WHERE subject = $1', [subject]), toUser);
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    return maybe(
      await this.one<Sql>('SELECT * FROM workspaces WHERE id = $1', [workspaceId]),
      toWorkspace,
    );
  }

  async updateWorkspace(
    workspaceId: string,
    patch: Parameters<DataStore['updateWorkspace']>[1],
    now: string,
  ): Promise<WorkspaceRecord> {
    return this.transaction(async () => {
      const current = await this.one<Sql>('SELECT * FROM workspaces WHERE id = $1 FOR UPDATE', [
        workspaceId,
      ]);
      if (!current) throw new StorageError('NOT_FOUND', 'Workspace not found.');
      const ws = toWorkspace(pgRow(current));
      const updated = await this.one<Sql>(
        `UPDATE workspaces SET name = $2, retention_source_days = $3, retention_export_days = $4, updated_at = $5
         WHERE id = $1 RETURNING *`,
        [
          workspaceId,
          patch.name ?? ws.name,
          patch.retention?.sourceDays ?? ws.retention.sourceDays,
          patch.retention?.exportDays ?? ws.retention.exportDays,
          now,
        ],
      );
      return toWorkspace(pgRow(updated as Sql));
    });
  }

  async createSession(input: Parameters<DataStore['createSession']>[0]): Promise<SessionRecord> {
    const row = await this.one<Sql>(
      `INSERT INTO sessions (id, token_hash, user_id, workspace_id, idp_session_id, created_at, expires_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $6) RETURNING *`,
      [
        newId('session'),
        input.tokenHash,
        input.userId,
        input.workspaceId,
        input.idpSessionId ?? null,
        input.now,
        input.expiresAt,
      ],
    );
    return toSession(pgRow(row as Sql));
  }

  async findActiveSession(tokenHash: string, now: string): Promise<SessionRecord | null> {
    const row = await this.one<Sql>('SELECT * FROM sessions WHERE token_hash = $1', [tokenHash]);
    if (!row) return null;
    const session = toSession(pgRow(row));
    if (session.revokedAt || session.expiresAt <= now) return null;
    return session;
  }

  async touchSession(id: string, now: string): Promise<void> {
    await this.run('UPDATE sessions SET last_seen_at = $2 WHERE id = $1', [id, now]);
  }

  async revokeSession(id: string, now: string): Promise<boolean> {
    return (
      (
        await this.run('UPDATE sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL', [
          id,
          now,
        ])
      ).changes > 0
    );
  }

  async revokeSessionsForUser(userId: string, now: string): Promise<number> {
    return (
      await this.run(
        'UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
        [userId, now],
      )
    ).changes;
  }

  async revokeSessionsByIdpSessionId(idpSessionId: string, now: string): Promise<number> {
    return (
      await this.run(
        'UPDATE sessions SET revoked_at = $2 WHERE idp_session_id = $1 AND revoked_at IS NULL',
        [idpSessionId, now],
      )
    ).changes;
  }

  async ensureGrant(input: Parameters<DataStore['ensureGrant']>[0]): Promise<GrantRecord> {
    const inserted = await this.one<Sql>(
      `INSERT INTO oauth_grants (id, user_id, workspace_id, client_id, client_name, scopes_json, created_at, last_used_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (user_id, client_id) DO NOTHING RETURNING *`,
      [
        newId('grant'),
        input.userId,
        input.workspaceId,
        input.clientId,
        input.clientName ?? null,
        JSON.stringify(input.scopes),
        input.now,
      ],
    );
    if (inserted) return toGrant(pgRow(inserted));
    const existing = await this.one<Sql>(
      'SELECT * FROM oauth_grants WHERE user_id = $1 AND client_id = $2',
      [input.userId, input.clientId],
    );
    if (!existing) throw new StorageError('INVALID_STATE', 'Grant vanished during creation.');
    return toGrant(pgRow(existing));
  }

  async touchGrant(id: string, now: string): Promise<void> {
    await this.run('UPDATE oauth_grants SET last_used_at = $2 WHERE id = $1', [id, now]);
  }

  async listGrants(workspaceId: string): Promise<GrantRecord[]> {
    return pgRows(
      await this.many<Sql>(
        'SELECT * FROM oauth_grants WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 100',
        [workspaceId],
      ),
    ).map(toGrant);
  }

  async getGrant(workspaceId: string, id: string): Promise<GrantRecord | null> {
    return maybe(
      await this.one<Sql>('SELECT * FROM oauth_grants WHERE id = $1 AND workspace_id = $2', [
        id,
        workspaceId,
      ]),
      toGrant,
    );
  }

  async revokeGrant(workspaceId: string, id: string, now: string): Promise<boolean> {
    return (
      (
        await this.run(
          'UPDATE oauth_grants SET revoked_at = $3 WHERE id = $1 AND workspace_id = $2 AND revoked_at IS NULL',
          [id, workspaceId, now],
        )
      ).changes > 0
    );
  }

  async revokeGrantsForUser(userId: string, now: string): Promise<number> {
    return (
      await this.run(
        'UPDATE oauth_grants SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
        [userId, now],
      )
    ).changes;
  }

  async revokeToken(jti: string, expiresAt: string): Promise<void> {
    await this.run(
      'INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, $2) ON CONFLICT (jti) DO UPDATE SET expires_at = EXCLUDED.expires_at',
      [jti, expiresAt],
    );
  }

  async isTokenRevoked(jti: string): Promise<boolean> {
    return Boolean(await this.one<Sql>('SELECT jti FROM revoked_tokens WHERE jti = $1', [jti]));
  }

  async purgeExpiredRevokedTokens(now: string): Promise<number> {
    return (await this.run('DELETE FROM revoked_tokens WHERE expires_at < $1', [now])).changes;
  }

  // --- projects ---------------------------------------------------------------

  async createProject(input: Parameters<DataStore['createProject']>[0]): Promise<ProjectRecord> {
    const row = await this.one<Sql>(
      `INSERT INTO projects (id, workspace_id, title, status, version, content_hash, language, style_json, segmentation_json, pages_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, '[]', $9, $9) RETURNING *`,
      [
        newId('project'),
        input.workspaceId,
        input.title,
        input.status,
        input.contentHash,
        input.language ?? null,
        JSON.stringify(input.style),
        JSON.stringify(input.segmentation),
        input.now,
      ],
    );
    return toProject(pgRow(row as Sql));
  }

  async getProject(workspaceId: string, id: string): Promise<ProjectRecord | null> {
    return maybe(
      await this.one<Sql>(
        'SELECT * FROM projects WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL',
        [id, workspaceId],
      ),
      toProject,
    );
  }

  async getProjectById(id: string): Promise<ProjectRecord | null> {
    return maybe(
      await this.one<Sql>('SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL', [id]),
      toProject,
    );
  }

  async listProjects(workspaceId: string, limit = 100): Promise<ProjectRecord[]> {
    return pgRows(
      await this.many<Sql>(
        'SELECT * FROM projects WHERE workspace_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT $2',
        [workspaceId, limit],
      ),
    ).map(toProject);
  }

  async commitProjectEdit(
    input: Parameters<DataStore['commitProjectEdit']>[0],
  ): Promise<ProjectRecord> {
    return this.transaction(async () => {
      const locked = await this.one<Sql>(
        'SELECT * FROM projects WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL FOR UPDATE',
        [input.id, input.workspaceId],
      );
      if (!locked) throw new StorageError('NOT_FOUND', 'Project not found.');
      const current = toProject(pgRow(locked));
      if (current.version !== input.expectedVersion) {
        throw new StorageError(
          'VERSION_CONFLICT',
          `Expected version ${input.expectedVersion}, current is ${current.version}.`,
        );
      }
      const p = input.patch;
      const updated = await this.one<Sql>(
        `UPDATE projects SET title = $4, language = $5, status = $6, style_json = $7, segmentation_json = $8,
           pages_json = $9, manual_breaks_json = $10, manual_joins_json = $11, qa_json = $12, content_hash = $13,
           current_revision_id = $14, version = version + 1, updated_at = $15
         WHERE id = $1 AND workspace_id = $2 AND version = $3 RETURNING *`,
        [
          input.id,
          input.workspaceId,
          input.expectedVersion,
          p.title ?? current.title,
          p.language ?? current.language ?? null,
          p.status ?? current.status,
          JSON.stringify(p.style ?? current.style),
          JSON.stringify(p.segmentation ?? current.segmentation),
          JSON.stringify(p.pages ?? current.pages),
          JSON.stringify(p.manualBreaks ?? current.manualBreaks),
          JSON.stringify(p.manualJoins ?? current.manualJoins),
          p.qa === undefined
            ? current.qa
              ? JSON.stringify(current.qa)
              : null
            : p.qa
              ? JSON.stringify(p.qa)
              : null,
          p.contentHash,
          p.currentRevisionId ?? current.currentRevisionId ?? null,
          input.now,
        ],
      );
      if (!updated) throw new StorageError('VERSION_CONFLICT', 'Project changed concurrently.');
      return toProject(pgRow(updated));
    });
  }

  async updateProjectMeta(
    id: string,
    patch: Parameters<DataStore['updateProjectMeta']>[1],
    now: string,
  ): Promise<ProjectRecord | null> {
    return this.transaction(async () => {
      const locked = await this.one<Sql>(
        'SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [id],
      );
      if (!locked) return null;
      const current = toProject(pgRow(locked));
      const updated = await this.one<Sql>(
        'UPDATE projects SET status = $2, source_asset_id = $3, language = $4, title = $5, updated_at = $6 WHERE id = $1 RETURNING *',
        [
          id,
          patch.status ?? current.status,
          patch.sourceAssetId === undefined ? (current.sourceAssetId ?? null) : patch.sourceAssetId,
          patch.language ?? current.language ?? null,
          patch.title ?? current.title,
          now,
        ],
      );
      return maybe(updated, toProject);
    });
  }

  async softDeleteProject(workspaceId: string, id: string, now: string): Promise<boolean> {
    return (
      (
        await this.run(
          'UPDATE projects SET deleted_at = $3, updated_at = $3 WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL',
          [id, workspaceId, now],
        )
      ).changes > 0
    );
  }

  async createRevision(input: Parameters<DataStore['createRevision']>[0]): Promise<RevisionRecord> {
    return this.transaction(async () => {
      // Serialize numbering per project: two concurrent revisions must get two
      // distinct numbers, not one unique-violation and one success.
      await this.one<Sql>('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [input.projectId]);
      const row = await this.one<Sql>(
        `INSERT INTO transcript_revisions (id, project_id, revision_number, source, provider, model, language, words_json, word_count, duration_ms, fallback_from, parent_revision_id, created_at)
         VALUES ($1, $2,
           (SELECT COALESCE(MAX(revision_number), 0) + 1 FROM transcript_revisions WHERE project_id = $2),
           $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          newId('revision'),
          input.projectId,
          input.source,
          input.provider,
          input.model ?? null,
          input.language,
          JSON.stringify(input.words),
          input.words.length,
          input.durationMs,
          input.fallbackFrom ?? null,
          input.parentRevisionId ?? null,
          input.now,
        ],
      );
      return toRevision(pgRow(row as Sql));
    });
  }

  async getRevision(projectId: string, id: string): Promise<RevisionRecord | null> {
    return maybe(
      await this.one<Sql>('SELECT * FROM transcript_revisions WHERE id = $1 AND project_id = $2', [
        id,
        projectId,
      ]),
      toRevision,
    );
  }

  async listRevisions(projectId: string, limit = 50): Promise<RevisionRecord[]> {
    return pgRows(
      await this.many<Sql>(
        'SELECT * FROM transcript_revisions WHERE project_id = $1 ORDER BY revision_number DESC LIMIT $2',
        [projectId, limit],
      ),
    ).map(toRevision);
  }

  async countProjects(workspaceId: string): Promise<number> {
    const row = await this.one<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM projects WHERE workspace_id = $1 AND deleted_at IS NULL',
      [workspaceId],
    );
    return row?.n ?? 0;
  }

  // --- assets and uploads -----------------------------------------------------

  async createAsset(input: Parameters<DataStore['createAsset']>[0]): Promise<AssetRecord> {
    const row = await this.one<Sql>(
      `INSERT INTO source_assets (id, workspace_id, project_id, status, origin, file_name, mime_type, source_url, truth_key, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING *`,
      [
        newId('asset'),
        input.workspaceId,
        input.projectId,
        input.status,
        input.origin,
        input.fileName ?? null,
        input.mimeType ?? null,
        input.sourceUrl ?? null,
        input.truthKey ?? null,
        input.now,
      ],
    );
    return toAsset(pgRow(row as Sql));
  }

  async updateAsset(id: string, patch: AssetPatch, now: string): Promise<AssetRecord | null> {
    return this.transaction(async () => {
      const locked = await this.one<Sql>('SELECT * FROM source_assets WHERE id = $1 FOR UPDATE', [
        id,
      ]);
      if (!locked) return null;
      const merged = { ...toAsset(pgRow(locked)), ...patch };
      const updated = await this.one<Sql>(
        `UPDATE source_assets SET status = $2, storage_key = $3, file_name = $4, mime_type = $5, bytes = $6,
           duration_ms = $7, width = $8, height = $9, fps = $10, has_audio = $11, sha256 = $12,
           expires_at = $13, truth_key = $14, updated_at = $15
         WHERE id = $1 RETURNING *`,
        [
          id,
          merged.status,
          merged.storageKey ?? null,
          merged.fileName ?? null,
          merged.mimeType ?? null,
          merged.bytes ?? null,
          merged.durationMs ?? null,
          merged.width ?? null,
          merged.height ?? null,
          merged.fps ?? null,
          merged.hasAudio === undefined ? null : merged.hasAudio ? 1 : 0,
          merged.sha256 ?? null,
          merged.expiresAt ?? null,
          merged.truthKey ?? null,
          now,
        ],
      );
      return maybe(updated, toAsset);
    });
  }

  async claimAssetForImport(id: string, now: string): Promise<boolean> {
    const row = await this.one<Sql>(
      `UPDATE source_assets SET status = 'importing', updated_at = $2
       WHERE id = $1 AND status = 'pending_upload' RETURNING id`,
      [id, now],
    );
    return Boolean(row);
  }

  async getAsset(workspaceId: string, id: string): Promise<AssetRecord | null> {
    return maybe(
      await this.one<Sql>('SELECT * FROM source_assets WHERE id = $1 AND workspace_id = $2', [
        id,
        workspaceId,
      ]),
      toAsset,
    );
  }

  async getAssetById(id: string): Promise<AssetRecord | null> {
    return maybe(await this.one<Sql>('SELECT * FROM source_assets WHERE id = $1', [id]), toAsset);
  }

  async listAssetsForProject(projectId: string): Promise<AssetRecord[]> {
    return pgRows(
      await this.many<Sql>(
        'SELECT * FROM source_assets WHERE project_id = $1 ORDER BY created_at DESC',
        [projectId],
      ),
    ).map(toAsset);
  }

  async listExpiredAssets(now: string, limit = 100): Promise<AssetRecord[]> {
    return pgRows(
      await this.many<Sql>(
        `SELECT * FROM source_assets WHERE purged_at IS NULL AND expires_at IS NOT NULL AND expires_at < $1
           AND status IN ('ready','failed') LIMIT $2`,
        [now, limit],
      ),
    ).map(toAsset);
  }

  async markAssetPurged(id: string, now: string): Promise<boolean> {
    return (
      (
        await this.run(
          "UPDATE source_assets SET status = 'purged', purged_at = $2, storage_key = NULL, updated_at = $2 WHERE id = $1 AND purged_at IS NULL",
          [id, now],
        )
      ).changes > 0
    );
  }

  async createUpload(input: Parameters<DataStore['createUpload']>[0]): Promise<UploadRecord> {
    const row = await this.one<Sql>(
      `INSERT INTO uploads (id, workspace_id, project_id, asset_id, token_hash, max_bytes, transport, storage_key, expected_bytes, expected_mime_type, expected_sha256, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        input.id ?? newId('upload'),
        input.workspaceId,
        input.projectId,
        input.assetId,
        input.tokenHash,
        input.maxBytes,
        input.transport ?? 'proxy',
        input.storageKey ?? null,
        input.expectedBytes ?? null,
        input.expectedMimeType ?? null,
        input.expectedSha256 ?? null,
        input.now,
        input.expiresAt,
      ],
    );
    return toUpload(pgRow(row as Sql));
  }

  async findUploadByTokenHash(tokenHash: string): Promise<UploadRecord | null> {
    return maybe(
      await this.one<Sql>('SELECT * FROM uploads WHERE token_hash = $1', [tokenHash]),
      toUpload,
    );
  }

  async getUpload(workspaceId: string, id: string): Promise<UploadRecord | null> {
    return maybe(
      await this.one<Sql>('SELECT * FROM uploads WHERE id = $1 AND workspace_id = $2', [
        id,
        workspaceId,
      ]),
      toUpload,
    );
  }

  async listUploadsForProject(projectId: string): Promise<UploadRecord[]> {
    return pgRows(
      await this.many<Sql>('SELECT * FROM uploads WHERE project_id = $1 ORDER BY created_at', [
        projectId,
      ]),
    ).map(toUpload);
  }

  async listExpiredDirectUploads(now: string, limit = 100): Promise<UploadRecord[]> {
    return pgRows(
      await this.many<Sql>(
        "SELECT * FROM uploads WHERE transport = 'direct' AND completed_at IS NULL AND purged_at IS NULL AND expires_at < $1 ORDER BY expires_at LIMIT $2",
        [now, limit],
      ),
    ).map(toUpload);
  }

  async markUploadPurged(id: string, now: string): Promise<boolean> {
    return (
      (await this.run('UPDATE uploads SET purged_at = $2 WHERE id = $1 AND purged_at IS NULL', [id, now]))
        .changes > 0
    );
  }

  /** Exactly one concurrent PUT may claim an upload target. */
  async completeUpload(id: string, now: string): Promise<boolean> {
    return (
      (
        await this.run(
          'UPDATE uploads SET completed_at = $2 WHERE id = $1 AND completed_at IS NULL',
          [id, now],
        )
      ).changes > 0
    );
  }

  // --- durable tasks ----------------------------------------------------------

  async enqueueTask(input: Parameters<DataStore['enqueueTask']>[0]): Promise<TaskRecord> {
    return this.transaction(async () => {
      const runAfter = input.runAfter ?? input.now;
      const inserted = await this.one<Sql>(
        `INSERT INTO tasks (id, workspace_id, project_id, kind, status, progress, attempts, max_attempts, idempotency_key, input_json, run_after, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'queued', 0, 0, $5, $6, $7, $8, $9, $9)
         ON CONFLICT (workspace_id, kind, idempotency_key) WHERE idempotency_key IS NOT NULL
         DO NOTHING RETURNING *`,
        [
          newId('task'),
          input.workspaceId,
          input.projectId ?? null,
          input.kind,
          input.maxAttempts ?? 3,
          input.idempotencyKey ?? null,
          JSON.stringify(input.input ?? {}),
          runAfter,
          input.now,
        ],
      );
      if (!inserted) {
        // Lost the idempotent race: the winner is committed by the time the
        // conflicting insert returns, so this read always finds it.
        const existing = input.idempotencyKey
          ? await this.findTaskByIdempotencyKey(input.workspaceId, input.kind, input.idempotencyKey)
          : null;
        if (!existing) throw new StorageError('INVALID_STATE', 'Task insert produced no row.');
        return existing;
      }
      const task = toTask(pgRow(inserted));
      await this.run(
        `INSERT INTO task_dispatch_outbox (task_id, available_at, attempts, created_at, updated_at)
         VALUES ($1, $2, 0, $3, $3) ON CONFLICT (task_id) DO NOTHING`,
        [task.id, runAfter, input.now],
      );
      return task;
    });
  }

  async findTaskByIdempotencyKey(
    workspaceId: string,
    kind: TaskKind,
    key: string,
  ): Promise<TaskRecord | null> {
    return maybe(
      await this.one<Sql>(
        'SELECT * FROM tasks WHERE workspace_id = $1 AND kind = $2 AND idempotency_key = $3',
        [workspaceId, kind, key],
      ),
      toTask,
    );
  }

  async getTask(workspaceId: string, id: string): Promise<TaskRecord | null> {
    return maybe(
      await this.one<Sql>('SELECT * FROM tasks WHERE id = $1 AND workspace_id = $2', [
        id,
        workspaceId,
      ]),
      toTask,
    );
  }

  async getTaskById(id: string): Promise<TaskRecord | null> {
    return maybe(await this.one<Sql>('SELECT * FROM tasks WHERE id = $1', [id]), toTask);
  }

  async listTasks(
    workspaceId: string,
    opts: Parameters<DataStore['listTasks']>[1] = {},
  ): Promise<TaskRecord[]> {
    const clauses = ['workspace_id = $1'];
    const params: unknown[] = [workspaceId];
    if (opts.projectId) {
      params.push(opts.projectId);
      clauses.push(`project_id = $${params.length}`);
    }
    if (opts.activeOnly) clauses.push("status IN ('queued','running')");
    params.push(opts.limit ?? 50);
    return pgRows(
      await this.many<Sql>(
        `SELECT * FROM tasks WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT $${params.length}`,
        params,
      ),
    ).map(toTask);
  }

  async countActiveRenderTasksForUpdate(workspaceId: string): Promise<number> {
    // Every render admission locks the same billing-account row first. This
    // prevents two concurrent transactions from both observing spare capacity.
    await this.one<Sql>(
      'SELECT workspace_id FROM billing_accounts WHERE workspace_id = $1 FOR UPDATE',
      [workspaceId],
    );
    const row = await this.one<Sql>(
      `SELECT COUNT(*)::int AS count FROM tasks
       WHERE workspace_id = $1 AND kind = 'render_export' AND status IN ('queued','running')`,
      [workspaceId],
    );
    return Number(row?.count ?? 0);
  }

  /** Concurrent workers take disjoint rows: SKIP LOCKED plus a status guard. */
  async claimNextTask(
    input: Parameters<DataStore['claimNextTask']>[0],
  ): Promise<TaskRecord | null> {
    const leaseExpires = new Date(Date.parse(input.now) + input.leaseMs).toISOString();
    const kinds = input.kinds?.length ? [...input.kinds] : null;
    const row = await this.one<Sql>(
      `WITH candidate AS (
         SELECT id FROM tasks
         WHERE status = 'queued' AND run_after <= $1
           AND ($4::text[] IS NULL OR kind = ANY($4::text[]))
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE tasks t
       SET status = 'running', lease_owner = $2, lease_expires_at = $3, attempts = t.attempts + 1,
           started_at = COALESCE(t.started_at, $1), updated_at = $1
       FROM candidate c
       WHERE t.id = c.id AND t.status = 'queued'
       RETURNING t.*`,
      [input.now, input.workerId, leaseExpires, kinds],
    );
    return maybe(row, toTask);
  }

  async claimTaskById(
    input: Parameters<DataStore['claimTaskById']>[0],
  ): Promise<TaskRecord | null> {
    const leaseExpires = new Date(Date.parse(input.now) + input.leaseMs).toISOString();
    const row = await this.one<Sql>(
      `UPDATE tasks SET status = 'running', lease_owner = $2, lease_expires_at = $3, attempts = attempts + 1,
         started_at = COALESCE(started_at, $4), updated_at = $4
       WHERE id = $1 AND status = 'queued' AND run_after <= $4 RETURNING *`,
      [input.id, input.workerId, leaseExpires, input.now],
    );
    return maybe(row, toTask);
  }

  async heartbeatTask(
    input: Parameters<DataStore['heartbeatTask']>[0],
  ): Promise<{ owned: boolean; cancelRequested: boolean }> {
    const leaseExpires = new Date(Date.parse(input.now) + input.leaseMs).toISOString();
    const row = await this.one<{ cancel_requested: number }>(
      `UPDATE tasks SET lease_expires_at = $3, progress = COALESCE($4, progress), stage = COALESCE($5, stage), updated_at = $6
       WHERE id = $1 AND status = 'running' AND lease_owner = $2
       RETURNING cancel_requested`,
      [
        input.id,
        input.workerId,
        leaseExpires,
        input.progress ?? null,
        input.stage ?? null,
        input.now,
      ],
    );
    if (row) return { owned: true, cancelRequested: row.cancel_requested === 1 };
    const current = await this.one<{ cancel_requested: number }>(
      'SELECT cancel_requested FROM tasks WHERE id = $1',
      [input.id],
    );
    return { owned: false, cancelRequested: current?.cancel_requested === 1 };
  }

  async completeTask(input: Parameters<DataStore['completeTask']>[0]): Promise<TaskRecord | null> {
    const row = await this.one<Sql>(
      `UPDATE tasks SET status = 'succeeded', progress = 100, result_json = $3, lease_owner = NULL,
         lease_expires_at = NULL, finished_at = $4, updated_at = $4
       WHERE id = $1 AND status = 'running' AND lease_owner = $2 RETURNING *`,
      [input.id, input.workerId, JSON.stringify(input.result), input.now],
    );
    return maybe(row, toTask);
  }

  async failTask(input: Parameters<DataStore['failTask']>[0]): Promise<{
    outcome: 'requeued' | 'failed' | 'not_owned';
    task: TaskRecord | null;
  }> {
    return this.transaction(async () => {
      const locked = await this.one<Sql>('SELECT * FROM tasks WHERE id = $1 FOR UPDATE', [
        input.id,
      ]);
      const current = maybe(locked, toTask);
      if (!current || current.status !== 'running' || current.leaseOwner !== input.workerId) {
        return { outcome: 'not_owned' as const, task: current };
      }
      const canRetry =
        input.error.retryable && current.attempts < current.maxAttempts && !current.cancelRequested;
      if (canRetry) {
        const runAfter = new Date(Date.parse(input.now) + (input.backoffMs ?? 0)).toISOString();
        const row = await this.one<Sql>(
          `UPDATE tasks SET status = 'queued', error_json = $2, lease_owner = NULL, lease_expires_at = NULL,
             run_after = $3, updated_at = $4 WHERE id = $1 RETURNING *`,
          [input.id, JSON.stringify(input.error), runAfter, input.now],
        );
        await this.rearmTaskDispatch(input.id, runAfter, input.now);
        return { outcome: 'requeued' as const, task: maybe(row, toTask) };
      }
      const row = await this.one<Sql>(
        `UPDATE tasks SET status = 'failed', error_json = $2, lease_owner = NULL, lease_expires_at = NULL,
           finished_at = $3, updated_at = $3 WHERE id = $1 RETURNING *`,
        [input.id, JSON.stringify(input.error), input.now],
      );
      return { outcome: 'failed' as const, task: maybe(row, toTask) };
    });
  }

  async requestCancel(
    workspaceId: string,
    id: string,
    now: string,
  ): Promise<{
    outcome: 'cancelled' | 'cancel_requested' | 'not_cancellable' | 'not_found';
    task: TaskRecord | null;
  }> {
    return this.transaction(async () => {
      const locked = await this.one<Sql>(
        'SELECT * FROM tasks WHERE id = $1 AND workspace_id = $2 FOR UPDATE',
        [id, workspaceId],
      );
      const current = maybe(locked, toTask);
      if (!current) return { outcome: 'not_found' as const, task: null };
      if (current.status === 'queued') {
        const row = await this.one<Sql>(
          `UPDATE tasks SET status = 'cancelled', cancel_requested = 1, finished_at = $2, updated_at = $2
           WHERE id = $1 AND status = 'queued' RETURNING *`,
          [id, now],
        );
        return { outcome: 'cancelled' as const, task: maybe(row, toTask) };
      }
      if (current.status === 'running') {
        const row = await this.one<Sql>(
          'UPDATE tasks SET cancel_requested = 1, updated_at = $2 WHERE id = $1 RETURNING *',
          [id, now],
        );
        return { outcome: 'cancel_requested' as const, task: maybe(row, toTask) };
      }
      return { outcome: 'not_cancellable' as const, task: current };
    });
  }

  async markCancelled(
    input: Parameters<DataStore['markCancelled']>[0],
  ): Promise<TaskRecord | null> {
    const row = await this.one<Sql>(
      `UPDATE tasks SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL,
         finished_at = $3, updated_at = $3
       WHERE id = $1 AND status = 'running' AND lease_owner = $2 RETURNING *`,
      [input.id, input.workerId, input.now],
    );
    return maybe(row, toTask);
  }

  async reclaimExpiredLeases(
    now: string,
  ): Promise<{ requeued: string[]; failed: string[]; cancelled: string[] }> {
    return this.transaction(async () => {
      const expired = pgRows(
        await this.many<Sql>(
          `SELECT * FROM tasks
           WHERE status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at < $1
           FOR UPDATE SKIP LOCKED`,
          [now],
        ),
      ).map(toTask);
      const requeued: string[] = [];
      const failed: string[] = [];
      const cancelled: string[] = [];
      for (const t of expired) {
        if (t.cancelRequested) {
          await this.run(
            `UPDATE tasks SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL,
               finished_at = $2, updated_at = $2 WHERE id = $1`,
            [t.id, now],
          );
          cancelled.push(t.id);
          continue;
        }
        if (t.attempts < t.maxAttempts) {
          await this.run(
            `UPDATE tasks SET status = 'queued', lease_owner = NULL, lease_expires_at = NULL,
               run_after = $2, updated_at = $2 WHERE id = $1`,
            [t.id, now],
          );
          await this.rearmTaskDispatch(t.id, now, now);
          requeued.push(t.id);
        } else {
          const error: TaskError = {
            code: 'INTERNAL',
            message: 'Worker lost the task lease and no attempts remain.',
            retryable: false,
          };
          await this.run(
            `UPDATE tasks SET status = 'failed', error_json = $2, lease_owner = NULL, lease_expires_at = NULL,
               finished_at = $3, updated_at = $3 WHERE id = $1`,
            [t.id, JSON.stringify(error), now],
          );
          failed.push(t.id);
        }
      }
      return { requeued, failed, cancelled };
    });
  }

  async countQueued(): Promise<number> {
    const row = await this.one<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM tasks WHERE status = 'queued'",
    );
    return row?.n ?? 0;
  }

  // --- transactional dispatch outbox ------------------------------------------

  async getTaskDispatch(taskId: string): Promise<DispatchOutboxRecord | null> {
    return maybe(
      await this.one<Sql>(
        'SELECT task_id, available_at, attempts, generation, delivered_at FROM task_dispatch_outbox WHERE task_id = $1',
        [taskId],
      ),
      toDispatchOutbox,
    );
  }

  async listPendingDispatches(now: string, limit = 100): Promise<DispatchOutboxRecord[]> {
    return pgRows(
      await this.many<Sql>(
        `SELECT task_id, available_at, attempts, generation, delivered_at FROM task_dispatch_outbox
         WHERE delivered_at IS NULL AND available_at <= $1
         ORDER BY available_at ASC, created_at ASC LIMIT $2`,
        [now, limit],
      ),
    ).map(toDispatchOutbox);
  }

  async markTaskDispatched(taskId: string, generation: number, now: string): Promise<boolean> {
    return (
      (
        await this.run(
          `UPDATE task_dispatch_outbox SET delivered_at = COALESCE(delivered_at, $3), updated_at = $3
         WHERE task_id = $1 AND generation = $2 AND delivered_at IS NULL`,
          [taskId, generation, now],
        )
      ).changes === 1
    );
  }

  async recordTaskDispatchFailure(
    taskId: string,
    generation: number,
    now: string,
    errorCode: string,
  ): Promise<void> {
    await this.run(
      `UPDATE task_dispatch_outbox SET attempts = attempts + 1, last_error_code = $3, updated_at = $4
       WHERE task_id = $1 AND generation = $2 AND delivered_at IS NULL`,
      [taskId, generation, errorCode.slice(0, 80), now],
    );
  }

  /** A re-queued task needs a new delivery; the generation invalidates stale ones. */
  private async rearmTaskDispatch(taskId: string, availableAt: string, now: string): Promise<void> {
    await this.run(
      `UPDATE task_dispatch_outbox
       SET generation = generation + 1, available_at = $2, attempts = 0,
           last_error_code = NULL, delivered_at = NULL, updated_at = $3
       WHERE task_id = $1`,
      [taskId, availableAt, now],
    );
  }

  // --- render quotes ----------------------------------------------------------

  async createQuote(input: Parameters<DataStore['createQuote']>[0]): Promise<QuoteRecord> {
    const row = await this.one<Sql>(
      `INSERT INTO render_quotes (id, workspace_id, project_id, project_version, content_hash, settings_json,
         expected_outputs_json, duration_ms, billable_minutes, credit_cost, price_version, status, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open', $12, $13) RETURNING *`,
      [
        newId('quote'),
        input.workspaceId,
        input.projectId,
        input.projectVersion,
        input.contentHash,
        JSON.stringify(input.settings),
        JSON.stringify(input.expectedOutputs),
        input.durationMs,
        input.billableMinutes,
        input.creditCost,
        input.priceVersion,
        input.now,
        input.expiresAt,
      ],
    );
    return toQuote(pgRow(row as Sql));
  }

  async getQuote(workspaceId: string, id: string): Promise<QuoteRecord | null> {
    return maybe(
      await this.one<Sql>('SELECT * FROM render_quotes WHERE id = $1 AND workspace_id = $2', [
        id,
        workspaceId,
      ]),
      toQuote,
    );
  }

  /** Guarded transition: exactly one caller can move an open quote to consumed. */
  async consumeQuote(input: Parameters<DataStore['consumeQuote']>[0]): Promise<{
    outcome: 'consumed' | 'expired' | 'invalidated' | 'already_consumed' | 'not_found';
    quote: QuoteRecord | null;
  }> {
    const won = await this.one<Sql>(
      `UPDATE render_quotes SET status = 'consumed', consumed_by_task_id = $3
       WHERE id = $1 AND workspace_id = $2 AND status = 'open' AND expires_at > $4 RETURNING *`,
      [input.id, input.workspaceId, input.taskId, input.now],
    );
    if (won) return { outcome: 'consumed', quote: toQuote(pgRow(won)) };
    const current = await this.getQuote(input.workspaceId, input.id);
    if (!current) return { outcome: 'not_found', quote: null };
    const status = effectiveStatus(current, input.now);
    if (status === 'expired') {
      await this.run(
        "UPDATE render_quotes SET status = 'expired' WHERE id = $1 AND status = 'open'",
        [input.id],
      );
      return { outcome: 'expired', quote: await this.getQuote(input.workspaceId, input.id) };
    }
    if (status === 'invalidated') return { outcome: 'invalidated', quote: current };
    return { outcome: 'already_consumed', quote: current };
  }

  async invalidateOpenQuotes(projectId: string, reason: string): Promise<number> {
    return (
      await this.run(
        "UPDATE render_quotes SET status = 'invalidated', invalidated_reason = $2 WHERE project_id = $1 AND status = 'open'",
        [projectId, reason],
      )
    ).changes;
  }

  async expireOpenQuotes(now: string): Promise<number> {
    return (
      await this.run(
        "UPDATE render_quotes SET status = 'expired' WHERE status = 'open' AND expires_at <= $1",
        [now],
      )
    ).changes;
  }

  async listQuotesForProject(projectId: string, limit = 20): Promise<QuoteRecord[]> {
    return pgRows(
      await this.many<Sql>(
        'SELECT * FROM render_quotes WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2',
        [projectId, limit],
      ),
    ).map(toQuote);
  }

  // --- credits ----------------------------------------------------------------

  async getBalance(workspaceId: string): Promise<CreditBalanceRecord> {
    const row = await this.one<{ available: number; reserved: number }>(
      'SELECT available, reserved FROM credit_accounts WHERE workspace_id = $1',
      [workspaceId],
    );
    return {
      workspaceId,
      available: row?.available ?? 0,
      reserved: row?.reserved ?? 0,
    };
  }

  /**
   * Take the per-workspace credit lock. Every balance mutation goes through
   * here first, so reservations, settlements, releases, and grants for one
   * workspace are strictly serialized and cannot overspend.
   */
  private async lockBalance(workspaceId: string, now: string): Promise<CreditBalanceRecord> {
    await this.run(
      'INSERT INTO credit_accounts (workspace_id, available, reserved, updated_at) VALUES ($1, 0, 0, $2) ON CONFLICT (workspace_id) DO NOTHING',
      [workspaceId, now],
    );
    const row = await this.one<{ available: number; reserved: number }>(
      'SELECT available, reserved FROM credit_accounts WHERE workspace_id = $1 FOR UPDATE',
      [workspaceId],
    );
    return { workspaceId, available: row?.available ?? 0, reserved: row?.reserved ?? 0 };
  }

  private async setBalance(
    workspaceId: string,
    available: number,
    reserved: number,
    now: string,
  ): Promise<void> {
    await this.run(
      `INSERT INTO credit_accounts (workspace_id, available, reserved, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id) DO UPDATE SET available = EXCLUDED.available, reserved = EXCLUDED.reserved, updated_at = EXCLUDED.updated_at`,
      [workspaceId, available, reserved, now],
    );
  }

  private async writeLedger(input: {
    workspaceId: string;
    kind: LedgerEntry['kind'];
    amount: number;
    available: number;
    reserved: number;
    idempotencyKey: string;
    taskId?: string;
    quoteId?: string;
    reservationId?: string;
    note?: string;
    now: string;
  }): Promise<void> {
    await this.run(
      `INSERT INTO credit_ledger (id, workspace_id, kind, amount, available_after, reserved_after, task_id, quote_id, reservation_id, idempotency_key, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        newId('ledger'),
        input.workspaceId,
        input.kind,
        input.amount,
        input.available,
        input.reserved,
        input.taskId ?? null,
        input.quoteId ?? null,
        input.reservationId ?? null,
        input.idempotencyKey,
        input.note ?? null,
        input.now,
      ],
    );
  }

  async grantCredits(
    input: Parameters<DataStore['grantCredits']>[0],
  ): Promise<CreditBalanceRecord> {
    return this.transaction(async () => {
      const bal = await this.lockBalance(input.workspaceId, input.now);
      const existing = await this.one<Sql>(
        'SELECT id FROM credit_ledger WHERE workspace_id = $1 AND idempotency_key = $2',
        [input.workspaceId, input.idempotencyKey],
      );
      if (existing) return bal;
      const available = bal.available + input.amount;
      await this.setBalance(input.workspaceId, available, bal.reserved, input.now);
      if (input.amount > 0) {
        await this.run(
          `INSERT INTO credit_pools (id, workspace_id, kind, original_amount, available, reserved, expires_at, idempotency_key, note, created_at)
           VALUES ($1, $2, $3, $4, $4, 0, $5, $6, $7, $8)`,
          [newId('pool'), input.workspaceId, input.poolKind ?? 'admin', input.amount, input.expiresAt ?? null, input.idempotencyKey, input.note ?? null, input.now],
        );
      }
      await this.writeLedger({
        workspaceId: input.workspaceId,
        kind: input.kind ?? 'grant',
        amount: input.amount,
        available,
        reserved: bal.reserved,
        idempotencyKey: input.idempotencyKey,
        ...(input.note ? { note: input.note } : {}),
        now: input.now,
      });
      return { workspaceId: input.workspaceId, available, reserved: bal.reserved };
    });
  }

  async reserveCredits(
    input: Parameters<DataStore['reserveCredits']>[0],
  ): Promise<{ reservation: ReservationRecord; created: boolean }> {
    return this.transaction(async () => {
      const bal = await this.lockBalance(input.workspaceId, input.now);
      const existing = await this.one<Sql>(
        'SELECT * FROM credit_reservations WHERE quote_id = $1',
        [input.quoteId],
      );
      if (existing) return { reservation: toReservation(pgRow(existing)), created: false };
      if (bal.available < input.amount) {
        throw new StorageError(
          'INSUFFICIENT_CREDITS',
          `Need ${input.amount} credits, ${bal.available} available.`,
        );
      }
      const id = newId('reservation');
      const row = await this.one<Sql>(
        `INSERT INTO credit_reservations (id, workspace_id, quote_id, task_id, amount, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'reserved', $6, $6) RETURNING *`,
        [id, input.workspaceId, input.quoteId, input.taskId, input.amount, input.now],
      );
      let remaining = input.amount;
      const pools = await this.many<Sql>(
        `SELECT * FROM credit_pools WHERE workspace_id = $1 AND available > 0 AND (expires_at IS NULL OR expires_at > $2)
         ORDER BY CASE kind WHEN 'subscription' THEN 0 WHEN 'free' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
           CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at, created_at FOR UPDATE`,
        [input.workspaceId, input.now],
      );
      for (const pool of pools) {
        if (remaining <= 0) break;
        const amount = Math.min(remaining, Number(pool.available ?? 0));
        if (amount <= 0) continue;
        await this.run('UPDATE credit_pools SET available = available - $1, reserved = reserved + $1 WHERE id = $2', [amount, String(pool.id)]);
        await this.run('INSERT INTO credit_reservation_allocations (reservation_id, pool_id, amount) VALUES ($1, $2, $3)', [id, String(pool.id), amount]);
        remaining -= amount;
      }
      if (remaining > 0) throw new StorageError('INVALID_STATE', 'Credit pools do not match the aggregate balance.');
      const available = bal.available - input.amount;
      const reserved = bal.reserved + input.amount;
      await this.setBalance(input.workspaceId, available, reserved, input.now);
      await this.writeLedger({
        workspaceId: input.workspaceId,
        kind: 'reserve',
        amount: -input.amount,
        available,
        reserved,
        idempotencyKey: `reserve:${input.quoteId}`,
        taskId: input.taskId,
        quoteId: input.quoteId,
        reservationId: id,
        now: input.now,
      });
      return { reservation: toReservation(pgRow(row as Sql)), created: true };
    });
  }

  async getReservation(id: string): Promise<ReservationRecord | null> {
    return maybe(
      await this.one<Sql>('SELECT * FROM credit_reservations WHERE id = $1', [id]),
      toReservation,
    );
  }

  async getReservationForTask(taskId: string): Promise<ReservationRecord | null> {
    return maybe(
      await this.one<Sql>('SELECT * FROM credit_reservations WHERE task_id = $1', [taskId]),
      toReservation,
    );
  }

  async settleReservation(
    input: Parameters<DataStore['settleReservation']>[0],
  ): Promise<{ reservation: ReservationRecord; changed: boolean }> {
    return this.transaction(async () => {
      const head = await this.getReservation(input.reservationId);
      if (!head) throw new StorageError('NOT_FOUND', 'Reservation not found.');
      // Lock order is always account then reservation, so concurrent settle and
      // release for one workspace cannot deadlock.
      const bal = await this.lockBalance(head.workspaceId, input.now);
      const locked = await this.one<Sql>(
        'SELECT * FROM credit_reservations WHERE id = $1 FOR UPDATE',
        [input.reservationId],
      );
      const res = maybe(locked, toReservation);
      if (!res) throw new StorageError('NOT_FOUND', 'Reservation not found.');
      if (res.status === 'settled') return { reservation: res, changed: false };
      if (res.status === 'released')
        throw new StorageError('INVALID_STATE', 'Reservation was released; cannot settle.');
      const actual = Math.min(res.amount, Math.max(0, input.actualAmount ?? res.amount));
      const reserved = Math.max(0, bal.reserved - res.amount);
      const available = bal.available + (res.amount - actual);
      let actualRemaining = actual;
      const allocations = await this.many<Sql>('SELECT * FROM credit_reservation_allocations WHERE reservation_id = $1 ORDER BY pool_id', [res.id]);
      for (const allocation of allocations) {
        const amount = Number(allocation.amount ?? 0);
        const consumed = Math.min(actualRemaining, amount);
        const refund = amount - consumed;
        await this.run('UPDATE credit_pools SET reserved = GREATEST(0, reserved - $1), available = available + $2 WHERE id = $3', [amount, refund, String(allocation.pool_id)]);
        actualRemaining -= consumed;
      }
      await this.setBalance(res.workspaceId, available, reserved, input.now);
      const updated = await this.one<Sql>(
        "UPDATE credit_reservations SET status = 'settled', settled_amount = $2, updated_at = $3 WHERE id = $1 AND status = 'reserved' RETURNING *",
        [res.id, actual, input.now],
      );
      await this.writeLedger({
        workspaceId: res.workspaceId,
        kind: 'settle',
        amount: res.amount - actual,
        available,
        reserved,
        idempotencyKey: `settle:${res.id}`,
        taskId: res.taskId,
        quoteId: res.quoteId,
        reservationId: res.id,
        note: `Charged ${actual} credits`,
        now: input.now,
      });
      return { reservation: toReservation(pgRow(updated as Sql)), changed: true };
    });
  }

  async releaseReservation(
    input: Parameters<DataStore['releaseReservation']>[0],
  ): Promise<{ reservation: ReservationRecord; changed: boolean }> {
    return this.transaction(async () => {
      const head = await this.getReservation(input.reservationId);
      if (!head) throw new StorageError('NOT_FOUND', 'Reservation not found.');
      const bal = await this.lockBalance(head.workspaceId, input.now);
      const locked = await this.one<Sql>(
        'SELECT * FROM credit_reservations WHERE id = $1 FOR UPDATE',
        [input.reservationId],
      );
      const res = maybe(locked, toReservation);
      if (!res) throw new StorageError('NOT_FOUND', 'Reservation not found.');
      if (res.status !== 'reserved') return { reservation: res, changed: false };
      const reserved = Math.max(0, bal.reserved - res.amount);
      const available = bal.available + res.amount;
      const allocations = await this.many<Sql>('SELECT * FROM credit_reservation_allocations WHERE reservation_id = $1', [res.id]);
      for (const allocation of allocations) {
        const amount = Number(allocation.amount ?? 0);
        await this.run('UPDATE credit_pools SET reserved = GREATEST(0, reserved - $1), available = available + $1 WHERE id = $2', [amount, String(allocation.pool_id)]);
      }
      await this.setBalance(res.workspaceId, available, reserved, input.now);
      const updated = await this.one<Sql>(
        "UPDATE credit_reservations SET status = 'released', updated_at = $2 WHERE id = $1 AND status = 'reserved' RETURNING *",
        [res.id, input.now],
      );
      await this.writeLedger({
        workspaceId: res.workspaceId,
        kind: 'release',
        amount: res.amount,
        available,
        reserved,
        idempotencyKey: `release:${res.id}`,
        taskId: res.taskId,
        quoteId: res.quoteId,
        reservationId: res.id,
        ...(input.reason ? { note: input.reason } : {}),
        now: input.now,
      });
      return { reservation: toReservation(pgRow(updated as Sql)), changed: true };
    });
  }

  async listLedger(workspaceId: string, limit = 100): Promise<LedgerEntry[]> {
    return pgRows(
      await this.many<Sql>(
        'SELECT * FROM credit_ledger WHERE workspace_id = $1 ORDER BY created_at DESC, seq DESC LIMIT $2',
        [workspaceId, limit],
      ),
    ).map(toLedger);
  }

  // --- plans, entitlements, and provider events -------------------------------

  async getBillingAccount(workspaceId: string): Promise<BillingAccountRecord | null> {
    return maybe(await this.one<Sql>('SELECT * FROM billing_accounts WHERE workspace_id = $1', [workspaceId]), toBillingAccount);
  }

  async upsertBillingAccount(input: Parameters<DataStore['upsertBillingAccount']>[0]): Promise<BillingAccountRecord> {
    const changed = await this.one<Sql>(
      `INSERT INTO billing_accounts (workspace_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, provider, provider_customer_id, provider_subscription_id, provider_event_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(workspace_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,status=EXCLUDED.status,current_period_start=EXCLUDED.current_period_start,
       current_period_end=EXCLUDED.current_period_end,cancel_at_period_end=EXCLUDED.cancel_at_period_end,provider=EXCLUDED.provider,
       provider_customer_id=EXCLUDED.provider_customer_id,provider_subscription_id=EXCLUDED.provider_subscription_id,
       provider_event_at=EXCLUDED.provider_event_at,updated_at=EXCLUDED.updated_at
       WHERE EXCLUDED.provider_event_at IS NULL OR billing_accounts.provider_event_at IS NULL
         OR EXCLUDED.provider_event_at >= billing_accounts.provider_event_at RETURNING *`,
      [input.workspaceId,input.planId,input.status,input.currentPeriodStart ?? null,input.currentPeriodEnd ?? null,input.cancelAtPeriodEnd ? 1 : 0,input.provider ?? null,input.providerCustomerId ?? null,input.providerSubscriptionId ?? null,input.providerEventAt ?? null,input.now],
    );
    const row = changed ?? await this.one<Sql>('SELECT * FROM billing_accounts WHERE workspace_id=$1', [input.workspaceId]);
    if (!row) throw new StorageError('INVALID_STATE', 'Billing account was not saved.');
    return toBillingAccount(pgRow(row));
  }

  async listCreditPools(workspaceId: string, now: string): Promise<CreditPoolRecord[]> {
    return pgRows(await this.many<Sql>(
      `SELECT * FROM credit_pools WHERE workspace_id=$1 AND (expires_at IS NULL OR expires_at>$2) AND (available>0 OR reserved>0)
       ORDER BY CASE kind WHEN 'subscription' THEN 0 WHEN 'free' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
       CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at, created_at`, [workspaceId, now],
    )).map(toCreditPool);
  }

  async recordBillingEvent(input: Parameters<DataStore['recordBillingEvent']>[0]): Promise<{ event: BillingEventRecord; created: boolean }> {
    const inserted = await this.one<Sql>(
      `INSERT INTO billing_events (provider,event_id,event_type,workspace_id,status,occurred_at,processed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(provider,event_id) DO NOTHING RETURNING *`,
      [input.provider,input.eventId,input.eventType,input.workspaceId ?? null,input.status,input.occurredAt,input.processedAt],
    );
    const row = inserted ?? await this.one<Sql>('SELECT * FROM billing_events WHERE provider=$1 AND event_id=$2', [input.provider,input.eventId]);
    if (!row) throw new StorageError('INVALID_STATE', 'Billing event was not saved.');
    return { event: toBillingEvent(pgRow(row)), created: Boolean(inserted) };
  }

  // --- request idempotency ----------------------------------------------------

  async beginIdempotent(
    input: Parameters<DataStore['beginIdempotent']>[0],
  ): Promise<IdempotencyBegin> {
    const inserted = await this.one<Sql>(
      `INSERT INTO idempotency_keys (workspace_id, scope, key, fingerprint, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'in_progress', $5, $5)
       ON CONFLICT (workspace_id, scope, key) DO NOTHING RETURNING key`,
      [input.workspaceId, input.scope, input.key, input.fingerprint, input.now],
    );
    if (inserted) return { kind: 'new' };
    const existing = await this.one<{
      fingerprint: string;
      status: string;
      status_code: number | null;
      response_json: string | null;
    }>(
      'SELECT fingerprint, status, status_code, response_json FROM idempotency_keys WHERE workspace_id = $1 AND scope = $2 AND key = $3',
      [input.workspaceId, input.scope, input.key],
    );
    if (!existing) return { kind: 'new' };
    if (existing.fingerprint !== input.fingerprint) return { kind: 'mismatch' };
    if (existing.status === 'in_progress') return { kind: 'in_progress' };
    let response: unknown = null;
    try {
      response = existing.response_json ? JSON.parse(existing.response_json) : null;
    } catch {
      // Corrupt legacy response JSON replays as null rather than escaping the
      // persistence boundary; `response` was initialized to that safe value.
    }
    return { kind: 'replay', statusCode: existing.status_code ?? 200, response };
  }

  async completeIdempotent(input: Parameters<DataStore['completeIdempotent']>[0]): Promise<void> {
    await this.run(
      `UPDATE idempotency_keys SET status = 'completed', status_code = $4, response_json = $5, updated_at = $6
       WHERE workspace_id = $1 AND scope = $2 AND key = $3`,
      [
        input.workspaceId,
        input.scope,
        input.key,
        input.statusCode,
        JSON.stringify(input.response ?? null),
        input.now,
      ],
    );
  }

  async abortIdempotent(input: Parameters<DataStore['abortIdempotent']>[0]): Promise<void> {
    await this.run(
      "DELETE FROM idempotency_keys WHERE workspace_id = $1 AND scope = $2 AND key = $3 AND status = 'in_progress'",
      [input.workspaceId, input.scope, input.key],
    );
  }

  async purgeIdempotencyKeys(olderThan: string): Promise<number> {
    return (await this.run('DELETE FROM idempotency_keys WHERE updated_at < $1', [olderThan]))
      .changes;
  }

  // --- exports ----------------------------------------------------------------

  async createExport(input: Parameters<DataStore['createExport']>[0]): Promise<ExportRecord> {
    const row = await this.one<Sql>(
      `INSERT INTO exports (id, workspace_id, project_id, task_id, kind, storage_key, file_name, mime_type, bytes, sha256,
         width, height, duration_ms, project_version, content_hash, status, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'available', $16, $17) RETURNING *`,
      [
        newId('export'),
        input.workspaceId,
        input.projectId,
        input.taskId,
        input.kind,
        input.storageKey,
        input.fileName,
        input.mimeType,
        input.bytes,
        input.sha256,
        input.width ?? null,
        input.height ?? null,
        input.durationMs ?? null,
        input.projectVersion,
        input.contentHash,
        input.now,
        input.expiresAt,
      ],
    );
    return toExport(pgRow(row as Sql));
  }

  async getExport(workspaceId: string, id: string): Promise<ExportRecord | null> {
    return maybe(
      await this.one<Sql>('SELECT * FROM exports WHERE id = $1 AND workspace_id = $2', [
        id,
        workspaceId,
      ]),
      toExport,
    );
  }

  async listExports(
    workspaceId: string,
    opts: Parameters<DataStore['listExports']>[1] = {},
  ): Promise<ExportRecord[]> {
    const clauses = ['workspace_id = $1'];
    const params: unknown[] = [workspaceId];
    if (opts.projectId) {
      params.push(opts.projectId);
      clauses.push(`project_id = $${params.length}`);
    }
    if (opts.taskId) {
      params.push(opts.taskId);
      clauses.push(`task_id = $${params.length}`);
    }
    if (!opts.includePurged) clauses.push("status = 'available'");
    params.push(opts.limit ?? 50);
    return pgRows(
      await this.many<Sql>(
        `SELECT * FROM exports WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT $${params.length}`,
        params,
      ),
    ).map(toExport);
  }

  async listExpiredExports(now: string, limit = 100): Promise<ExportRecord[]> {
    return pgRows(
      await this.many<Sql>(
        "SELECT * FROM exports WHERE status = 'available' AND expires_at < $1 LIMIT $2",
        [now, limit],
      ),
    ).map(toExport);
  }

  async markExportPurged(id: string, now: string): Promise<boolean> {
    return (
      (
        await this.run(
          "UPDATE exports SET status = 'purged', purged_at = $2 WHERE id = $1 AND status = 'available'",
          [id, now],
        )
      ).changes > 0
    );
  }

  async listExportsForProjectAll(projectId: string): Promise<ExportRecord[]> {
    return pgRows(
      await this.many<Sql>('SELECT * FROM exports WHERE project_id = $1', [projectId]),
    ).map(toExport);
  }

  async listExportsForTaskAll(taskId: string): Promise<ExportRecord[]> {
    return pgRows(await this.many<Sql>('SELECT * FROM exports WHERE task_id = $1', [taskId])).map(
      toExport,
    );
  }

  async deleteExportsForTask(taskId: string): Promise<number> {
    return (await this.run('DELETE FROM exports WHERE task_id = $1', [taskId])).changes;
  }

  // --- audit ------------------------------------------------------------------

  async recordAudit(input: AuditEventInput): Promise<AuditEventRecord> {
    const row = await this.one<Sql>(
      `INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, target_type, target_id, outcome, error_ref, metadata_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        newId('audit'),
        input.workspaceId ?? null,
        input.actorType,
        input.actorId ?? null,
        input.action,
        input.targetType ?? null,
        input.targetId ?? null,
        input.outcome,
        input.errorRef ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.now,
      ],
    );
    return toEvent(pgRow(row as Sql));
  }

  async listAudit(workspaceId: string, limit = 100): Promise<AuditEventRecord[]> {
    return pgRows(
      await this.many<Sql>(
        'SELECT * FROM audit_events WHERE workspace_id = $1 ORDER BY created_at DESC, seq DESC LIMIT $2',
        [workspaceId, limit],
      ),
    ).map(toEvent);
  }

  async findAuditByErrorRef(errorRef: string): Promise<AuditEventRecord | null> {
    return maybe(
      await this.one<Sql>('SELECT * FROM audit_events WHERE error_ref = $1', [errorRef]),
      toEvent,
    );
  }
}
