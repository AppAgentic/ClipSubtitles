import type { Readable } from 'node:stream';
import { SUPPORTED_SOURCE_MIME_TYPES } from '@clipsubtitles/contracts';
import { ObjectTooLargeError, type AssetRecord } from '@clipsubtitles/storage';
import { probeMedia, type MediaProbe } from '@clipsubtitles/transcription';
import { hashToken } from '../auth/tokens';
import type { AppContext } from '../context';
import { ApiError } from '../errors';
import { audit } from './audit';

export function sourceStorageKey(workspaceId: string, assetId: string, fileName: string): string {
  const ext = (fileName.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? '.bin').toLowerCase();
  return `${workspaceId}/sources/${assetId}/source${ext}`;
}

/**
 * Validate probed media against product limits and mark the asset ready.
 * Shared by uploads and remote imports. Retention comes from the workspace.
 */
export async function finalizeSourceAsset(
  ctx: AppContext,
  asset: AssetRecord,
  info: { storageKey: string; bytes: number; sha256: string; mimeType?: string },
): Promise<AssetRecord> {
  const localPath = await ctx.store.materialize(info.storageKey);
  let probe: MediaProbe;
  try {
    probe = await probeMedia(localPath, {
      ffmpegPath: ctx.config.ffmpegPath,
      ffprobePath: ctx.config.ffprobePath,
    });
  } catch (err) {
    await failAsset(ctx, asset, info.storageKey);
    throw new ApiError('UNSUPPORTED_MEDIA', 'The file could not be read as audio or video.', {
      internal: err,
    });
  } finally {
    await ctx.store.releaseMaterialized?.(localPath).catch(() => undefined);
  }
  if (!probe.hasAudio && !probe.hasVideo) {
    await failAsset(ctx, asset, info.storageKey);
    throw new ApiError('UNSUPPORTED_MEDIA', 'The file contains no audio or video stream.');
  }
  if (!probe.hasAudio) {
    await failAsset(ctx, asset, info.storageKey);
    throw new ApiError('UNSUPPORTED_MEDIA', 'The file has no audio track to transcribe.');
  }
  if (probe.durationMs <= 0 || probe.durationMs > ctx.config.limits.maxSourceDurationMs) {
    await failAsset(ctx, asset, info.storageKey);
    throw new ApiError(
      'PAYLOAD_TOO_LARGE',
      `Media must be between 1 second and ${Math.round(ctx.config.limits.maxSourceDurationMs / 60000)} minutes long.`,
    );
  }
  const now = ctx.clock.now();
  const project = await ctx.db.getProjectById(asset.projectId);
  const workspace = await ctx.db.getWorkspace(asset.workspaceId);
  const retentionDays = workspace?.retention.sourceDays ?? ctx.config.limits.sourceRetentionDays;
  const updated = await ctx.db.updateAsset(
    asset.id,
    {
      status: 'ready',
      storageKey: info.storageKey,
      bytes: info.bytes,
      sha256: info.sha256,
      ...(info.mimeType ? { mimeType: info.mimeType } : {}),
      durationMs: probe.durationMs,
      hasAudio: probe.hasAudio,
      // Audio-only sources render onto a neutral 1080x1920 canvas.
      width: probe.width ?? 1080,
      height: probe.height ?? 1920,
      ...(probe.fps ? { fps: probe.fps } : {}),
      expiresAt: new Date(now + retentionDays * 86_400_000).toISOString(),
    },
    new Date(now).toISOString(),
  );
  if (project && project.status !== 'captioned')
    await ctx.db.updateProjectMeta(project.id, { status: 'ready' }, new Date(now).toISOString());
  return updated ?? asset;
}

async function failAsset(ctx: AppContext, asset: AssetRecord, storageKey: string): Promise<void> {
  await ctx.store.delete(storageKey).catch(() => false);
  await ctx.db.updateAsset(asset.id, { status: 'failed' }, ctx.clock.iso());
  await ctx.db.updateProjectMeta(asset.projectId, { status: 'failed' }, ctx.clock.iso());
}

export interface ReceiveUploadInput {
  token: string;
  workspaceId: string;
  stream: Readable;
  contentType?: string;
  contentLength?: number;
}

/**
 * Bounded single-PUT upload. The token is claimed atomically BEFORE any bytes
 * are stored, so concurrent PUTs with the same target cannot overwrite or
 * delete each other's file: exactly one wins, the rest get CONFLICT.
 */
export async function receiveUpload(
  ctx: AppContext,
  input: ReceiveUploadInput,
): Promise<AssetRecord> {
  const mime = input.contentType?.split(';')[0]?.trim().toLowerCase();
  if (
    mime &&
    mime !== 'application/octet-stream' &&
    !(SUPPORTED_SOURCE_MIME_TYPES as readonly string[]).includes(mime)
  ) {
    throw new ApiError('UNSUPPORTED_MEDIA', `Content type ${mime} is not accepted.`);
  }
  const claimed = await ctx.db.transaction(async () => {
    const upload = await ctx.db.findUploadByTokenHash(hashToken(input.token));
    const nowIso = ctx.clock.iso();
    if (!upload || upload.workspaceId !== input.workspaceId)
      throw new ApiError('NOT_FOUND', 'Upload target not found.');
    if (upload.expiresAt <= nowIso)
      throw new ApiError('RETENTION_EXPIRED', 'The upload target has expired. Request a new one.');
    if (upload.completedAt) throw new ApiError('CONFLICT', 'This upload target was already used.');
    const asset = await ctx.db.getAssetById(upload.assetId);
    if (!asset || asset.status !== 'pending_upload')
      throw new ApiError('CONFLICT', 'The project already has a source.');
    if (input.contentLength !== undefined && input.contentLength > upload.maxBytes)
      throw new ApiError('PAYLOAD_TOO_LARGE');
    if (!(await ctx.db.completeUpload(upload.id, nowIso)))
      throw new ApiError('CONFLICT', 'This upload target was already used.');
    await ctx.db.updateAsset(asset.id, { status: 'importing' }, nowIso);
    return { upload, asset };
  });
  const { upload, asset } = claimed;
  const key = sourceStorageKey(asset.workspaceId, asset.id, asset.fileName ?? 'source.mp4');
  let stored: { bytes: number; sha256: string };
  try {
    stored = await ctx.store.putStream(key, input.stream, {
      maxBytes: upload.maxBytes,
      ...(mime ? { contentType: mime } : {}),
    });
  } catch (err) {
    await failAsset(ctx, asset, key);
    if (err instanceof ObjectTooLargeError) throw new ApiError('PAYLOAD_TOO_LARGE');
    throw new ApiError('INTERNAL', undefined, { internal: err });
  }
  let ready: AssetRecord;
  try {
    await ctx.db.updateAsset(asset.id, { storageKey: key }, ctx.clock.iso());
    ready = await finalizeSourceAsset(ctx, asset, {
      storageKey: key,
      bytes: stored.bytes,
      sha256: stored.sha256,
      ...(mime ? { mimeType: mime } : {}),
    });
  } catch (err) {
    // The blob is already stored: never leave it behind without a row that points at it.
    await failAsset(ctx, asset, key).catch(() => undefined);
    throw err;
  }
  await audit(ctx, {
    workspaceId: asset.workspaceId,
    actorType: 'user',
    action: 'source.upload',
    targetType: 'asset',
    targetId: asset.id,
    metadata: { bytes: stored.bytes, durationMs: ready.durationMs },
  });
  return ready;
}
