import { PRICE_VERSION, type CreditBalance, type LedgerEntry } from '@clipsubtitles/contracts';
import type { ReservationRecord } from '@clipsubtitles/storage';
import type { AppContext } from '../context';

export async function creditBalance(ctx: AppContext, workspaceId: string): Promise<CreditBalance> {
  const b = await ctx.db.getBalance(workspaceId);
  return { available: b.available, reserved: b.reserved, total: b.available + b.reserved, priceVersion: PRICE_VERSION };
}

export function ledger(ctx: AppContext, workspaceId: string, limit = 100): Promise<LedgerEntry[]> {
  return ctx.db.listLedger(workspaceId, limit);
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
