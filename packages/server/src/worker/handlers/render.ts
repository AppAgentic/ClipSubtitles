import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { TaskResult } from '@clipsubtitles/contracts';
import type { RenderContent, RenderOutputFile, RenderSource } from '@clipsubtitles/render';
import {
  createExport,
  deleteExportsForTask,
  getAssetById,
  getProjectById,
  getReservationForTask,
  getRevision,
  getWorkspace,
  listExportsForTaskAll,
  type TaskRecord,
} from '@clipsubtitles/storage';
import type { AppContext } from '../../context';
import { TaskFailure } from '../errors';
import { RenderExportInputSchema, RenderPreviewInputSchema } from '../inputs';
import type { HandlerTools } from '../worker';

interface Snapshot {
  projectId: string;
  assetId: string;
  revisionId: string;
  projectVersion: number;
  contentHash: string;
  pages: RenderContent['pages'];
  style: RenderContent['style'];
}

function loadRenderInputs(ctx: AppContext, task: TaskRecord, snap: Snapshot): { source: RenderSource; content: RenderContent } {
  const project = getProjectById(ctx.db, snap.projectId);
  if (!project || project.workspaceId !== task.workspaceId) throw new TaskFailure('NOT_FOUND', 'Project not found.');
  const asset = getAssetById(ctx.db, snap.assetId);
  if (!asset || asset.status !== 'ready' || !asset.storageKey || asset.durationMs === undefined) throw new TaskFailure('SOURCE_NOT_READY');
  const revision = getRevision(ctx.db, snap.projectId, snap.revisionId);
  if (!revision) throw new TaskFailure('TRANSCRIPT_MISSING');
  const source: RenderSource = {
    path: ctx.store.localPath(asset.storageKey),
    width: asset.width ?? 1080,
    height: asset.height ?? 1920,
    durationMs: asset.durationMs,
    hasAudio: asset.hasAudio ?? true,
  };
  if (asset.fps) source.fps = asset.fps;
  const content: RenderContent = { words: revision.words, pages: snap.pages, style: snap.style, projectVersion: snap.projectVersion, contentHash: snap.contentHash };
  return { source, content };
}

/** A retried attempt replaces any partial outputs from an earlier attempt instead of duplicating them. */
async function discardPartialOutputs(ctx: AppContext, taskId: string): Promise<void> {
  const previous = listExportsForTaskAll(ctx.db, taskId);
  for (const e of previous) await ctx.store.delete(e.storageKey).catch(() => false);
  if (previous.length) deleteExportsForTask(ctx.db, taskId);
}

async function storeOutput(ctx: AppContext, task: TaskRecord, projectId: string, snap: Snapshot, file: RenderOutputFile, expiresAt: string) {
  const key = `${task.workspaceId}/exports/${task.id}/${file.fileName}`;
  const stored = await ctx.store.putFile(key, file.path, { move: true });
  return createExport(ctx.db, {
    workspaceId: task.workspaceId,
    projectId,
    taskId: task.id,
    kind: file.kind,
    storageKey: key,
    fileName: file.fileName,
    mimeType: file.mimeType,
    bytes: stored.bytes,
    sha256: stored.sha256,
    ...(file.width !== undefined ? { width: file.width } : {}),
    ...(file.height !== undefined ? { height: file.height } : {}),
    ...(file.durationMs !== undefined ? { durationMs: file.durationMs } : {}),
    projectVersion: snap.projectVersion,
    contentHash: snap.contentHash,
    expiresAt,
    now: ctx.clock.iso(),
  });
}

export async function renderPreviewHandler(ctx: AppContext, task: TaskRecord, tools: HandlerTools): Promise<TaskResult> {
  const input = RenderPreviewInputSchema.parse(task.input);
  const { source, content } = loadRenderInputs(ctx, task, input);
  const workDir = path.join(ctx.config.workDir, task.id);
  await mkdir(workDir, { recursive: true });
  await discardPartialOutputs(ctx, task.id);
  try {
    const file = await ctx.renderer.renderPreview(
      { source, content, startMs: input.startMs, durationMs: input.durationMs, resolution: input.resolution, workDir, baseName: `preview-v${input.projectVersion}` },
      { signal: tools.signal, onProgress: (p, s) => tools.progress(p, s) },
    );
    const expiresAt = new Date(ctx.clock.now() + 24 * 3_600_000).toISOString();
    const exp = await storeOutput(ctx, task, input.projectId, input, file, expiresAt);
    return { kind: 'render_preview', projectId: input.projectId, exportId: exp.id, projectVersion: input.projectVersion, contentHash: input.contentHash };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function renderExportHandler(ctx: AppContext, task: TaskRecord, tools: HandlerTools): Promise<TaskResult> {
  const input = RenderExportInputSchema.parse(task.input);
  const reservation = getReservationForTask(ctx.db, task.id);
  if (!reservation || reservation.status !== 'reserved') throw new TaskFailure('QUOTE_INVALIDATED', 'No active credit reservation for this render.');
  const { source, content } = loadRenderInputs(ctx, task, input);
  const workspace = getWorkspace(ctx.db, task.workspaceId);
  const retentionDays = workspace?.retention.exportDays ?? ctx.config.limits.exportRetentionDays;
  const workDir = path.join(ctx.config.workDir, task.id);
  await mkdir(workDir, { recursive: true });
  await discardPartialOutputs(ctx, task.id);
  try {
    const files = await ctx.renderer.renderExport(
      { source, content, settings: input.settings, workDir, baseName: `captions-v${input.projectVersion}` },
      { signal: tools.signal, onProgress: (p, s) => tools.progress(p, s) },
    );
    const expiresAt = new Date(ctx.clock.now() + retentionDays * 86_400_000).toISOString();
    const exportIds: string[] = [];
    for (const file of files) exportIds.push((await storeOutput(ctx, task, input.projectId, input, file, expiresAt)).id);
    return {
      kind: 'render_export',
      projectId: input.projectId,
      exportIds,
      projectVersion: input.projectVersion,
      contentHash: input.contentHash,
      creditsCharged: reservation.amount,
      reservationId: reservation.id,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
