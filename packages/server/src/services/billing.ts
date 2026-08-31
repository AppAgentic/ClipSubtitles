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
} from '@clipsubtitles/contracts';
import type { ReservationRecord } from '@clipsubtitles/storage';
import type { AppContext } from '../context';

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
  });
}

export async function processBillingWebhook(
  ctx: AppContext,
  rawBody: string,
  headers: Record<string, string>,
): Promise<{ received: true; duplicate: boolean }> {
  const event = ctx.billing.verifyWebhook(rawBody, headers);
  if (!event.id) throw new Error('Verified billing webhook has no event id.');
  return ctx.db.transaction(async () => {
    const metadata = eventMetadata(event.data);
    const workspaceId = typeof metadata.workspace_id === 'string' ? metadata.workspace_id : undefined;
    const sku = typeof metadata.sku === 'string' ? metadata.sku as BillingSku : undefined;
    const recorded = await ctx.db.recordBillingEvent({
      provider: ctx.billing.name,
      eventId: event.id,
      eventType: event.type,
      ...(workspaceId ? { workspaceId } : {}),
      status: workspaceId && sku ? 'processed' : 'ignored',
      occurredAt: event.occurredAt,
      processedAt: ctx.clock.iso(),
    });
    if (!recorded.created) return { received: true, duplicate: true };
    if (!workspaceId || !sku || !isSuccessfulPayment(event.type, event.data)) {
      return { received: true, duplicate: false };
    }
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
    const plan = BILLING_PLANS.find((candidate) => 'sku' in candidate && candidate.sku === sku);
    if (!plan || plan.id === 'free') return { received: true, duplicate: false };
    const periodEnd = stringField(event.data, ['current_period_end', 'renewal_period_end', 'expires_at']);
    const providerCustomerId = stringField(event.data, ['customer_id', 'user_id']);
    const providerSubscriptionId = stringField(event.data, ['membership_id', 'subscription_id']);
    await ctx.db.upsertBillingAccount({
      workspaceId,
      planId: plan.id as BillingPlanId,
      status: 'active',
      ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
      provider: ctx.billing.name,
      ...(providerCustomerId ? { providerCustomerId } : {}),
      ...(providerSubscriptionId ? { providerSubscriptionId } : {}),
      now: ctx.clock.iso(),
    });
    const rolloverEnd = periodEnd ? addMonths(periodEnd, BILLING_CATALOG.subscriptionRolloverMonths) : undefined;
    await ctx.db.grantCredits({
      workspaceId,
      amount: plan.monthlyCredits,
      poolKind: 'subscription',
      ...(rolloverEnd ? { expiresAt: rolloverEnd } : {}),
      idempotencyKey: `billing:${ctx.billing.name}:${event.id}`,
      note: `${plan.name} monthly credits`,
      now: ctx.clock.iso(),
    });
    return { received: true, duplicate: false };
  });
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
