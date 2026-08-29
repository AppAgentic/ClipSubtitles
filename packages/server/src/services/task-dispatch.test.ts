import { describe, expect, it, vi } from 'vitest';
import { createHarness } from '../test/harness';
import { dispatchTaskBestEffort, flushTaskDispatchOutbox } from './task-dispatch';

describe('task dispatch outbox', () => {
  it('keeps a failed dispatch pending without throwing, then reconciles it', async () => {
    const h = await createHarness();
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('temporary'), { code: 14 }))
      .mockResolvedValue(undefined);
    h.ctx.taskDispatcher = { dispatch };
    const identity = await h.ctx.db.ensureUserWorkspace({
      subject: 'dispatch-test',
      now: h.clock.iso(),
      initialCredits: 0,
    });
    const task = await h.ctx.db.enqueueTask({
      workspaceId: identity.workspace.id,
      kind: 'render_preview',
      input: {},
      now: h.clock.iso(),
    });

    await expect(dispatchTaskBestEffort(h.ctx, task.id)).resolves.toBe(false);
    expect((await h.ctx.db.listPendingDispatches(h.clock.iso()))[0]?.attempts).toBe(1);

    await expect(flushTaskDispatchOutbox(h.ctx)).resolves.toEqual({ attempted: 1, delivered: 1 });
    expect(await h.ctx.db.listPendingDispatches(h.clock.iso())).toHaveLength(0);
    expect(dispatch).toHaveBeenCalledTimes(2);
    h.cleanup();
  });
});
