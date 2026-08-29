import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { TaskResult } from '@clipsubtitles/contracts';
import type { TaskRecord } from '@clipsubtitles/storage';
import type { AppContext } from '../../context';
import { audit } from '../../services/audit';
import { directUploadPrefix, finalizeSourceAsset, sourceStorageKey } from '../../services/uploads';
import { TaskFailure } from '../errors';
import { FinalizeUploadInputSchema } from '../inputs';
import type { HandlerTools } from '../worker';

async function hashLocalFile(filePath: string): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    bytes += buffer.length;
    hash.update(buffer);
  }
  return { bytes, sha256: hash.digest('hex') };
}

export async function finalizeUploadHandler(
  ctx: AppContext,
  task: TaskRecord,
  tools: HandlerTools,
): Promise<TaskResult> {
  const input = FinalizeUploadInputSchema.parse(task.input);
  const asset = await ctx.db.getAssetById(input.assetId);
  if (!asset || asset.workspaceId !== task.workspaceId || asset.projectId !== input.projectId)
    throw new TaskFailure('NOT_FOUND', 'Source asset not found.');
  const finalKey = sourceStorageKey(asset.workspaceId, asset.id, asset.fileName ?? 'source.bin');

  // A reclaimed delivery after the durable asset commit is harmless.
  if (asset.status === 'ready' && asset.storageKey === finalKey) {
    await ctx.store.deletePrefix(directUploadPrefix(asset.workspaceId, input.uploadId)).catch(() => 0);
    return {
      kind: 'finalize_upload',
      projectId: asset.projectId,
      assetId: asset.id,
      durationMs: asset.durationMs ?? 0,
    };
  }
  if (asset.status !== 'importing')
    throw new TaskFailure('CONFLICT', 'The source asset is not awaiting verification.');

  tools.progress(10, 'downloading');
  let localPath: string | undefined;
  try {
    localPath = await ctx.store.materialize(input.verificationKey);
    tools.progress(35, 'hashing');
    const actual = await hashLocalFile(localPath);
    if (actual.bytes !== input.expectedBytes)
      throw new TaskFailure('PAYLOAD_TOO_LARGE', 'The uploaded byte length changed during verification.');
    if (input.expectedSha256 && actual.sha256 !== input.expectedSha256)
      throw new TaskFailure('UNSUPPORTED_MEDIA', 'The uploaded file checksum did not match.');
    if (tools.signal.aborted) throw new DOMException('Cancelled', 'AbortError');

    tools.progress(55, 'snapshotting');
    // This is a provider-side copy in R2/GCS, not a Cloud Run byte relay.
    await ctx.store.copy(input.verificationKey, finalKey);
    tools.progress(70, 'probing');
    const ready = await finalizeSourceAsset(ctx, asset, {
      storageKey: finalKey,
      bytes: actual.bytes,
      sha256: actual.sha256,
      mimeType: input.mimeType,
      materializedPath: localPath,
    });
    tools.progress(95, 'cleaning_up');
    await ctx.store
      .deletePrefix(directUploadPrefix(asset.workspaceId, input.uploadId))
      .catch((err) =>
        ctx.logger.warn('verified upload staging cleanup failed', {
          uploadId: input.uploadId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    await audit(ctx, {
      workspaceId: asset.workspaceId,
      actorType: 'worker',
      actorId: tools.workerId,
      action: 'source.direct_upload.verified',
      targetType: 'asset',
      targetId: asset.id,
      metadata: { bytes: actual.bytes, durationMs: ready.durationMs, uploadId: input.uploadId },
    }).catch((err) =>
      ctx.logger.warn('verified upload audit failed', {
        uploadId: input.uploadId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return {
      kind: 'finalize_upload',
      projectId: asset.projectId,
      assetId: asset.id,
      durationMs: ready.durationMs ?? 0,
    };
  } catch (err) {
    await ctx.store.delete(finalKey).catch(() => false);
    await ctx.store.deletePrefix(directUploadPrefix(asset.workspaceId, input.uploadId)).catch(() => 0);
    await ctx.db.updateAsset(asset.id, { status: 'failed' }, ctx.clock.iso());
    await ctx.db.updateProjectMeta(asset.projectId, { status: 'failed' }, ctx.clock.iso());
    throw err;
  } finally {
    if (localPath) await ctx.store.releaseMaterialized?.(localPath).catch(() => undefined);
  }
}
