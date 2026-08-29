import {
  SUPPORTED_SOURCE_MIME_TYPES,
  type CaptionProject,
  type CreateDirectUploadTargetRequest,
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
import { toPublicTask, type ProjectRecord } from '@clipsubtitles/storage';
import type { Principal } from '../auth/principal';
import { hashToken, randomToken } from '../auth/tokens';
import { signContentUrl } from '../auth/urls';
import type { AppContext } from '../context';
import { ApiError } from '../errors';
import { audit } from './audit';
import { releaseForTask } from './billing';
import { dispatchTaskBestEffort } from './task-dispatch';
import { directUploadPrefix } from './uploads';
import { guessFileName, sanitizeFileName, validateSourceUrl } from './source-policy';
import {
  buildProjectSummary,
  buildProjectView,
  currentRevision,
  loadCaptionState,
  type ProjectViewOptions,
} from './views';

const PROXY_UPLOAD_TTL_SECONDS = 3600;
const DIRECT_UPLOAD_TTL_SECONDS = 900;
const MAX_OUTSTANDING_DIRECT_UPLOADS_PER_PROJECT = 3;

function sourceExtension(fileName: string | undefined): string {
  return (fileName?.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? '.bin').toLowerCase();
}

export async function requireProject(
  ctx: AppContext,
  principal: Principal,
  projectId: string,
): Promise<ProjectRecord> {
  const project = await ctx.db.getProject(principal.workspaceId, projectId);
  if (!project) throw new ApiError('NOT_FOUND');
  return project;
}

async function uploadTarget(
  ctx: AppContext,
  project: ProjectRecord,
  assetId: string,
  fileName?: string,
  direct?: CreateDirectUploadTargetRequest,
): Promise<UploadTarget> {
  const token = randomToken(32);
  const now = ctx.clock.now();
  const canUploadDirect = Boolean(direct && ctx.store.directUploadAuthorization);
  if (direct && direct.bytes > ctx.config.limits.maxUploadBytes)
    throw new ApiError('PAYLOAD_TOO_LARGE');
  const ttlSeconds = canUploadDirect ? DIRECT_UPLOAD_TTL_SECONDS : PROXY_UPLOAD_TTL_SECONDS;
  const expiresAtSeconds = Math.floor(now / 1000) + ttlSeconds;
  const uploadId = newId('upload');
  const storageKey = canUploadDirect
    ? `${directUploadPrefix(project.workspaceId, uploadId)}/incoming${sourceExtension(fileName)}`
    : undefined;
  const upload = await ctx.db.createUpload({
    id: uploadId,
    workspaceId: project.workspaceId,
    projectId: project.id,
    assetId,
    tokenHash: hashToken(token),
    maxBytes: ctx.config.limits.maxUploadBytes,
    ...(canUploadDirect && direct && storageKey
      ? {
          transport: 'direct' as const,
          storageKey,
          expectedBytes: direct.bytes,
          expectedMimeType: direct.mimeType,
          ...(direct.sha256 ? { expectedSha256: direct.sha256 } : {}),
        }
      : {}),
    now: ctx.clock.iso(),
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
  });
  if (canUploadDirect && direct && storageKey && ctx.store.directUploadAuthorization) {
    const authorization = await ctx.store.directUploadAuthorization(storageKey, {
      expiresSeconds: ttlSeconds,
      contentLength: direct.bytes,
      contentType: direct.mimeType,
      metadata: {
        'upload-id': upload.id,
        'expected-bytes': String(direct.bytes),
        ...(direct.sha256 ? { 'expected-sha256': direct.sha256 } : {}),
      },
    });
    return {
      uploadId: upload.id,
      transport: 'direct',
      method: 'PUT',
      url: authorization.url,
      headers: authorization.headers,
      expectedBytes: direct.bytes,
      completeUrl: `${ctx.config.apiPublicUrl}/v1/projects/${project.id}/uploads/${upload.id}/complete`,
      maxBytes: ctx.config.limits.maxUploadBytes,
      acceptedMimeTypes: [...SUPPORTED_SOURCE_MIME_TYPES],
      expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
      webUploadUrl: `${ctx.config.webPublicUrl}/projects/${project.id}/upload`,
    };
  }
  return {
    uploadId: upload.id,
    transport: 'proxy',
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

export async function createProject(
  ctx: AppContext,
  principal: Principal,
  input: CreateProjectRequest,
): Promise<CreateProjectResponse> {
  const style = defaultStyle();
  const segmentation = segmentationForStyle(style, DEFAULT_SEGMENTATION);
  const now = ctx.clock.iso();
  const sourceUrl = input.sourceUrl
    ? validateSourceUrl(input.sourceUrl, { allowPrivate: ctx.config.limits.allowPrivateSourceUrls })
    : null;
  const title =
    input.title ??
    (sourceUrl ? guessFileName(sourceUrl) : sanitizeFileName(input.fileName, 'Untitled project'));

  const result = await ctx.db.transaction(async () => {
    const project = await ctx.db.createProject({
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
      const asset = await ctx.db.createAsset({
        workspaceId: principal.workspaceId,
        projectId: project.id,
        status: 'importing',
        origin: 'remote_url',
        fileName: guessFileName(sourceUrl),
        sourceUrl: sourceUrl.toString(),
        now,
      });
      await ctx.db.updateProjectMeta(project.id, { sourceAssetId: asset.id }, now);
      const task = await ctx.db.enqueueTask({
        workspaceId: principal.workspaceId,
        projectId: project.id,
        kind: 'import_source',
        input: { projectId: project.id, assetId: asset.id, url: sourceUrl.toString() },
        now,
        maxAttempts: 2,
      });
      response.importTask = toPublicTask(task);
    } else {
      const asset = await ctx.db.createAsset({
        workspaceId: principal.workspaceId,
        projectId: project.id,
        status: 'pending_upload',
        origin: 'upload',
        fileName: sanitizeFileName(input.fileName),
        now,
      });
      await ctx.db.updateProjectMeta(project.id, { sourceAssetId: asset.id }, now);
      response.uploadTarget = await uploadTarget(
        ctx,
        project,
        asset.id,
        asset.fileName,
        input.upload,
      );
    }
    const fresh = (await ctx.db.getProject(principal.workspaceId, project.id)) as ProjectRecord;
    response.project = await buildProjectView(ctx, fresh, { includePages: false });
    await audit(ctx, {
      principal,
      action: 'project.create',
      targetType: 'project',
      targetId: project.id,
      metadata: { origin: sourceUrl ? 'remote_url' : 'upload' },
    });
    return response;
  });
  if (result.importTask) {
    await dispatchTaskBestEffort(ctx, result.importTask.id);
  }
  return result;
}

/**
 * A fresh upload target for a project whose source has not been received yet.
 * A failed upload can be retried: the asset returns to pending_upload.
 */
export async function createUploadTarget(
  ctx: AppContext,
  principal: Principal,
  projectId: string,
): Promise<UploadTarget> {
  return ctx.db.transaction(async () => {
    const project = await requireProject(ctx, principal, projectId);
    const asset = project.sourceAssetId ? await ctx.db.getAssetById(project.sourceAssetId) : null;
    if (!asset || asset.status === 'ready' || asset.status === 'importing') {
      throw new ApiError('CONFLICT', 'This project already has a source.');
    }
    const now = ctx.clock.iso();
    if (asset.status === 'failed') {
      await ctx.db.updateAsset(asset.id, { status: 'pending_upload' }, now);
      await ctx.db.updateProjectMeta(project.id, { status: 'awaiting_source' }, now);
    }
    return uploadTarget(ctx, project, asset.id, asset.fileName);
  });
}

/** Prefer a direct R2 PUT when the active store supports it; otherwise return the protected proxy target. */
export async function createDirectUploadTarget(
  ctx: AppContext,
  principal: Principal,
  projectId: string,
  input: CreateDirectUploadTargetRequest,
): Promise<UploadTarget> {
  return ctx.db.transaction(async () => {
    const project = await requireProject(ctx, principal, projectId);
    const asset = project.sourceAssetId ? await ctx.db.getAssetById(project.sourceAssetId) : null;
    if (!asset || asset.status === 'ready' || asset.status === 'importing')
      throw new ApiError('CONFLICT', 'This project already has a source.');
    const now = ctx.clock.iso();
    const outstanding = (await ctx.db.listUploadsForProject(project.id)).filter(
      (upload) =>
        upload.transport === 'direct' &&
        !upload.completedAt &&
        !upload.purgedAt &&
        upload.expiresAt > now,
    );
    if (outstanding.length >= MAX_OUTSTANDING_DIRECT_UPLOADS_PER_PROJECT)
      throw new ApiError(
        'CONFLICT',
        'Too many active upload targets. Reuse one or wait for it to expire.',
      );
    if (asset.status === 'failed') {
      await ctx.db.updateAsset(asset.id, { status: 'pending_upload' }, now);
      await ctx.db.updateProjectMeta(project.id, { status: 'awaiting_source' }, now);
    }
    return uploadTarget(ctx, project, asset.id, asset.fileName, input);
  });
}

export async function listProjects(
  ctx: AppContext,
  principal: Principal,
): Promise<ProjectSummary[]> {
  const projects = await ctx.db.listProjects(principal.workspaceId);
  const summaries: ProjectSummary[] = [];
  for (const p of projects) summaries.push(await buildProjectSummary(ctx, p));
  return summaries;
}

export async function getProjectView(
  ctx: AppContext,
  principal: Principal,
  projectId: string,
  opts: ProjectViewOptions = {},
): Promise<CaptionProject> {
  return buildProjectView(ctx, await requireProject(ctx, principal, projectId), opts);
}

export async function patchProject(
  ctx: AppContext,
  principal: Principal,
  projectId: string,
  req: PatchProjectRequest,
): Promise<{ project: CaptionProject; applied: number; newRevision: boolean }> {
  return ctx.db.transaction(async () => {
    const project = await requireProject(ctx, principal, projectId);
    if (project.version !== req.expectedVersion) throw new ApiError('VERSION_CONFLICT');
    const revision = await currentRevision(ctx, project);
    const state = loadCaptionState(project, revision);
    const outcome = applyPatchOps(state, req.ops, { newWordId: () => newId('word') });
    const now = ctx.clock.iso();
    let revisionId = project.currentRevisionId;
    let newRevision = false;
    let finalState = outcome.state;
    if (outcome.transcriptChanged) {
      if (!revision) throw new ApiError('TRANSCRIPT_MISSING');
      const created = await ctx.db.createRevision({
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
    const qa = finalState.words.length
      ? evaluateCaptions(finalState.words, finalState.pages, finalState.segmentation)
      : null;
    const updated = await ctx.db.commitProjectEdit({
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
    const invalidated = await ctx.db.invalidateOpenQuotes(project.id, 'project edited');
    await audit(ctx, {
      principal,
      action: 'project.update',
      targetType: 'project',
      targetId: project.id,
      metadata: {
        ops: req.ops.map((o) => o.op),
        newRevision,
        invalidatedQuotes: invalidated,
        version: updated.version,
      },
    });
    return {
      project: await buildProjectView(ctx, updated, { includePages: true }),
      applied: outcome.applied,
      newRevision,
    };
  });
}

/** Delete a project and its media immediately; cancels active tasks and releases reservations. */
export async function deleteProject(
  ctx: AppContext,
  principal: Principal,
  projectId: string,
): Promise<void> {
  const project = await requireProject(ctx, principal, projectId);
  const now = ctx.clock.iso();
  const active = await ctx.db.listTasks(principal.workspaceId, {
    projectId: project.id,
    activeOnly: true,
    limit: 100,
  });
  for (const task of active) {
    const res = await ctx.db.requestCancel(principal.workspaceId, task.id, now);
    if (res.outcome === 'cancelled' && task.kind === 'render_export')
      await releaseForTask(ctx, task.id, 'project deleted');
  }
  for (const asset of await ctx.db.listAssetsForProject(project.id)) {
    // Do not sever the durable key if the provider deletion failed. A retry of
    // DELETE must still be able to find and remove every private object.
    if (asset.storageKey) await ctx.store.delete(asset.storageKey);
    if (asset.truthKey) await ctx.store.delete(asset.truthKey);
    await ctx.db.markAssetPurged(asset.id, now);
  }
  for (const upload of await ctx.db.listUploadsForProject(project.id)) {
    if (upload.transport === 'direct') {
      await ctx.store.deletePrefix(directUploadPrefix(upload.workspaceId, upload.id));
      await ctx.db.markUploadPurged(upload.id, now);
    }
  }
  for (const e of await ctx.db.listExportsForProjectAll(project.id)) {
    await ctx.store.delete(e.storageKey);
    await ctx.db.markExportPurged(e.id, now);
  }
  await ctx.db.invalidateOpenQuotes(project.id, 'project deleted');
  await ctx.db.softDeleteProject(principal.workspaceId, project.id, now);
  await audit(ctx, { principal, action: 'project.delete', targetType: 'project', targetId: project.id });
}
