import { createRoute, z } from '@hono/zod-openapi';
import { ExportSchema, LIMITS, ProjectIdSchema, TaskIdSchema, TaskListSchema, TaskSchema } from '@clipsubtitles/contracts';
import { authenticate, principalKey, rateLimit, requireScope } from '../../auth/middleware';
import type { AppContext } from '../../context';
import { cancelTask, getTaskView, listTasks } from '../../services/tasks';
import { SECURITY, errorResponses, jsonResponse, type Api } from '../openapi';

const TaskParams = z.object({ taskId: TaskIdSchema });

export function registerTaskRoutes(api: Api, ctx: AppContext): void {
  const auth = authenticate(ctx, { modes: ['bearer', 'session'] });
  const limited = rateLimit(ctx, 'api', principalKey);

  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/tasks',
      tags: ['Tasks'],
      summary: 'List recent tasks in the caller workspace',
      security: SECURITY,
      middleware: [auth, limited, requireScope('captions:read')] as const,
      request: { query: z.object({ projectId: ProjectIdSchema.optional(), active: z.enum(['true', 'false']).optional(), limit: z.coerce.number().int().min(1).max(200).optional() }) },
      responses: { 200: jsonResponse(TaskListSchema, 'Tasks'), ...errorResponses() },
    }),
    async (c) => {
      const q = c.req.valid('query');
      return c.json(
        {
          tasks: await listTasks(ctx, c.get('principal'), {
            ...(q.projectId ? { projectId: q.projectId } : {}),
            activeOnly: q.active === 'true',
            limit: q.limit ?? 50,
          }),
        },
        200,
      );
    },
  );

  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/tasks/{taskId}',
      tags: ['Tasks'],
      summary: 'Get durable task progress, bounded errors, and finished exports',
      security: SECURITY,
      middleware: [auth, limited, requireScope('captions:read')] as const,
      request: { params: TaskParams },
      responses: { 200: jsonResponse(z.object({ task: TaskSchema, exports: z.array(ExportSchema).max(LIMITS.maxExportsPerRender).optional() }), 'Task'), ...errorResponses() },
    }),
    async (c) => {
      const { taskId } = c.req.valid('param');
      return c.json(await getTaskView(ctx, c.get('principal'), taskId), 200);
    },
  );

  api.openapi(
    createRoute({
      method: 'post',
      path: '/v1/tasks/{taskId}/cancel',
      tags: ['Tasks'],
      summary: 'Request cancellation (queued tasks cancel immediately, running tasks cooperatively)',
      security: SECURITY,
      middleware: [auth, limited, requireScope('captions:write')] as const,
      request: { params: TaskParams },
      responses: { 200: jsonResponse(z.object({ task: TaskSchema }), 'Task'), ...errorResponses('TASK_NOT_CANCELLABLE') },
    }),
    async (c) => {
      const { taskId } = c.req.valid('param');
      return c.json({ task: await cancelTask(ctx, c.get('principal'), taskId) }, 200);
    },
  );
}
