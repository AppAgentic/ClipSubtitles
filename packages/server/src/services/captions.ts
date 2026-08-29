import {
  DEFAULT_OUTPUT_SETTINGS,
  PRICE_VERSION,
  type CaptionProject,
  type CreatePreviewRequest,
  type CreateRenderQuoteRequest,
  type CreateRenderRequest,
  type GenerateCaptionsRequest,
  type RenderQuote,
  type Task,
} from '@clipsubtitles/contracts';
import { quoteRender } from '@clipsubtitles/core';
import {
  effectiveStatus,
  toPublicQuote,
  toPublicTask,
  type AssetRecord,
  type ProjectRecord,
  type RevisionRecord,
} from '@clipsubtitles/storage';
import type { Principal } from '../auth/principal';
import type { AppContext } from '../context';
import { ApiError } from '../errors';
import type { GenerateCaptionsInput, RenderExportInput, RenderPreviewInput } from '../worker/inputs';
import { audit } from './audit';
import { dispatchTaskBestEffort } from './task-dispatch';
import { requireProject } from './projects';
import { buildProjectView, currentRevision, projectAsset } from './views';

async function requireReadySource(ctx: AppContext, project: ProjectRecord): Promise<AssetRecord> {
  const asset = await projectAsset(ctx, project);
  if (!asset || asset.status !== 'ready' || !asset.storageKey) throw new ApiError('SOURCE_NOT_READY');
  if (asset.durationMs === undefined || !asset.width || !asset.height) throw new ApiError('SOURCE_NOT_READY');
  return asset;
}

async function requireTranscript(ctx: AppContext, project: ProjectRecord): Promise<RevisionRecord> {
  const revision = await currentRevision(ctx, project);
  if (!revision || revision.words.length === 0) throw new ApiError('TRANSCRIPT_MISSING');
  return revision;
}

export async function startGeneration(
  ctx: AppContext,
  principal: Principal,
  projectId: string,
  req: GenerateCaptionsRequest,
): Promise<{ task: Task; project: CaptionProject }> {
  const result = await ctx.db.transaction(async () => {
    const project = await requireProject(ctx, principal, projectId);
    const asset = await requireReadySource(ctx, project);
    if (req.provider) {
      const p = ctx.providers.byId(req.provider);
      if (!p || !p.isConfigured()) {
        throw new ApiError('VALIDATION_FAILED', undefined, { details: [{ path: 'provider', message: 'Unknown or unconfigured provider.' }] });
      }
    }
    const input: GenerateCaptionsInput = {
      projectId: project.id,
      assetId: asset.id,
      expectedVersion: project.version,
      ...(req.language ? { language: req.language } : {}),
      ...(req.vocabulary ? { vocabulary: req.vocabulary } : {}),
      ...(req.preset ? { preset: req.preset } : {}),
      ...(req.position ? { position: req.position } : {}),
      ...(req.segmentation ? { segmentation: req.segmentation } : {}),
      ...(req.provider ? { provider: req.provider } : {}),
    };
    const now = ctx.clock.iso();
    const task = await ctx.db.enqueueTask({
      workspaceId: principal.workspaceId,
      projectId: project.id,
      kind: 'generate_captions',
      input,
      ...(req.idempotencyKey ? { idempotencyKey: req.idempotencyKey } : {}),
      maxAttempts: 3,
      now,
    });
    const updated = (await ctx.db.updateProjectMeta(project.id, { status: 'transcribing' }, now)) ?? project;
    await audit(ctx, { principal, action: 'captions.generate', targetType: 'task', targetId: task.id, metadata: { projectId: project.id, provider: req.provider ?? 'chain' } });
    return { task: toPublicTask(task), project: await buildProjectView(ctx, updated, { includePages: false }) };
  });
  await dispatchTaskBestEffort(ctx, result.task.id);
  return result;
}

export async function createRenderQuote(ctx: AppContext, principal: Principal, projectId: string, req: CreateRenderQuoteRequest): Promise<RenderQuote> {
  const project = await requireProject(ctx, principal, projectId);
  if (req.expectedVersion !== undefined && req.expectedVersion !== project.version) throw new ApiError('VERSION_CONFLICT');
  const asset = await requireReadySource(ctx, project);
  await requireTranscript(ctx, project);
  const settings = req.settings ?? DEFAULT_OUTPUT_SETTINGS;
  const priced = quoteRender({ durationMs: asset.durationMs ?? 0, settings, source: { width: asset.width ?? 1080, height: asset.height ?? 1920 } });
  const now = ctx.clock.now();
  const quote = await ctx.db.createQuote({
    workspaceId: principal.workspaceId,
    projectId: project.id,
    projectVersion: project.version,
    contentHash: project.contentHash,
    settings,
    expectedOutputs: priced.expectedOutputs,
    durationMs: asset.durationMs ?? 0,
    billableMinutes: priced.billableMinutes,
    creditCost: priced.creditCost,
    priceVersion: priced.priceVersion,
    now: new Date(now).toISOString(),
    expiresAt: new Date(now + ctx.config.limits.quoteTtlSeconds * 1000).toISOString(),
  });
  await audit(ctx, { principal, action: 'render.quote', targetType: 'quote', targetId: quote.id, metadata: { projectId: project.id, creditCost: quote.creditCost, outputs: settings.outputs } });
  return toPublicQuote(quote, new Date(now).toISOString());
}

export interface StartRenderResult {
  task: Task;
  quote: RenderQuote;
  reservedCredits: number;
}

/**
 * Consume an approved, unexpired quote exactly once: reserve credits, snapshot
 * the exact content, and enqueue the render — all in one transaction.
 */
export async function startRender(ctx: AppContext, principal: Principal, projectId: string, req: CreateRenderRequest): Promise<StartRenderResult> {
  const result = await ctx.db.transaction(async () => {
    const project = await requireProject(ctx, principal, projectId);
    const quote = await ctx.db.getQuote(principal.workspaceId, req.quoteId);
    if (!quote || quote.projectId !== project.id) throw new ApiError('NOT_FOUND', 'Render quote not found for this project.');
    const nowIso = ctx.clock.iso();
    const status = effectiveStatus(quote, nowIso);
    if (status === 'expired') throw new ApiError('QUOTE_EXPIRED');
    if (status === 'invalidated') throw new ApiError('QUOTE_INVALIDATED');
    if (status === 'consumed') throw new ApiError('QUOTE_INVALIDATED', 'This quote was already used to start a render.');
    if (quote.projectVersion !== project.version || quote.contentHash !== project.contentHash || quote.priceVersion !== PRICE_VERSION) {
      await ctx.db.invalidateOpenQuotes(project.id, 'project or price changed');
      throw new ApiError('QUOTE_INVALIDATED');
    }
    if (req.approvedCreditCost !== quote.creditCost) throw new ApiError('QUOTE_MISMATCH');
    const asset = await requireReadySource(ctx, project);
    const revision = await requireTranscript(ctx, project);
    const input: RenderExportInput = {
      projectId: project.id,
      assetId: asset.id,
      revisionId: revision.id,
      projectVersion: project.version,
      contentHash: project.contentHash,
      pages: project.pages,
      style: project.style,
      quoteId: quote.id,
      settings: quote.settings,
      creditCost: quote.creditCost,
    };
    const task = await ctx.db.enqueueTask({
      workspaceId: principal.workspaceId,
      projectId: project.id,
      kind: 'render_export',
      input,
      idempotencyKey: req.idempotencyKey,
      maxAttempts: 2,
      now: nowIso,
    });
    const reservation = await ctx.db.reserveCredits({ workspaceId: principal.workspaceId, quoteId: quote.id, taskId: task.id, amount: quote.creditCost, now: nowIso });
    const consumed = await ctx.db.consumeQuote({ workspaceId: principal.workspaceId, id: quote.id, taskId: task.id, now: nowIso });
    if (consumed.outcome !== 'consumed') throw new ApiError('QUOTE_INVALIDATED');
    await audit(ctx, {
      principal,
      action: 'render.start',
      targetType: 'task',
      targetId: task.id,
      metadata: { projectId: project.id, quoteId: quote.id, credits: reservation.reservation.amount, outputs: quote.settings.outputs },
    });
    return { task: toPublicTask(task), quote: toPublicQuote(consumed.quote ?? quote, nowIso), reservedCredits: reservation.reservation.amount };
  });
  await dispatchTaskBestEffort(ctx, result.task.id);
  return result;
}

export async function startPreview(ctx: AppContext, principal: Principal, projectId: string, req: CreatePreviewRequest): Promise<Task> {
  const result = await ctx.db.transaction(async () => {
    const project = await requireProject(ctx, principal, projectId);
    const asset = await requireReadySource(ctx, project);
    const revision = await requireTranscript(ctx, project);
    const input: RenderPreviewInput = {
      projectId: project.id,
      assetId: asset.id,
      revisionId: revision.id,
      projectVersion: project.version,
      contentHash: project.contentHash,
      pages: project.pages,
      style: project.style,
      startMs: req.startMs ?? 0,
      durationMs: req.durationMs ?? 8000,
      resolution: req.resolution ?? '480p',
    };
    const task = await ctx.db.enqueueTask({
      workspaceId: principal.workspaceId,
      projectId: project.id,
      kind: 'render_preview',
      input,
      ...(req.idempotencyKey ? { idempotencyKey: req.idempotencyKey } : {}),
      maxAttempts: 2,
      now: ctx.clock.iso(),
    });
    await audit(ctx, { principal, action: 'preview.start', targetType: 'task', targetId: task.id, metadata: { projectId: project.id } });
    return toPublicTask(task);
  });
  await dispatchTaskBestEffort(ctx, result.id);
  return result;
}
