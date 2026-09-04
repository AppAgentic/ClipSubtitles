'use client';

import type { PaidFunnelEvent, WebAttribution } from '@clipsubtitles/contracts';

const STORAGE_KEY = 'clipsubtitles_attribution';
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

const QUERY_FIELDS = {
  ar_click_id: 'appreferClickId',
  fbclid: 'fbclid',
  campaign_id: 'campaignId',
  campaign_name: 'campaignName',
  adset_id: 'adsetId',
  adset_name: 'adsetName',
  ad_id: 'adId',
  ad_name: 'adName',
  creative_id: 'creativeId',
  placement: 'placement',
  site_source_name: 'siteSourceName',
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_content: 'utmContent',
  utm_term: 'utmTerm',
} as const;

function clean(value: string | null, maxLength = 500): string | undefined {
  const trimmed = value?.trim();
  return trimmed && !/[{}]/.test(trimmed) ? trimmed.slice(0, maxLength) : undefined;
}

function safePageUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return clean(`${url.origin}${url.pathname}`);
  } catch {
    return undefined;
  }
}

export function readAttribution(): WebAttribution | undefined {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY);
    if (!value) return undefined;
    const parsed = JSON.parse(value) as WebAttribution;
    if (!parsed.sessionId || Date.now() - parsed.capturedAt > MAX_AGE_MS) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function captureAttribution(): WebAttribution {
  const params = new URLSearchParams(window.location.search);
  const incoming: Partial<WebAttribution> = {};
  for (const [query, field] of Object.entries(QUERY_FIELDS)) {
    const value = clean(params.get(query), field.endsWith('Name') ? 200 : 500);
    if (value) incoming[field] = value;
  }
  const paidTouch = Boolean(incoming.appreferClickId || incoming.fbclid || incoming.utmSource);
  const existing = readAttribution();
  const now = Date.now();
  const attribution: WebAttribution = {
    ...(existing ?? { sessionId: crypto.randomUUID(), capturedAt: now }),
    ...(paidTouch ? incoming : {}),
    ...(paidTouch || !existing
      ? {
          capturedAt: now,
          landingUrl: safePageUrl(window.location.href),
          referrer: document.referrer ? safePageUrl(document.referrer) : undefined,
        }
      : {}),
  };
  if (!attribution.fbc && attribution.fbclid) attribution.fbc = `fb.1.${now}.${attribution.fbclid}`;
  const encoded = JSON.stringify(attribution);
  sessionStorage.setItem(STORAGE_KEY, encoded);
  localStorage.setItem(STORAGE_KEY, encoded);
  return attribution;
}

export function trackPaidFunnelEvent(
  event: PaidFunnelEvent,
  properties?: Record<string, string | number | boolean>,
): void {
  const attribution = readAttribution() ?? captureAttribution();
  void fetch('/v1/analytics/funnel', {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event, attribution, ...(properties ? { properties } : {}) }),
  }).catch(() => undefined);
}

/** Record a milestone once per paid-attribution browser session. */
export function trackPaidFunnelEventOnce(
  event: PaidFunnelEvent,
  properties?: Record<string, string | number | boolean>,
): void {
  const attribution = readAttribution() ?? captureAttribution();
  const key = `${STORAGE_KEY}:event:${attribution.sessionId}:${event}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  trackPaidFunnelEvent(event, properties);
}
