import {
  BILLING_CATALOG,
  BILLING_PLANS,
  BILLING_TOP_UPS,
  PRICE_VERSION,
  type BillingOverview,
  type BillingPlanId,
  type BillingSku,
  type CheckoutSession,
  type CheckoutSource,
  type CreditBalance,
  type LedgerEntry,
  type WebAttribution,
} from '@clipsubtitles/contracts';
import type { ReservationRecord } from '@clipsubtitles/storage';
import type { AppContext } from '../context';
import { ApiError } from '../errors';
import { audit } from './audit';
import { checkoutAttributionMetadata, forwardPurchaseToAppRefer } from './attribution';

export async function creditBalance(ctx: AppContext, workspaceId: string): Promise<CreditBalance> {
  const b = await ctx.db.getBalance(workspaceId);
  return { available: b.available, reserved: b.reserved, total: b.available + b.reserved, priceVersion: PRICE_VERSION };
}

export function ledger(ctx: AppContext, workspaceId: string, limit = 100): Promise<LedgerEntry[]> {
  return ctx.db.listLedger(workspaceId, limit);
}

export async function billingOverview(ctx: AppContext, workspaceId: string): Promise<BillingOverview> {
  const [account, credits, pools] = await Promise.all([
    ctx.db.getBillingAccount(workspaceId),
    creditBalance(ctx, workspaceId),
    ctx.db.listCreditPools(workspaceId, ctx.clock.iso()),
  ]);
  const planId = account?.planId ?? 'free';
  const plan = BILLING_PLANS.find((candidate) => candidate.id === planId) ?? BILLING_PLANS[0];
  return {
    catalogVersion: BILLING_CATALOG.version,
    planId,
    status: account?.status ?? 'free',
    ...(account?.currentPeriodEnd ? { currentPeriodEnd: account.currentPeriodEnd } : {}),
    cancelAtPeriodEnd: account?.cancelAtPeriodEnd ?? false,
    credits,
    pools: pools.map((pool) => ({
      kind: pool.kind,
      available: pool.available,
      reserved: pool.reserved,
      ...(pool.expiresAt ? { expiresAt: pool.expiresAt } : {}),
    })),
    entitlements: {
      activeRenderLimit: plan.activeRenderLimit,
      apiAccess: plan.apiAccess,
      teamControls: plan.teamControls,
    },
  };
}

export async function createCheckout(
  ctx: AppContext,
  input: {
    workspaceId: string;
    sku: BillingSku;
    source: CheckoutSource;
    returnTo?: string;
    resume?: string;
    idempotencyKey: string;
    attribution?: WebAttribution;
  },
): Promise<CheckoutSession> {
  const fallback = '/app/settings?checkout=complete';
  const returnTo = safeRelativePath(input.returnTo) ?? fallback;
  const redirect = new URL(returnTo, `${ctx.config.webPublicUrl}/`).toString();
  return ctx.billing.createCheckout({
    workspaceId: input.workspaceId,
    sku: input.sku,
    source: input.source,
    redirectUrl: redirect,
    ...(input.resume ? { resume: input.resume } : {}),
    idempotencyKey: input.idempotencyKey,
    attribution: checkoutAttributionMetadata(input.attribution, input.idempotencyKey),
  });
}

export async function billingManagementUrl(ctx: AppContext, workspaceId: string): Promise<{ url: string }> {
  const account = await ctx.db.getBillingAccount(workspaceId);
  if (!account?.providerSubscriptionId || account.status === 'free') {
    throw new ApiError('CONFLICT', 'There is no paid subscription to manage.');
  }
  return { url: await ctx.billing.managementUrl(account.providerSubscriptionId) };
}

export async function processBillingWebhook(
  ctx: AppContext,
  rawBody: string,
  headers: Record<string, string>,
): Promise<{ received: true; duplicate: boolean }> {
  const event = ctx.billing.verifyWebhook(rawBody, headers);
  if (!event.id) throw new Error('Verified billing webhook has no event id.');
  const result = await ctx.db.transaction<{ received: true; duplicate: boolean }>(async () => {
    const metadata = eventMetadata(event.data);
    const workspaceId = typeof metadata.workspace_id === 'string' ? metadata.workspace_id : undefined;
    const sku = eventSku(ctx, event.data, metadata);
    const billingAccount = workspaceId ? await ctx.db.getBillingAccount(workspaceId) : null;
    const actionable = Boolean(workspaceId && sku && billingAccount);
    const recorded = await ctx.db.recordBillingEvent({
      provider: ctx.billing.name,
      eventId: event.id,
      eventType: event.type,
      ...(workspaceId ? { workspaceId } : {}),
      status: actionable ? 'processed' : 'ignored',
      occurredAt: event.occurredAt,
      processedAt: ctx.clock.iso(),
    });
    if (!recorded.created) return { received: true, duplicate: true };
    if (!workspaceId || !sku || !billingAccount) {
      return { received: true, duplicate: false };
    }
    if (event.type.toLowerCase().startsWith('membership.')) {
      const plan = BILLING_PLANS.find(
        (candidate) => 'sku' in candidate && (candidate.sku === sku || candidate.annualSku === sku),
      );
      if (!plan || plan.id === 'free') return { received: true, duplicate: false };
      const previous = billingAccount;
      const status = membershipStatus(event.type, event.data);
      const periodEnd = stringField(event.data, ['current_period_end', 'renewal_period_end', 'expires_at']);
      const resolvedPeriodEnd = periodEnd ?? previous?.currentPeriodEnd;
      const providerCustomerId = stringField(event.data, ['customer_id', 'user_id']) ?? previous?.providerCustomerId;
      const providerSubscriptionId = stringField(event.data, ['id', 'membership_id', 'subscription_id']) ?? previous?.providerSubscriptionId;
      await ctx.db.upsertBillingAccount({
        workspaceId,
        planId: plan.id as BillingPlanId,
        status,
        ...(resolvedPeriodEnd ? { currentPeriodEnd: resolvedPeriodEnd } : {}),
        cancelAtPeriodEnd: booleanField(event.data, 'cancel_at_period_end') ?? previous?.cancelAtPeriodEnd ?? false,
        provider: ctx.billing.name,
        ...(providerCustomerId ? { providerCustomerId } : {}),
        ...(providerSubscriptionId ? { providerSubscriptionId } : {}),
        providerEventAt: event.occurredAt,
        now: ctx.clock.iso(),
      });
      return { received: true, duplicate: false };
    }
    if (!isSuccessfulPayment(event.type, event.data)) return { received: true, duplicate: false };
    const topUp = BILLING_TOP_UPS.find((candidate) => candidate.sku === sku);
    if (topUp) {
      await ctx.db.grantCredits({
        workspaceId,
        amount: topUp.credits,
        poolKind: 'purchased',
        idempotencyKey: `billing:${ctx.billing.name}:${event.id}`,
        note: `${topUp.name} purchase`,
        now: ctx.clock.iso(),
      });
      return { received: true, duplicate: false };
    }
    const plan = BILLING_PLANS.find(
      (candidate) => 'sku' in candidate && (candidate.sku === sku || candidate.annualSku === sku),
    );
    if (!plan || plan.id === 'free') return { received: true, duplicate: false };
    const annual = plan.annualSku === sku;
    const periodEnd = stringField(event.data, ['current_period_end', 'renewal_period_end', 'expires_at']);
    const providerCustomerId = stringField(event.data, ['customer_id', 'user_id']) ?? nestedStringField(event.data, 'user', 'id');
    const providerSubscriptionId = stringField(event.data, ['membership_id', 'subscription_id']) ?? nestedStringField(event.data, 'membership', 'id');
    await ctx.db.upsertBillingAccount({
      workspaceId,
      planId: plan.id as BillingPlanId,
      status: 'active',
      ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
      provider: ctx.billing.name,
      ...(providerCustomerId ? { providerCustomerId } : {}),
      ...(providerSubscriptionId ? { providerSubscriptionId } : {}),
      providerEventAt: event.occurredAt,
      now: ctx.clock.iso(),
    });
    const rolloverEnd = periodEnd ? addMonths(periodEnd, BILLING_CATALOG.subscriptionRolloverMonths) : undefined;
    await ctx.db.grantCredits({
      workspaceId,
      amount: annual ? plan.annualCredits : plan.monthlyCredits,
      poolKind: 'subscription',
      ...(rolloverEnd ? { expiresAt: rolloverEnd } : {}),
      idempotencyKey: `billing:${ctx.billing.name}:${event.id}`,
      note: `${plan.name} ${annual ? 'annual' : 'monthly'} credits`,
      now: ctx.clock.iso(),
    });
    return { received: true, duplicate: false };
  });
  if (!result.duplicate) {
    const metadata = eventMetadata(event.data);
    const sessionId = stringField(metadata, ['web_funnel_session_id']);
    if (isSuccessfulPayment(event.type, event.data) && sessionId) {
      await audit(ctx, {
        actorType: 'system',
        action: 'paid_funnel.purchase_completed',
        targetType: 'funnel_session',
        targetId: sessionId,
        metadata: {
          provider: ctx.billing.name,
          providerEventId: event.id,
          sku: stringField(metadata, ['sku']),
          campaignId: stringField(metadata, ['campaign_id']),
          adsetId: stringField(metadata, ['adset_id']),
          adId: stringField(metadata, ['ad_id']),
          utmSource: stringField(metadata, ['utm_source']),
          utmCampaign: stringField(metadata, ['utm_campaign']),
        },
      });
    }
    try {
      await forwardPurchaseToAppRefer(ctx, event);
    } catch (error) {
      ctx.logger.warn('purchase attribution forwarding failed', {
        provider: ctx.billing.name,
        eventId: event.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}

function safeRelativePath(value?: string): string | undefined {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return undefined;
  return value.slice(0, 500);
}

function eventMetadata(data: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(data.metadata)) return data.metadata;
  for (const key of ['payment', 'membership', 'checkout_configuration']) {
    const nested = data[key];
    if (isRecord(nested) && isRecord(nested.metadata)) return nested.metadata;
  }
  return {};
}

function isSuccessfulPayment(type: string, data: Record<string, unknown>): boolean {
  const normalized = type.toLowerCase();
  if (normalized.includes('payment') && (normalized.includes('succeed') || normalized.includes('paid'))) return true;
  return data.status === 'paid' || data.status === 'succeeded';
}

function eventSku(ctx: AppContext, data: Record<string, unknown>, metadata: Record<string, unknown>): BillingSku | undefined {
  if (typeof metadata.sku === 'string') return metadata.sku as BillingSku;
  const planId = stringField(data, ['plan_id']) ?? nestedStringField(data, 'plan', 'id');
  if (!planId || ctx.config.billing.provider !== 'whop') return undefined;
  const match = Object.entries(ctx.config.billing.planIds).find(([, providerPlanId]) => providerPlanId === planId);
  return match?.[0] as BillingSku | undefined;
}

function membershipStatus(type: string, data: Record<string, unknown>): 'active' | 'past_due' | 'canceled' {
  const status = typeof data.status === 'string' ? data.status.toLowerCase() : '';
  if (status === 'past_due') return 'past_due';
  if (type.toLowerCase() === 'membership.deactivated' || ['canceled', 'expired', 'completed'].includes(status)) return 'canceled';
  return 'active';
}

function booleanField(data: Record<string, unknown>, key: string): boolean | undefined {
  return typeof data[key] === 'boolean' ? data[key] : undefined;
}

function nestedStringField(data: Record<string, unknown>, parent: string, key: string): string | undefined {
  const value = data[parent];
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : undefined;
}

function stringField(data: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) if (typeof data[key] === 'string') return data[key];
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addMonths(iso: string, months: number): string | undefined {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return undefined;
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

/** Release the reservation held by a render task (failure/cancel). Exactly-once. */
export async function releaseForTask(ctx: AppContext, taskId: string, reason: string): Promise<ReservationRecord | null> {
  const res = await ctx.db.getReservationForTask(taskId);
  if (!res) return null;
  return (await ctx.db.releaseReservation({ reservationId: res.id, now: ctx.clock.iso(), reason })).reservation;
}

/** Settle the reservation held by a render task on success. Exactly-once. */
export async function settleForTask(ctx: AppContext, taskId: string, actualAmount?: number): Promise<ReservationRecord | null> {
  const res = await ctx.db.getReservationForTask(taskId);
  if (!res) return null;
  return (
    await ctx.db.settleReservation({ reservationId: res.id, ...(actualAmount !== undefined ? { actualAmount } : {}), now: ctx.clock.iso() })
  ).reservation;
}
