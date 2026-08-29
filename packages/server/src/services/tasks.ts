import type { Export, Task } from '@clipsubtitles/contracts';
import { getTask, listExports, listTasks as listTaskRecords, requestCancel, toPublicTask } from '@clipsubtitles/storage';
import type { Principal } from '../auth/principal';
import type { AppContext } from '../context';
import { ApiError } from '../errors';
import { audit } from './audit';
import { releaseForTask } from './billing';
import { exportView } from './views';

export function getTaskView(ctx: AppContext, principal: Principal, taskId: string): { task: Task; exports?: Export[] } {
  const task = getTask(ctx.db, principal.workspaceId, taskId);
  if (!task) throw new ApiError('NOT_FOUND');
  const view: { task: Task; exports?: Export[] } = { task: toPublicTask(task) };
  if ((task.kind === 'render_export' || task.kind === 'render_preview') && task.status === 'succeeded') {
    view.exports = listExports(ctx.db, principal.workspaceId, { taskId: task.id, limit: 10 }).map((e) => exportView(ctx, e));
  }
  return view;
}

export function listTasks(ctx: AppContext, principal: Principal, opts: { projectId?: string; activeOnly?: boolean; limit?: number } = {}): Task[] {
  return listTaskRecords(ctx.db, principal.workspaceId, opts).map(toPublicTask);
}

export function cancelTask(ctx: AppContext, principal: Principal, taskId: string): Task {
  const result = requestCancel(ctx.db, principal.workspaceId, taskId, ctx.clock.iso());
  if (result.outcome === 'not_found' || !result.task) throw new ApiError('NOT_FOUND');
  if (result.outcome === 'not_cancellable') throw new ApiError('TASK_NOT_CANCELLABLE');
  if (result.outcome === 'cancelled' && result.task.kind === 'render_export') releaseForTask(ctx, result.task.id, 'cancelled before start');
  audit(ctx, { principal, action: 'task.cancel', targetType: 'task', targetId: taskId, metadata: { outcome: result.outcome, kind: result.task.kind } });
  return toPublicTask(result.task);
}
