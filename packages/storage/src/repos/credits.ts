import type { LedgerEntry, LedgerEntryKind } from '@clipsubtitles/contracts';
import { newId } from '@clipsubtitles/core';
import { many, num, one, run, text, transaction, type Db, type Row } from '../db';
import { StorageError } from '../errors';

export interface CreditBalanceRecord {
  workspaceId: string;
  available: number;
  reserved: number;
}

export type ReservationStatus = 'reserved' | 'settled' | 'released';

export interface ReservationRecord {
  id: string;
  workspaceId: string;
  quoteId: string;
  taskId: string;
  amount: number;
  status: ReservationStatus;
  settledAmount?: number;
  createdAt: string;
  updatedAt: string;
}

function toReservation(r: Row): ReservationRecord {
  const res: ReservationRecord = {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    quoteId: String(r.quote_id),
    taskId: String(r.task_id),
    amount: num(r.amount) ?? 0,
    status: String(r.status) as ReservationStatus,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
  const settled = num(r.settled_amount);
  if (settled !== undefined) res.settledAmount = settled;
  return res;
}

function toLedger(r: Row): LedgerEntry {
  const e: LedgerEntry = {
    id: String(r.id),
    kind: String(r.kind) as LedgerEntryKind,
    amount: num(r.amount) ?? 0,
    availableAfter: num(r.available_after) ?? 0,
    reservedAfter: num(r.reserved_after) ?? 0,
    createdAt: String(r.created_at),
  };
  const taskId = text(r.task_id);
  const quoteId = text(r.quote_id);
  const reservationId = text(r.reservation_id);
  const note = text(r.note);
  if (taskId) e.taskId = taskId;
  if (quoteId) e.quoteId = quoteId;
  if (reservationId) e.reservationId = reservationId;
  if (note) e.note = note;
  return e;
}

export function getBalance(db: Db, workspaceId: string): CreditBalanceRecord {
  const r = one(db, 'SELECT * FROM credit_accounts WHERE workspace_id = ?', workspaceId);
  if (!r) return { workspaceId, available: 0, reserved: 0 };
  return { workspaceId, available: num(r.available) ?? 0, reserved: num(r.reserved) ?? 0 };
}

function writeLedger(
  db: Db,
  input: {
    workspaceId: string;
    kind: LedgerEntryKind;
    amount: number;
    available: number;
    reserved: number;
    idempotencyKey: string;
    taskId?: string;
    quoteId?: string;
    reservationId?: string;
    note?: string;
    now: string;
  },
): void {
  run(
    db,
    `INSERT INTO credit_ledger (id, workspace_id, kind, amount, available_after, reserved_after, task_id, quote_id, reservation_id, idempotency_key, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId('ledger'),
    input.workspaceId,
    input.kind,
    input.amount,
    input.available,
    input.reserved,
    input.taskId ?? null,
    input.quoteId ?? null,
    input.reservationId ?? null,
    input.idempotencyKey,
    input.note ?? null,
    input.now,
  );
}

function setBalance(db: Db, workspaceId: string, available: number, reserved: number, now: string): void {
  run(
    db,
    'INSERT INTO credit_accounts (workspace_id, available, reserved, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET available = excluded.available, reserved = excluded.reserved, updated_at = excluded.updated_at',
    workspaceId,
    available,
    reserved,
    now,
  );
}

/** Idempotent grant/adjustment keyed by the caller's idempotency key. */
export function grantCredits(
  db: Db,
  input: { workspaceId: string; amount: number; idempotencyKey: string; note?: string; now: string; kind?: 'grant' | 'adjust' },
): CreditBalanceRecord {
  return transaction(db, () => {
    const existing = one(db, 'SELECT id FROM credit_ledger WHERE idempotency_key = ?', input.idempotencyKey);
    if (existing) return getBalance(db, input.workspaceId);
    const bal = getBalance(db, input.workspaceId);
    const available = bal.available + input.amount;
    setBalance(db, input.workspaceId, available, bal.reserved, input.now);
    writeLedger(db, {
      workspaceId: input.workspaceId,
      kind: input.kind ?? 'grant',
      amount: input.amount,
      available,
      reserved: bal.reserved,
      idempotencyKey: input.idempotencyKey,
      ...(input.note ? { note: input.note } : {}),
      now: input.now,
    });
    return getBalance(db, input.workspaceId);
  });
}

/**
 * Reserve credits for an approved quote exactly once. A second call for the
 * same quote returns the existing reservation (no double reservation).
 */
export function reserveCredits(
  db: Db,
  input: { workspaceId: string; quoteId: string; taskId: string; amount: number; now: string },
): { reservation: ReservationRecord; created: boolean } {
  return transaction(db, () => {
    const existing = one(db, 'SELECT * FROM credit_reservations WHERE quote_id = ?', input.quoteId);
    if (existing) return { reservation: toReservation(existing), created: false };
    const bal = getBalance(db, input.workspaceId);
    if (bal.available < input.amount) {
      throw new StorageError('INSUFFICIENT_CREDITS', `Need ${input.amount} credits, ${bal.available} available.`);
    }
    const id = newId('reservation');
    run(
      db,
      `INSERT INTO credit_reservations (id, workspace_id, quote_id, task_id, amount, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?)`,
      id,
      input.workspaceId,
      input.quoteId,
      input.taskId,
      input.amount,
      input.now,
      input.now,
    );
    const available = bal.available - input.amount;
    const reserved = bal.reserved + input.amount;
    setBalance(db, input.workspaceId, available, reserved, input.now);
    writeLedger(db, {
      workspaceId: input.workspaceId,
      kind: 'reserve',
      amount: -input.amount,
      available,
      reserved,
      idempotencyKey: `reserve:${input.quoteId}`,
      taskId: input.taskId,
      quoteId: input.quoteId,
      reservationId: id,
      now: input.now,
    });
    return { reservation: toReservation(one(db, 'SELECT * FROM credit_reservations WHERE id = ?', id) as Row), created: true };
  });
}

export function getReservation(db: Db, id: string): ReservationRecord | null {
  const r = one(db, 'SELECT * FROM credit_reservations WHERE id = ?', id);
  return r ? toReservation(r) : null;
}

export function getReservationForTask(db: Db, taskId: string): ReservationRecord | null {
  const r = one(db, 'SELECT * FROM credit_reservations WHERE task_id = ?', taskId);
  return r ? toReservation(r) : null;
}

/**
 * Settle exactly once. The reserved amount is consumed; if the actual charge
 * is lower, the difference returns to the available balance. Already-settled
 * reservations are a no-op; released ones cannot be settled.
 */
export function settleReservation(
  db: Db,
  input: { reservationId: string; actualAmount?: number; now: string },
): { reservation: ReservationRecord; changed: boolean } {
  return transaction(db, () => {
    const res = getReservation(db, input.reservationId);
    if (!res) throw new StorageError('NOT_FOUND', 'Reservation not found.');
    if (res.status === 'settled') return { reservation: res, changed: false };
    if (res.status === 'released') throw new StorageError('INVALID_STATE', 'Reservation was released; cannot settle.');
    const actual = Math.min(res.amount, Math.max(0, input.actualAmount ?? res.amount));
    const bal = getBalance(db, res.workspaceId);
    const reserved = Math.max(0, bal.reserved - res.amount);
    const available = bal.available + (res.amount - actual);
    setBalance(db, res.workspaceId, available, reserved, input.now);
    run(
      db,
      "UPDATE credit_reservations SET status = 'settled', settled_amount = ?, updated_at = ? WHERE id = ? AND status = 'reserved'",
      actual,
      input.now,
      res.id,
    );
    writeLedger(db, {
      workspaceId: res.workspaceId,
      kind: 'settle',
      amount: res.amount - actual,
      available,
      reserved,
      idempotencyKey: `settle:${res.id}`,
      taskId: res.taskId,
      quoteId: res.quoteId,
      reservationId: res.id,
      note: `Charged ${actual} credits`,
      now: input.now,
    });
    return { reservation: getReservation(db, res.id) as ReservationRecord, changed: true };
  });
}

/** Release exactly once (failure/cancellation). Settled reservations are never released. */
export function releaseReservation(
  db: Db,
  input: { reservationId: string; now: string; reason?: string },
): { reservation: ReservationRecord; changed: boolean } {
  return transaction(db, () => {
    const res = getReservation(db, input.reservationId);
    if (!res) throw new StorageError('NOT_FOUND', 'Reservation not found.');
    if (res.status !== 'reserved') return { reservation: res, changed: false };
    const bal = getBalance(db, res.workspaceId);
    const reserved = Math.max(0, bal.reserved - res.amount);
    const available = bal.available + res.amount;
    setBalance(db, res.workspaceId, available, reserved, input.now);
    run(db, "UPDATE credit_reservations SET status = 'released', updated_at = ? WHERE id = ? AND status = 'reserved'", input.now, res.id);
    writeLedger(db, {
      workspaceId: res.workspaceId,
      kind: 'release',
      amount: res.amount,
      available,
      reserved,
      idempotencyKey: `release:${res.id}`,
      taskId: res.taskId,
      quoteId: res.quoteId,
      reservationId: res.id,
      ...(input.reason ? { note: input.reason } : {}),
      now: input.now,
    });
    return { reservation: getReservation(db, res.id) as ReservationRecord, changed: true };
  });
}

export function listLedger(db: Db, workspaceId: string, limit = 100): LedgerEntry[] {
  return many(db, 'SELECT * FROM credit_ledger WHERE workspace_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?', workspaceId, limit).map(toLedger);
}
