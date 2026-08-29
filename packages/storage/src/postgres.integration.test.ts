import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultStyle, DEFAULT_SEGMENTATION } from '@clipsubtitles/core';
import type { StorageError } from './errors';
import { PostgresStore } from './postgres-store';

/**
 * Opt-in concurrency suite. Point POSTGRES_TEST_URL at a disposable
 * PostgreSQL 17 database and run `pnpm --filter @clipsubtitles/storage
 * test:postgres`. Every case here exercises an invariant that SQLite got from
 * being a single writer and PostgreSQL must get from explicit locking.
 */
const connectionString = process.env.POSTGRES_TEST_URL;
const suite = connectionString ? describe : describe.skip;

const NOW = '2026-08-29T10:00:00.000Z';
const later = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();

suite('PostgreSQL persistence under concurrency', () => {
  let store: PostgresStore;
  let second: PostgresStore;

  async function newWorkspace(credits = 0): Promise<string> {
    const { workspace } = await store.ensureUserWorkspace({
      subject: `subject-${randomUUID()}`,
      now: NOW,
      initialCredits: credits,
    });
    return workspace.id;
  }

  async function newProject(workspaceId: string): Promise<string> {
    const project = await store.createProject({
      workspaceId,
      title: 'Concurrency',
      status: 'ready',
      style: defaultStyle(),
      segmentation: DEFAULT_SEGMENTATION,
      contentHash: 'hash',
      now: NOW,
    });
    return project.id;
  }

  beforeAll(async () => {
    // Two independently migrating pools: startup must be serialized by the
    // advisory lock and each version applied exactly once.
    [store, second] = await Promise.all([
      PostgresStore.open({ connectionString }),
      PostgresStore.open({ connectionString }),
    ]);
  });

  afterAll(async () => {
    await Promise.all([store?.close(), second?.close()]);
  });

  it('applies every migration exactly once despite concurrent startup', async () => {
    const rows = await store.db.pool.query<{ version: number; count: number }>(
      'SELECT version, count(*)::int AS count FROM schema_migrations GROUP BY version ORDER BY version',
    );
    expect(rows.rows).toEqual([{ version: 1, count: 1 }]);
    // Re-running the migrator is a no-op, not a duplicate apply.
    const third = await PostgresStore.open({ connectionString });
    try {
      const again = await third.db.pool.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM schema_migrations',
      );
      expect(again.rows[0]?.n).toBe(1);
    } finally {
      await third.close();
    }
  });

  it('rolls back every write in a failed transaction', async () => {
    const workspaceId = await newWorkspace();
    const marker = `rollback-${randomUUID()}`;
    await expect(
      store.transaction(async () => {
        await store.createProject({
          workspaceId,
          title: marker,
          status: 'ready',
          style: defaultStyle(),
          segmentation: DEFAULT_SEGMENTATION,
          contentHash: 'hash',
          now: NOW,
        });
        throw new Error('rollback-check');
      }),
    ).rejects.toThrow('rollback-check');
    const projects = await store.listProjects(workspaceId);
    expect(projects.map((p) => p.title)).not.toContain(marker);
  });

  it('pins nested calls to the outer transaction', async () => {
    const workspaceId = await newWorkspace();
    let idInside = '';
    await store.transaction(async () => {
      const project = await store.createProject({
        workspaceId,
        title: 'pinned',
        status: 'ready',
        style: defaultStyle(),
        segmentation: DEFAULT_SEGMENTATION,
        contentHash: 'hash',
        now: NOW,
      });
      idInside = project.id;
      // Nested transaction joins rather than opening a second one, so the
      // uncommitted row is visible to it.
      const seen = await store.transaction(() => store.getProjectById(project.id));
      expect(seen?.id).toBe(project.id);
      // A different pool connection must not see it yet.
      expect(await second.getProjectById(project.id)).toBeNull();
    });
    expect((await second.getProjectById(idInside))?.id).toBe(idInside);
  });

  it('claims a request idempotency key exactly once under concurrency', async () => {
    const workspaceId = await newWorkspace();
    const key = `idem-${randomUUID()}`;
    const attempts = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        (i % 2 === 0 ? store : second).beginIdempotent({
          workspaceId,
          scope: 'renders',
          key,
          fingerprint: 'fp',
          now: NOW,
        }),
      ),
    );
    expect(attempts.filter((a) => a.kind === 'new')).toHaveLength(1);
    expect(attempts.filter((a) => a.kind === 'in_progress')).toHaveLength(7);
    // A reused key with a different payload is rejected, not replayed.
    const reused = await store.beginIdempotent({
      workspaceId,
      scope: 'renders',
      key,
      fingerprint: 'other',
      now: NOW,
    });
    expect(reused.kind).toBe('mismatch');
  });

  it('enqueues one task for concurrent duplicate idempotency keys', async () => {
    const workspaceId = await newWorkspace();
    const key = `task-${randomUUID()}`;
    const tasks = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        (i % 2 === 0 ? store : second).enqueueTask({
          workspaceId,
          kind: 'render_export',
          input: { n: i },
          idempotencyKey: key,
          now: NOW,
        }),
      ),
    );
    expect(new Set(tasks.map((t) => t.id)).size).toBe(1);
    const rows = await store.db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM tasks WHERE workspace_id = $1',
      [workspaceId],
    );
    expect(rows.rows[0]?.n).toBe(1);
  });

  it('never overspends credits when reservations race', async () => {
    const workspaceId = await newWorkspace(100);
    const projectId = await newProject(workspaceId);
    const quotes = await Promise.all(
      Array.from({ length: 5 }, () =>
        store.createQuote({
          workspaceId,
          projectId,
          projectVersion: 1,
          contentHash: 'hash',
          settings: { outputs: ['mp4'], resolution: 'source', fps: 'source', quality: 'standard' },
          expectedOutputs: [],
          durationMs: 1000,
          billableMinutes: 1,
          creditCost: 40,
          priceVersion: 'test',
          now: NOW,
          expiresAt: later(900_000),
        }),
      ),
    );
    const results = await Promise.allSettled(
      quotes.map((quote, i) =>
        (i % 2 === 0 ? store : second).reserveCredits({
          workspaceId,
          quoteId: quote.id,
          taskId: `task_${quote.id}`,
          amount: 40,
          now: NOW,
        }),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const denied = results.filter(
      (r) => r.status === 'rejected' && (r.reason as StorageError).code === 'INSUFFICIENT_CREDITS',
    );
    expect(ok).toHaveLength(2);
    expect(denied).toHaveLength(3);
    const balance = await store.getBalance(workspaceId);
    expect(balance).toMatchObject({ available: 20, reserved: 80 });
    expect(balance.available).toBeGreaterThanOrEqual(0);
  });

  it('reserves a single quote exactly once and settles it exactly once', async () => {
    const workspaceId = await newWorkspace(100);
    const projectId = await newProject(workspaceId);
    const quote = await store.createQuote({
      workspaceId,
      projectId,
      projectVersion: 1,
      contentHash: 'hash',
      settings: { outputs: ['mp4'], resolution: 'source', fps: 'source', quality: 'standard' },
      expectedOutputs: [],
      durationMs: 1000,
      billableMinutes: 1,
      creditCost: 25,
      priceVersion: 'test',
      now: NOW,
      expiresAt: later(900_000),
    });
    const taskId = `task_${quote.id}`;
    const reserved = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        (i % 2 === 0 ? store : second).reserveCredits({
          workspaceId,
          quoteId: quote.id,
          taskId,
          amount: 25,
          now: NOW,
        }),
      ),
    );
    expect(reserved.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(reserved.map((r) => r.reservation.id)).size).toBe(1);
    expect(await store.getBalance(workspaceId)).toMatchObject({ available: 75, reserved: 25 });

    // Only one caller may consume the quote.
    const consumed = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        (i % 2 === 0 ? store : second).consumeQuote({
          workspaceId,
          id: quote.id,
          taskId,
          now: NOW,
        }),
      ),
    );
    expect(consumed.filter((c) => c.outcome === 'consumed')).toHaveLength(1);
    expect(consumed.filter((c) => c.outcome === 'already_consumed')).toHaveLength(3);

    const reservationId = reserved[0]!.reservation.id;
    const settled = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        (i % 2 === 0 ? store : second).settleReservation({ reservationId, now: NOW }),
      ),
    );
    expect(settled.filter((s) => s.changed)).toHaveLength(1);
    expect(await store.getBalance(workspaceId)).toMatchObject({ available: 75, reserved: 0 });
    const ledger = await store.listLedger(workspaceId);
    expect(ledger.filter((e) => e.kind === 'settle')).toHaveLength(1);
    expect(ledger.filter((e) => e.kind === 'reserve')).toHaveLength(1);
  });

  it('gives concurrent revisions distinct sequential numbers', async () => {
    const workspaceId = await newWorkspace();
    const projectId = await newProject(workspaceId);
    const revisions = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        (i % 2 === 0 ? store : second).createRevision({
          projectId,
          source: 'generated',
          provider: 'mock',
          language: 'en',
          words: [],
          durationMs: 1000,
          now: NOW,
        }),
      ),
    );
    const numbers = revisions.map((r) => r.revisionNumber).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('lets exactly one worker claim each queued task', async () => {
    // Earlier cases intentionally leave queued tasks behind; isolate this
    // global-queue assertion so it measures only the five tasks below.
    await store.db.pool.query("UPDATE tasks SET status = 'succeeded' WHERE status = 'queued'");
    const workspaceId = await newWorkspace();
    const created = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        store.enqueueTask({ workspaceId, kind: 'render_preview', input: { i }, now: NOW }),
      ),
    );
    const claims = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        (i % 2 === 0 ? store : second).claimNextTask({
          workerId: `worker_${i}`,
          now: later(1000),
          leaseMs: 60_000,
        }),
      ),
    );
    const claimed = claims.filter((t): t is NonNullable<typeof t> => t !== null);
    expect(claimed).toHaveLength(created.length);
    expect(new Set(claimed.map((t) => t.id)).size).toBe(created.length);
    for (const task of claimed) expect(task.attempts).toBe(1);
  });

  it('rejects completion, heartbeat, and cancellation from a worker that lost the lease', async () => {
    const workspaceId = await newWorkspace();
    const task = await store.enqueueTask({
      workspaceId,
      kind: 'render_preview',
      input: {},
      now: NOW,
    });
    const claimed = await store.claimTaskById({
      id: task.id,
      workerId: 'worker_owner',
      now: later(1000),
      leaseMs: 60_000,
    });
    expect(claimed).not.toBeNull();
    expect(
      await second.claimTaskById({
        id: task.id,
        workerId: 'worker_thief',
        now: later(1000),
        leaseMs: 60_000,
      }),
    ).toBeNull();
    expect(
      await second.heartbeatTask({
        id: task.id,
        workerId: 'worker_thief',
        now: later(2000),
        leaseMs: 60_000,
      }),
    ).toEqual({ owned: false, cancelRequested: false });
    expect(
      await second.completeTask({
        id: task.id,
        workerId: 'worker_thief',
        result: {
          kind: 'render_preview',
          projectId: 'p',
          exportId: 'e',
          projectVersion: 1,
          contentHash: 'h',
        },
        now: later(2000),
      }),
    ).toBeNull();
    expect(
      await second.markCancelled({ id: task.id, workerId: 'worker_thief', now: later(2000) }),
    ).toBeNull();
    expect(
      await store.heartbeatTask({
        id: task.id,
        workerId: 'worker_owner',
        now: later(2000),
        leaseMs: 60_000,
        progress: 42,
      }),
    ).toEqual({ owned: true, cancelRequested: false });
    expect((await store.getTaskById(task.id))?.progress).toBe(42);
  });

  it('reclaims an expired lease once, even with two reclaimers running', async () => {
    const workspaceId = await newWorkspace();
    const task = await store.enqueueTask({
      workspaceId,
      kind: 'render_preview',
      input: {},
      now: NOW,
    });
    await store.claimTaskById({
      id: task.id,
      workerId: 'worker_gone',
      now: NOW,
      leaseMs: 1_000,
    });
    const [a, b] = await Promise.all([
      store.reclaimExpiredLeases(later(60_000)),
      second.reclaimExpiredLeases(later(60_000)),
    ]);
    const requeued = [...a.requeued, ...b.requeued];
    expect(requeued.filter((id) => id === task.id)).toHaveLength(1);
    expect((await store.getTaskById(task.id))?.status).toBe('queued');
    expect((await store.getTaskById(task.id))?.leaseOwner).toBeUndefined();
  });

  it('re-arms the dispatch outbox with a new generation so stale deliveries cannot ack', async () => {
    const workspaceId = await newWorkspace();
    const task = await store.enqueueTask({
      workspaceId,
      kind: 'render_preview',
      input: {},
      now: NOW,
      maxAttempts: 3,
    });
    expect(await store.getTaskDispatch(task.id)).toMatchObject({ generation: 0 });
    expect(await store.markTaskDispatched(task.id, 0, NOW)).toBe(true);
    // A second ack for the same generation must not double-deliver.
    expect(await second.markTaskDispatched(task.id, 0, NOW)).toBe(false);

    await store.claimTaskById({ id: task.id, workerId: 'w1', now: NOW, leaseMs: 60_000 });
    const failed = await store.failTask({
      id: task.id,
      workerId: 'w1',
      error: { code: 'INTERNAL', message: 'transient', retryable: true },
      now: NOW,
      backoffMs: 0,
    });
    expect(failed.outcome).toBe('requeued');

    const rearmed = await store.getTaskDispatch(task.id);
    expect(rearmed).toMatchObject({ generation: 1, attempts: 0 });
    expect(rearmed?.deliveredAt).toBeUndefined();
    expect((await store.listPendingDispatches(later(1000))).map((d) => d.taskId)).toContain(
      task.id,
    );
    // The stale generation cannot ack the redelivery; the current one can, once.
    expect(await store.markTaskDispatched(task.id, 0, NOW)).toBe(false);
    expect(await store.markTaskDispatched(task.id, 1, NOW)).toBe(true);
    expect(await second.markTaskDispatched(task.id, 1, NOW)).toBe(false);
  });

  it('claims an upload token exactly once', async () => {
    const workspaceId = await newWorkspace();
    const projectId = await newProject(workspaceId);
    const asset = await store.createAsset({
      workspaceId,
      projectId,
      status: 'pending_upload',
      origin: 'upload',
      now: NOW,
    });
    const upload = await store.createUpload({
      workspaceId,
      projectId,
      assetId: asset.id,
      tokenHash: `hash-${randomUUID()}`,
      maxBytes: 1024,
      now: NOW,
      expiresAt: later(3_600_000),
    });
    const claims = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        (i % 2 === 0 ? store : second).completeUpload(upload.id, NOW),
      ),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('accepts one optimistic project edit per version', async () => {
    const workspaceId = await newWorkspace();
    const projectId = await newProject(workspaceId);
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) =>
        (i % 2 === 0 ? store : second).commitProjectEdit({
          id: projectId,
          workspaceId,
          expectedVersion: 1,
          patch: { contentHash: `hash-${i}` },
          now: NOW,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((x) => x.status === 'rejected')) {
      expect((r.reason as StorageError).code).toBe('VERSION_CONFLICT');
    }
    expect((await store.getProjectById(projectId))?.version).toBe(2);
  });
});
