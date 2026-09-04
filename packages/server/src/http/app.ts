import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { newId } from '@clipsubtitles/core';
import { requestIdMiddleware, type AppEnv } from '../auth/middleware';
import type { AppContext } from '../context';
import { ApiError, toApiError } from '../errors';
import { registerMcpRoute } from '../mcp/route';
import { audit } from '../services/audit';
import { OPENAPI_INFO, createApi, registerSecuritySchemes, type Api } from './openapi';
import { registerAccountRoutes } from './routes/account';
import { registerAuthRoutes } from './routes/auth';
import { registerAnalyticsRoutes } from './routes/analytics';
import { registerBillingRoutes } from './routes/billing';
import { registerDevRoutes } from './routes/dev';
import { registerExportRoutes } from './routes/exports';
import { registerProjectRoutes } from './routes/projects';
import { registerTaskRoutes } from './routes/tasks';
import { registerWellKnownRoutes } from './routes/wellknown';
import { registerAdminRoutes } from './routes/admin';

export type App = Api;

export function createApp(ctx: AppContext): App {
  const api = createApi();
  registerSecuritySchemes(api);

  api.use('*', requestIdMiddleware());
  api.use('*', secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }));
  api.use(
    '/api/mcp',
    cors({
      origin: '*',
      allowHeaders: [
        'Authorization',
        'Content-Type',
        'Mcp-Session-Id',
        'Mcp-Protocol-Version',
        'Last-Event-ID',
      ],
      exposeHeaders: ['Mcp-Session-Id', 'WWW-Authenticate'],
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    }),
  );
  api.use('/.well-known/*', cors({ origin: '*' }));
  // Native widget uploads use a signed single-use capability, never cookies.
  // Opaque host iframes may send Origin: null; authorize the PUT by its signature.
  api.use('/v1/uploads/*', cors({ origin: '*', allowMethods: ['PUT', 'OPTIONS'], allowHeaders: ['Content-Type'], maxAge: 600 }));
  api.use('*', async (c, next) => {
    // Uploads stream to the object store with their own byte cap; everything else is a small JSON body.
    if (c.req.method === 'PUT' && c.req.path.startsWith('/v1/uploads/')) return next();
    return bodyLimit({
      maxSize: ctx.config.limits.maxJsonBodyBytes,
      onError: () => {
        throw new ApiError('PAYLOAD_TOO_LARGE');
      },
    })(c, next);
  });
  api.use('*', async (c, next) => {
    await next();
    if (c.req.path.startsWith('/v1/') || c.req.path.startsWith('/api/'))
      c.header('Cache-Control', 'no-store');
  });

  registerWellKnownRoutes(api, ctx);
  registerAnalyticsRoutes(api, ctx);
  registerAuthRoutes(api, ctx);
  if (ctx.config.auth.mode === 'mock' && ctx.config.env !== 'production')
    registerDevRoutes(api, ctx);
  registerProjectRoutes(api, ctx);
  registerTaskRoutes(api, ctx);
  registerExportRoutes(api, ctx);
  registerAccountRoutes(api, ctx);
  registerBillingRoutes(api, ctx);
  registerAdminRoutes(api, ctx);
  registerMcpRoute(api, ctx);

  api.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: OPENAPI_INFO,
    servers: [{ url: ctx.config.apiPublicUrl }],
    tags: [
      { name: 'Projects' },
      { name: 'Captions' },
      { name: 'Rendering' },
      { name: 'Tasks' },
      { name: 'Exports' },
      { name: 'Account' },
      { name: 'Billing' },
      { name: 'Admin' },
    ],
  });

  api.notFound((c) => c.json(new ApiError('NOT_FOUND', 'No such route.').toBody(), 404));

  api.onError((err, c) => {
    const apiErr = toApiError(err);
    const principal = c.get('principal');
    if (apiErr.code === 'INTERNAL' || apiErr.internal !== undefined) {
      const errorRef = apiErr.errorRef ?? newId('errorRef');
      apiErr.errorRef = errorRef;
      const internal = apiErr.internal ?? err;
      ctx.logger.error('request failed', {
        errorRef,
        code: apiErr.code,
        method: c.req.method,
        path: c.req.path,
        requestId: c.get('requestId'),
        internal:
          internal instanceof Error
            ? {
                name: internal.name,
                message: internal.message,
                stack: internal.stack?.split('\n').slice(0, 5).join('\n'),
              }
            : internal,
      });
      // The response is already being written: record the audit alongside it.
      void audit(ctx, {
        ...(principal ? { principal } : { actorType: 'system' }),
        action: 'http.error',
        outcome: 'error',
        errorRef,
        metadata: { code: apiErr.code, method: c.req.method, path: c.req.path },
      });
    }
    c.header('Cache-Control', 'no-store');
    return c.json(apiErr.toBody(), apiErr.status as 400);
  });

  return api;
}

export type { AppEnv };
