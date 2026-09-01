import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { BillingSku } from '@clipsubtitles/contracts';
import type { AppConfig } from '../config';
import { createBillingProvider } from '../billing/provider';

const planIds = Object.fromEntries(
  [
    'plan_creator_monthly',
    'plan_creator_annual',
    'plan_pro_monthly',
    'plan_pro_annual',
    'plan_studio_monthly',
    'plan_studio_annual',
    'topup_small',
    'topup_medium',
    'topup_large',
  ].map((sku) => [sku, `provider_${sku}`]),
) as Record<BillingSku, string>;

describe('Whop billing provider boundary', () => {
  it('accepts an authentic Standard Webhooks signature over the exact raw body and rejects tampering', () => {
    const webhookSecret = 'ws_test_webhook_secret';
    const provider = createBillingProvider({
      provider: 'whop',
      apiKey: 'test_api_key',
      accountId: 'account_test',
      webhookSecret,
      planIds,
    } satisfies AppConfig['billing']);
    const id = 'evt_signed_boundary';
    const timestamp = Math.floor(Date.now() / 1000);
    const raw = JSON.stringify({
      type: 'payment.succeeded',
      created_at: new Date(timestamp * 1000).toISOString(),
      data: { metadata: { workspace_id: 'ws_test', sku: 'topup_small' } },
    });
    const signature = createHmac('sha256', webhookSecret)
      .update(`${id}.${timestamp}.${raw}`)
      .digest('base64');
    const headers = {
      'webhook-id': id,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': `v1,${signature}`,
    };

    expect(provider.verifyWebhook(raw, headers)).toMatchObject({
      id,
      type: 'payment.succeeded',
      occurredAt: new Date(timestamp * 1000).toISOString(),
      data: { metadata: { workspace_id: 'ws_test', sku: 'topup_small' } },
    });
    expect(() => provider.verifyWebhook(`${raw} `, headers)).toThrow();
  });
});
