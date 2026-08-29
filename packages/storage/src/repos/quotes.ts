import type { ExpectedOutput, OutputSettings, RenderQuote } from '@clipsubtitles/contracts';
import { newId } from '@clipsubtitles/core';
import { many, num, one, parseJson, run, text, transaction, type Db, type Row } from '../db';

export interface QuoteRecord extends RenderQuote {
  workspaceId: string;
  consumedByTaskId?: string;
}

function toQuote(r: Row): QuoteRecord {
  const q: QuoteRecord = {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    projectId: String(r.project_id),
    projectVersion: num(r.project_version) ?? 1,
    contentHash: String(r.content_hash),
    settings: parseJson<OutputSettings>(r.settings_json, {} as OutputSettings),
    expectedOutputs: parseJson<ExpectedOutput[]>(r.expected_outputs_json, []),
    durationMs: num(r.duration_ms) ?? 0,
    billableMinutes: num(r.billable_minutes) ?? 0,
    creditCost: num(r.credit_cost) ?? 0,
    priceVersion: String(r.price_version),
    status: String(r.status) as RenderQuote['status'],
    createdAt: String(r.created_at),
    expiresAt: String(r.expires_at),
  };
  const reason = text(r.invalidated_reason);
  const consumed = text(r.consumed_by_task_id);
  if (reason) q.invalidatedReason = reason;
  if (consumed) q.consumedByTaskId = consumed;
  return q;
}

/** Reads report `expired` for open quotes past their expiry without writing. */
export function effectiveStatus(q: QuoteRecord, now: string): RenderQuote['status'] {
  if (q.status === 'open' && q.expiresAt <= now) return 'expired';
  return q.status;
}

export function createQuote(
  db: Db,
  input: {
    workspaceId: string;
    projectId: string;
    projectVersion: number;
    contentHash: string;
    settings: OutputSettings;
    expectedOutputs: ExpectedOutput[];
    durationMs: number;
    billableMinutes: number;
    creditCost: number;
    priceVersion: string;
    now: string;
    expiresAt: string;
  },
): QuoteRecord {
  const id = newId('quote');
  run(
    db,
    `INSERT INTO render_quotes (id, workspace_id, project_id, project_version, content_hash, settings_json, expected_outputs_json, duration_ms, billable_minutes, credit_cost, price_version, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    id,
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
  );
  return toQuote(one(db, 'SELECT * FROM render_quotes WHERE id = ?', id) as Row);
}

export function getQuote(db: Db, workspaceId: string, id: string): QuoteRecord | null {
  const r = one(db, 'SELECT * FROM render_quotes WHERE id = ? AND workspace_id = ?', id, workspaceId);
  return r ? toQuote(r) : null;
}

/** Consume exactly once: open + unexpired -> consumed. */
export function consumeQuote(
  db: Db,
  input: { workspaceId: string; id: string; taskId: string; now: string },
): { outcome: 'consumed' | 'expired' | 'invalidated' | 'already_consumed' | 'not_found'; quote: QuoteRecord | null } {
  return transaction(db, () => {
    const q = getQuote(db, input.workspaceId, input.id);
    if (!q) return { outcome: 'not_found', quote: null };
    const status = effectiveStatus(q, input.now);
    if (status === 'expired') {
      run(db, "UPDATE render_quotes SET status = 'expired' WHERE id = ? AND status = 'open'", input.id);
      return { outcome: 'expired', quote: getQuote(db, input.workspaceId, input.id) };
    }
    if (status === 'invalidated') return { outcome: 'invalidated', quote: q };
    if (status === 'consumed') return { outcome: 'already_consumed', quote: q };
    const res = run(
      db,
      "UPDATE render_quotes SET status = 'consumed', consumed_by_task_id = ? WHERE id = ? AND status = 'open' AND expires_at > ?",
      input.taskId,
      input.id,
      input.now,
    );
    if (res.changes !== 1) return { outcome: 'already_consumed', quote: getQuote(db, input.workspaceId, input.id) };
    return { outcome: 'consumed', quote: getQuote(db, input.workspaceId, input.id) };
  });
}

/** Any project change invalidates every open quote for it. */
export function invalidateOpenQuotes(db: Db, projectId: string, reason: string): number {
  return run(db, "UPDATE render_quotes SET status = 'invalidated', invalidated_reason = ? WHERE project_id = ? AND status = 'open'", reason, projectId).changes;
}

export function expireOpenQuotes(db: Db, now: string): number {
  return run(db, "UPDATE render_quotes SET status = 'expired' WHERE status = 'open' AND expires_at <= ?", now).changes;
}

export function listQuotesForProject(db: Db, projectId: string, limit = 20): QuoteRecord[] {
  return many(db, 'SELECT * FROM render_quotes WHERE project_id = ? ORDER BY created_at DESC LIMIT ?', projectId, limit).map(toQuote);
}

export function toPublicQuote(q: QuoteRecord, now: string): RenderQuote {
  const { workspaceId: _ws, consumedByTaskId: _task, ...rest } = q;
  return { ...rest, status: effectiveStatus(q, now) };
}
