import { newId } from '@clipsubtitles/core';
import { bool, many, num, one, run, text, transaction, type Db, type Row } from '../db';

export type AssetStatus = 'pending_upload' | 'importing' | 'ready' | 'failed' | 'purged';
export type AssetOrigin = 'upload' | 'remote_url' | 'fixture';

export interface AssetRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  status: AssetStatus;
  origin: AssetOrigin;
  storageKey?: string;
  fileName?: string;
  mimeType?: string;
  bytes?: number;
  durationMs?: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio?: boolean;
  sha256?: string;
  sourceUrl?: string;
  truthKey?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  purgedAt?: string;
}

export interface UploadRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  assetId: string;
  maxBytes: number;
  transport: 'proxy' | 'direct';
  storageKey?: string;
  expectedBytes?: number;
  expectedMimeType?: string;
  expectedSha256?: string;
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
  purgedAt?: string;
}

export function toAsset(r: Row): AssetRecord {
  const a: AssetRecord = {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    projectId: String(r.project_id),
    status: String(r.status) as AssetStatus,
    origin: String(r.origin) as AssetOrigin,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
  const set = <K extends keyof AssetRecord>(key: K, value: AssetRecord[K] | undefined) => {
    if (value !== undefined) a[key] = value;
  };
  set('storageKey', text(r.storage_key));
  set('fileName', text(r.file_name));
  set('mimeType', text(r.mime_type));
  set('bytes', num(r.bytes));
  set('durationMs', num(r.duration_ms));
  set('width', num(r.width));
  set('height', num(r.height));
  set('fps', num(r.fps));
  if (r.has_audio !== null && r.has_audio !== undefined) a.hasAudio = bool(r.has_audio);
  set('sha256', text(r.sha256));
  set('sourceUrl', text(r.source_url));
  set('truthKey', text(r.truth_key));
  set('expiresAt', text(r.expires_at));
  set('purgedAt', text(r.purged_at));
  return a;
}

export function toUpload(r: Row): UploadRecord {
  const u: UploadRecord = {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    projectId: String(r.project_id),
    assetId: String(r.asset_id),
    maxBytes: num(r.max_bytes) ?? 0,
    transport: (text(r.transport) ?? 'proxy') as 'proxy' | 'direct',
    createdAt: String(r.created_at),
    expiresAt: String(r.expires_at),
  };
  const storageKey = text(r.storage_key);
  const expectedBytes = num(r.expected_bytes);
  const expectedMimeType = text(r.expected_mime_type);
  const expectedSha256 = text(r.expected_sha256);
  if (storageKey) u.storageKey = storageKey;
  if (expectedBytes !== undefined) u.expectedBytes = expectedBytes;
  if (expectedMimeType) u.expectedMimeType = expectedMimeType;
  if (expectedSha256) u.expectedSha256 = expectedSha256;
  const completed = text(r.completed_at);
  if (completed) u.completedAt = completed;
  const purged = text(r.purged_at);
  if (purged) u.purgedAt = purged;
  return u;
}

export function createAsset(
  db: Db,
  input: {
    workspaceId: string;
    projectId: string;
    status: AssetStatus;
    origin: AssetOrigin;
    fileName?: string;
    mimeType?: string;
    sourceUrl?: string;
    truthKey?: string;
    now: string;
  },
): AssetRecord {
  const id = newId('asset');
  run(
    db,
    `INSERT INTO source_assets (id, workspace_id, project_id, status, origin, file_name, mime_type, source_url, truth_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.workspaceId,
    input.projectId,
    input.status,
    input.origin,
    input.fileName ?? null,
    input.mimeType ?? null,
    input.sourceUrl ?? null,
    input.truthKey ?? null,
    input.now,
    input.now,
  );
  return toAsset(one(db, 'SELECT * FROM source_assets WHERE id = ?', id) as Row);
}

export type AssetPatch = Partial<
  Pick<
    AssetRecord,
    'status' | 'storageKey' | 'fileName' | 'mimeType' | 'bytes' | 'durationMs' | 'width' | 'height' | 'fps' | 'hasAudio' | 'sha256' | 'expiresAt' | 'truthKey'
  >
>;

export function updateAsset(db: Db, id: string, patch: AssetPatch, now: string): AssetRecord | null {
  return transaction(db, () => {
    const current = getAssetById(db, id);
    if (!current) return null;
    const merged = { ...current, ...patch };
    run(
      db,
      `UPDATE source_assets SET status = ?, storage_key = ?, file_name = ?, mime_type = ?, bytes = ?, duration_ms = ?, width = ?, height = ?, fps = ?, has_audio = ?, sha256 = ?, expires_at = ?, truth_key = ?, updated_at = ? WHERE id = ?`,
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
      id,
    );
    return getAssetById(db, id);
  });
}

export function claimAssetForImport(db: Db, id: string, now: string): boolean {
  return (
    run(
      db,
      "UPDATE source_assets SET status = 'importing', updated_at = ? WHERE id = ? AND status = 'pending_upload'",
      now,
      id,
    ).changes === 1
  );
}

export function getAsset(db: Db, workspaceId: string, id: string): AssetRecord | null {
  const r = one(db, 'SELECT * FROM source_assets WHERE id = ? AND workspace_id = ?', id, workspaceId);
  return r ? toAsset(r) : null;
}

export function getAssetById(db: Db, id: string): AssetRecord | null {
  const r = one(db, 'SELECT * FROM source_assets WHERE id = ?', id);
  return r ? toAsset(r) : null;
}

export function listAssetsForProject(db: Db, projectId: string): AssetRecord[] {
  return many(db, 'SELECT * FROM source_assets WHERE project_id = ? ORDER BY created_at DESC', projectId).map(toAsset);
}

export function listExpiredAssets(db: Db, now: string, limit = 100): AssetRecord[] {
  return many(
    db,
    "SELECT * FROM source_assets WHERE purged_at IS NULL AND expires_at IS NOT NULL AND expires_at < ? AND status IN ('ready','failed') LIMIT ?",
    now,
    limit,
  ).map(toAsset);
}

export function markAssetPurged(db: Db, id: string, now: string): boolean {
  return run(db, "UPDATE source_assets SET status = 'purged', purged_at = ?, storage_key = NULL, updated_at = ? WHERE id = ? AND purged_at IS NULL", now, now, id).changes > 0;
}

export function createUpload(
  db: Db,
  input: { id?: string; workspaceId: string; projectId: string; assetId: string; tokenHash: string; maxBytes: number; transport?: 'proxy' | 'direct'; storageKey?: string; expectedBytes?: number; expectedMimeType?: string; expectedSha256?: string; now: string; expiresAt: string },
): UploadRecord {
  const id = input.id ?? newId('upload');
  run(
    db,
    `INSERT INTO uploads (id, workspace_id, project_id, asset_id, token_hash, max_bytes, transport, storage_key, expected_bytes, expected_mime_type, expected_sha256, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
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
  );
  return toUpload(one(db, 'SELECT * FROM uploads WHERE id = ?', id) as Row);
}

export function listExpiredDirectUploads(db: Db, now: string, limit = 100): UploadRecord[] {
  return many(
    db,
    "SELECT * FROM uploads WHERE transport = 'direct' AND completed_at IS NULL AND purged_at IS NULL AND expires_at < ? ORDER BY expires_at LIMIT ?",
    now,
    limit,
  ).map(toUpload);
}

export function markUploadPurged(db: Db, id: string, now: string): boolean {
  return run(db, 'UPDATE uploads SET purged_at = ? WHERE id = ? AND purged_at IS NULL', now, id)
    .changes > 0;
}

export function findUploadByTokenHash(db: Db, tokenHash: string): UploadRecord | null {
  const r = one(db, 'SELECT * FROM uploads WHERE token_hash = ?', tokenHash);
  return r ? toUpload(r) : null;
}

export function getUpload(db: Db, workspaceId: string, id: string): UploadRecord | null {
  const r = one(db, 'SELECT * FROM uploads WHERE id = ? AND workspace_id = ?', id, workspaceId);
  return r ? toUpload(r) : null;
}

export function listUploadsForProject(db: Db, projectId: string): UploadRecord[] {
  return many(db, 'SELECT * FROM uploads WHERE project_id = ? ORDER BY created_at', projectId).map(
    toUpload,
  );
}

/** Marks an upload complete exactly once. Returns false when already completed. */
export function completeUpload(db: Db, id: string, now: string): boolean {
  return run(db, 'UPDATE uploads SET completed_at = ? WHERE id = ? AND completed_at IS NULL', now, id).changes > 0;
}
