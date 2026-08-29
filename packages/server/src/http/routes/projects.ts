import { createRoute, z } from '@hono/zod-openapi';
import {
  CaptionProjectSchema,
  CreatePreviewRequestSchema,
  CreateProjectRequestSchema,
  CreateProjectResponseSchema,
  CreateRenderQuoteRequestSchema,
  CreateRenderRequestSchema,
  GenerateCaptionsRequestSchema,
  PatchProjectRequestSchema,
  PatchProjectResponseSchema,
  ProjectIdSchema,
  ProjectListSchema,
  ProjectQuerySchema,
  RenderQuoteSchema,
  TaskSchema,
  UploadTargetSchema,
} from '@clipsubtitles/contracts';
import { authenticate, principalKey, rateLimit, requireScope } from '../../auth/middleware';
import type { AppContext } from '../../context';
import { createRenderQuote, startGeneration, startPreview, startRender } from '../../services/captions';
import { createProject, createUploadTarget, deleteProject, getProjectView, listProjects, patchProject } from '../../services/projects';
import { idempotencyKeyFrom, withIdempotency } from '../idempotent';
import { SECURITY, errorResponses, jsonBody, jsonResponse, type Api } from '../openapi';

const ProjectParams = z.object({ projectId: ProjectIdSchema });

function parseInclude(include: string | undefined): { includePages: boolean; includeWords: boolean } {
  const parts = (include ?? 'pages').split(',').map((s) => s.trim());
  return { includePages: parts.includes('pages'), includeWords: parts.includes('words') };
}

export function registerProjectRoutes(api: Api, ctx: AppContext): void {
  const auth = authenticate(ctx, { modes: ['bearer', 'session'] });
  const limited = rateLimit(ctx, 'api', principalKey);
  const read = requireScope('captions:read');
  const write = requireScope('captions:write');

  api.openapi(
    createRoute({
      method: 'post',
      path: '/v1/projects',
      tags: ['Projects'],
      summary: 'Create a caption project',
      description: 'Returns an upload target (single bounded PUT) or, when sourceUrl is given, starts a bounded remote import task.',
      security: SECURITY,
      middleware: [auth, limited, write] as const,
      request: { body: jsonBody(CreateProjectRequestSchema) },
      responses: { 201: jsonResponse(CreateProjectResponseSchema, 'Project created'), ...errorResponses('SOURCE_URL_REJECTED', 'IDEMPOTENCY_KEY_REUSED') },
    }),
    async (c) => {
      const body = c.req.valid('json');
      const principal = c.get('principal');
      const key = idempotencyKeyFrom(c, body);
      const out = await withIdempotency(ctx, { workspaceId: principal.workspaceId, scope: 'projects.create', key, payload: body }, () =>
        createProject(ctx, principal, body),
      );
      return c.json(out.body, out.status as 201);
    },
  );

  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/projects',
      tags: ['Projects'],
      summary: 'List projects in the caller workspace',
      security: SECURITY,
      middleware: [auth, limited, read] as const,
      responses: { 200: jsonResponse(ProjectListSchema, 'Projects'), ...errorResponses() },
    }),
    async (c) => c.json({ projects: await listProjects(ctx, c.get('principal')) }, 200),
  );

  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/projects/{projectId}',
      tags: ['Projects'],
      summary: 'Get a project',
      description: 'include=pages,words selects caption pages and a bounded window of transcript words.',
      security: SECURITY,
      middleware: [auth, limited, read] as const,
      request: { params: ProjectParams, query: ProjectQuerySchema },
      responses: { 200: jsonResponse(CaptionProjectSchema, 'Project'), ...errorResponses() },
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const q = c.req.valid('query');
      const { includePages, includeWords } = parseInclude(q.include);
      return c.json(
        await getProjectView(ctx, c.get('principal'), projectId, {
          includePages,
          includeWords,
          ...(q.wordsOffset !== undefined ? { wordsOffset: q.wordsOffset } : {}),
          ...(q.wordsLimit !== undefined ? { wordsLimit: q.wordsLimit } : {}),
        }),
        200,
      );
    },
  );

  api.openapi(
    createRoute({
      method: 'patch',
      path: '/v1/projects/{projectId}',
      tags: ['Projects'],
      summary: 'Apply constrained edits with an optimistic version check',
      security: SECURITY,
      middleware: [auth, limited, write] as const,
      request: { params: ProjectParams, body: jsonBody(PatchProjectRequestSchema) },
      responses: { 200: jsonResponse(PatchProjectResponseSchema, 'Updated project'), ...errorResponses('VERSION_CONFLICT', 'TRANSCRIPT_MISSING') },
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      return c.json(await patchProject(ctx, c.get('principal'), projectId, c.req.valid('json')), 200);
    },
  );

  api.openapi(
    createRoute({
      method: 'delete',
      path: '/v1/projects/{projectId}',
      tags: ['Projects'],
      summary: 'Delete a project and its media immediately',
      security: SECURITY,
      middleware: [auth, limited, write] as const,
      request: { params: ProjectParams },
      responses: { 204: { description: 'Deleted' }, ...errorResponses() },
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      await deleteProject(ctx, c.get('principal'), projectId);
      return c.body(null, 204);
    },
  );

  api.openapi(
    createRoute({
      method: 'post',
      path: '/v1/projects/{projectId}/upload-targets',
      tags: ['Projects'],
      summary: 'Issue a fresh bounded upload target for a project awaiting its source',
      security: SECURITY,
      middleware: [auth, limited, write] as const,
      request: { params: ProjectParams },
      responses: { 201: jsonResponse(UploadTargetSchema, 'Upload target'), ...errorResponses('CONFLICT') },
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      return c.json(await createUploadTarget(ctx, c.get('principal'), projectId), 201);
    },
  );

  api.openapi(
    createRoute({
      method: 'post',
      path: '/v1/projects/{projectId}/captions',
      tags: ['Captions'],
      summary: 'Start transcription, normalization, segmentation, and initial styling',
      security: SECURITY,
      middleware: [auth, limited, write] as const,
      request: { params: ProjectParams, body: jsonBody(GenerateCaptionsRequestSchema) },
      responses: {
        202: jsonResponse(z.object({ task: TaskSchema, project: CaptionProjectSchema }), 'Generation task accepted'),
        ...errorResponses('SOURCE_NOT_READY', 'IDEMPOTENCY_KEY_REUSED'),
      },
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const body = c.req.valid('json');
      const principal = c.get('principal');
      const key = idempotencyKeyFrom(c, body);
      const out = await withIdempotency(ctx, { workspaceId: principal.workspaceId, scope: `captions:${projectId}`, key, payload: body, status: 202 }, () =>
        startGeneration(ctx, principal, projectId, key ? { ...body, idempotencyKey: key } : body),
      );
      return c.json(out.body, out.status as 202);
    },
  );

  api.openapi(
    createRoute({
      method: 'post',
      path: '/v1/projects/{projectId}/previews',
      tags: ['Captions'],
      summary: 'Create a fast low-resolution preview task (free, rate limited)',
      security: SECURITY,
      middleware: [auth, limited, write, rateLimit(ctx, 'previews', principalKey)] as const,
      request: { params: ProjectParams, body: jsonBody(CreatePreviewRequestSchema) },
      responses: { 202: jsonResponse(z.object({ task: TaskSchema }), 'Preview task accepted'), ...errorResponses('SOURCE_NOT_READY', 'TRANSCRIPT_MISSING') },
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const body = c.req.valid('json');
      const principal = c.get('principal');
      const key = idempotencyKeyFrom(c, body);
      const out = await withIdempotency(ctx, { workspaceId: principal.workspaceId, scope: `previews:${projectId}`, key, payload: body, status: 202 }, async () => ({
        task: await startPreview(ctx, principal, projectId, key ? { ...body, idempotencyKey: key } : body),
      }));
      return c.json(out.body, out.status as 202);
    },
  );

  api.openapi(
    createRoute({
      method: 'post',
      path: '/v1/projects/{projectId}/render-quotes',
      tags: ['Rendering'],
      summary: 'Create an immutable render quote (settings, version/hash, expected outputs, credit estimate)',
      security: SECURITY,
      middleware: [auth, limited, write] as const,
      request: { params: ProjectParams, body: jsonBody(CreateRenderQuoteRequestSchema) },
      responses: { 201: jsonResponse(RenderQuoteSchema, 'Quote'), ...errorResponses('SOURCE_NOT_READY', 'TRANSCRIPT_MISSING', 'VERSION_CONFLICT') },
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      return c.json(await createRenderQuote(ctx, c.get('principal'), projectId, c.req.valid('json')), 201);
    },
  );

  api.openapi(
    createRoute({
      method: 'post',
      path: '/v1/projects/{projectId}/renders',
      tags: ['Rendering'],
      summary: 'Consume an approved quote: reserve credits and start the final render',
      description: 'Requires the quote id, the exact approved credit cost, and an idempotency key. Duplicate requests return the same task and never double-charge.',
      security: SECURITY,
      middleware: [auth, limited, write] as const,
      request: { params: ProjectParams, body: jsonBody(CreateRenderRequestSchema) },
      responses: {
        202: jsonResponse(z.object({ task: TaskSchema, quote: RenderQuoteSchema, reservedCredits: z.number().int() }), 'Render task accepted'),
        ...errorResponses('QUOTE_EXPIRED', 'QUOTE_INVALIDATED', 'QUOTE_MISMATCH', 'INSUFFICIENT_CREDITS', 'IDEMPOTENCY_KEY_REUSED'),
      },
    }),
    async (c) => {
      const { projectId } = c.req.valid('param');
      const body = c.req.valid('json');
      const principal = c.get('principal');
      const key = idempotencyKeyFrom(c, body) ?? body.idempotencyKey;
      const out = await withIdempotency(ctx, { workspaceId: principal.workspaceId, scope: `renders:${projectId}`, key, payload: body, status: 202 }, () =>
        startRender(ctx, principal, projectId, { ...body, idempotencyKey: key }),
      );
      return c.json(out.body, out.status as 202);
    },
  );
}
