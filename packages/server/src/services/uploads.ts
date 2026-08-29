import type { Readable } from 'node:stream';
import { SUPPORTED_SOURCE_MIME_TYPES } from '@clipsubtitles/contracts';
import type { Task } from '@clipsubtitles/contracts';
import { newId } from '@clipsubtitles/core';
import {
  ObjectTooLargeError,
  toPublicTask,
  type AssetRecord,
  type ObjectStat,
  type UploadRecord,
} from '@clipsubtitles/storage';
import { probeMedia, type MediaProbe } from '@clipsubtitles/transcription';
import { hashToken } from '../auth/tokens';
import type { AppContext } from '../context';
import type { Principal } from '../auth/principal';
import { ApiError } from '../errors';
import { audit } from './audit';
import { dispatchTaskBestEffort } from './task-dispatch';

export function sourceStorageKey(workspaceId: string, assetId: string, fileName: string): string {
  const ext = (fileName.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? '.bin').toLowerCase();
  return `${workspaceId}/sources/${assetId}/source${ext}`;
}

export function directUploadPrefix(workspaceId: string, uploadId: string): string {
  // Bucket-global prefix lets one R2 lifecycle rule delete every abandoned
  // staging object while the next segment preserves workspace isolation.
  return `staging/${workspaceId}/${uploadId}`;
}

function assertDirectObjectMatches(upload: UploadRecord, object: ObjectStat | null): void {
  if (!object) throw new ApiError('CONFLICT', 'The direct upload has not reached storage yet.');
  if (object.bytes !== upload.expectedBytes)
    throw new ApiError(
      'PAYLOAD_TOO_LARGE',
      'The uploaded byte length does not match its authorization.',
    );
  if (object.metadata?.['upload-id'] && object.metadata['upload-id'] !== upload.id)
    throw new ApiError('CONFLICT', 'The stored upload metadata does not match its authorization.');
  if (
    upload.expectedMimeType &&
    object.contentType &&
    object.contentType.split(';')[0]?.trim().toLowerCase() !== upload.expectedMimeType
  )
    throw new ApiError('UNSUPPORTED_MEDIA', 'The stored content type does not match its authorization.');
}

/**
 * Validate probed media against product limits and mark the asset ready.
 * Shared by uploads and remote imports. Retention comes from the workspace.
 */
export async function finalizeSourceAsset(
  ctx: AppContext,
  asset: AssetRecord,
  info: {
    storageKey: string;
    bytes: number;
    sha256: string;
    mimeType?: string;
    /** Already-materialized equivalent bytes, used by direct-upload workers. */
    materializedPath?: string;
  },
): Promise<AssetRecord> {
  const localPath = info.materializedPath ?? (await ctx.store.materialize(info.storageKey));
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
    if (!info.materializedPath)
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

/**
 * Snapshot a browser-to-R2 upload and enqueue durable verification. The signed
 * staging PUT remains reusable until expiry, so the worker never reads that key
 * directly: each completion attempt first makes a provider-side copy to a
 * server-only random key.
 */
export async function completeDirectUpload(
  ctx: AppContext,
  principal: Principal,
  projectId: string,
  uploadId: string,
  input: { sha256?: string },
): Promise<Task> {
  const upload = await ctx.db.getUpload(principal.workspaceId, uploadId);
  if (!upload || upload.projectId !== projectId || upload.transport !== 'direct' || !upload.storageKey)
    throw new ApiError('NOT_FOUND', 'Upload target not found.');
  if (upload.expiresAt <= ctx.clock.iso())
    throw new ApiError('RETENTION_EXPIRED', 'The upload target has expired. Request a new one.');
  if (upload.expectedSha256 && input.sha256 && upload.expectedSha256 !== input.sha256)
    throw new ApiError('CONFLICT', 'The completion checksum differs from the upload target.');
  if (upload.completedAt) {
    const existing = await ctx.db.findTaskByIdempotencyKey(
      principal.workspaceId,
      'finalize_upload',
      upload.id,
    );
    if (!existing) throw new ApiError('INTERNAL');
    return toPublicTask(existing);
  }

  const asset = await ctx.db.getAsset(principal.workspaceId, upload.assetId);
  if (!asset || asset.projectId !== projectId || asset.status !== 'pending_upload')
    throw new ApiError('CONFLICT', 'This project already has a source.');
  const staged = await ctx.store.stat(upload.storageKey);
  assertDirectObjectMatches(upload, staged);

  const ext = upload.storageKey.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? '.bin';
  const verificationKey = `${directUploadPrefix(upload.workspaceId, upload.id)}/verify-${newId('asset')}${ext}`;
  await ctx.store.copy(upload.storageKey, verificationKey);
  const snapshot = await ctx.store.stat(verificationKey);
  try {
    // The signed staging key remains writable until expiry. Validate the
    // immutable copy itself, not only the object observed before the copy.
    assertDirectObjectMatches(upload, snapshot);
  } catch (err) {
    await ctx.store.delete(verificationKey).catch(() => false);
    throw err;
  }

  let accepted = false;
  try {
    const task = await ctx.db.transaction(async () => {
      const fresh = await ctx.db.getUpload(principal.workspaceId, upload.id);
      if (!fresh) throw new ApiError('NOT_FOUND');
      if (fresh.completedAt) {
        const existing = await ctx.db.findTaskByIdempotencyKey(
          principal.workspaceId,
          'finalize_upload',
          upload.id,
        );
        if (!existing) throw new ApiError('INTERNAL');
        return existing;
      }
      const claimTime = ctx.clock.iso();
      if (!(await ctx.db.claimAssetForImport(asset.id, claimTime))) {
        // A concurrent completion of this same target is an idempotent replay.
        // The conditional asset update only returns after the winner commits,
        // so its task is visible here. A different target winning remains a conflict.
        const winnerUpload = await ctx.db.getUpload(principal.workspaceId, upload.id);
        if (winnerUpload?.completedAt) {
          const existing = await ctx.db.findTaskByIdempotencyKey(
            principal.workspaceId,
            'finalize_upload',
            upload.id,
          );
          if (existing) return existing;
        }
        throw new ApiError('CONFLICT', 'Another upload already supplied this project source.');
      }
      if (!(await ctx.db.completeUpload(upload.id, claimTime))) {
        const existing = await ctx.db.findTaskByIdempotencyKey(
          principal.workspaceId,
          'finalize_upload',
          upload.id,
        );
        if (!existing) throw new ApiError('CONFLICT', 'The upload completion raced another request.');
        return existing;
      }
      await ctx.db.updateProjectMeta(projectId, { status: 'importing' }, claimTime);
      const queued = await ctx.db.enqueueTask({
        workspaceId: principal.workspaceId,
        projectId,
        kind: 'finalize_upload',
        idempotencyKey: upload.id,
        input: {
          projectId,
          assetId: asset.id,
          uploadId: upload.id,
          stagingKey: upload.storageKey,
          verificationKey,
          expectedBytes: upload.expectedBytes,
          mimeType: upload.expectedMimeType,
          expectedSha256: upload.expectedSha256 ?? input.sha256,
        },
        now: ctx.clock.iso(),
        maxAttempts: 3,
      });
      accepted = true;
      return queued;
    });
    if (!accepted) await ctx.store.delete(verificationKey).catch(() => false);
    else {
      await dispatchTaskBestEffort(ctx, task.id);
      await audit(ctx, {
        principal,
        action: 'source.direct_upload.accepted',
        targetType: 'asset',
        targetId: asset.id,
        metadata: { bytes: upload.expectedBytes, uploadId: upload.id },
      });
    }
    return toPublicTask(task);
  } catch (err) {
    if (!accepted) await ctx.store.delete(verificationKey).catch(() => false);
    throw err;
  }
}
