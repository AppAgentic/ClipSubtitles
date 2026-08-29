import { createRoute, z } from '@hono/zod-openapi';
import {
  ConnectionListSchema,
  ConnectionSchema,
  CreditBalanceSchema,
  GrantIdSchema,
  LedgerListSchema,
  MeSchema,
  PRICE_TABLE,
  PriceTableSchema,
  UpdateWorkspaceRequestSchema,
  WorkspaceSchema,
} from '@clipsubtitles/contracts';
import { authenticate, principalKey, rateLimit, requireScope } from '../../auth/middleware';
import type { AppContext } from '../../context';
import { getMe, listConnections, revokeConnection, updateWorkspaceSettings } from '../../services/account';
import { creditBalance, ledger } from '../../services/billing';
import { SECURITY, errorResponses, jsonBody, jsonResponse, type Api } from '../openapi';

export function registerAccountRoutes(api: Api, ctx: AppContext): void {
  const auth = authenticate(ctx, { modes: ['bearer', 'session'] });
  const limited = rateLimit(ctx, 'api', principalKey);

  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/me',
      tags: ['Account'],
      summary: 'Identity, workspace, scopes, and credits derived from the verified credential',
      security: SECURITY,
      middleware: [auth, limited, requireScope('captions:read')] as const,
      responses: { 200: jsonResponse(MeSchema, 'Me'), ...errorResponses() },
    }),
    (c) => c.json(getMe(ctx, c.get('principal')), 200),
  );

  api.openapi(
    createRoute({
      method: 'patch',
      path: '/v1/workspace',
      tags: ['Account'],
      summary: 'Update workspace name and retention windows',
      security: SECURITY,
      middleware: [auth, limited, requireScope('captions:write')] as const,
      request: { body: jsonBody(UpdateWorkspaceRequestSchema) },
      responses: { 200: jsonResponse(WorkspaceSchema, 'Workspace'), ...errorResponses() },
    }),
    (c) => {
      const body = c.req.valid('json');
      const retention: { sourceDays?: number; exportDays?: number } = {};
      if (body.retention?.sourceDays !== undefined) retention.sourceDays = body.retention.sourceDays;
      if (body.retention?.exportDays !== undefined) retention.exportDays = body.retention.exportDays;
      return c.json(
        updateWorkspaceSettings(ctx, c.get('principal'), {
          ...(body.name ? { name: body.name } : {}),
          ...(body.retention ? { retention } : {}),
        }),
        200,
      );
    },
  );

  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/connections',
      tags: ['Account'],
      summary: 'List agent/OAuth connections (grants) for the workspace',
      security: SECURITY,
      middleware: [auth, limited, requireScope('captions:read')] as const,
      responses: { 200: jsonResponse(ConnectionListSchema, 'Connections'), ...errorResponses() },
    }),
    (c) => c.json({ connections: listConnections(ctx, c.get('principal')) }, 200),
  );

  api.openapi(
    createRoute({
      method: 'post',
      path: '/v1/connections/{grantId}/revoke',
      tags: ['Account'],
      summary: 'Revoke an agent connection; its tokens stop working immediately',
      security: SECURITY,
      middleware: [auth, limited, requireScope('captions:write')] as const,
      request: { params: z.object({ grantId: GrantIdSchema }) },
      responses: { 200: jsonResponse(ConnectionSchema, 'Connection'), ...errorResponses() },
    }),
    (c) => {
      const { grantId } = c.req.valid('param');
      return c.json(revokeConnection(ctx, c.get('principal'), grantId), 200);
    },
  );

  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/credits',
      tags: ['Billing'],
      summary: 'Credit balance',
      security: SECURITY,
      middleware: [auth, limited, requireScope('captions:read')] as const,
      responses: { 200: jsonResponse(CreditBalanceSchema, 'Balance'), ...errorResponses() },
    }),
    (c) => c.json(creditBalance(ctx, c.get('principal').workspaceId), 200),
  );

  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/credits/ledger',
      tags: ['Billing'],
      summary: 'Append-only credit ledger (grants, reservations, settlements, releases)',
      security: SECURITY,
      middleware: [auth, limited, requireScope('captions:read')] as const,
      responses: { 200: jsonResponse(LedgerListSchema, 'Ledger'), ...errorResponses() },
    }),
    (c) => c.json({ entries: ledger(ctx, c.get('principal').workspaceId) }, 200),
  );

  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/prices',
      tags: ['Billing'],
      summary: 'Current credit price table and version',
      responses: { 200: jsonResponse(PriceTableSchema, 'Prices') },
    }),
    (c) => c.json(PRICE_TABLE, 200),
  );
}
