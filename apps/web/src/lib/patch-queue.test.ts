import { describe, expect, it, vi } from 'vitest';
import type { CaptionProject, PatchOp } from '@clipsubtitles/contracts';
import { PatchQueue, mergeStylePatch, type PatchResult } from './patch-queue';

function fakeProject(version: number): CaptionProject {
  return { version } as unknown as CaptionProject;
}

interface Call {
  expectedVersion: number;
  ops: PatchOp[];
  keepalive: boolean;
}

function makeSender(opts: { failOn?: (call: Call) => boolean; delayMs?: number } = {}) {
  const calls: Call[] = [];
  let version = 1;
  const send = vi.fn(async (expectedVersion: number, ops: PatchOp[], o: { keepalive: boolean }): Promise<PatchResult> => {
    const call = { expectedVersion, ops, keepalive: o.keepalive };
    calls.push(call);
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.failOn?.(call)) throw new Error('VERSION_CONFLICT');
    if (expectedVersion !== version) throw new Error(`stale version ${expectedVersion} != ${version}`);
    version += 1;
    return { project: fakeProject(version), applied: ops.length, newRevision: false };
  });
  return { send, calls, current: () => version };
}

describe('PatchQueue', () => {
  it('serializes rapid ops so each request asserts the version returned by the previous one', async () => {
    const s = makeSender({ delayMs: 5 });
    const results: number[] = [];
    const busyAtResult: boolean[] = [];
    let idleCalls = 0;
    const q = new PatchQueue(1, {
      send: s.send,
      onResult: (r) => {
        results.push(r.project.version);
        busyAtResult.push(q.busy);
      },
      onError: () => undefined,
      onIdle: () => {
        idleCalls += 1;
      },
    });
    void q.enqueue([{ op: 'set_title', title: 'a' }]);
    void q.enqueue([{ op: 'set_position', position: 'top' }]);
    void q.enqueue([{ op: 'set_preset', preset: 'karaoke' }]);
    expect(q.busy).toBe(true);
    await q.idle();
    expect(s.calls.map((c) => c.expectedVersion)).toEqual([1, 2, 3]);
    expect(results).toEqual([2, 3, 4]);
    expect(q.currentVersion).toBe(4);
    // The last result must observe busy=false so a UI can settle to "saved"; idle fires exactly once for the burst.
    expect(busyAtResult).toEqual([true, true, false]);
    expect(q.busy).toBe(false);
    expect(idleCalls).toBe(1);
  });

  it('fires onIdle after an error too, so the UI never sticks in a saving state', async () => {
    const s = makeSender({ failOn: () => true });
    let idleCalls = 0;
    const q = new PatchQueue(1, { send: s.send, onResult: () => undefined, onError: () => undefined, onIdle: () => (idleCalls += 1) });
    await q.enqueue([{ op: 'set_title', title: 'x' }]);
    expect(q.busy).toBe(false);
    expect(idleCalls).toBe(1);
  });

  it('coalesces style patches and flushes them ahead of a non-style op in the same request', async () => {
    const s = makeSender();
    const q = new PatchQueue(1, { send: s.send, onResult: () => undefined, onError: () => undefined, styleDebounceMs: 10_000 });
    q.style({ fontSizePct: 0.05 });
    q.style({ stroke: { widthPct: 0.01 } });
    q.style({ stroke: { color: '#FF0000' }, fontSizePct: 0.06 });
    expect(q.hasPendingStyle).toBe(true);
    await q.enqueue([{ op: 'set_title', title: 'after style' }]);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]?.ops).toEqual([
      { op: 'set_style', style: { fontSizePct: 0.06, stroke: { widthPct: 0.01, color: '#FF0000' } } },
      { op: 'set_title', title: 'after style' },
    ]);
    expect(q.hasPendingStyle).toBe(false);
  });

  it('sends debounced style on its own after the window elapses', async () => {
    vi.useFakeTimers();
    try {
      const s = makeSender();
      const q = new PatchQueue(1, { send: s.send, onResult: () => undefined, onError: () => undefined, styleDebounceMs: 300 });
      q.style({ fontWeight: 900 });
      vi.advanceTimersByTime(299);
      expect(s.calls).toHaveLength(0);
      vi.advanceTimersByTime(1);
      await q.idle();
      expect(s.calls).toHaveLength(1);
      expect(s.calls[0]?.ops).toEqual([{ op: 'set_style', style: { fontWeight: 900 } }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps serving later requests after a failure and reports the error', async () => {
    const s = makeSender({ failOn: (c) => c.ops.some((o) => o.op === 'set_title' && o.title === 'boom') });
    const errors: string[] = [];
    const q = new PatchQueue(1, { send: s.send, onResult: () => undefined, onError: (e) => errors.push((e as Error).message) });
    void q.enqueue([{ op: 'set_title', title: 'boom' }]);
    await q.enqueue([{ op: 'set_title', title: 'ok' }]);
    expect(errors).toEqual(['VERSION_CONFLICT']);
    expect(s.calls[1]?.expectedVersion).toBe(1);
    expect(q.currentVersion).toBe(2);
  });

  it('resetVersion adopts an external reload and drops pending style edits', () => {
    const s = makeSender();
    const q = new PatchQueue(1, { send: s.send, onResult: () => undefined, onError: () => undefined, styleDebounceMs: 10_000 });
    q.style({ fontSizePct: 0.04 });
    q.resetVersion(7);
    expect(q.currentVersion).toBe(7);
    expect(q.hasPendingStyle).toBe(false);
  });

  it('dispose flushes pending style with keepalive and ignores later edits', async () => {
    const s = makeSender();
    const q = new PatchQueue(1, { send: s.send, onResult: () => undefined, onError: () => undefined, styleDebounceMs: 10_000 });
    q.style({ textTransform: 'uppercase' });
    q.dispose();
    q.style({ fontWeight: 500 });
    await q.enqueue([{ op: 'set_title', title: 'ignored' }]);
    await q.idle();
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]).toMatchObject({ keepalive: true, ops: [{ op: 'set_style', style: { textTransform: 'uppercase' } }] });
  });
});

describe('mergeStylePatch', () => {
  it('merges nested groups and lets later values win', () => {
    expect(mergeStylePatch({ stroke: { widthPct: 0.01 }, fontSizePct: 0.05 }, { stroke: { color: '#000000' }, fontSizePct: 0.06 })).toEqual({
      stroke: { widthPct: 0.01, color: '#000000' },
      fontSizePct: 0.06,
    });
    expect(mergeStylePatch(null, { maxLines: 1 })).toEqual({ maxLines: 1 });
  });
});
