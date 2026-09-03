import { z } from 'zod';
import { WebAttributionSchema } from './billing';

export const PaidFunnelEventSchema = z.enum([
  'landing_captured',
  'signup_screen_viewed',
  'signup_started',
  'signup_completed',
  'upload_selected',
  'upload_completed',
  'transcript_ready',
  'preview_seen',
  'first_edit_made',
  'style_previewed',
  'export_reviewed',
  'export_started',
  'export_completed',
  'pricing_viewed',
  'plan_selected',
  'checkout_started',
  'checkout_failed',
  'dashboard_viewed',
  'purchase_completed',
]);
export type PaidFunnelEvent = z.infer<typeof PaidFunnelEventSchema>;

export const PaidFunnelEventRequestSchema = z
  .object({
    event: PaidFunnelEventSchema,
    attribution: WebAttributionSchema,
    properties: z
      .record(
        z.string().regex(/^[a-z][a-z0-9_]{0,39}$/i),
        z.union([z.string().max(200), z.number(), z.boolean()]),
      )
      .optional(),
  })
  .strict();
export type PaidFunnelEventRequest = z.infer<typeof PaidFunnelEventRequestSchema>;
