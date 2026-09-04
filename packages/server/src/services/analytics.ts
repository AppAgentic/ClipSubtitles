import type { Principal } from '../auth/principal';
import type { AppContext } from '../context';

/** Durable lifecycle events derived by the API, independent of browser JS. */
export async function recordLifecycle(
  ctx: AppContext,
  principal: Principal,
  event: string,
  refs: {
    projectId?: string;
    taskId?: string;
    properties?: Record<string, string | number | boolean>;
  } = {},
): Promise<void> {
  await ctx.db.recordAnalyticsEvent({
    sessionId: `server-${principal.workspaceId}`,
    source: 'internal',
    event,
    surface: principal.kind === 'bearer' ? 'api' : 'web',
    userId: principal.userId,
    workspaceId: principal.workspaceId,
    ...refs,
    now: ctx.clock.iso(),
  }).catch((error) => {
    ctx.logger.warn('analytics lifecycle event not recorded', { event, error: error instanceof Error ? error.message : String(error) });
  });
}
