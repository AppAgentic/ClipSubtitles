import { z } from 'zod';
import { OutputKindSchema, ResolutionSchema } from './render';

export const PRICE_VERSION = '2026-08-v1';
export const BILLING_CATALOG_VERSION = '2026-09-launch-v4';

/**
 * Credit price table. Credits per billable output minute; subtitle files are
 * free; previews are free but rate limited. Changing any number here must bump
 * PRICE_VERSION so open quotes are invalidated rather than silently repriced.
 */
export const PRICE_TABLE = {
  version: PRICE_VERSION,
  perMinute: {
    mp4: { '720p': 6, '1080p': 10, source: 10 },
    overlay: { '720p': 6, '1080p': 8, source: 8 },
    srt: { '720p': 0, '1080p': 0, source: 0 },
    vtt: { '720p': 0, '1080p': 0, source: 0 },
  },
  highQualityMultiplier: 1.5,
  minimumPaidCredits: 2,
  previewCredits: 0,
} as const;

export const PriceTableSchema = z.object({
  version: z.string(),
  perMinute: z.record(OutputKindSchema, z.record(ResolutionSchema, z.number().nonnegative())),
  highQualityMultiplier: z.number().positive(),
  minimumPaidCredits: z.number().int().nonnegative(),
  previewCredits: z.number().int().nonnegative(),
}).meta({ id: 'PriceTable' });

export const CreditBalanceSchema = z.object({
  available: z.number().int().describe('Credits not reserved by in-flight renders'),
  reserved: z.number().int().nonnegative(),
  total: z.number().int(),
  priceVersion: z.string(),
}).meta({ id: 'CreditBalance' });
export type CreditBalance = z.infer<typeof CreditBalanceSchema>;

export const LedgerEntryKindSchema = z.enum(['grant', 'reserve', 'settle', 'release', 'adjust']);
export type LedgerEntryKind = z.infer<typeof LedgerEntryKindSchema>;

export const LedgerEntrySchema = z.object({
  id: z.string().max(64),
  kind: LedgerEntryKindSchema,
  amount: z.number().int().describe('Signed credit delta on available balance'),
  availableAfter: z.number().int(),
  reservedAfter: z.number().int().nonnegative(),
  taskId: z.string().max(64).optional(),
  quoteId: z.string().max(64).optional(),
  reservationId: z.string().max(64).optional(),
  note: z.string().max(200).optional(),
  createdAt: z.iso.datetime(),
}).meta({ id: 'LedgerEntry' });
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const LedgerListSchema = z.object({ entries: z.array(LedgerEntrySchema).max(500) });

export const BillingPlanIdSchema = z.enum(['free', 'creator', 'pro', 'studio']);
export type BillingPlanId = z.infer<typeof BillingPlanIdSchema>;

export const PaidBillingPlanIdSchema = z.enum(['creator', 'pro', 'studio']);
export type PaidBillingPlanId = z.infer<typeof PaidBillingPlanIdSchema>;

export const BillingSkuSchema = z.enum([
  'plan_creator_monthly',
  'plan_creator_annual',
  'plan_pro_monthly',
  'plan_pro_annual',
  'plan_studio_monthly',
  'plan_studio_annual',
  'topup_small',
  'topup_medium',
  'topup_large',
]);
export type BillingSku = z.infer<typeof BillingSkuSchema>;

export const CreditPoolKindSchema = z.enum(['free', 'subscription', 'purchased', 'admin']);
export type CreditPoolKind = z.infer<typeof CreditPoolKindSchema>;

export const BillingPlanSchema = z.object({
  id: BillingPlanIdSchema,
  name: z.string(),
  monthlyPriceCents: z.number().int().nonnegative(),
  monthlyCredits: z.number().int().nonnegative(),
  annualPriceCents: z.number().int().nonnegative().optional(),
  annualCredits: z.number().int().nonnegative().optional(),
  approximateMp4Minutes: z.number().int().nonnegative(),
  activeRenderLimit: z.number().int().positive(),
  apiAccess: z.boolean(),
  teamControls: z.boolean(),
  sku: BillingSkuSchema.optional(),
  annualSku: BillingSkuSchema.optional(),
});
export type BillingPlan = z.infer<typeof BillingPlanSchema>;

export const BillingTopUpSchema = z.object({
  sku: BillingSkuSchema,
  name: z.string(),
  priceCents: z.number().int().positive(),
  credits: z.number().int().positive(),
  approximateMp4Minutes: z.number().int().positive(),
});
export type BillingTopUp = z.infer<typeof BillingTopUpSchema>;

export const BILLING_PLANS = [
  {
    id: 'free',
    name: 'Free',
    monthlyPriceCents: 0,
    monthlyCredits: 0,
    approximateMp4Minutes: 1,
    activeRenderLimit: 1,
    apiAccess: true,
    teamControls: false,
  },
  {
    id: 'creator',
    name: 'Creator',
    monthlyPriceCents: 1_500,
    monthlyCredits: 300,
    annualPriceCents: 14_400,
    annualCredits: 3_600,
    approximateMp4Minutes: 30,
    activeRenderLimit: 1,
    apiAccess: true,
    teamControls: false,
    sku: 'plan_creator_monthly',
    annualSku: 'plan_creator_annual',
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPriceCents: 3_900,
    monthlyCredits: 1_000,
    annualPriceCents: 39_600,
    annualCredits: 12_000,
    approximateMp4Minutes: 100,
    activeRenderLimit: 2,
    apiAccess: true,
    teamControls: false,
    sku: 'plan_pro_monthly',
    annualSku: 'plan_pro_annual',
  },
  {
    id: 'studio',
    name: 'Studio',
    monthlyPriceCents: 9_900,
    monthlyCredits: 3_000,
    annualPriceCents: 100_800,
    annualCredits: 36_000,
    approximateMp4Minutes: 300,
    activeRenderLimit: 4,
    apiAccess: true,
    teamControls: true,
    sku: 'plan_studio_monthly',
    annualSku: 'plan_studio_annual',
  },
] as const satisfies readonly BillingPlan[];

export const BILLING_TOP_UPS = [
  {
    sku: 'topup_small',
    name: 'Small top-up',
    priceCents: 1_200,
    credits: 200,
    approximateMp4Minutes: 20,
  },
  {
    sku: 'topup_medium',
    name: 'Medium top-up',
    priceCents: 3_500,
    credits: 750,
    approximateMp4Minutes: 75,
  },
  {
    sku: 'topup_large',
    name: 'Large top-up',
    priceCents: 7_900,
    credits: 2_000,
    approximateMp4Minutes: 200,
  },
] as const satisfies readonly BillingTopUp[];

export const BILLING_CATALOG = {
  version: BILLING_CATALOG_VERSION,
  currency: 'USD',
  freeLifetimeCredits: 10,
  subscriptionRolloverMonths: 2,
  plans: BILLING_PLANS,
  topUps: BILLING_TOP_UPS,
} as const;

export const BillingCatalogSchema = z.object({
  version: z.string(),
  currency: z.literal('USD'),
  freeLifetimeCredits: z.number().int().nonnegative(),
  subscriptionRolloverMonths: z.number().int().positive(),
  plans: z.array(BillingPlanSchema),
  topUps: z.array(BillingTopUpSchema),
});
export type BillingCatalog = z.infer<typeof BillingCatalogSchema>;

export const BillingSubscriptionStatusSchema = z.enum([
  'free',
  'active',
  'past_due',
  'canceled',
]);
export type BillingSubscriptionStatus = z.infer<typeof BillingSubscriptionStatusSchema>;

export const CreditPoolSchema = z.object({
  kind: CreditPoolKindSchema,
  available: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
  expiresAt: z.iso.datetime().optional(),
});
export type CreditPool = z.infer<typeof CreditPoolSchema>;

export const BillingOverviewSchema = z.object({
  catalogVersion: z.string(),
  planId: BillingPlanIdSchema,
  status: BillingSubscriptionStatusSchema,
  currentPeriodEnd: z.iso.datetime().optional(),
  cancelAtPeriodEnd: z.boolean(),
  credits: CreditBalanceSchema,
  pools: z.array(CreditPoolSchema),
  entitlements: z.object({
    activeRenderLimit: z.number().int().positive(),
    apiAccess: z.boolean(),
    teamControls: z.boolean(),
  }),
});
export type BillingOverview = z.infer<typeof BillingOverviewSchema>;

export const CheckoutSourceSchema = z.enum(['web', 'chatgpt', 'claude', 'codex', 'agent']);
export type CheckoutSource = z.infer<typeof CheckoutSourceSchema>;

export const CreateCheckoutRequestSchema = z
  .object({
    sku: BillingSkuSchema,
    source: CheckoutSourceSchema.default('web'),
    returnTo: z.string().max(500).optional(),
    resume: z.string().max(500).optional(),
  })
  .strict();
export type CreateCheckoutRequest = z.infer<typeof CreateCheckoutRequestSchema>;

export const CheckoutSessionSchema = z.object({
  id: z.string().max(200),
  url: z.url(),
  sku: BillingSkuSchema,
  expiresAt: z.iso.datetime().optional(),
});
export type CheckoutSession = z.infer<typeof CheckoutSessionSchema>;

export const CheckoutRequiredSchema = z.object({
  status: z.literal('checkout_required'),
  balance: z.number().int().nonnegative(),
  shortfall: z.number().int().positive(),
  quoteId: z.string().max(64),
  quoteExpiresAt: z.iso.datetime(),
  pricingUrl: z.url(),
  catalogVersion: z.string(),
});
export type CheckoutRequired = z.infer<typeof CheckoutRequiredSchema>;
