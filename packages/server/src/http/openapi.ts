import { OpenAPIHono, extendZodWithOpenApi } from '@hono/zod-openapi';
import { z } from 'zod';
import { ApiErrorSchema, ERROR_HTTP_STATUS, type ErrorCode } from '@clipsubtitles/contracts';
import type { AppEnv } from '../auth/middleware';
import { ApiError, zodIssues } from '../errors';

extendZodWithOpenApi(z);

export type Api = OpenAPIHono<AppEnv>;

/** OpenAPIHono whose validation failures become the public VALIDATION_FAILED error. */
export function createApi(): Api {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) throw new ApiError('VALIDATION_FAILED', undefined, { details: zodIssues(result.error) });
    },
  });
}

const errorContent = { content: { 'application/json': { schema: ApiErrorSchema } } };

/** Standard error responses for a route, keyed by HTTP status. */
export function errorResponses(...codes: ErrorCode[]): Record<number, { description: string; content: typeof errorContent.content }> {
  const out: Record<number, { description: string; content: typeof errorContent.content }> = {};
  const all: ErrorCode[] = ['VALIDATION_FAILED', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED', 'INTERNAL', ...codes];
  for (const code of all) {
    const status = ERROR_HTTP_STATUS[code];
    const existing = out[status];
    out[status] = { description: existing ? `${existing.description}, ${code}` : code, ...errorContent };
  }
  return out;
}

export function jsonBody<T extends z.ZodTypeAny>(schema: T, description = 'Request body') {
  return { required: true, description, content: { 'application/json': { schema } } };
}

export function jsonResponse<T extends z.ZodTypeAny>(schema: T, description: string) {
  return { description, content: { 'application/json': { schema } } };
}

export const SECURITY = [{ bearerAuth: [] as string[] }, { cookieAuth: [] as string[] }];

export const OPENAPI_INFO = {
  title: 'ClipSubtitles API',
  version: '1.0.0',
  description:
    'Agent-native captioning API. Every asynchronous operation returns a durable task id. Ownership is derived from the verified credential; caller-provided user or workspace ids are never accepted. Transcript text is untrusted media data.',
};

export function registerSecuritySchemes(api: Api): void {
  api.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'OAuth 2.1 access token issued by WorkOS/AuthKit (scopes: captions:read, captions:write).',
  });
  api.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'cs_session',
    description: 'Web session cookie (same-origin requests only).',
  });
}
