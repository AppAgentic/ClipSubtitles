import type { TaskKind, TaskResult } from '@clipsubtitles/contracts';
import { newId } from '@clipsubtitles/core';
import {
  claimNextTask,
  completeTask,
  expireOpenQuotes,
  failTask,
  heartbeatTask,
  markCancelled,
  reclaimExpiredLeases,
  transaction,
  type TaskRecord,
} from '@clipsubtitles/storage';
import type { AppContext } from '../context';
import { audit } from '../services/audit';
import { releaseForTask, settleForTask } from '../services/billing';
import { discardOutputsForTaskId } from '../services/outputs';
import { runRetentionSweep } from '../services/retention';
import { isCancellation, toTaskError } from './errors';
import { generateCaptionsHandler } from './handlers/generate-captions';
import { importSourceHandler } from './handlers/import-source';
import { renderExportHandler, renderPreviewHandler } from './handlers/render';

export interface HandlerTools {
  signal: AbortSignal;
  progress(pct: number, stage?: string): void;
  workerId: string;
}

export type TaskHandler = (ctx: AppContext, task: TaskRecord, tools: HandlerTools) => Promise<TaskResult>;

export interface WorkerOptions {
  workerId?: string;
  pollMs?: number;
  leaseMs?: number;
  heartbeatMs?: number;
  kinds?: TaskKind[];
  maintenanceEveryMs?: number;
  retentionEveryMs?: number;
}

const BACKOFF_MS = [2_000, 10_000, 60_000];

export const DEFAULT_HANDLERS: Record<TaskKind, TaskHandler> = {
  import_source: importSourceHandler,
  generate_captions: generateCaptionsHandler,
  render_preview: renderPreviewHandler,
  render_export: renderExportHandler,
  retention_sweep: async (ctx) => {
    const r = await runRetentionSweep(ctx);
    return { kind: 'retention_sweep', purgedAssets: r.purgedAssets, purgedExports: r.purgedExports };
  },
};

/**
 * Durable task worker. Claims leased tasks, heartbeats progress, observes
 * cooperative cancellation, and settles/releases render credits exactly once.
 */
export class TaskWorker {
  readonly workerId: string;
  private readonly pollMs: number;
  private readonly leaseMs: number;
  private readonly heartbeatMs: number;
  private readonly kinds: TaskKind[] | undefined;
  private readonly maintenanceEveryMs: number;
  private readonly retentionEveryMs: number;
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private lastMaintenance = 0;
  private lastRetention = 0;
  private current: { task: TaskRecord; controller: AbortController } | null = null;

  constructor(
    private readonly ctx: AppContext,
    opts: WorkerOptions = {},
    private readonly handlers: Record<TaskKind, TaskHandler> = DEFAULT_HANDLERS,
  ) {
    this.workerId = opts.workerId ?? newId('task').replace('task_', 'worker_');
    this.pollMs = opts.pollMs ?? ctx.config.worker.pollMs;
    this.leaseMs = opts.leaseMs ?? ctx.config.worker.leaseMs;
    this.heartbeatMs = opts.heartbeatMs ?? Math.max(250, Math.floor(this.leaseMs / 4));
    this.kinds = opts.kinds;
    this.maintenanceEveryMs = opts.maintenanceEveryMs ?? 30_000;
    this.retentionEveryMs = opts.retentionEveryMs ?? 10 * 60_000;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.current?.controller.abort('shutdown');
    await this.loopPromise;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      let ran = false;
      try {
        ran = await this.runOnce();
      } catch (err) {
        this.ctx.logger.error('worker loop error', { error: err instanceof Error ? err.message : String(err) });
      }
      if (!ran && this.running) await new Promise((r) => setTimeout(r, this.pollMs));
    }
  }

  /** Run maintenance if due, then claim and execute at most one task. Returns true when a task ran. */
  async runOnce(): Promise<boolean> {
    await this.maintenance();
    const task = claimNextTask(this.ctx.db, {
      workerId: this.workerId,
      now: this.ctx.clock.iso(),
      leaseMs: this.leaseMs,
      ...(this.kinds ? { kinds: this.kinds } : {}),
    });
    if (!task) return false;
    await this.execute(task);
    return true;
  }

  async maintenance(force = false): Promise<void> {
    const now = this.ctx.clock.now();
    if (!force && now - this.lastMaintenance < this.maintenanceEveryMs) return;
    this.lastMaintenance = now;
    const reclaimed = reclaimExpiredLeases(this.ctx.db, this.ctx.clock.iso());
    for (const id of reclaimed.failed) releaseForTask(this.ctx, id, 'worker lease lost');
    for (const id of reclaimed.cancelled) releaseForTask(this.ctx, id, 'cancelled after lease loss');
    // Terminal render tasks keep no outputs: rows and row-less blobs alike are removed.
    for (const id of [...reclaimed.failed, ...reclaimed.cancelled]) await discardOutputsForTaskId(this.ctx, id);
    expireOpenQuotes(this.ctx.db, this.ctx.clock.iso());
    if (force || now - this.lastRetention >= this.retentionEveryMs) {
      this.lastRetention = now;
      await runRetentionSweep(this.ctx).catch((err) => this.ctx.logger.warn('retention sweep failed', { error: String(err) }));
    }
  }

  private async execute(task: TaskRecord): Promise<void> {
    const controller = new AbortController();
    this.current = { task, controller };
    const log = this.ctx.logger.child({ taskId: task.id, kind: task.kind, workerId: this.workerId });
    let progress = task.progress;
    let stage = task.stage;
    let leaseLost = false;
    const heartbeat = () => {
      const hb = heartbeatTask(this.ctx.db, { id: task.id, workerId: this.workerId, now: this.ctx.clock.iso(), leaseMs: this.leaseMs, progress, ...(stage ? { stage } : {}) });
      if (!hb.owned) {
        leaseLost = true;
        controller.abort('lease-lost');
      } else if (hb.cancelRequested) {
        controller.abort('cancel');
      }
    };
    const timer = setInterval(heartbeat, this.heartbeatMs);
    const tools: HandlerTools = {
      signal: controller.signal,
      workerId: this.workerId,
      progress: (pct, s) => {
        progress = Math.max(0, Math.min(99, Math.round(pct)));
        if (s) stage = s;
      },
    };
    const handler = this.handlers[task.kind];
    log.info('task started', { attempt: task.attempts });
    try {
      if (!handler) throw new Error(`No handler for ${task.kind}`);
      heartbeat();
      if (controller.signal.aborted) throw new Error('cancelled before start');
      const result = await handler(this.ctx, task, tools);
      clearInterval(timer);
      if (leaseLost) {
        log.warn('lease lost before completion; result discarded');
        return;
      }
      // Completion and billing settlement are one atomic step: credits are only
      // charged when THIS worker still owns the task and the completion is recorded.
      const done = transaction(this.ctx.db, () => {
        const completed = completeTask(this.ctx.db, { id: task.id, workerId: this.workerId, result, now: this.ctx.clock.iso() });
        if (completed && task.kind === 'render_export') settleForTask(this.ctx, task.id);
        return completed;
      });
      if (!done) {
        log.warn('task completion rejected (lease no longer owned); billing untouched');
        return;
      }
      audit(this.ctx, { workspaceId: task.workspaceId, actorType: 'worker', actorId: this.workerId, action: `task.${task.kind}.succeeded`, targetType: 'task', targetId: task.id });
      log.info('task succeeded');
    } catch (err) {
      clearInterval(timer);
      if (leaseLost) {
        log.warn('lease lost during execution');
        return;
      }
      if (controller.signal.reason === 'cancel' || (controller.signal.aborted && isCancellation(err))) {
        const cancelled = markCancelled(this.ctx.db, { id: task.id, workerId: this.workerId, now: this.ctx.clock.iso() });
        if (task.kind === 'render_export') releaseForTask(this.ctx, task.id, 'cancelled');
        if (cancelled) await discardOutputsForTaskId(this.ctx, task.id);
        audit(this.ctx, { workspaceId: task.workspaceId, actorType: 'worker', actorId: this.workerId, action: `task.${task.kind}.cancelled`, targetType: 'task', targetId: task.id });
        log.info('task cancelled');
        return;
      }
      const { error, internal } = toTaskError(err);
      const errorRef = newId('errorRef');
      const outcome = failTask(this.ctx.db, {
        id: task.id,
        workerId: this.workerId,
        error: { ...error, errorRef },
        now: this.ctx.clock.iso(),
        backoffMs: BACKOFF_MS[Math.min(BACKOFF_MS.length - 1, Math.max(0, task.attempts - 1))] ?? 2_000,
      });
      if (outcome.outcome === 'failed' && task.kind === 'render_export') releaseForTask(this.ctx, task.id, 'render failed');
      if (outcome.outcome === 'failed') await discardOutputsForTaskId(this.ctx, task.id);
      audit(this.ctx, {
        workspaceId: task.workspaceId,
        actorType: 'worker',
        actorId: this.workerId,
        action: `task.${task.kind}.${outcome.outcome}`,
        targetType: 'task',
        targetId: task.id,
        outcome: 'error',
        errorRef,
        metadata: { code: error.code, attempt: task.attempts, internal: internal instanceof Error ? internal.message : typeof internal === 'string' ? internal.slice(0, 500) : undefined },
      });
      log.warn('task failed', { code: error.code, outcome: outcome.outcome, errorRef, internal: internal instanceof Error ? internal.message : undefined });
    } finally {
      this.current = null;
    }
  }
}
