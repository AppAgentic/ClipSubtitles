import type { RetentionPolicy, Scope, Workspace } from '@clipsubtitles/contracts';
import { newId } from '@clipsubtitles/core';
import { bool, many, num, one, parseJson, run, text, transaction, type Db, type Row } from '../db';
import { StorageError } from '../errors';

export interface UserRecord {
  id: string;
  subject: string;
  email?: string;
  displayName?: string;
  createdAt: string;
}

export interface WorkspaceRecord extends Workspace {
  ownerUserId: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  workspaceId: string;
  idpSessionId?: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
}

export interface GrantRecord {
  id: string;
  userId: string;
  workspaceId: string;
  clientId: string;
  clientName?: string;
  scopes: Scope[];
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export function toUser(r: Row): UserRecord {
  const u: UserRecord = { id: String(r.id), subject: String(r.subject), createdAt: String(r.created_at) };
  const email = text(r.email);
  const displayName = text(r.display_name);
  if (email) u.email = email;
  if (displayName) u.displayName = displayName;
  return u;
}

export function toWorkspace(r: Row): WorkspaceRecord {
  return {
    id: String(r.id),
    ownerUserId: String(r.owner_user_id),
    name: String(r.name),
    retention: { sourceDays: num(r.retention_source_days) ?? 30, exportDays: num(r.retention_export_days) ?? 7 },
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function toSession(r: Row): SessionRecord {
  const s: SessionRecord = {
    id: String(r.id),
    userId: String(r.user_id),
    workspaceId: String(r.workspace_id),
    createdAt: String(r.created_at),
    expiresAt: String(r.expires_at),
  };
  const idp = text(r.idp_session_id);
  const seen = text(r.last_seen_at);
  const revoked = text(r.revoked_at);
  if (idp) s.idpSessionId = idp;
  if (seen) s.lastSeenAt = seen;
  if (revoked) s.revokedAt = revoked;
  return s;
}

export function toGrant(r: Row): GrantRecord {
  const g: GrantRecord = {
    id: String(r.id),
    userId: String(r.user_id),
    workspaceId: String(r.workspace_id),
    clientId: String(r.client_id),
    scopes: parseJson<Scope[]>(r.scopes_json, []),
    createdAt: String(r.created_at),
  };
  const name = text(r.client_name);
  const used = text(r.last_used_at);
  const revoked = text(r.revoked_at);
  if (name) g.clientName = name;
  if (used) g.lastUsedAt = used;
  if (revoked) g.revokedAt = revoked;
  return g;
}

export interface EnsureUserWorkspaceInput {
  subject: string;
  email?: string;
  displayName?: string;
  now: string;
  initialCredits: number;
  defaultRetention?: RetentionPolicy;
  workspaceName?: string;
}

/**
 * One verified subject maps to exactly one user and one personal workspace.
 * Creation is atomic and idempotent; the initial credit grant is recorded once.
 */
export function ensureUserWorkspace(
  db: Db,
  input: EnsureUserWorkspaceInput,
): { user: UserRecord; workspace: WorkspaceRecord; created: boolean } {
  return transaction(db, () => {
    const existing = one(db, 'SELECT * FROM users WHERE subject = ?', input.subject);
    if (existing) {
      const user = toUser(existing);
      const ws = one(db, 'SELECT * FROM workspaces WHERE owner_user_id = ?', user.id);
      if (!ws) throw new StorageError('INVALID_STATE', 'User exists without a workspace.');
      return { user, workspace: toWorkspace(ws), created: false };
    }
    const userId = newId('user');
    const workspaceId = newId('workspace');
    run(
      db,
      'INSERT INTO users (id, subject, email, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
      userId,
      input.subject,
      input.email ?? null,
      input.displayName ?? null,
      input.now,
    );
    const retention = input.defaultRetention ?? { sourceDays: 30, exportDays: 7 };
    run(
      db,
      'INSERT INTO workspaces (id, owner_user_id, name, retention_source_days, retention_export_days, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      workspaceId,
      userId,
      input.workspaceName ?? 'Personal workspace',
      retention.sourceDays,
      retention.exportDays,
      input.now,
      input.now,
    );
    run(
      db,
      'INSERT INTO credit_accounts (workspace_id, available, reserved, updated_at) VALUES (?, ?, 0, ?)',
      workspaceId,
      input.initialCredits,
      input.now,
    );
    const hasBilling = Boolean(
      one(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'billing_accounts'"),
    );
    if (hasBilling) {
      run(
        db,
        "INSERT INTO billing_accounts (workspace_id, plan_id, status, updated_at) VALUES (?, 'free', 'free', ?)",
        workspaceId,
        input.now,
      );
    }
    if (input.initialCredits > 0) {
      if (hasBilling) {
        run(
          db,
          `INSERT INTO credit_pools (id, workspace_id, kind, original_amount, available, reserved, idempotency_key, note, created_at)
           VALUES (?, ?, 'free', ?, ?, 0, ?, ?, ?)`,
          newId('pool'),
          workspaceId,
          input.initialCredits,
          input.initialCredits,
          `grant:initial:${workspaceId}`,
          'Free lifetime credit grant',
          input.now,
        );
      }
      run(
        db,
        'INSERT INTO credit_ledger (id, workspace_id, kind, amount, available_after, reserved_after, idempotency_key, note, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)',
        newId('ledger'),
        workspaceId,
        'grant',
        input.initialCredits,
        input.initialCredits,
        `grant:initial:${workspaceId}`,
        'Free lifetime credit grant',
        input.now,
      );
    }
    const user = toUser(one(db, 'SELECT * FROM users WHERE id = ?', userId) as Row);
    const workspace = toWorkspace(one(db, 'SELECT * FROM workspaces WHERE id = ?', workspaceId) as Row);
    return { user, workspace, created: true };
  });
}

export function getUser(db: Db, userId: string): UserRecord | null {
  const r = one(db, 'SELECT * FROM users WHERE id = ?', userId);
  return r ? toUser(r) : null;
}

export function getUserBySubject(db: Db, subject: string): UserRecord | null {
  const r = one(db, 'SELECT * FROM users WHERE subject = ?', subject);
  return r ? toUser(r) : null;
}

export function getWorkspace(db: Db, workspaceId: string): WorkspaceRecord | null {
  const r = one(db, 'SELECT * FROM workspaces WHERE id = ?', workspaceId);
  return r ? toWorkspace(r) : null;
}

export function updateWorkspace(
  db: Db,
  workspaceId: string,
  patch: { name?: string; retention?: Partial<RetentionPolicy> },
  now: string,
): WorkspaceRecord {
  return transaction(db, () => {
    const current = getWorkspace(db, workspaceId);
    if (!current) throw new StorageError('NOT_FOUND', 'Workspace not found.');
    const name = patch.name ?? current.name;
    const sourceDays = patch.retention?.sourceDays ?? current.retention.sourceDays;
    const exportDays = patch.retention?.exportDays ?? current.retention.exportDays;
    run(
      db,
      'UPDATE workspaces SET name = ?, retention_source_days = ?, retention_export_days = ?, updated_at = ? WHERE id = ?',
      name,
      sourceDays,
      exportDays,
      now,
      workspaceId,
    );
    return getWorkspace(db, workspaceId) as WorkspaceRecord;
  });
}

export function createSession(
  db: Db,
  input: { tokenHash: string; userId: string; workspaceId: string; idpSessionId?: string; now: string; expiresAt: string },
): SessionRecord {
  const id = newId('session');
  run(
    db,
    'INSERT INTO sessions (id, token_hash, user_id, workspace_id, idp_session_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    input.tokenHash,
    input.userId,
    input.workspaceId,
    input.idpSessionId ?? null,
    input.now,
    input.expiresAt,
    input.now,
  );
  return toSession(one(db, 'SELECT * FROM sessions WHERE id = ?', id) as Row);
}

/** Active = not revoked and not expired. */
export function findActiveSession(db: Db, tokenHash: string, now: string): SessionRecord | null {
  const r = one(db, 'SELECT * FROM sessions WHERE token_hash = ?', tokenHash);
  if (!r) return null;
  const s = toSession(r);
  if (s.revokedAt || s.expiresAt <= now) return null;
  return s;
}

export function touchSession(db: Db, id: string, now: string): void {
  run(db, 'UPDATE sessions SET last_seen_at = ? WHERE id = ?', now, id);
}

export function revokeSession(db: Db, id: string, now: string): boolean {
  return run(db, 'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', now, id).changes > 0;
}

export function revokeSessionsForUser(db: Db, userId: string, now: string): number {
  return run(db, 'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', now, userId).changes;
}

export function revokeSessionsByIdpSessionId(db: Db, idpSessionId: string, now: string): number {
  return run(db, 'UPDATE sessions SET revoked_at = ? WHERE idp_session_id = ? AND revoked_at IS NULL', now, idpSessionId).changes;
}

export function ensureGrant(
  db: Db,
  input: { userId: string; workspaceId: string; clientId: string; clientName?: string; scopes: Scope[]; now: string },
): GrantRecord {
  return transaction(db, () => {
    const existing = one(db, 'SELECT * FROM oauth_grants WHERE user_id = ? AND client_id = ?', input.userId, input.clientId);
    if (existing) return toGrant(existing);
    const id = newId('grant');
    run(
      db,
      'INSERT INTO oauth_grants (id, user_id, workspace_id, client_id, client_name, scopes_json, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      input.userId,
      input.workspaceId,
      input.clientId,
      input.clientName ?? null,
      JSON.stringify(input.scopes),
      input.now,
      input.now,
    );
    return toGrant(one(db, 'SELECT * FROM oauth_grants WHERE id = ?', id) as Row);
  });
}

export function touchGrant(db: Db, id: string, now: string): void {
  run(db, 'UPDATE oauth_grants SET last_used_at = ? WHERE id = ?', now, id);
}

export function listGrants(db: Db, workspaceId: string): GrantRecord[] {
  return many(db, 'SELECT * FROM oauth_grants WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100', workspaceId).map(toGrant);
}

export function getGrant(db: Db, workspaceId: string, id: string): GrantRecord | null {
  const r = one(db, 'SELECT * FROM oauth_grants WHERE id = ? AND workspace_id = ?', id, workspaceId);
  return r ? toGrant(r) : null;
}

export function revokeGrant(db: Db, workspaceId: string, id: string, now: string): boolean {
  return (
    run(db, 'UPDATE oauth_grants SET revoked_at = ? WHERE id = ? AND workspace_id = ? AND revoked_at IS NULL', now, id, workspaceId)
      .changes > 0
  );
}

export function revokeGrantsForUser(db: Db, userId: string, now: string): number {
  return run(db, 'UPDATE oauth_grants SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', now, userId).changes;
}

export function revokeToken(db: Db, jti: string, expiresAt: string): void {
  run(db, 'INSERT OR REPLACE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)', jti, expiresAt);
}

export function isTokenRevoked(db: Db, jti: string): boolean {
  return Boolean(one(db, 'SELECT jti FROM revoked_tokens WHERE jti = ?', jti));
}

export function purgeExpiredRevokedTokens(db: Db, now: string): number {
  return run(db, 'DELETE FROM revoked_tokens WHERE expires_at < ?', now).changes;
}

export function isActiveFlag(value: unknown): boolean {
  return bool(value as never);
}
