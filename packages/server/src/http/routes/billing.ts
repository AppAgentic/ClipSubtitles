import { createRoute, z } from '@hono/zod-openapi';
import {
  BILLING_CATALOG,
  BillingCatalogSchema,
  BillingManagementSessionSchema,
  BillingOverviewSchema,
  CheckoutSessionSchema,
  CreateCheckoutRequestSchema,
} from '@clipsubtitles/contracts';
import { authenticate, clientIp, principalKey, rateLimit, requireScope } from '../../auth/middleware';
import type { AppContext } from '../../context';
import { billingManagementUrl, billingOverview, createCheckout, processBillingWebhook } from '../../services/billing';
import { SECURITY, errorResponses, jsonBody, jsonResponse, type Api } from '../openapi';

export function registerBillingRoutes(api: Api, ctx: AppContext): void {
  const auth = authenticate(ctx, { modes: ['bearer', 'session'] });
  const limited = rateLimit(ctx, 'api', principalKey);
  const anonymous = rateLimit(ctx, 'anonymous', (c) => `ip:${clientIp(c, ctx.config.trustedProxies)}`);

  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/billing/catalog',
      tags: ['Billing'],
      summary: 'Public, versioned plan and top-up catalog',
      responses: { 200: jsonResponse(BillingCatalogSchema, 'Billing catalog') },
    }),
    (c) => c.json(BillingCatalogSchema.parse(BILLING_CATALOG), 200),
  );

  api.openapi(
    createRoute({
      method: 'get',
      path: '/v1/billing',
      tags: ['Billing'],
      summary: 'Current plan, credit pools, and entitlements',
      security: SECURITY,
      middleware: [auth, limited, requireScope('captions:read')] as const,
      responses: { 200: jsonResponse(BillingOverviewSchema, 'Billing overview'), ...errorResponses() },
    }),
    async (c) => c.json(await billingOverview(ctx, c.get('principal').workspaceId), 200),
  );

  api.openapi(
    createRoute({
      method: 'post',
      path: '/v1/billing/checkout',
      tags: ['Billing'],
      summary: 'Create a workspace-bound hosted checkout',
      security: SECURITY,
      middleware: [auth, limited, requireScope('captions:write')] as const,
      request: {
        headers: z.object({ 'idempotency-key': z.string().min(8).max(200).optional() }),
        body: jsonBody(CreateCheckoutRequestSchema),
      },
      responses: { 200: jsonResponse(CheckoutSessionSchema, 'Hosted checkout'), ...errorResponses('PROVIDER_UNAVAILABLE') },
    }),
    async (c) => {
      const body = c.req.valid('json');
      const headers = c.req.valid('header');
      const principal = c.get('principal');
      return c.json(await createCheckout(ctx, {
        workspaceId: principal.workspaceId,
        sku: body.sku,
        source: body.source,
        ...(body.returnTo ? { returnTo: body.returnTo } : {}),
        ...(body.resume ? { resume: body.resume } : {}),
        idempotencyKey: headers['idempotency-key'] ?? `${c.get('requestId')}:${body.sku}`,
      }), 200);
    },
  );

  api.openapi(
    createRoute({
      method: 'post',
      path: '/v1/billing/manage',
      tags: ['Billing'],
      summary: 'Open the provider-hosted subscription management portal',
      security: SECURITY,
      middleware: [auth, limited, requireScope('captions:write')] as const,
      responses: { 200: jsonResponse(BillingManagementSessionSchema, 'Subscription management destination'), ...errorResponses('CONFLICT', 'PROVIDER_UNAVAILABLE') },
    }),
    async (c) => c.json(await billingManagementUrl(ctx, c.get('principal').workspaceId), 200),
  );

  api.post('/v1/billing/webhooks/whop', anonymous, async (c) => {
    const rawBody = await c.req.text();
    const headers: Record<string, string> = {};
    for (const name of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
      const value = c.req.header(name);
      if (value) headers[name] = value;
    }
    return c.json(await processBillingWebhook(ctx, rawBody, headers), 200);
  });
}
