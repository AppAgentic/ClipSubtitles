import { expect, it, vi } from 'vitest';
import { DEFAULT_HANDLERS, TaskWorker } from '../worker/worker';
import { createHarness } from './harness';

it('publishes intermediate progress before a short job completes with a long production lease', async () => {
  const h = await createHarness();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let execution: Promise<boolean> | undefined;
  try {
    const token = await h.token();
    const me = await h.api<{ workspace: { id: string } }>('GET', '/v1/me', { token });
    const workspaceId = me.body.workspace.id;
    const task = await h.ctx.db.enqueueTask({ workspaceId, kind: 'retention_sweep', input: {}, now: h.clock.iso() });
    const worker = new TaskWorker(h.ctx, { leaseMs: 120_000 }, {
      ...DEFAULT_HANDLERS,
      retention_sweep: async (_ctx, _task, tools) => {
        tools.progress(20, 'transcribing');
        await pending;
        return { kind: 'retention_sweep', purgedAssets: 0, purgedExports: 0 };
      },
    });
    execution = worker.runOnce();
    await vi.waitFor(async () => {
      const current = await h.ctx.db.getTask(workspaceId, task.id);
      expect(current).toMatchObject({ status: 'running', progress: 20, stage: 'transcribing' });
    }, { timeout: 2_500, interval: 50 });
    release();
    expect(await execution).toBe(true);
    expect(await h.ctx.db.getTask(workspaceId, task.id)).toMatchObject({ status: 'succeeded', progress: 100 });
  } finally {
    release();
    await execution;
    await h.cleanup();
  }
});
