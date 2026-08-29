import type { AppContext } from '../context';
import { audit } from './audit';

export interface SweepResult {
  purgedAssets: number;
  purgedExports: number;
  failedDeletes: number;
  expiredQuotes: number;
  purgedIdempotencyKeys: number;
}

/** Enforce retention: delete expired media objects and mark records purged. */
export async function runRetentionSweep(ctx: AppContext): Promise<SweepResult> {
  const nowIso = ctx.clock.iso();
  let purgedAssets = 0;
  let purgedExports = 0;
  let failedDeletes = 0;
  const maxItems = ctx.config.limits.retentionSweepMaxItems;
  const assetQuota = Math.ceil(maxItems / 2);
  const exportQuota = Math.floor(maxItems / 2);
  let assets = await ctx.db.listExpiredAssets(nowIso, assetQuota);
  let exports = await ctx.db.listExpiredExports(nowIso, exportQuota);
  // Guarantee both media classes a share of every bounded sweep, then let the
  // other class consume unused capacity. A large asset backlog cannot starve
  // short-lived exports (and vice versa).
  if (assets.length < assetQuota) {
    exports = await ctx.db.listExpiredExports(nowIso, maxItems - assets.length);
  } else if (exports.length < exportQuota) {
    assets = await ctx.db.listExpiredAssets(nowIso, maxItems - exports.length);
  }

  // Keep a failed row eligible for the next sweep. Marking it purged after a
  // provider error would lose the only durable pointer to the private blob.
  await mapConcurrent(assets, 16, async (asset) => {
    try {
      if (asset.storageKey) await ctx.store.delete(asset.storageKey);
      if (asset.truthKey) await ctx.store.delete(asset.truthKey);
      if (await ctx.db.markAssetPurged(asset.id, nowIso)) purgedAssets += 1;
    } catch (err) {
      failedDeletes += 1;
      ctx.logger.warn('retention object delete failed', {
        assetId: asset.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
  await mapConcurrent(exports, 16, async (e) => {
    try {
      await ctx.store.delete(e.storageKey);
      if (await ctx.db.markExportPurged(e.id, nowIso)) purgedExports += 1;
    } catch (err) {
      failedDeletes += 1;
      ctx.logger.warn('retention object delete failed', {
        exportId: e.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
  const expiredQuotes = await ctx.db.expireOpenQuotes(nowIso);
  await ctx.db.purgeExpiredRevokedTokens(nowIso);
  const purgedIdempotencyKeys = await ctx.db.purgeIdempotencyKeys(
    new Date(ctx.clock.now() - 7 * 86_400_000).toISOString(),
  );
  if (purgedAssets || purgedExports || failedDeletes) {
    await audit(ctx, {
      actorType: 'system',
      action: 'retention.sweep',
      metadata: { purgedAssets, purgedExports, failedDeletes, expiredQuotes },
    });
  }
  return { purgedAssets, purgedExports, failedDeletes, expiredQuotes, purgedIdempotencyKeys };
}

async function mapConcurrent<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const workers = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workers }, async (_, worker) => {
      for (let index = worker; index < items.length; index += workers) {
        await fn(items[index] as T);
      }
    }),
  );
}
