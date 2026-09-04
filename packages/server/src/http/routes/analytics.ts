import { PaidFunnelEventRequestSchema } from '@clipsubtitles/contracts';
import { clientIp, rateLimit } from '../../auth/middleware';
import { authenticate } from '../../auth/middleware';
import type { AppContext } from '../../context';
import { ApiError } from '../../errors';
import { audit } from '../../services/audit';
import type { Api } from '../openapi';

export function registerAnalyticsRoutes(api: Api, ctx: AppContext): void {
  const limited = rateLimit(
    ctx,
    'anonymous',
    (c) => `ip:${clientIp(c, ctx.config.trustedProxies)}`,
  );
  const optionalAuth = authenticate(ctx, { modes: ['session'], optional: true });
  api.post('/v1/analytics/funnel', limited, optionalAuth, async (c) => {
    const parsed = PaidFunnelEventRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Invalid analytics event.');
    const { event, attribution, properties } = parsed.data;
    const principal = c.get('principal');
    const campaignName = attribution.campaignName ?? attribution.utmCampaign;
    const source = classifySource(
      attribution.utmSource,
      attribution.referrer,
      attribution.fbclid,
      attribution.appreferClickId,
    );
    await ctx.db.recordAnalyticsEvent({
      sessionId: attribution.sessionId,
      source,
      ...(attribution.utmMedium ? { medium: attribution.utmMedium } : {}),
      ...(attribution.campaignId ? { campaignId: attribution.campaignId } : {}),
      ...(campaignName ? { campaignName } : {}),
      ...(attribution.adsetId ? { adsetId: attribution.adsetId } : {}),
      ...(attribution.adId ? { adId: attribution.adId } : {}),
      ...(attribution.creativeId ? { creativeId: attribution.creativeId } : {}),
      ...(attribution.appreferClickId ? { appreferClickId: attribution.appreferClickId } : {}),
      ...(attribution.landingUrl ? { landingUrl: attribution.landingUrl } : {}),
      ...(attribution.referrer ? { referrer: attribution.referrer } : {}),
      event,
      surface: 'web',
      ...(principal ? { userId: principal.userId, workspaceId: principal.workspaceId } : {}),
      ...(typeof properties?.project_id === 'string' ? { projectId: properties.project_id } : {}),
      ...(typeof properties?.task_id === 'string' ? { taskId: properties.task_id } : {}),
      ...(properties ? { properties } : {}),
      now: ctx.clock.iso(),
    });
    await audit(ctx, {
      actorType: 'system',
      action: `paid_funnel.${event}`,
      targetType: 'funnel_session',
      targetId: attribution.sessionId,
      metadata: {
        campaignId: attribution.campaignId,
        adsetId: attribution.adsetId,
        adId: attribution.adId,
        creativeId: attribution.creativeId,
        placement: attribution.placement,
        utmSource: attribution.utmSource,
        utmCampaign: attribution.utmCampaign,
        appreferClickId: attribution.appreferClickId,
        properties,
      },
    });
    return c.json({ recorded: true }, 200);
  });
}

function classifySource(
  utmSource?: string,
  referrer?: string,
  fbclid?: string,
  appreferClickId?: string,
): string {
  if (
    fbclid ||
    appreferClickId ||
    utmSource?.toLowerCase() === 'facebook' ||
    utmSource?.toLowerCase() === 'meta'
  )
    return 'meta';
  if (utmSource) return utmSource.toLowerCase().slice(0, 80);
  if (!referrer) return 'direct';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    if (/google\.|bing\.|duckduckgo\.|yahoo\./.test(host)) return 'organic-search';
    if (/chatgpt\.com|claude\.ai|perplexity\.ai/.test(host)) return 'agent-referral';
    return 'referral';
  } catch {
    return 'referral';
  }
}
