import { PaidFunnelEventRequestSchema } from '@clipsubtitles/contracts';
import { clientIp, rateLimit } from '../../auth/middleware';
import type { AppContext } from '../../context';
import { ApiError } from '../../errors';
import { audit } from '../../services/audit';
import type { Api } from '../openapi';

export function registerAnalyticsRoutes(api: Api, ctx: AppContext): void {
  const limited = rateLimit(ctx, 'anonymous', (c) => `ip:${clientIp(c, ctx.config.trustedProxies)}`);
  api.post('/v1/analytics/funnel', limited, async (c) => {
    const parsed = PaidFunnelEventRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Invalid analytics event.');
    const { event, attribution, properties } = parsed.data;
    await audit(ctx, {
      actorType: 'system', action: `paid_funnel.${event}`, targetType: 'funnel_session',
      targetId: attribution.sessionId,
      metadata: {
        campaignId: attribution.campaignId, adsetId: attribution.adsetId, adId: attribution.adId,
        creativeId: attribution.creativeId, placement: attribution.placement,
        utmSource: attribution.utmSource, utmCampaign: attribution.utmCampaign,
        appreferClickId: attribution.appreferClickId, properties,
      },
    });
    return c.json({ recorded: true }, 200);
  });
}
