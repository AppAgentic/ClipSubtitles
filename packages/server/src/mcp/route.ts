import type { Hono } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authenticate, principalKey, rateLimit, type AppEnv } from '../auth/middleware';
import type { AppContext } from '../context';
import { createMcpServer } from './server';

/**
 * Remote MCP endpoint over Streamable HTTP. Stateless: every request gets a
 * fresh server bound to the verified bearer principal, so no cross-user state
 * can leak between sessions.
 */
export function registerMcpRoute(app: Hono<AppEnv>, ctx: AppContext): void {
  app.all('/api/mcp', authenticate(ctx, { modes: ['bearer'] }), rateLimit(ctx, 'api', principalKey), async (c) => {
    const principal = c.get('principal');
    const server = createMcpServer(ctx, principal);
    // No sessionIdGenerator => stateless mode (no session ids, no cross-request state).
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    await server.connect(transport);
    const header = c.req.header('authorization') ?? '';
    const token = header.replace(/^Bearer\s+/i, '');
    try {
      const response = await transport.handleRequest(c.req.raw, {
        authInfo: {
          token,
          clientId: principal.clientId ?? 'unknown',
          scopes: principal.scopes,
          extra: { userId: principal.userId, workspaceId: principal.workspaceId },
        },
      });
      return response;
    } finally {
      // JSON response mode: the body is materialized before handleRequest resolves.
      queueMicrotask(() => {
        server.close().catch(() => undefined);
      });
    }
  });
}
