import type { Task, TaskError, TaskKind, TaskResult, TaskStatus } from '@clipsubtitles/contracts';
import { newId } from '@clipsubtitles/core';
import { bool, many, num, one, parseJson, run, text, transaction, type Db, type Row } from '../db';

export interface TaskRecord {
  id: string;
  workspaceId: string;
  projectId?: string;
  kind: TaskKind;
  status: TaskStatus;
  progress: number;
  stage?: string;
  attempts: number;
  maxAttempts: number;
  idempotencyKey?: string;
  input: unknown;
  result?: TaskResult;
  error?: TaskError;
  cancelRequested: boolean;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  runAfter: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export function toTask(r: Row): TaskRecord {
  const t: TaskRecord = {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    kind: String(r.kind) as TaskKind,
    status: String(r.status) as TaskStatus,
    progress: num(r.progress) ?? 0,
    attempts: num(r.attempts) ?? 0,
    maxAttempts: num(r.max_attempts) ?? 3,
    input: parseJson<unknown>(r.input_json, {}),
    cancelRequested: bool(r.cancel_requested),
    runAfter: String(r.run_after),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
  const set = <K extends keyof TaskRecord>(key: K, value: TaskRecord[K] | undefined) => {
    if (value !== undefined) t[key] = value;
  };
  set('projectId', text(r.project_id));
  set('stage', text(r.stage));
  set('idempotencyKey', text(r.idempotency_key));
  const result = parseJson<TaskResult | null>(r.result_json, null);
  if (result) t.result = result;
  const error = parseJson<TaskError | null>(r.error_json, null);
  if (error) t.error = error;
  set('leaseOwner', text(r.lease_owner));
  set('leaseExpiresAt', text(r.lease_expires_at));
  set('startedAt', text(r.started_at));
  set('finishedAt', text(r.finished_at));
  return t;
}

/** Public projection: internal lease/worker fields never leave the server. */
export function toPublicTask(t: TaskRecord): Task {
  const task: Task = {
    id: t.id,
    kind: t.kind,
    status: t.status,
    progress: t.progress,
    attempts: t.attempts,
    maxAttempts: t.maxAttempts,
    cancelRequested: t.cancelRequested,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
  if (t.stage) task.stage = t.stage;
  if (t.projectId) task.projectId = t.projectId;
  if (t.idempotencyKey) task.idempotencyKey = t.idempotencyKey;
  if (t.startedAt) task.startedAt = t.startedAt;
  if (t.finishedAt) task.finishedAt = t.finishedAt;
  if (t.error) task.error = t.error;
  if (t.result) task.result = t.result;
  return task;
}

export function enqueueTask(
  db: Db,
  input: {
    workspaceId: string;
    projectId?: string;
    kind: TaskKind;
    input: unknown;
    idempotencyKey?: string;
    maxAttempts?: number;
    now: string;
    runAfter?: string;
  },
): TaskRecord {
  return transaction(db, () => {
    if (input.idempotencyKey) {
      const existing = findTaskByIdempotencyKey(
        db,
        input.workspaceId,
        input.kind,
        input.idempotencyKey,
      );
      if (existing) return existing;
    }
    const id = newId('task');
    run(
      db,
      `INSERT INTO tasks (id, workspace_id, project_id, kind, status, progress, attempts, max_attempts, idempotency_key, input_json, run_after, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 0, 0, ?, ?, ?, ?, ?, ?)`,
      id,
      input.workspaceId,
      input.projectId ?? null,
      input.kind,
      input.maxAttempts ?? 3,
      input.idempotencyKey ?? null,
      JSON.stringify(input.input ?? {}),
      input.runAfter ?? input.now,
      input.now,
      input.now,
    );
    run(
      db,
      `INSERT OR IGNORE INTO task_dispatch_outbox (task_id, available_at, attempts, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?)`,
      id,
      input.runAfter ?? input.now,
      input.now,
      input.now,
    );
    return toTask(one(db, 'SELECT * FROM tasks WHERE id = ?', id) as Row);
  });
}

export interface DispatchOutboxRecord {
  taskId: string;
  availableAt: string;
  attempts: number;
  generation: number;
  deliveredAt?: string;
}

export function toDispatchOutbox(row: Row): DispatchOutboxRecord {
  const deliveredAt = text(row.delivered_at);
  return {
    taskId: String(row.task_id),
    availableAt: String(row.available_at),
    attempts: num(row.attempts) ?? 0,
    generation: num(row.generation) ?? 0,
    ...(deliveredAt ? { deliveredAt } : {}),
  };
}

export function getTaskDispatch(db: Db, taskId: string): DispatchOutboxRecord | null {
  const row = one(
    db,
    'SELECT task_id, available_at, attempts, generation, delivered_at FROM task_dispatch_outbox WHERE task_id = ?',
    taskId,
  );
  return row ? toDispatchOutbox(row) : null;
}

export function listPendingDispatches(db: Db, now: string, limit = 100): DispatchOutboxRecord[] {
  return many(
    db,
    `SELECT task_id, available_at, attempts, generation, delivered_at
     FROM task_dispatch_outbox
     WHERE delivered_at IS NULL AND available_at <= ?
     ORDER BY available_at ASC, created_at ASC LIMIT ?`,
    now,
    limit,
  ).map(toDispatchOutbox);
}

export function markTaskDispatched(db: Db, taskId: string, generation: number, now: string): boolean {
  return (
    run(
      db,
      `UPDATE task_dispatch_outbox SET delivered_at = COALESCE(delivered_at, ?), updated_at = ?
     WHERE task_id = ? AND generation = ? AND delivered_at IS NULL`,
      now,
      now,
      taskId,
      generation,
    ).changes === 1
  );
}

export function recordTaskDispatchFailure(
  db: Db,
  taskId: string,
  generation: number,
  now: string,
  errorCode: string,
): void {
  run(
    db,
    `UPDATE task_dispatch_outbox SET attempts = attempts + 1, last_error_code = ?, updated_at = ?
     WHERE task_id = ? AND generation = ? AND delivered_at IS NULL`,
    errorCode.slice(0, 80),
    now,
    taskId,
    generation,
  );
}

function rearmTaskDispatch(db: Db, taskId: string, availableAt: string, now: string): void {
  run(
    db,
    `UPDATE task_dispatch_outbox
     SET generation = generation + 1, available_at = ?, attempts = 0,
         last_error_code = NULL, delivered_at = NULL, updated_at = ?
     WHERE task_id = ?`,
    availableAt,
    now,
    taskId,
  );
}

export function findTaskByIdempotencyKey(
  db: Db,
  workspaceId: string,
  kind: TaskKind,
  key: string,
): TaskRecord | null {
  const r = one(
    db,
    'SELECT * FROM tasks WHERE workspace_id = ? AND kind = ? AND idempotency_key = ?',
    workspaceId,
    kind,
    key,
  );
  return r ? toTask(r) : null;
}

export function getTask(db: Db, workspaceId: string, id: string): TaskRecord | null {
  const r = one(db, 'SELECT * FROM tasks WHERE id = ? AND workspace_id = ?', id, workspaceId);
  return r ? toTask(r) : null;
}

export function getTaskById(db: Db, id: string): TaskRecord | null {
  const r = one(db, 'SELECT * FROM tasks WHERE id = ?', id);
  return r ? toTask(r) : null;
}

export function listTasks(
  db: Db,
  workspaceId: string,
  opts: { projectId?: string; activeOnly?: boolean; limit?: number } = {},
): TaskRecord[] {
  const clauses = ['workspace_id = ?'];
  const params: Array<string | number> = [workspaceId];
  if (opts.projectId) {
    clauses.push('project_id = ?');
    params.push(opts.projectId);
  }
  if (opts.activeOnly) clauses.push("status IN ('queued','running')");
  params.push(opts.limit ?? 50);
  return many(
    db,
    `SELECT * FROM tasks WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`,
    ...params,
  ).map(toTask);
}

export function countActiveRenderTasks(db: Db, workspaceId: string): number {
  const row = one(
    db,
    `SELECT COUNT(*) AS count FROM tasks
     WHERE workspace_id = ? AND kind = 'render_export' AND status IN ('queued','running')`,
    workspaceId,
  );
  return num(row?.count) ?? 0;
}

/** Atomically claim the oldest runnable task and lease it to `workerId`. */
export function claimNextTask(
  db: Db,
  input: { workerId: string; now: string; leaseMs: number; kinds?: readonly TaskKind[] },
): TaskRecord | null {
  return transaction(db, () => {
    const kindFilter = input.kinds?.length
      ? ` AND kind IN (${input.kinds.map(() => '?').join(',')})`
      : '';
    const candidate = one(
      db,
      `SELECT id FROM tasks WHERE status = 'queued' AND run_after <= ?${kindFilter} ORDER BY created_at ASC LIMIT 1`,
      input.now,
      ...(input.kinds ?? []),
    );
    if (!candidate) return null;
    const leaseExpires = new Date(Date.parse(input.now) + input.leaseMs).toISOString();
    const res = run(
      db,
      `UPDATE tasks SET status = 'running', lease_owner = ?, lease_expires_at = ?, attempts = attempts + 1,
         started_at = COALESCE(started_at, ?), updated_at = ?
       WHERE id = ? AND status = 'queued'`,
      input.workerId,
      leaseExpires,
      input.now,
      input.now,
      String(candidate.id),
    );
    if (res.changes !== 1) return null;
    return toTask(one(db, 'SELECT * FROM tasks WHERE id = ?', String(candidate.id)) as Row);
  });
}

/** Atomically claim one known task for an authenticated push delivery. */
export function claimTaskById(
  db: Db,
  input: { id: string; workerId: string; now: string; leaseMs: number },
): TaskRecord | null {
  return transaction(db, () => {
    const leaseExpires = new Date(Date.parse(input.now) + input.leaseMs).toISOString();
    const res = run(
      db,
      `UPDATE tasks SET status = 'running', lease_owner = ?, lease_expires_at = ?, attempts = attempts + 1,
         started_at = COALESCE(started_at, ?), updated_at = ?
       WHERE id = ? AND status = 'queued' AND run_after <= ?`,
      input.workerId,
      leaseExpires,
      input.now,
      input.now,
      input.id,
      input.now,
    );
    return res.changes === 1 ? getTaskById(db, input.id) : null;
  });
}

/** Extend the lease; reports whether the worker still owns the task and whether cancellation was requested. */
export function heartbeatTask(
  db: Db,
  input: {
    id: string;
    workerId: string;
    now: string;
    leaseMs: number;
    progress?: number;
    stage?: string;
  },
): { owned: boolean; cancelRequested: boolean } {
  return transaction(db, () => {
    const current = getTaskById(db, input.id);
    if (!current || current.status !== 'running' || current.leaseOwner !== input.workerId) {
      return { owned: false, cancelRequested: current?.cancelRequested ?? false };
    }
    const leaseExpires = new Date(Date.parse(input.now) + input.leaseMs).toISOString();
    run(
      db,
      'UPDATE tasks SET lease_expires_at = ?, progress = ?, stage = ?, updated_at = ? WHERE id = ?',
      leaseExpires,
      input.progress ?? current.progress,
      input.stage ?? current.stage ?? null,
      input.now,
      input.id,
    );
    return { owned: true, cancelRequested: current.cancelRequested };
  });
}

export function completeTask(
  db: Db,
  input: { id: string; workerId: string; result: TaskResult; now: string },
): TaskRecord | null {
  return transaction(db, () => {
    const res = run(
      db,
      `UPDATE tasks SET status = 'succeeded', progress = 100, result_json = ?, lease_owner = NULL, lease_expires_at = NULL, finished_at = ?, updated_at = ?
       WHERE id = ? AND status = 'running' AND lease_owner = ?`,
      JSON.stringify(input.result),
      input.now,
      input.now,
      input.id,
      input.workerId,
    );
    return res.changes === 1 ? getTaskById(db, input.id) : null;
  });
}

/**
 * Fail the current attempt. Retryable failures with attempts left are re-queued
 * with backoff; otherwise the task fails terminally with a bounded error.
 */
export function failTask(
  db: Db,
  input: { id: string; workerId: string; error: TaskError; now: string; backoffMs?: number },
): { outcome: 'requeued' | 'failed' | 'not_owned'; task: TaskRecord | null } {
  return transaction(db, () => {
    const current = getTaskById(db, input.id);
    if (!current || current.status !== 'running' || current.leaseOwner !== input.workerId)
      return { outcome: 'not_owned', task: current };
    const canRetry =
      input.error.retryable && current.attempts < current.maxAttempts && !current.cancelRequested;
    if (canRetry) {
      const runAfter = new Date(Date.parse(input.now) + (input.backoffMs ?? 0)).toISOString();
      run(
        db,
        `UPDATE tasks SET status = 'queued', error_json = ?, lease_owner = NULL, lease_expires_at = NULL, run_after = ?, updated_at = ? WHERE id = ?`,
        JSON.stringify(input.error),
        runAfter,
        input.now,
        input.id,
      );
      rearmTaskDispatch(db, input.id, runAfter, input.now);
      return { outcome: 'requeued', task: getTaskById(db, input.id) };
    }
    run(
      db,
      `UPDATE tasks SET status = 'failed', error_json = ?, lease_owner = NULL, lease_expires_at = NULL, finished_at = ?, updated_at = ? WHERE id = ?`,
      JSON.stringify(input.error),
      input.now,
      input.now,
      input.id,
    );
    return { outcome: 'failed', task: getTaskById(db, input.id) };
  });
}

/**
 * Cancellation: queued tasks cancel immediately; running tasks get a
 * cooperative flag the worker observes on its next heartbeat.
 */
export function requestCancel(
  db: Db,
  workspaceId: string,
  id: string,
  now: string,
): {
  outcome: 'cancelled' | 'cancel_requested' | 'not_cancellable' | 'not_found';
  task: TaskRecord | null;
} {
  return transaction(db, () => {
    const current = getTask(db, workspaceId, id);
    if (!current) return { outcome: 'not_found', task: null };
    if (current.status === 'queued') {
      run(
        db,
        `UPDATE tasks SET status = 'cancelled', cancel_requested = 1, finished_at = ?, updated_at = ? WHERE id = ? AND status = 'queued'`,
        now,
        now,
        id,
      );
      return { outcome: 'cancelled', task: getTaskById(db, id) };
    }
    if (current.status === 'running') {
      run(db, 'UPDATE tasks SET cancel_requested = 1, updated_at = ? WHERE id = ?', now, id);
      return { outcome: 'cancel_requested', task: getTaskById(db, id) };
    }
    return { outcome: 'not_cancellable', task: current };
  });
}

/** Worker acknowledges a cancellation of a running task it owns. */
export function markCancelled(
  db: Db,
  input: { id: string; workerId: string; now: string },
): TaskRecord | null {
  return transaction(db, () => {
    const res = run(
      db,
      `UPDATE tasks SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL, finished_at = ?, updated_at = ? WHERE id = ? AND status = 'running' AND lease_owner = ?`,
      input.now,
      input.now,
      input.id,
      input.workerId,
    );
    return res.changes === 1 ? getTaskById(db, input.id) : null;
  });
}

/**
 * Crash recovery: running tasks whose lease expired go back to the queue (or
 * fail when out of attempts). Cancel-requested tasks finish as cancelled and
 * are reported so callers can release any credit reservations.
 */
export function reclaimExpiredLeases(
  db: Db,
  now: string,
): { requeued: string[]; failed: string[]; cancelled: string[] } {
  return transaction(db, () => {
    const expired = many(
      db,
      `SELECT * FROM tasks WHERE status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?`,
      now,
    ).map(toTask);
    const requeued: string[] = [];
    const failed: string[] = [];
    const cancelled: string[] = [];
    for (const t of expired) {
      if (t.cancelRequested) {
        run(
          db,
          `UPDATE tasks SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL, finished_at = ?, updated_at = ? WHERE id = ?`,
          now,
          now,
          t.id,
        );
        cancelled.push(t.id);
        continue;
      }
      if (t.attempts < t.maxAttempts) {
        run(
          db,
          `UPDATE tasks SET status = 'queued', lease_owner = NULL, lease_expires_at = NULL, run_after = ?, updated_at = ? WHERE id = ?`,
          now,
          now,
          t.id,
        );
        rearmTaskDispatch(db, t.id, now, now);
        requeued.push(t.id);
      } else {
        const error: TaskError = {
          code: 'INTERNAL',
          message: 'Worker lost the task lease and no attempts remain.',
          retryable: false,
        };
        run(
          db,
          `UPDATE tasks SET status = 'failed', error_json = ?, lease_owner = NULL, lease_expires_at = NULL, finished_at = ?, updated_at = ? WHERE id = ?`,
          JSON.stringify(error),
          now,
          now,
          t.id,
        );
        failed.push(t.id);
      }
    }
    return { requeued, failed, cancelled };
  });
}

export function countQueued(db: Db): number {
  return num(one(db, "SELECT COUNT(*) AS n FROM tasks WHERE status = 'queued'")?.n) ?? 0;
}
