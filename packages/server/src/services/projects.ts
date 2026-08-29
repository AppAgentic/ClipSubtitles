import {
  SUPPORTED_SOURCE_MIME_TYPES,
  type CaptionProject,
  type CreateProjectRequest,
  type CreateProjectResponse,
  type PatchProjectRequest,
  type ProjectSummary,
  type UploadTarget,
} from '@clipsubtitles/contracts';
import {
  DEFAULT_SEGMENTATION,
  applyPatchOps,
  computeContentHash,
  defaultStyle,
  evaluateCaptions,
  newId,
  resegmentState,
  segmentationForStyle,
  stateContentHash,
} from '@clipsubtitles/core';
import {
  commitProjectEdit,
  createAsset,
  createProject as createProjectRecord,
  createRevision,
  createUpload,
  enqueueTask,
  getAssetById,
  getProject,
  invalidateOpenQuotes,
  listAssetsForProject,
  listExportsForProjectAll,
  listProjects as listProjectRecords,
  listTasks,
  markAssetPurged,
  markExportPurged,
  requestCancel,
  softDeleteProject,
  toPublicTask,
  transaction,
  updateAsset,
  updateProjectMeta,
  type ProjectRecord,
} from '@clipsubtitles/storage';
import type { Principal } from '../auth/principal';
import { hashToken, randomToken } from '../auth/tokens';
import { signContentUrl } from '../auth/urls';
import type { AppContext } from '../context';
import { ApiError } from '../errors';
import { audit } from './audit';
import { releaseForTask } from './billing';
import { guessFileName, sanitizeFileName, validateSourceUrl } from './source-policy';
import { buildProjectSummary, buildProjectView, currentRevision, loadCaptionState, type ProjectViewOptions } from './views';

const UPLOAD_TTL_SECONDS = 3600;

export function requireProject(ctx: AppContext, principal: Principal, projectId: string): ProjectRecord {
  const project = getProject(ctx.db, principal.workspaceId, projectId);
  if (!project) throw new ApiError('NOT_FOUND');
  return project;
}

function uploadTarget(ctx: AppContext, project: ProjectRecord, assetId: string): UploadTarget {
  const token = randomToken(32);
  const now = ctx.clock.now();
  const expiresAtSeconds = Math.floor(now / 1000) + UPLOAD_TTL_SECONDS;
  const upload = createUpload(ctx.db, {
    workspaceId: project.workspaceId,
    projectId: project.id,
    assetId,
    tokenHash: hashToken(token),
    maxBytes: ctx.config.limits.maxUploadBytes,
    now: ctx.clock.iso(),
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
  });
  return {
    uploadId: upload.id,
    method: 'PUT',
    url: signContentUrl({
      secret: ctx.config.auth.localSecret,
      apiPublicUrl: ctx.config.apiPublicUrl,
      kind: 'upload',
      id: token,
      workspaceId: project.workspaceId,
      expiresAt: expiresAtSeconds,
    }),
    maxBytes: ctx.config.limits.maxUploadBytes,
    acceptedMimeTypes: [...SUPPORTED_SOURCE_MIME_TYPES],
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    webUploadUrl: `${ctx.config.webPublicUrl}/projects/${project.id}/upload`,
  };
}

export function createProject(ctx: AppContext, principal: Principal, input: CreateProjectRequest): CreateProjectResponse {
  const style = defaultStyle();
  const segmentation = segmentationForStyle(style, DEFAULT_SEGMENTATION);
  const now = ctx.clock.iso();
  const sourceUrl = input.sourceUrl ? validateSourceUrl(input.sourceUrl, { allowPrivate: ctx.config.limits.allowPrivateSourceUrls }) : null;
  const title = input.title ?? (sourceUrl ? guessFileName(sourceUrl) : sanitizeFileName(input.fileName, 'Untitled project'));

  return transaction(ctx.db, () => {
    const project = createProjectRecord(ctx.db, {
      workspaceId: principal.workspaceId,
      title,
      status: sourceUrl ? 'importing' : 'awaiting_source',
      style,
      segmentation,
      contentHash: computeContentHash({ words: [], pages: [], style }),
      ...(input.language ? { language: input.language } : {}),
      now,
    });
    const response: CreateProjectResponse = { project: {} as CaptionProject };
    if (sourceUrl) {
      const asset = createAsset(ctx.db, {
        workspaceId: principal.workspaceId,
        projectId: project.id,
        status: 'importing',
        origin: 'remote_url',
        fileName: guessFileName(sourceUrl),
        sourceUrl: sourceUrl.toString(),
        now,
      });
      updateProjectMeta(ctx.db, project.id, { sourceAssetId: asset.id }, now);
      const task = enqueueTask(ctx.db, {
        workspaceId: principal.workspaceId,
        projectId: project.id,
        kind: 'import_source',
        input: { projectId: project.id, assetId: asset.id, url: sourceUrl.toString() },
        now,
        maxAttempts: 2,
      });
      response.importTask = toPublicTask(task);
    } else {
      const asset = createAsset(ctx.db, {
        workspaceId: principal.workspaceId,
        projectId: project.id,
        status: 'pending_upload',
        origin: 'upload',
        fileName: sanitizeFileName(input.fileName),
        now,
      });
      updateProjectMeta(ctx.db, project.id, { sourceAssetId: asset.id }, now);
      response.uploadTarget = uploadTarget(ctx, project, asset.id);
    }
    const fresh = getProject(ctx.db, principal.workspaceId, project.id) as ProjectRecord;
    response.project = buildProjectView(ctx, fresh, { includePages: false });
    audit(ctx, { principal, action: 'project.create', targetType: 'project', targetId: project.id, metadata: { origin: sourceUrl ? 'remote_url' : 'upload' } });
    return response;
  });
}

/**
 * A fresh upload target for a project whose source has not been received yet.
 * A failed upload can be retried: the asset returns to pending_upload.
 */
export function createUploadTarget(ctx: AppContext, principal: Principal, projectId: string): UploadTarget {
  return transaction(ctx.db, () => {
    const project = requireProject(ctx, principal, projectId);
    const asset = project.sourceAssetId ? getAssetById(ctx.db, project.sourceAssetId) : null;
    if (!asset || asset.status === 'ready' || asset.status === 'importing') {
      throw new ApiError('CONFLICT', 'This project already has a source.');
    }
    const now = ctx.clock.iso();
    if (asset.status === 'failed') {
      updateAsset(ctx.db, asset.id, { status: 'pending_upload' }, now);
      updateProjectMeta(ctx.db, project.id, { status: 'awaiting_source' }, now);
    }
    return uploadTarget(ctx, project, asset.id);
  });
}

export function listProjects(ctx: AppContext, principal: Principal): ProjectSummary[] {
  return listProjectRecords(ctx.db, principal.workspaceId).map((p) => buildProjectSummary(ctx, p));
}

export function getProjectView(ctx: AppContext, principal: Principal, projectId: string, opts: ProjectViewOptions = {}): CaptionProject {
  return buildProjectView(ctx, requireProject(ctx, principal, projectId), opts);
}

export function patchProject(
  ctx: AppContext,
  principal: Principal,
  projectId: string,
  req: PatchProjectRequest,
): { project: CaptionProject; applied: number; newRevision: boolean } {
  return transaction(ctx.db, () => {
    const project = requireProject(ctx, principal, projectId);
    if (project.version !== req.expectedVersion) throw new ApiError('VERSION_CONFLICT');
    const revision = currentRevision(ctx, project);
    const state = loadCaptionState(project, revision);
    const outcome = applyPatchOps(state, req.ops, { newWordId: () => newId('word') });
    const now = ctx.clock.iso();
    let revisionId = project.currentRevisionId;
    let newRevision = false;
    let finalState = outcome.state;
    if (outcome.transcriptChanged) {
      if (!revision) throw new ApiError('TRANSCRIPT_MISSING');
      const created = createRevision(ctx.db, {
        projectId: project.id,
        source: 'edit',
        provider: revision.provider,
        ...(revision.model ? { model: revision.model } : {}),
        language: outcome.state.language ?? revision.language,
        words: outcome.state.words,
        durationMs: revision.durationMs,
        parentRevisionId: revision.id,
        now,
      });
      revisionId = created.id;
      newRevision = true;
      // Page ids derive from the revision seed: re-derive pages (same breaks, ids scoped to the new revision).
      finalState = resegmentState({ ...outcome.state, revisionSeed: created.id });
    }
    const qa = finalState.words.length ? evaluateCaptions(finalState.words, finalState.pages, finalState.segmentation) : null;
    const updated = commitProjectEdit(ctx.db, {
      id: project.id,
      workspaceId: principal.workspaceId,
      expectedVersion: req.expectedVersion,
      patch: {
        title: finalState.title,
        ...(finalState.language ? { language: finalState.language } : {}),
        style: finalState.style,
        segmentation: finalState.segmentation,
        pages: finalState.pages,
        manualBreaks: finalState.manualBreaks,
        manualJoins: finalState.manualJoins,
        qa,
        contentHash: stateContentHash(finalState),
        ...(revisionId ? { currentRevisionId: revisionId } : {}),
      },
      now,
    });
    const invalidated = invalidateOpenQuotes(ctx.db, project.id, 'project edited');
    audit(ctx, {
      principal,
      action: 'project.update',
      targetType: 'project',
      targetId: project.id,
      metadata: { ops: req.ops.map((o) => o.op), newRevision, invalidatedQuotes: invalidated, version: updated.version },
    });
    return { project: buildProjectView(ctx, updated, { includePages: true }), applied: outcome.applied, newRevision };
  });
}

/** Delete a project and its media immediately; cancels active tasks and releases reservations. */
export async function deleteProject(ctx: AppContext, principal: Principal, projectId: string): Promise<void> {
  const project = requireProject(ctx, principal, projectId);
  const now = ctx.clock.iso();
  for (const task of listTasks(ctx.db, principal.workspaceId, { projectId: project.id, activeOnly: true, limit: 100 })) {
    const res = requestCancel(ctx.db, principal.workspaceId, task.id, now);
    if (res.outcome === 'cancelled' && task.kind === 'render_export') releaseForTask(ctx, task.id, 'project deleted');
  }
  for (const asset of listAssetsForProject(ctx.db, project.id)) {
    if (asset.storageKey) await ctx.store.delete(asset.storageKey).catch(() => false);
    if (asset.truthKey) await ctx.store.delete(asset.truthKey).catch(() => false);
    markAssetPurged(ctx.db, asset.id, now);
  }
  for (const e of listExportsForProjectAll(ctx.db, project.id)) {
    await ctx.store.delete(e.storageKey).catch(() => false);
    markExportPurged(ctx.db, e.id, now);
  }
  invalidateOpenQuotes(ctx.db, project.id, 'project deleted');
  softDeleteProject(ctx.db, principal.workspaceId, project.id, now);
  audit(ctx, { principal, action: 'project.delete', targetType: 'project', targetId: project.id });
}
