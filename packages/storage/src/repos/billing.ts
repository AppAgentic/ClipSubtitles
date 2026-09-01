import type {
  BillingPlanId,
  BillingSubscriptionStatus,
  CreditPoolKind,
} from '@clipsubtitles/contracts';
import { bool, many, num, one, run, text, type Db, type Row } from '../db';
import { StorageError } from '../errors';

export interface BillingAccountRecord {
  workspaceId: string;
  planId: BillingPlanId;
  status: BillingSubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  provider?: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  providerEventAt?: string;
  updatedAt: string;
}

export interface CreditPoolRecord {
  id: string;
  workspaceId: string;
  kind: CreditPoolKind;
  originalAmount: number;
  available: number;
  reserved: number;
  expiresAt?: string;
  note?: string;
  createdAt: string;
}

export interface BillingEventRecord {
  provider: string;
  eventId: string;
  eventType: string;
  workspaceId?: string;
  status: 'processing' | 'processed' | 'ignored' | 'failed';
  occurredAt: string;
  processedAt: string;
}

export function toBillingAccount(row: Row): BillingAccountRecord {
  const record: BillingAccountRecord = {
    workspaceId: String(row.workspace_id),
    planId: String(row.plan_id) as BillingPlanId,
    status: String(row.status) as BillingSubscriptionStatus,
    cancelAtPeriodEnd: bool(row.cancel_at_period_end),
    updatedAt: String(row.updated_at),
  };
  const currentPeriodStart = text(row.current_period_start);
  const currentPeriodEnd = text(row.current_period_end);
  const provider = text(row.provider);
  const providerCustomerId = text(row.provider_customer_id);
  const providerSubscriptionId = text(row.provider_subscription_id);
  const providerEventAt = text(row.provider_event_at);
  if (currentPeriodStart) record.currentPeriodStart = currentPeriodStart;
  if (currentPeriodEnd) record.currentPeriodEnd = currentPeriodEnd;
  if (provider) record.provider = provider;
  if (providerCustomerId) record.providerCustomerId = providerCustomerId;
  if (providerSubscriptionId) record.providerSubscriptionId = providerSubscriptionId;
  if (providerEventAt) record.providerEventAt = providerEventAt;
  return record;
}

export function toCreditPool(row: Row): CreditPoolRecord {
  const pool: CreditPoolRecord = {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    kind: String(row.kind) as CreditPoolKind,
    originalAmount: num(row.original_amount) ?? 0,
    available: num(row.available) ?? 0,
    reserved: num(row.reserved) ?? 0,
    createdAt: String(row.created_at),
  };
  const expiresAt = text(row.expires_at);
  const note = text(row.note);
  if (expiresAt) pool.expiresAt = expiresAt;
  if (note) pool.note = note;
  return pool;
}

export function toBillingEvent(row: Row): BillingEventRecord {
  const event: BillingEventRecord = {
    provider: String(row.provider),
    eventId: String(row.event_id),
    eventType: String(row.event_type),
    status: String(row.status) as BillingEventRecord['status'],
    occurredAt: String(row.occurred_at),
    processedAt: String(row.processed_at),
  };
  const workspaceId = text(row.workspace_id);
  if (workspaceId) event.workspaceId = workspaceId;
  return event;
}

export function getBillingAccount(db: Db, workspaceId: string): BillingAccountRecord | null {
  const row = one(db, 'SELECT * FROM billing_accounts WHERE workspace_id = ?', workspaceId);
  return row ? toBillingAccount(row) : null;
}

export function upsertBillingAccount(
  db: Db,
  input: {
    workspaceId: string;
    planId: BillingPlanId;
    status: BillingSubscriptionStatus;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
    provider?: string;
    providerCustomerId?: string;
    providerSubscriptionId?: string;
    providerEventAt?: string;
    now: string;
  },
): BillingAccountRecord {
  run(
    db,
    `INSERT INTO billing_accounts (workspace_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, provider, provider_customer_id, provider_subscription_id, provider_event_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id) DO UPDATE SET plan_id = excluded.plan_id, status = excluded.status,
       current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
       cancel_at_period_end = excluded.cancel_at_period_end, provider = excluded.provider,
       provider_customer_id = excluded.provider_customer_id, provider_subscription_id = excluded.provider_subscription_id,
       provider_event_at = excluded.provider_event_at, updated_at = excluded.updated_at
     WHERE excluded.provider_event_at IS NULL OR billing_accounts.provider_event_at IS NULL
       OR excluded.provider_event_at >= billing_accounts.provider_event_at`,
    input.workspaceId,
    input.planId,
    input.status,
    input.currentPeriodStart ?? null,
    input.currentPeriodEnd ?? null,
    input.cancelAtPeriodEnd ? 1 : 0,
    input.provider ?? null,
    input.providerCustomerId ?? null,
    input.providerSubscriptionId ?? null,
    input.providerEventAt ?? null,
    input.now,
  );
  const record = getBillingAccount(db, input.workspaceId);
  if (!record) throw new StorageError('INVALID_STATE', 'Billing account was not saved.');
  return record;
}

export function listCreditPools(db: Db, workspaceId: string, now: string): CreditPoolRecord[] {
  return many(
    db,
    `SELECT * FROM credit_pools WHERE workspace_id = ? AND (expires_at IS NULL OR expires_at > ?)
     AND (available > 0 OR reserved > 0)
     ORDER BY CASE kind WHEN 'subscription' THEN 0 WHEN 'free' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
       CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at, created_at`,
    workspaceId,
    now,
  ).map(toCreditPool);
}

export function recordBillingEvent(
  db: Db,
  input: {
    provider: string;
    eventId: string;
    eventType: string;
    workspaceId?: string;
    status: BillingEventRecord['status'];
    occurredAt: string;
    processedAt: string;
  },
): { event: BillingEventRecord; created: boolean } {
  const created = run(
    db,
    `INSERT INTO billing_events (provider, event_id, event_type, workspace_id, status, occurred_at, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(provider, event_id) DO NOTHING`,
    input.provider,
    input.eventId,
    input.eventType,
    input.workspaceId ?? null,
    input.status,
    input.occurredAt,
    input.processedAt,
  ).changes > 0;
  const row = one(
    db,
    'SELECT * FROM billing_events WHERE provider = ? AND event_id = ?',
    input.provider,
    input.eventId,
  );
  if (!row) throw new StorageError('INVALID_STATE', 'Billing event was not saved.');
  return { event: toBillingEvent(row), created };
}
