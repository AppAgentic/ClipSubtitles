import type { Export, ExportKind } from '@clipsubtitles/contracts';
import { newId } from '@clipsubtitles/core';
import { many, num, one, run, text, type Db, type Row } from '../db';

export interface ExportRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  taskId: string;
  kind: ExportKind;
  storageKey: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  width?: number;
  height?: number;
  durationMs?: number;
  projectVersion: number;
  contentHash: string;
  status: 'available' | 'purged';
  createdAt: string;
  expiresAt: string;
  purgedAt?: string;
}

export function toExport(r: Row): ExportRecord {
  const e: ExportRecord = {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    projectId: String(r.project_id),
    taskId: String(r.task_id),
    kind: String(r.kind) as ExportKind,
    storageKey: String(r.storage_key),
    fileName: String(r.file_name),
    mimeType: String(r.mime_type),
    bytes: num(r.bytes) ?? 0,
    sha256: String(r.sha256),
    projectVersion: num(r.project_version) ?? 1,
    contentHash: String(r.content_hash),
    status: String(r.status) as 'available' | 'purged',
    createdAt: String(r.created_at),
    expiresAt: String(r.expires_at),
  };
  const width = num(r.width);
  const height = num(r.height);
  const duration = num(r.duration_ms);
  const purged = text(r.purged_at);
  if (width !== undefined) e.width = width;
  if (height !== undefined) e.height = height;
  if (duration !== undefined) e.durationMs = duration;
  if (purged) e.purgedAt = purged;
  return e;
}

export function toPublicExport(e: ExportRecord): Export {
  const out: Export = {
    id: e.id,
    kind: e.kind,
    projectId: e.projectId,
    taskId: e.taskId,
    projectVersion: e.projectVersion,
    contentHash: e.contentHash,
    fileName: e.fileName,
    mimeType: e.mimeType,
    bytes: e.bytes,
    sha256: e.sha256,
    status: e.status,
    createdAt: e.createdAt,
    expiresAt: e.expiresAt,
  };
  if (e.width !== undefined) out.width = e.width;
  if (e.height !== undefined) out.height = e.height;
  if (e.durationMs !== undefined) out.durationMs = e.durationMs;
  return out;
}

export function createExport(
  db: Db,
  input: Omit<ExportRecord, 'id' | 'status' | 'createdAt' | 'purgedAt'> & { now: string },
): ExportRecord {
  const id = newId('export');
  run(
    db,
    `INSERT INTO exports (id, workspace_id, project_id, task_id, kind, storage_key, file_name, mime_type, bytes, sha256, width, height, duration_ms, project_version, content_hash, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)`,
    id,
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
  );
  return toExport(one(db, 'SELECT * FROM exports WHERE id = ?', id) as Row);
}

export function getExport(db: Db, workspaceId: string, id: string): ExportRecord | null {
  const r = one(db, 'SELECT * FROM exports WHERE id = ? AND workspace_id = ?', id, workspaceId);
  return r ? toExport(r) : null;
}

export function listExports(
  db: Db,
  workspaceId: string,
  opts: { projectId?: string; taskId?: string; limit?: number; includePurged?: boolean } = {},
): ExportRecord[] {
  const clauses = ['workspace_id = ?'];
  const params: Array<string | number> = [workspaceId];
  if (opts.projectId) {
    clauses.push('project_id = ?');
    params.push(opts.projectId);
  }
  if (opts.taskId) {
    clauses.push('task_id = ?');
    params.push(opts.taskId);
  }
  if (!opts.includePurged) clauses.push("status = 'available'");
  params.push(opts.limit ?? 50);
  return many(db, `SELECT * FROM exports WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`, ...params).map(toExport);
}

export function listExpiredExports(db: Db, now: string, limit = 100): ExportRecord[] {
  return many(db, "SELECT * FROM exports WHERE status = 'available' AND expires_at < ? LIMIT ?", now, limit).map(toExport);
}

export function markExportPurged(db: Db, id: string, now: string): boolean {
  return run(db, "UPDATE exports SET status = 'purged', purged_at = ? WHERE id = ? AND status = 'available'", now, id).changes > 0;
}

export function listExportsForProjectAll(db: Db, projectId: string): ExportRecord[] {
  return many(db, 'SELECT * FROM exports WHERE project_id = ?', projectId).map(toExport);
}

export function listExportsForTaskAll(db: Db, taskId: string): ExportRecord[] {
  return many(db, 'SELECT * FROM exports WHERE task_id = ?', taskId).map(toExport);
}

/** Hard-delete export rows for a task (used when a retried render replaces partial outputs). */
export function deleteExportsForTask(db: Db, taskId: string): number {
  return run(db, 'DELETE FROM exports WHERE task_id = ?', taskId).changes;
}
