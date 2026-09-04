import { createRoute, z } from '@hono/zod-openapi';
import {
  authenticate,
  principalKey,
  rateLimit,
  requireScope,
  type AppEnv,
} from '../../auth/middleware';
import type { AppContext } from '../../context';
import { ApiError } from '../../errors';
import { SECURITY, errorResponses, jsonBody, jsonResponse, type Api } from '../openapi';
import { audit } from '../../services/audit';
import type { MiddlewareHandler } from 'hono';

const CountSchema = z.number().int().nonnegative();
const OverviewSchema = z.object({
  generatedAt: z.iso.datetime(),
  totals: z.object({
    users: CountSchema,
    activatedUsers: CountSchema,
    projects: CountSchema,
    uploadedVideos: CountSchema,
    transcribedVideos: CountSchema,
    previews: CountSchema,
    exports: CountSchema,
    purchases: CountSchema,
  }),
  jobs: z.object({
    queued: CountSchema,
    running: CountSchema,
    succeeded: CountSchema,
    failed: CountSchema,
    oldestQueuedAt: z.iso.datetime().optional(),
  }),
  funnel: z.array(z.object({ event: z.string(), count: CountSchema })),
  sources: z.array(
    z.object({ source: z.string(), sessions: CountSchema, registrations: CountSchema }),
  ),
  costs: z.object({
    transcriptionMinutes: z.number().nonnegative(),
    estimatedTranscriptionUsd: z.number().nonnegative(),
    storedBytes: CountSchema,
  }),
});
const UserSchema = z.object({
  id: z.string(),
  emailMasked: z.string().optional(),
  createdAt: z.iso.datetime(),
  projects: CountSchema,
  transcriptions: CountSchema,
  exports: CountSchema,
  source: z.string().optional(),
  lastActivityAt: z.iso.datetime().optional(),
});
const JobSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: z.string(),
  progress: CountSchema,
  stage: z.string().optional(),
  attempts: CountSchema,
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().optional(),
  finishedAt: z.iso.datetime().optional(),
  errorCode: z.string().optional(),
  userEmailMasked: z.string().optional(),
});
const TimelineSchema = z.object({
  event: z.string(),
  surface: z.string(),
  occurredAt: z.iso.datetime(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
});

function requireAdmin(ctx: AppContext): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const principal = c.get('principal');
    const user = principal ? await ctx.db.getUser(principal.userId) : null;
    if (!user?.email || !ctx.config.adminEmails.includes(user.email.toLowerCase())) {
      throw new ApiError('FORBIDDEN', 'Administrator access is required.');
    }
    await next();
  };
}

export function registerAdminRoutes(api: Api, ctx: AppContext): void {
  const auth = authenticate(ctx, { modes: ['session'] });
  const middleware = [
    auth,
    rateLimit(ctx, 'api', principalKey),
    requireScope('captions:read'),
    requireAdmin(ctx),
  ];
  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/admin/overview',
      tags: ['Admin'],
      summary: 'Read-only product, funnel, health and cost overview',
      security: SECURITY,
      middleware,
      responses: { 200: jsonResponse(OverviewSchema, 'Admin overview'), ...errorResponses() },
    }),
    async (c) => c.json(await ctx.db.getAdminOverview(ctx.clock.iso()), 200),
  );
  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/admin/users',
      tags: ['Admin'],
      summary: 'Recent users with masked identity and activation counts',
      security: SECURITY,
      middleware,
      request: { query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }) },
      responses: {
        200: jsonResponse(z.object({ users: z.array(UserSchema) }), 'Admin users'),
        ...errorResponses(),
      },
    }),
    async (c) =>
      c.json({ users: await ctx.db.listAdminUsers(c.req.valid('query').limit ?? 100) }, 200),
  );
  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/admin/jobs',
      tags: ['Admin'],
      summary: 'Recent processing jobs and bounded failure codes',
      security: SECURITY,
      middleware,
      request: { query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }) },
      responses: {
        200: jsonResponse(z.object({ jobs: z.array(JobSchema) }), 'Admin jobs'),
        ...errorResponses(),
      },
    }),
    async (c) =>
      c.json({ jobs: await ctx.db.listAdminJobs(c.req.valid('query').limit ?? 100) }, 200),
  );
  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/admin/users/{userId}/timeline',
      tags: ['Admin'],
      summary: 'Privacy-safe lifecycle timeline for one user',
      security: SECURITY,
      middleware,
      request: {
        params: z.object({ userId: z.string().min(8).max(100) }),
        query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }),
      },
      responses: {
        200: jsonResponse(z.object({ events: z.array(TimelineSchema) }), 'User timeline'),
        ...errorResponses(),
      },
    }),
    async (c) => {
      const { userId } = c.req.valid('param');
      return c.json(
        { events: await ctx.db.listAdminUserTimeline(userId, c.req.valid('query').limit ?? 100) },
        200,
      );
    },
  );
  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/admin/funnel',
      tags: ['Admin'],
      summary: 'All-source acquisition and conversion funnel',
      security: SECURITY,
      middleware,
      responses: {
        200: jsonResponse(
          z.object({ funnel: OverviewSchema.shape.funnel, sources: OverviewSchema.shape.sources }),
          'Admin funnel',
        ),
        ...errorResponses(),
      },
    }),
    async (c) => {
      const overview = await ctx.db.getAdminOverview(ctx.clock.iso());
      return c.json({ funnel: overview.funnel, sources: overview.sources }, 200);
    },
  );
  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/admin/system-health',
      tags: ['Admin'],
      summary: 'Queue and processing health',
      security: SECURITY,
      middleware,
      responses: {
        200: jsonResponse(
          z.object({ generatedAt: z.iso.datetime(), jobs: OverviewSchema.shape.jobs }),
          'System health',
        ),
        ...errorResponses(),
      },
    }),
    async (c) => {
      const overview = await ctx.db.getAdminOverview(ctx.clock.iso());
      return c.json({ generatedAt: overview.generatedAt, jobs: overview.jobs }, 200);
    },
  );
  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/admin/costs',
      tags: ['Admin'],
      summary: 'Estimated transcription and storage cost inputs',
      security: SECURITY,
      middleware,
      responses: {
        200: jsonResponse(
          z.object({ generatedAt: z.iso.datetime(), costs: OverviewSchema.shape.costs }),
          'Cost overview',
        ),
        ...errorResponses(),
      },
    }),
    async (c) => {
      const overview = await ctx.db.getAdminOverview(ctx.clock.iso());
      return c.json({ generatedAt: overview.generatedAt, costs: overview.costs }, 200);
    },
  );
  api.openapi(
    createRoute({
      method: 'post',
      path: '/v1/admin/jobs/{taskId}/retry',
      tags: ['Admin'],
      summary: 'Retry one eligible failed non-billable task',
      security: SECURITY,
      middleware,
      request: {
        params: z.object({ taskId: z.string().min(8).max(100) }),
        body: jsonBody(z.object({ confirm: z.literal(true) }).strict()),
      },
      responses: {
        200: jsonResponse(z.object({ queued: z.literal(true) }), 'Task requeued'),
        ...errorResponses('CONFLICT'),
      },
    }),
    async (c) => {
      const { taskId } = c.req.valid('param');
      const changed = await ctx.db.retryAdminTask(taskId, ctx.clock.iso());
      if (!changed)
        throw new ApiError(
          'CONFLICT',
          'Only failed import, upload, transcription and preview tasks can be retried.',
        );
      await audit(ctx, {
        principal: c.get('principal'),
        action: 'admin.task.retry',
        targetType: 'task',
        targetId: taskId,
      });
      return c.json({ queued: true as const }, 200);
    },
  );
}
