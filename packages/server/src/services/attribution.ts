import { createHash } from 'node:crypto';
import type { WebAttribution } from '@clipsubtitles/contracts';
import type { AppContext } from '../context';

function clean(value: unknown, max = 500): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && !/[{}]/.test(trimmed) ? trimmed.slice(0, max) : undefined;
}

function safeUrl(value: unknown): string | undefined {
  const candidate = clean(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? `${url.origin}${url.pathname}`.slice(0, 500) : undefined;
  } catch { return undefined; }
}

export function checkoutAttributionMetadata(attribution: WebAttribution | undefined, eventSeed: string): Record<string, string> {
  if (!attribution) return {};
  const values: Record<string, string | undefined> = {
    web_funnel_session_id: clean(attribution.sessionId, 100),
    apprefer_click_id: clean(attribution.appreferClickId), fbclid: clean(attribution.fbclid),
    fbp: clean(attribution.fbp, 200), fbc: clean(attribution.fbc),
    campaign_id: clean(attribution.campaignId, 200), campaign_name: clean(attribution.campaignName, 200),
    adset_id: clean(attribution.adsetId, 200), adset_name: clean(attribution.adsetName, 200),
    ad_id: clean(attribution.adId, 200), ad_name: clean(attribution.adName, 200),
    creative_id: clean(attribution.creativeId, 200), placement: clean(attribution.placement, 200),
    site_source_name: clean(attribution.siteSourceName, 200), utm_source: clean(attribution.utmSource, 200),
    utm_medium: clean(attribution.utmMedium, 200), utm_campaign: clean(attribution.utmCampaign, 200),
    utm_content: clean(attribution.utmContent, 200), utm_term: clean(attribution.utmTerm, 200),
    landing_url: safeUrl(attribution.landingUrl), referrer: safeUrl(attribution.referrer),
    apprefer_event_id: `clipsubtitles_purchase_${createHash('sha256').update(eventSeed).digest('hex')}`,
  };
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

function metadataFromEvent(data: Record<string, unknown>): Record<string, unknown> {
  if (data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)) return data.metadata as Record<string, unknown>;
  for (const key of ['payment', 'membership', 'checkout_configuration']) {
    const nested = data[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const metadata = (nested as Record<string, unknown>).metadata;
      if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) return metadata as Record<string, unknown>;
    }
  }
  return {};
}

async function ensureAppReferAttribution(
  apiKey: string,
  deviceId: string,
  appreferClickId: string | undefined,
): Promise<void> {
  const response = await fetch('https://apprefer.com/api/track/configure', {
    method: 'POST',
    signal: AbortSignal.timeout(8_000),
    headers: { 'content-type': 'application/json', 'x-apprefer-key': apiKey },
    body: JSON.stringify({
      device_id: deviceId,
      ...(appreferClickId ? { ar_click_id: appreferClickId } : {}),
      device_info: { platform: 'web' },
    }),
  });
  if (!response.ok) throw new Error(`AppRefer attribution configuration failed (${response.status})`);
}

export async function forwardPurchaseToAppRefer(ctx: AppContext, event: { id: string; type: string; data: Record<string, unknown> }): Promise<'forwarded' | 'skipped'> {
  const apiKey = ctx.config.appRefer.apiKey;
  const normalizedType = event.type.toLowerCase();
  if (!apiKey || !normalizedType.includes('payment') || (!normalizedType.includes('succeed') && !normalizedType.includes('paid'))) return 'skipped';
  const metadata = metadataFromEvent(event.data);
  const deviceId = clean(metadata.web_funnel_session_id, 100);
  const eventId = clean(metadata.apprefer_event_id, 200);
  if (!deviceId || !eventId) return 'skipped';
  const revenue = Number(event.data.total ?? event.data.subtotal ?? 0);
  if (!Number.isFinite(revenue) || revenue <= 0) return 'skipped';
  await ensureAppReferAttribution(apiKey, deviceId, clean(metadata.apprefer_click_id));
  const response = await fetch('https://apprefer.com/api/track/event', {
    method: 'POST', signal: AbortSignal.timeout(8_000),
    headers: { 'content-type': 'application/json', 'x-apprefer-key': apiKey },
    body: JSON.stringify({
      device_id: deviceId, event_name: 'purchase', event_id: eventId, revenue,
      currency: clean(event.data.currency, 8)?.toUpperCase() ?? 'USD',
      properties: {
        payment_id: event.id, apprefer_click_id: clean(metadata.apprefer_click_id),
        campaign_id: clean(metadata.campaign_id, 200), adset_id: clean(metadata.adset_id, 200),
        ad_id: clean(metadata.ad_id, 200), utm_source: clean(metadata.utm_source, 200),
        utm_campaign: clean(metadata.utm_campaign, 200), sku: clean(metadata.sku, 100),
      },
    }),
  });
  if (!response.ok) throw new Error(`AppRefer purchase forwarding failed (${response.status})`);
  return 'forwarded';
}
