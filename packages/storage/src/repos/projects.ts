import type {
  CaptionPage,
  CaptionQaSummary,
  ProjectStatus,
  SegmentationParams,
  StyleConfig,
  TranscriptSource,
  TranscriptWord,
} from '@clipsubtitles/contracts';
import { StyleConfigSchema } from '@clipsubtitles/contracts';
import { newId } from '@clipsubtitles/core';
import { many, num, one, parseJson, run, text, transaction, type Db, type Row } from '../db';
import { StorageError } from '../errors';

export interface ProjectRecord {
  id: string;
  workspaceId: string;
  title: string;
  status: ProjectStatus;
  version: number;
  contentHash: string;
  language?: string;
  sourceAssetId?: string;
  currentRevisionId?: string;
  style: StyleConfig;
  segmentation: SegmentationParams;
  pages: CaptionPage[];
  manualBreaks: string[];
  manualJoins: string[];
  qa: CaptionQaSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface RevisionRecord {
  id: string;
  projectId: string;
  revisionNumber: number;
  source: TranscriptSource;
  provider: string;
  model?: string;
  language: string;
  words: TranscriptWord[];
  wordCount: number;
  durationMs: number;
  fallbackFrom?: string;
  parentRevisionId?: string;
  createdAt: string;
}

function toProject(r: Row): ProjectRecord {
  const p: ProjectRecord = {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    title: String(r.title),
    status: String(r.status) as ProjectStatus,
    version: num(r.version) ?? 1,
    contentHash: String(r.content_hash),
    style: StyleConfigSchema.parse(parseJson<unknown>(r.style_json, {})),
    segmentation: parseJson<SegmentationParams>(r.segmentation_json, {} as SegmentationParams),
    pages: parseJson<CaptionPage[]>(r.pages_json, []),
    manualBreaks: parseJson<string[]>(r.manual_breaks_json, []),
    manualJoins: parseJson<string[]>(r.manual_joins_json, []),
    qa: parseJson<CaptionQaSummary | null>(r.qa_json, null),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
  const language = text(r.language);
  const asset = text(r.source_asset_id);
  const rev = text(r.current_revision_id);
  if (language) p.language = language;
  if (asset) p.sourceAssetId = asset;
  if (rev) p.currentRevisionId = rev;
  return p;
}

function toRevision(r: Row): RevisionRecord {
  const rev: RevisionRecord = {
    id: String(r.id),
    projectId: String(r.project_id),
    revisionNumber: num(r.revision_number) ?? 1,
    source: String(r.source) as TranscriptSource,
    provider: String(r.provider),
    language: String(r.language),
    words: parseJson<TranscriptWord[]>(r.words_json, []),
    wordCount: num(r.word_count) ?? 0,
    durationMs: num(r.duration_ms) ?? 0,
    createdAt: String(r.created_at),
  };
  const model = text(r.model);
  const fallback = text(r.fallback_from);
  const parent = text(r.parent_revision_id);
  if (model) rev.model = model;
  if (fallback) rev.fallbackFrom = fallback;
  if (parent) rev.parentRevisionId = parent;
  return rev;
}

export function createProject(
  db: Db,
  input: {
    workspaceId: string;
    title: string;
    status: ProjectStatus;
    style: StyleConfig;
    segmentation: SegmentationParams;
    contentHash: string;
    language?: string;
    now: string;
  },
): ProjectRecord {
  const id = newId('project');
  run(
    db,
    `INSERT INTO projects (id, workspace_id, title, status, version, content_hash, language, style_json, segmentation_json, pages_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, '[]', ?, ?)`,
    id,
    input.workspaceId,
    input.title,
    input.status,
    input.contentHash,
    input.language ?? null,
    JSON.stringify(input.style),
    JSON.stringify(input.segmentation),
    input.now,
    input.now,
  );
  return toProject(one(db, 'SELECT * FROM projects WHERE id = ?', id) as Row);
}

/** Workspace-scoped read: cross-workspace ids resolve to null (never 403 leaks). */
export function getProject(db: Db, workspaceId: string, id: string): ProjectRecord | null {
  const r = one(
    db,
    'SELECT * FROM projects WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL',
    id,
    workspaceId,
  );
  return r ? toProject(r) : null;
}

/** Internal read for workers (already authorized by task ownership). */
export function getProjectById(db: Db, id: string): ProjectRecord | null {
  const r = one(db, 'SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', id);
  return r ? toProject(r) : null;
}

export function listProjects(db: Db, workspaceId: string, limit = 100): ProjectRecord[] {
  return many(
    db,
    'SELECT * FROM projects WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?',
    workspaceId,
    limit,
  ).map(toProject);
}

export interface ProjectEditPatch {
  title?: string;
  language?: string;
  status?: ProjectStatus;
  style?: StyleConfig;
  segmentation?: SegmentationParams;
  pages?: CaptionPage[];
  manualBreaks?: string[];
  manualJoins?: string[];
  qa?: CaptionQaSummary | null;
  contentHash: string;
  currentRevisionId?: string;
}

/**
 * Commit an edit with optimistic concurrency. The version increments by one;
 * a stale `expectedVersion` throws VERSION_CONFLICT and changes nothing.
 */
export function commitProjectEdit(
  db: Db,
  input: {
    id: string;
    workspaceId: string;
    expectedVersion: number;
    patch: ProjectEditPatch;
    now: string;
  },
): ProjectRecord {
  return transaction(db, () => {
    const current = getProject(db, input.workspaceId, input.id);
    if (!current) throw new StorageError('NOT_FOUND', 'Project not found.');
    if (current.version !== input.expectedVersion) {
      throw new StorageError(
        'VERSION_CONFLICT',
        `Expected version ${input.expectedVersion}, current is ${current.version}.`,
      );
    }
    const p = input.patch;
    const res = run(
      db,
      `UPDATE projects SET title = ?, language = ?, status = ?, style_json = ?, segmentation_json = ?, pages_json = ?,
        manual_breaks_json = ?, manual_joins_json = ?, qa_json = ?, content_hash = ?, current_revision_id = ?,
        version = version + 1, updated_at = ?
       WHERE id = ? AND workspace_id = ? AND version = ?`,
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
      input.id,
      input.workspaceId,
      input.expectedVersion,
    );
    if (res.changes !== 1)
      throw new StorageError('VERSION_CONFLICT', 'Project changed concurrently.');
    return getProject(db, input.workspaceId, input.id) as ProjectRecord;
  });
}

/** Non-edit metadata updates (pipeline status, source asset) do not bump the version. */
export function updateProjectMeta(
  db: Db,
  id: string,
  patch: {
    status?: ProjectStatus;
    sourceAssetId?: string | null;
    language?: string;
    title?: string;
  },
  now: string,
): ProjectRecord | null {
  return transaction(db, () => {
    const current = getProjectById(db, id);
    if (!current) return null;
    run(
      db,
      'UPDATE projects SET status = ?, source_asset_id = ?, language = ?, title = ?, updated_at = ? WHERE id = ?',
      patch.status ?? current.status,
      patch.sourceAssetId === undefined ? (current.sourceAssetId ?? null) : patch.sourceAssetId,
      patch.language ?? current.language ?? null,
      patch.title ?? current.title,
      now,
      id,
    );
    return getProjectById(db, id);
  });
}

export function softDeleteProject(db: Db, workspaceId: string, id: string, now: string): boolean {
  return (
    run(
      db,
      'UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL',
      now,
      now,
      id,
      workspaceId,
    ).changes > 0
  );
}

export function createRevision(
  db: Db,
  input: {
    projectId: string;
    source: TranscriptSource;
    provider: string;
    model?: string;
    language: string;
    words: TranscriptWord[];
    durationMs: number;
    fallbackFrom?: string;
    parentRevisionId?: string;
    now: string;
  },
): RevisionRecord {
  return transaction(db, () => {
    const last = one(
      db,
      'SELECT MAX(revision_number) AS n FROM transcript_revisions WHERE project_id = ?',
      input.projectId,
    );
    const next = (num(last?.n) ?? 0) + 1;
    const id = newId('revision');
    run(
      db,
      `INSERT INTO transcript_revisions (id, project_id, revision_number, source, provider, model, language, words_json, word_count, duration_ms, fallback_from, parent_revision_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.projectId,
      next,
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
    );
    return toRevision(one(db, 'SELECT * FROM transcript_revisions WHERE id = ?', id) as Row);
  });
}

export function getRevision(db: Db, projectId: string, id: string): RevisionRecord | null {
  const r = one(
    db,
    'SELECT * FROM transcript_revisions WHERE id = ? AND project_id = ?',
    id,
    projectId,
  );
  return r ? toRevision(r) : null;
}

export function listRevisions(db: Db, projectId: string, limit = 50): RevisionRecord[] {
  return many(
    db,
    'SELECT * FROM transcript_revisions WHERE project_id = ? ORDER BY revision_number DESC LIMIT ?',
    projectId,
    limit,
  ).map(toRevision);
}

export function countProjects(db: Db, workspaceId: string): number {
  return (
    num(
      one(
        db,
        'SELECT COUNT(*) AS n FROM projects WHERE workspace_id = ? AND deleted_at IS NULL',
        workspaceId,
      )?.n,
    ) ?? 0
  );
}
