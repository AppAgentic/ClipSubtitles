import {
  CONTENT_NOTICE,
  LIMITS,
  type CaptionProject,
  type Export,
  type ProjectSummary,
  type SourceAsset,
  type TranscriptView,
} from '@clipsubtitles/contracts';
import { createCaptionState, resegmentState, type CaptionState } from '@clipsubtitles/core';
import {
  getAssetById,
  getRevision,
  listExports,
  listTasks,
  toPublicExport,
  toPublicTask,
  type AssetRecord,
  type ExportRecord,
  type ProjectRecord,
  type RevisionRecord,
} from '@clipsubtitles/storage';
import { signContentUrl } from '../auth/urls';
import type { AppContext } from '../context';

export interface ProjectViewOptions {
  includePages?: boolean;
  includeWords?: boolean;
  wordsOffset?: number;
  wordsLimit?: number;
}

function signedFor(ctx: AppContext, kind: 'asset' | 'export', id: string, workspaceId: string): { url: string; expiresAt: string } {
  const expiresAt = Math.floor(ctx.clock.now() / 1000) + ctx.config.limits.signedUrlTtlSeconds;
  return {
    url: signContentUrl({ secret: ctx.config.auth.localSecret, apiPublicUrl: ctx.config.apiPublicUrl, kind, id, workspaceId, expiresAt }),
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

export function assetView(ctx: AppContext, asset: AssetRecord): SourceAsset {
  const view: SourceAsset = { id: asset.id, status: asset.status, origin: asset.origin };
  if (asset.fileName) view.fileName = asset.fileName;
  if (asset.mimeType) view.mimeType = asset.mimeType;
  if (asset.bytes !== undefined) view.bytes = asset.bytes;
  if (asset.durationMs !== undefined) view.durationMs = asset.durationMs;
  if (asset.width !== undefined) view.width = asset.width;
  if (asset.height !== undefined) view.height = asset.height;
  if (asset.fps !== undefined) view.fps = asset.fps;
  if (asset.hasAudio !== undefined) view.hasAudio = asset.hasAudio;
  if (asset.sha256) view.sha256 = asset.sha256;
  if (asset.expiresAt) view.expiresAt = asset.expiresAt;
  if (asset.status === 'ready' && asset.storageKey) {
    const s = signedFor(ctx, 'asset', asset.id, asset.workspaceId);
    view.playbackUrl = s.url;
    view.playbackUrlExpiresAt = s.expiresAt;
  }
  return view;
}

export function exportView(ctx: AppContext, e: ExportRecord): Export {
  const view = toPublicExport(e);
  if (e.status === 'available') {
    const s = signedFor(ctx, 'export', e.id, e.workspaceId);
    view.downloadUrl = s.url;
    view.downloadUrlExpiresAt = s.expiresAt;
  }
  return view;
}

export function transcriptView(revision: RevisionRecord, opts: ProjectViewOptions): TranscriptView {
  const view: TranscriptView = {
    id: revision.id,
    revisionNumber: revision.revisionNumber,
    source: revision.source,
    provider: revision.provider,
    language: revision.language,
    wordCount: revision.wordCount,
    durationMs: revision.durationMs,
    createdAt: revision.createdAt,
  };
  if (revision.model) view.model = revision.model;
  if (revision.fallbackFrom) view.fallbackFrom = revision.fallbackFrom;
  if (revision.parentRevisionId) view.parentRevisionId = revision.parentRevisionId;
  if (opts.includeWords) {
    const offset = Math.max(0, opts.wordsOffset ?? 0);
    const limit = Math.min(LIMITS.maxWordsWindow, Math.max(1, opts.wordsLimit ?? LIMITS.maxWordsWindow));
    view.words = revision.words.slice(offset, offset + limit);
    view.wordsWindow = { offset, limit, total: revision.words.length };
  }
  return view;
}

export function currentRevision(ctx: AppContext, project: ProjectRecord): RevisionRecord | null {
  return project.currentRevisionId ? getRevision(ctx.db, project.id, project.currentRevisionId) : null;
}

export function projectAsset(ctx: AppContext, project: ProjectRecord): AssetRecord | null {
  return project.sourceAssetId ? getAssetById(ctx.db, project.sourceAssetId) : null;
}

export function buildProjectView(ctx: AppContext, project: ProjectRecord, opts: ProjectViewOptions = {}): CaptionProject {
  const asset = projectAsset(ctx, project);
  const revision = currentRevision(ctx, project);
  const includePages = opts.includePages ?? true;
  const view: CaptionProject = {
    id: project.id,
    title: project.title,
    status: project.status,
    version: project.version,
    contentHash: project.contentHash,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    source: asset ? assetView(ctx, asset) : null,
    transcript: revision ? transcriptView(revision, opts) : null,
    pageCount: project.pages.length,
    style: project.style,
    segmentation: project.segmentation,
    qa: project.qa,
    activeTasks: listTasks(ctx.db, project.workspaceId, { projectId: project.id, activeOnly: true, limit: 20 }).map(toPublicTask),
    recentExports: listExports(ctx.db, project.workspaceId, { projectId: project.id, limit: 10 }).map((e) => exportView(ctx, e)),
    links: { editor: `${ctx.config.webPublicUrl}/projects/${project.id}` },
    contentNotice: CONTENT_NOTICE,
  };
  if (project.language) view.language = project.language;
  if (includePages) view.pages = project.pages;
  if (project.status === 'awaiting_source' || (asset && asset.status !== 'ready')) {
    view.links.upload = `${ctx.config.webPublicUrl}/projects/${project.id}/upload`;
  }
  return view;
}

export function buildProjectSummary(ctx: AppContext, project: ProjectRecord): ProjectSummary {
  const asset = projectAsset(ctx, project);
  const summary: ProjectSummary = {
    id: project.id,
    title: project.title,
    status: project.status,
    version: project.version,
    pageCount: project.pages.length,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
  if (project.language) summary.language = project.language;
  if (asset?.durationMs !== undefined) summary.durationMs = asset.durationMs;
  return summary;
}

/** Rebuild the editable caption state for a project from its stored parts. */
export function loadCaptionState(project: ProjectRecord, revision: RevisionRecord | null): CaptionState {
  if (!revision) {
    return createCaptionState({
      title: project.title,
      words: [],
      style: project.style,
      segmentation: project.segmentation,
      ...(project.language ? { language: project.language } : {}),
      revisionSeed: project.id,
    });
  }
  const state: CaptionState = {
    title: project.title,
    language: project.language,
    words: revision.words,
    pages: project.pages,
    style: project.style,
    segmentation: project.segmentation,
    manualBreaks: project.manualBreaks,
    manualJoins: project.manualJoins,
    revisionSeed: revision.id,
  };
  // Pages stored on the project are authoritative; recompute only if missing.
  return project.pages.length || revision.words.length === 0 ? state : resegmentState(state);
}
