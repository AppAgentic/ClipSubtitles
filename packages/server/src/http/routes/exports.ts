import { Readable } from 'node:stream';
import { createRoute, z } from '@hono/zod-openapi';
import {
  AssetIdSchema,
  ExportIdSchema,
  ExportListSchema,
  ExportSchema,
  ProjectIdSchema,
  SourceAssetSchema,
} from '@clipsubtitles/contracts';
import {
  authenticate,
  clientIp,
  principalKey,
  rateLimit,
  requireScope,
} from '../../auth/middleware';
import { verifyContentSignature } from '../../auth/urls';
import type { AppContext } from '../../context';
import { ApiError } from '../../errors';
import { getExportView, listExports } from '../../services/account';
import { receiveUpload } from '../../services/uploads';
import { assetView } from '../../services/views';
import { SECURITY, errorResponses, jsonResponse, type Api } from '../openapi';
import { streamObject } from '../stream';

const SignedQuery = z.object({
  exp: z.coerce.number().int(),
  ws: z.string().max(64),
  sig: z.string().max(128),
  download: z.enum(['1', '0']).optional(),
});

function checkSignature(
  ctx: AppContext,
  kind: 'asset' | 'export' | 'upload',
  id: string,
  q: z.infer<typeof SignedQuery>,
): void {
  const ok = verifyContentSignature({
    secret: ctx.config.auth.localSecret,
    kind,
    id,
    workspaceId: q.ws,
    expiresAt: q.exp,
    signature: q.sig,
    nowSeconds: Math.floor(ctx.clock.now() / 1000),
  });
  if (!ok) throw new ApiError('UNAUTHENTICATED', 'The signed URL is invalid or expired.');
}

export function registerExportRoutes(api: Api, ctx: AppContext): void {
  const auth = authenticate(ctx, { modes: ['bearer', 'session'] });
  const limited = rateLimit(ctx, 'api', principalKey);
  const anon = rateLimit(ctx, 'anonymous', (c) => `ip:${clientIp(c, ctx.config.trustedProxies)}`);

  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/exports',
      tags: ['Exports'],
      summary: 'List exports in the caller workspace',
      security: SECURITY,
      middleware: [auth, limited, requireScope('captions:read')] as const,
      request: {
        query: z.object({
          projectId: ProjectIdSchema.optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        }),
      },
      responses: { 200: jsonResponse(ExportListSchema, 'Exports'), ...errorResponses() },
    }),
    async (c) => {
      const q = c.req.valid('query');
      return c.json(
        {
          exports: await listExports(ctx, c.get('principal'), {
            ...(q.projectId ? { projectId: q.projectId } : {}),
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
      path: '/v1/exports/{exportId}',
      tags: ['Exports'],
      summary: 'Get export metadata and a short-lived download URL',
      security: SECURITY,
      middleware: [auth, limited, requireScope('captions:read')] as const,
      request: { params: z.object({ exportId: ExportIdSchema }) },
      responses: {
        200: jsonResponse(ExportSchema, 'Export'),
        ...errorResponses('RETENTION_EXPIRED'),
      },
    }),
    async (c) => {
      const { exportId } = c.req.valid('param');
      return c.json(await getExportView(ctx, c.get('principal'), exportId), 200);
    },
  );

  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/exports/{exportId}/content',
      tags: ['Exports'],
      summary: 'Download export bytes via a signed, short-lived URL (supports Range)',
      middleware: [anon] as const,
      request: { params: z.object({ exportId: ExportIdSchema }), query: SignedQuery },
      responses: {
        200: { description: 'File bytes' },
        206: { description: 'Partial content' },
        ...errorResponses('RETENTION_EXPIRED'),
      },
    }),
    async (c) => {
      const { exportId } = c.req.valid('param');
      const q = c.req.valid('query');
      checkSignature(ctx, 'export', exportId, q);
      const e = await ctx.db.getExport(q.ws, exportId);
      if (!e) throw new ApiError('NOT_FOUND');
      if (e.status === 'purged') throw new ApiError('RETENTION_EXPIRED');
      if (ctx.store.signedDownloadUrl) {
        const url = await ctx.store.signedDownloadUrl(e.storageKey, {
          expiresSeconds: Math.max(30, q.exp - Math.floor(ctx.clock.now() / 1000)),
          fileName: e.fileName,
          download: q.download === '1',
          contentType: e.mimeType,
        });
        return c.redirect(url, 302);
      }
      return streamObject({
        store: ctx.store,
        key: e.storageKey,
        mimeType: e.mimeType,
        fileName: e.fileName,
        download: q.download === '1',
        rangeHeader: c.req.header('range'),
      });
    },
  );

  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/assets/{assetId}/content',
      tags: ['Exports'],
      summary: 'Stream source media for the editor via a signed, short-lived URL (supports Range)',
      middleware: [anon] as const,
      request: { params: z.object({ assetId: AssetIdSchema }), query: SignedQuery },
      responses: {
        200: { description: 'Media bytes' },
        206: { description: 'Partial content' },
        ...errorResponses('RETENTION_EXPIRED'),
      },
    }),
    async (c) => {
      const { assetId } = c.req.valid('param');
      const q = c.req.valid('query');
      checkSignature(ctx, 'asset', assetId, q);
      const asset = await ctx.db.getAssetById(assetId);
      if (!asset || asset.workspaceId !== q.ws) throw new ApiError('NOT_FOUND');
      if (asset.status === 'purged' || !asset.storageKey) throw new ApiError('RETENTION_EXPIRED');
      if (ctx.store.signedDownloadUrl) {
        const url = await ctx.store.signedDownloadUrl(asset.storageKey, {
          expiresSeconds: Math.max(30, q.exp - Math.floor(ctx.clock.now() / 1000)),
          ...(asset.fileName ? { fileName: asset.fileName } : {}),
          download: false,
          ...(asset.mimeType ? { contentType: asset.mimeType } : {}),
        });
        return c.redirect(url, 302);
      }
      return streamObject({
        store: ctx.store,
        key: asset.storageKey,
        mimeType: asset.mimeType ?? 'video/mp4',
        rangeHeader: c.req.header('range'),
      });
    },
  );

  api.openapi(
    createRoute({
      method: 'put',
      path: '/v1/uploads/{uploadToken}',
      tags: ['Projects'],
      summary: 'Upload the source media in a single bounded PUT to a signed upload target',
      middleware: [
        rateLimit(
          ctx,
          'uploads',
          (c) => `ws:${c.req.query('ws') ?? clientIp(c, ctx.config.trustedProxies)}`,
        ),
      ] as const,
      request: {
        params: z.object({ uploadToken: z.string().min(16).max(128) }),
        query: SignedQuery,
      },
      responses: {
        200: jsonResponse(z.object({ asset: SourceAssetSchema }), 'Source stored and probed'),
        ...errorResponses(
          'PAYLOAD_TOO_LARGE',
          'UNSUPPORTED_MEDIA',
          'CONFLICT',
          'RETENTION_EXPIRED',
        ),
      },
    }),
    async (c) => {
      const { uploadToken } = c.req.valid('param');
      const q = c.req.valid('query');
      checkSignature(ctx, 'upload', uploadToken, q);
      const body = c.req.raw.body;
      if (!body) throw new ApiError('VALIDATION_FAILED', 'Request body is required.');
      const lengthHeader = c.req.header('content-length');
      const asset = await receiveUpload(ctx, {
        token: uploadToken,
        workspaceId: q.ws,
        stream: Readable.fromWeb(body as never),
        ...(c.req.header('content-type')
          ? { contentType: c.req.header('content-type') as string }
          : {}),
        ...(lengthHeader ? { contentLength: Number(lengthHeader) } : {}),
      });
      return c.json({ asset: assetView(ctx, asset) }, 200);
    },
  );
}
