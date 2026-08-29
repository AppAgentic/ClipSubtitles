import { PRICE_VERSION, type CreditBalance, type LedgerEntry } from '@clipsubtitles/contracts';
import { getBalance, getReservationForTask, listLedger, releaseReservation, settleReservation, type ReservationRecord } from '@clipsubtitles/storage';
import type { AppContext } from '../context';

export function creditBalance(ctx: AppContext, workspaceId: string): CreditBalance {
  const b = getBalance(ctx.db, workspaceId);
  return { available: b.available, reserved: b.reserved, total: b.available + b.reserved, priceVersion: PRICE_VERSION };
}

export function ledger(ctx: AppContext, workspaceId: string, limit = 100): LedgerEntry[] {
  return listLedger(ctx.db, workspaceId, limit);
}

/** Release the reservation held by a render task (failure/cancel). Exactly-once. */
export function releaseForTask(ctx: AppContext, taskId: string, reason: string): ReservationRecord | null {
  const res = getReservationForTask(ctx.db, taskId);
  if (!res) return null;
  return releaseReservation(ctx.db, { reservationId: res.id, now: ctx.clock.iso(), reason }).reservation;
}

/** Settle the reservation held by a render task on success. Exactly-once. */
export function settleForTask(ctx: AppContext, taskId: string, actualAmount?: number): ReservationRecord | null {
  const res = getReservationForTask(ctx.db, taskId);
  if (!res) return null;
  return settleReservation(ctx.db, { reservationId: res.id, ...(actualAmount !== undefined ? { actualAmount } : {}), now: ctx.clock.iso() }).reservation;
}
