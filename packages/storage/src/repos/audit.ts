import { newId } from '@clipsubtitles/core';
import { many, one, parseJson, run, text, type Db, type Row } from '../db';

export type AuditActorType = 'user' | 'agent' | 'worker' | 'system';
export type AuditOutcome = 'ok' | 'denied' | 'error';

export interface AuditEventInput {
  workspaceId?: string;
  actorType: AuditActorType;
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  outcome: AuditOutcome;
  errorRef?: string;
  /** Already redacted by the caller: never raw transcripts, media, tokens, or provider errors. */
  metadata?: Record<string, unknown>;
  now: string;
}

export interface AuditEventRecord extends Omit<AuditEventInput, 'now'> {
  id: string;
  createdAt: string;
}

function toEvent(r: Row): AuditEventRecord {
  const e: AuditEventRecord = {
    id: String(r.id),
    actorType: String(r.actor_type) as AuditActorType,
    action: String(r.action),
    outcome: String(r.outcome) as AuditOutcome,
    createdAt: String(r.created_at),
  };
  const ws = text(r.workspace_id);
  const actor = text(r.actor_id);
  const tt = text(r.target_type);
  const ti = text(r.target_id);
  const ref = text(r.error_ref);
  const meta = parseJson<Record<string, unknown> | null>(r.metadata_json, null);
  if (ws) e.workspaceId = ws;
  if (actor) e.actorId = actor;
  if (tt) e.targetType = tt;
  if (ti) e.targetId = ti;
  if (ref) e.errorRef = ref;
  if (meta) e.metadata = meta;
  return e;
}

export function recordAudit(db: Db, input: AuditEventInput): AuditEventRecord {
  const id = newId('audit');
  run(
    db,
    `INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, target_type, target_id, outcome, error_ref, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
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
  );
  return toEvent(one(db, 'SELECT * FROM audit_events WHERE id = ?', id) as Row);
}

export function listAudit(db: Db, workspaceId: string, limit = 100): AuditEventRecord[] {
  return many(db, 'SELECT * FROM audit_events WHERE workspace_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?', workspaceId, limit).map(toEvent);
}

export function findAuditByErrorRef(db: Db, errorRef: string): AuditEventRecord | null {
  const r = one(db, 'SELECT * FROM audit_events WHERE error_ref = ?', errorRef);
  return r ? toEvent(r) : null;
}
