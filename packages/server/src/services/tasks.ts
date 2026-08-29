import type { Export, Task } from '@clipsubtitles/contracts';
import { toPublicTask } from '@clipsubtitles/storage';
import type { Principal } from '../auth/principal';
import type { AppContext } from '../context';
import { ApiError } from '../errors';
import { audit } from './audit';
import { releaseForTask } from './billing';
import { exportView } from './views';

export async function getTaskView(ctx: AppContext, principal: Principal, taskId: string): Promise<{ task: Task; exports?: Export[] }> {
  const task = await ctx.db.getTask(principal.workspaceId, taskId);
  if (!task) throw new ApiError('NOT_FOUND');
  const view: { task: Task; exports?: Export[] } = { task: toPublicTask(task) };
  if ((task.kind === 'render_export' || task.kind === 'render_preview') && task.status === 'succeeded') {
    const rows = await ctx.db.listExports(principal.workspaceId, { taskId: task.id, limit: 10 });
    view.exports = rows.map((e) => exportView(ctx, e));
  }
  return view;
}

export async function listTasks(ctx: AppContext, principal: Principal, opts: { projectId?: string; activeOnly?: boolean; limit?: number } = {}): Promise<Task[]> {
  return (await ctx.db.listTasks(principal.workspaceId, opts)).map(toPublicTask);
}

export async function cancelTask(ctx: AppContext, principal: Principal, taskId: string): Promise<Task> {
  const result = await ctx.db.requestCancel(principal.workspaceId, taskId, ctx.clock.iso());
  if (result.outcome === 'not_found' || !result.task) throw new ApiError('NOT_FOUND');
  if (result.outcome === 'not_cancellable') throw new ApiError('TASK_NOT_CANCELLABLE');
  if (result.outcome === 'cancelled' && result.task.kind === 'render_export') await releaseForTask(ctx, result.task.id, 'cancelled before start');
  await audit(ctx, { principal, action: 'task.cancel', targetType: 'task', targetId: taskId, metadata: { outcome: result.outcome, kind: result.task.kind } });
  return toPublicTask(result.task);
}
