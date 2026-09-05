// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_KEY, readPrivacyConsent, savePrivacyConsent } from './privacy-consent';
import { captureAttribution, readCheckoutAttribution, trackPaidFunnelEvent } from './attribution';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState({}, '', '/?fbclid=ad-id');
});
afterEach(() => vi.restoreAllMocks());

describe('privacy choices enforce processing boundaries', () => {
  it('does not store attribution or send analytics before consent or after essential-only choice', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(captureAttribution()).toBeUndefined();
    trackPaidFunnelEvent('pricing_viewed');
    expect(localStorage.length).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    savePrivacyConsent({ analytics: false, marketing: false });
    expect(captureAttribution()).toBeUndefined();
    expect(readCheckoutAttribution()).toBeUndefined();
    expect(localStorage.length).toBe(1);
  });
  it('allows usage analytics independently without advertising IDs or purchase forwarding metadata', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    savePrivacyConsent({ analytics: true, marketing: false });
    expect(captureAttribution()?.fbclid).toBeUndefined();
    trackPaidFunnelEvent('pricing_viewed');
    expect(fetch).toHaveBeenCalledOnce();
    expect(readCheckoutAttribution()).toBeUndefined();
  });
  it('allows advertising attribution independently without usage events', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    savePrivacyConsent({ analytics: false, marketing: true });
    expect(readCheckoutAttribution()?.fbclid).toBe('ad-id');
    trackPaidFunnelEvent('pricing_viewed');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('withdrawal clears persisted identifiers and blocks later events and checkout reuse', () => {
    savePrivacyConsent({ analytics: true, marketing: true });
    captureAttribution();
    const fetch = vi.spyOn(globalThis, 'fetch');
    savePrivacyConsent({ analytics: false, marketing: false });
    expect(localStorage.getItem('clipsubtitles_attribution')).toBeNull();
    expect(sessionStorage.getItem('clipsubtitles_attribution')).toBeNull();
    trackPaidFunnelEvent('pricing_viewed');
    expect(fetch).not.toHaveBeenCalled();
    expect(readCheckoutAttribution()).toBeUndefined();
  });
  it('does not leak old per-tab advertising IDs after another tab withdraws advertising permission', () => {
    savePrivacyConsent({ analytics: true, marketing: true });
    captureAttribution();
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ analytics: true, marketing: false, savedAt: Date.now() }),
    );
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    trackPaidFunnelEvent('pricing_viewed');
    expect(JSON.stringify(fetch.mock.calls[0]?.[1]?.body)).not.toContain('ad-id');
    expect(readCheckoutAttribution()).toBeUndefined();
  });
  it('rejects expired or malformed saved preferences', () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ analytics: true, marketing: true, savedAt: 0 }),
    );
    expect(readPrivacyConsent()).toBeUndefined();
    localStorage.setItem(CONSENT_KEY, '{broken');
    expect(captureAttribution()).toBeUndefined();
  });
});
