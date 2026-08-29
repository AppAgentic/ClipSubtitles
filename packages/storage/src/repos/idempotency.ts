import { num, one, parseJson, run, transaction, type Db } from '../db';

export type IdempotencyBegin =
  | { kind: 'new' }
  | { kind: 'replay'; statusCode: number; response: unknown }
  | { kind: 'mismatch' }
  | { kind: 'in_progress' };

/**
 * Begin an idempotent operation. The (workspace, scope, key) triple is the
 * identity; the fingerprint detects key reuse with a different payload.
 */
export function beginIdempotent(
  db: Db,
  input: { workspaceId: string; scope: string; key: string; fingerprint: string; now: string },
): IdempotencyBegin {
  return transaction(db, () => {
    const existing = one(
      db,
      'SELECT * FROM idempotency_keys WHERE workspace_id = ? AND scope = ? AND key = ?',
      input.workspaceId,
      input.scope,
      input.key,
    );
    if (!existing) {
      run(
        db,
        `INSERT INTO idempotency_keys (workspace_id, scope, key, fingerprint, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'in_progress', ?, ?)`,
        input.workspaceId,
        input.scope,
        input.key,
        input.fingerprint,
        input.now,
        input.now,
      );
      return { kind: 'new' };
    }
    if (String(existing.fingerprint) !== input.fingerprint) return { kind: 'mismatch' };
    if (String(existing.status) === 'in_progress') return { kind: 'in_progress' };
    return { kind: 'replay', statusCode: num(existing.status_code) ?? 200, response: parseJson<unknown>(existing.response_json, null) };
  });
}

export function completeIdempotent(
  db: Db,
  input: { workspaceId: string; scope: string; key: string; statusCode: number; response: unknown; now: string },
): void {
  run(
    db,
    `UPDATE idempotency_keys SET status = 'completed', status_code = ?, response_json = ?, updated_at = ? WHERE workspace_id = ? AND scope = ? AND key = ?`,
    input.statusCode,
    JSON.stringify(input.response ?? null),
    input.now,
    input.workspaceId,
    input.scope,
    input.key,
  );
}

/** Drop an in-progress key after a failure so the client can retry the same key. */
export function abortIdempotent(db: Db, input: { workspaceId: string; scope: string; key: string }): void {
  run(
    db,
    `DELETE FROM idempotency_keys WHERE workspace_id = ? AND scope = ? AND key = ? AND status = 'in_progress'`,
    input.workspaceId,
    input.scope,
    input.key,
  );
}

export function purgeIdempotencyKeys(db: Db, olderThan: string): number {
  return run(db, 'DELETE FROM idempotency_keys WHERE updated_at < ?', olderThan).changes;
}
