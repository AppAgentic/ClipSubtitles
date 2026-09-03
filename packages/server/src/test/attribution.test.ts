import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkoutAttributionMetadata, forwardPurchaseToAppRefer } from '../services/attribution';
import type { AppContext } from '../context';

afterEach(() => vi.restoreAllMocks());

describe('paid attribution', () => {
  it('bounds and flattens campaign data for Whop metadata', () => {
    const metadata = checkoutAttributionMetadata({
      sessionId: 'session_12345678', capturedAt: 1, fbclid: 'fb_123',
      campaignId: 'campaign_1', adsetId: 'adset_1', adId: 'ad_1',
      utmSource: 'meta', utmCampaign: 'agent-launch',
      landingUrl: 'https://clipsubtitles.com/?fbclid=fb_123&private=discarded',
    }, 'checkout-123');
    expect(metadata).toMatchObject({
      web_funnel_session_id: 'session_12345678', fbclid: 'fb_123', campaign_id: 'campaign_1',
      adset_id: 'adset_1', ad_id: 'ad_1', utm_source: 'meta', utm_campaign: 'agent-launch',
      landing_url: 'https://clipsubtitles.com/',
    });
    expect(metadata.apprefer_event_id).toMatch(/^clipsubtitles_purchase_[a-f0-9]{64}$/);
    expect(metadata.landing_url).not.toContain('private');
  });

  it('returns no attribution metadata for direct checkout', () => {
    expect(checkoutAttributionMetadata(undefined, 'checkout-123')).toEqual({});
  });

  it('configures the click before forwarding a deduplicated purchase', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const ctx = {
      config: { appRefer: { apiKey: 'test_key' } },
    } as unknown as AppContext;
    const result = await forwardPurchaseToAppRefer(ctx, {
      id: 'payment_123',
      type: 'payment.succeeded',
      data: {
        total: 12,
        currency: 'gbp',
        metadata: {
          web_funnel_session_id: 'session_12345678',
          apprefer_click_id: 'click_123',
          apprefer_event_id: 'clipsubtitles_purchase_123',
          sku: 'plan_creator_annual',
        },
      },
    });

    expect(result).toBe('forwarded');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://apprefer.com/api/track/configure');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      device_id: 'session_12345678', ar_click_id: 'click_123', device_info: { platform: 'web' },
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://apprefer.com/api/track/event');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      device_id: 'session_12345678', event_name: 'purchase', event_id: 'clipsubtitles_purchase_123',
      revenue: 12, currency: 'GBP', properties: { payment_id: 'payment_123', sku: 'plan_creator_annual' },
    });
  });

  it('does not call AppRefer for an unattributed payment', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const ctx = { config: { appRefer: { apiKey: 'test_key' } } } as unknown as AppContext;
    await expect(forwardPurchaseToAppRefer(ctx, {
      id: 'payment_direct', type: 'payment.succeeded', data: { total: 12, currency: 'gbp', metadata: {} },
    })).resolves.toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
