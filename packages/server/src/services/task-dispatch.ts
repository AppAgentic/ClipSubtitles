import type { AppContext } from '../context';

function boundedErrorCode(err: unknown): string {
  if (typeof (err as { code?: unknown })?.code === 'number' || typeof (err as { code?: unknown })?.code === 'string') {
    return String((err as { code: number | string }).code).slice(0, 80);
  }
  return err instanceof Error ? err.name.slice(0, 80) : 'UNKNOWN';
}

/**
 * Deliver one transactionally-recorded task. Failure is deliberately
 * non-fatal to the originating request: the outbox reconciler retries it.
 */
export async function dispatchTaskBestEffort(
  ctx: AppContext,
  taskId: string,
  expectedGeneration?: number,
): Promise<boolean> {
  const task = await ctx.db.getTaskById(taskId);
  const outbox = await ctx.db.getTaskDispatch(taskId);
  if (!task || !outbox || outbox.deliveredAt) return false;
  if (expectedGeneration !== undefined && outbox.generation !== expectedGeneration) return false;
  const generation = outbox.generation;
  try {
    await ctx.taskDispatcher.dispatch(task, generation);
    return await ctx.db.markTaskDispatched(task.id, generation, ctx.clock.iso());
  } catch (err) {
    const code = boundedErrorCode(err);
    await ctx.db.recordTaskDispatchFailure(task.id, generation, ctx.clock.iso(), code);
    ctx.logger.warn('task dispatch deferred', { taskId: task.id, kind: task.kind, errorCode: code });
    return false;
  }
}

export async function flushTaskDispatchOutbox(ctx: AppContext, limit = 100): Promise<{ attempted: number; delivered: number }> {
  const pending = await ctx.db.listPendingDispatches(ctx.clock.iso(), limit);
  let delivered = 0;
  for (const row of pending)
    if (await dispatchTaskBestEffort(ctx, row.taskId, row.generation)) delivered += 1;
  return { attempted: pending.length, delivered };
}
