import { expireOpenQuotes, listExpiredAssets, listExpiredExports, markAssetPurged, markExportPurged, purgeExpiredRevokedTokens, purgeIdempotencyKeys } from '@clipsubtitles/storage';
import type { AppContext } from '../context';
import { audit } from './audit';

export interface SweepResult {
  purgedAssets: number;
  purgedExports: number;
  expiredQuotes: number;
  purgedIdempotencyKeys: number;
}

/** Enforce retention: delete expired media objects and mark records purged. */
export async function runRetentionSweep(ctx: AppContext): Promise<SweepResult> {
  const nowIso = ctx.clock.iso();
  let purgedAssets = 0;
  let purgedExports = 0;
  for (const asset of listExpiredAssets(ctx.db, nowIso, 200)) {
    if (asset.storageKey) await ctx.store.delete(asset.storageKey).catch(() => false);
    if (asset.truthKey) await ctx.store.delete(asset.truthKey).catch(() => false);
    if (markAssetPurged(ctx.db, asset.id, nowIso)) purgedAssets += 1;
  }
  for (const e of listExpiredExports(ctx.db, nowIso, 200)) {
    await ctx.store.delete(e.storageKey).catch(() => false);
    if (markExportPurged(ctx.db, e.id, nowIso)) purgedExports += 1;
  }
  const expiredQuotes = expireOpenQuotes(ctx.db, nowIso);
  purgeExpiredRevokedTokens(ctx.db, nowIso);
  const purgedIdempotencyKeys = purgeIdempotencyKeys(ctx.db, new Date(ctx.clock.now() - 7 * 86_400_000).toISOString());
  if (purgedAssets || purgedExports) {
    audit(ctx, { actorType: 'system', action: 'retention.sweep', metadata: { purgedAssets, purgedExports, expiredQuotes } });
  }
  return { purgedAssets, purgedExports, expiredQuotes, purgedIdempotencyKeys };
}
