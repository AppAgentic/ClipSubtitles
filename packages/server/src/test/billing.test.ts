import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BillingSku, CheckoutSession, CheckoutSource } from '@clipsubtitles/contracts';
import type { BillingProvider, BillingWebhook } from '../billing/provider';
import { createHarness, type Harness } from './harness';

class FakeBillingProvider implements BillingProvider {
  readonly name = 'whop' as const;
  event: BillingWebhook = {
    id: 'evt_topup_1',
    type: 'payment.succeeded',
    occurredAt: '2026-08-31T12:00:00.000Z',
    data: { metadata: { workspace_id: '', sku: 'topup_small' } },
  };
  checkoutInput?: {
    workspaceId: string;
    sku: BillingSku;
    source: CheckoutSource;
    redirectUrl: string;
    resume?: string;
    idempotencyKey: string;
  };

  async createCheckout(input: NonNullable<FakeBillingProvider['checkoutInput']>): Promise<CheckoutSession> {
    this.checkoutInput = input;
    return { id: 'checkout_test_1', url: 'https://checkout.example.test/session', sku: input.sku };
  }

  verifyWebhook(): BillingWebhook {
    return this.event;
  }
}

describe('billing checkout and webhook lifecycle', () => {
  let h: Harness;
  let token: string;
  let billing: FakeBillingProvider;
  let workspaceId: string;

  beforeEach(async () => {
    h = await createHarness();
    token = await h.token('mock|billing-test');
    billing = new FakeBillingProvider();
    h.ctx.billing = billing;
    const me = await h.api<{ workspace: { id: string } }>('GET', '/v1/me', { token });
    workspaceId = me.body.workspace.id;
  });

  afterEach(async () => h.cleanup());

  it('creates a workspace-bound checkout with a safe app redirect', async () => {
    const result = await h.api<CheckoutSession>('POST', '/v1/billing/checkout', {
      token,
      headers: { 'idempotency-key': 'checkout-test-1' },
      body: {
        sku: 'plan_pro_monthly',
        source: 'chatgpt',
        returnTo: '//malicious.example/escape',
        resume: 'render:project:quote',
      },
    });
    expect(result.status).toBe(200);
    expect(result.body.url).toBe('https://checkout.example.test/session');
    expect(billing.checkoutInput).toMatchObject({
      workspaceId,
      sku: 'plan_pro_monthly',
      source: 'chatgpt',
      redirectUrl: 'http://127.0.0.1:3100/app/settings?checkout=complete',
      resume: 'render:project:quote',
      idempotencyKey: 'checkout-test-1',
    });
  });

  it('grants a verified top-up exactly once and activates a paid plan', async () => {
    (billing.event.data.metadata as Record<string, string>).workspace_id = workspaceId;
    const headers = {
      'webhook-id': 'evt_topup_1',
      'webhook-timestamp': '1788177600',
      'webhook-signature': 'test-signature',
    };
    const first = await h.api<{ received: boolean; duplicate: boolean }>('POST', '/v1/billing/webhooks/whop', {
      raw: '{}',
      headers,
    });
    const duplicate = await h.api<{ received: boolean; duplicate: boolean }>('POST', '/v1/billing/webhooks/whop', {
      raw: '{}',
      headers,
    });
    expect(first).toMatchObject({ status: 200, body: { received: true, duplicate: false } });
    expect(duplicate).toMatchObject({ status: 200, body: { received: true, duplicate: true } });

    billing.event = {
      id: 'evt_pro_renewal_1',
      type: 'payment.succeeded',
      occurredAt: '2026-08-31T12:01:00.000Z',
      data: {
        metadata: { workspace_id: workspaceId, sku: 'plan_pro_monthly' },
        current_period_end: '2026-09-30T12:01:00.000Z',
        customer_id: 'customer_test',
        membership_id: 'membership_test',
      },
    };
    const renewal = await h.api<{ received: boolean; duplicate: boolean }>('POST', '/v1/billing/webhooks/whop', {
      raw: '{}',
      headers: { ...headers, 'webhook-id': 'evt_pro_renewal_1' },
    });
    expect(renewal.status).toBe(200);

    const overview = await h.api<{
      planId: string;
      status: string;
      credits: { available: number };
      pools: Array<{ kind: string; available: number }>;
      entitlements: { apiAccess: boolean; activeRenderLimit: number };
    }>('GET', '/v1/billing', { token });
    expect(overview.body).toMatchObject({
      planId: 'pro',
      status: 'active',
      credits: { available: 1_210 },
      entitlements: { apiAccess: true, activeRenderLimit: 2 },
    });
    expect(overview.body.pools).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'subscription', available: 1_000 }),
      expect.objectContaining({ kind: 'free', available: 10 }),
      expect.objectContaining({ kind: 'purchased', available: 200 }),
    ]));
  });

  it('grants the full prepaid credit allowance for an annual plan', async () => {
    billing.event = {
      id: 'evt_creator_annual_1',
      type: 'payment.succeeded',
      occurredAt: '2026-09-01T12:01:00.000Z',
      data: {
        metadata: { workspace_id: workspaceId, sku: 'plan_creator_annual' },
        current_period_end: '2027-09-01T12:01:00.000Z',
        customer_id: 'customer_annual',
        membership_id: 'membership_annual',
      },
    };
    const result = await h.api<{ received: boolean; duplicate: boolean }>('POST', '/v1/billing/webhooks/whop', {
      raw: '{}',
      headers: {
        'webhook-id': 'evt_creator_annual_1',
        'webhook-timestamp': '1788260460',
        'webhook-signature': 'test-signature',
      },
    });
    expect(result).toMatchObject({ status: 200, body: { received: true, duplicate: false } });

    const overview = await h.api<{
      planId: string;
      credits: { available: number };
      pools: Array<{ kind: string; available: number; expiresAt?: string }>;
    }>('GET', '/v1/billing', { token });
    expect(overview.body).toMatchObject({ planId: 'creator', credits: { available: 3_610 } });
    expect(overview.body.pools).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'subscription', available: 3_600, expiresAt: '2027-11-01T12:01:00.000Z' }),
      expect.objectContaining({ kind: 'free', available: 10 }),
    ]));
  });
});
