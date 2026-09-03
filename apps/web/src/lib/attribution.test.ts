// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureAttribution, readAttribution, trackPaidFunnelEvent } from './attribution';

describe('paid web attribution', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    history.replaceState({}, '', '/');
  });

  afterEach(() => vi.restoreAllMocks());

  it('captures AppRefer and Meta IDs without retaining landing query parameters', () => {
    history.replaceState({}, '', '/pricing?ar_click_id=click_123&fbclid=fb_123&campaign_id=campaign_1&utm_source=meta&private=discarded');
    const attribution = captureAttribution();
    expect(attribution).toMatchObject({
      appreferClickId: 'click_123',
      fbclid: 'fb_123',
      campaignId: 'campaign_1',
      utmSource: 'meta',
      landingUrl: 'http://localhost:3000/pricing',
    });
    expect(attribution?.fbc).toContain('.fb_123');
    expect(JSON.stringify(attribution)).not.toContain('private');
    expect(readAttribution()?.sessionId).toBe(attribution?.sessionId);
  });

  it('does not create attribution state for direct traffic', () => {
    expect(captureAttribution()).toBeUndefined();
    expect(localStorage.length).toBe(0);
  });

  it('sends funnel events only when paid attribution exists', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    trackPaidFunnelEvent('pricing_viewed');
    expect(fetchMock).not.toHaveBeenCalled();

    history.replaceState({}, '', '/?ar_click_id=click_123&utm_source=meta');
    const attribution = captureAttribution();
    trackPaidFunnelEvent('plan_selected', { sku: 'plan_creator_annual' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(request?.body))).toMatchObject({
      event: 'plan_selected',
      attribution: { sessionId: attribution?.sessionId, appreferClickId: 'click_123' },
      properties: { sku: 'plan_creator_annual' },
    });
  });
});
