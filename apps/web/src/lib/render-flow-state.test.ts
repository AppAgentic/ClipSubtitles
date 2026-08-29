import { describe, expect, it } from 'vitest';
import type { RenderQuote } from '@clipsubtitles/contracts';
import { canApprove, canQuote, formLocked, initialRenderFlowState, isTaskActive, isTaskTerminal, renderFlowReducer } from './render-flow-state';

const quote: RenderQuote = {
  id: 'quote_01j5abcdefghjkmnpqrsx',
  projectId: 'proj_01j5abcdefghjkmnpqrsx',
  projectVersion: 3,
  contentHash: 'a'.repeat(64),
  settings: { outputs: ['mp4', 'srt'], resolution: '1080p', fps: 'source', quality: 'standard' },
  expectedOutputs: [],
  durationMs: 10_000,
  billableMinutes: 0.17,
  creditCost: 4,
  priceVersion: '2026-08-v1',
  status: 'open',
  createdAt: '2026-08-29T10:00:00.000Z',
  expiresAt: '2026-08-29T10:15:00.000Z',
};
const project = { version: 3, contentHash: 'a'.repeat(64) };
const now = Date.parse('2026-08-29T10:01:00.000Z');

describe('renderFlowReducer', () => {
  it('drops an open quote when settings change so the card never diverges from the form', () => {
    let s = renderFlowReducer(initialRenderFlowState(), { type: 'quoted', quote });
    expect(canApprove(s, now, project)).toBe(true);
    s = renderFlowReducer(s, { type: 'settings', patch: { resolution: '720p' } });
    expect(s.quote).toBeNull();
    expect(s.quoteDroppedReason).toBe('settings_changed');
    expect(canApprove(s, now, project)).toBe(false);
    s = renderFlowReducer(s, { type: 'quoted', quote });
    s = renderFlowReducer(s, { type: 'toggle_output', kind: 'vtt' });
    expect(s.quote).toBeNull();
    expect(s.settings.outputs).toEqual(['mp4', 'srt', 'vtt']);
  });

  it('never allows zero outputs', () => {
    let s = initialRenderFlowState();
    s = renderFlowReducer(s, { type: 'toggle_output', kind: 'srt' });
    s = renderFlowReducer(s, { type: 'toggle_output', kind: 'mp4' });
    expect(s.settings.outputs).toEqual(['mp4']);
  });

  it('locks the form while a render is active and unlocks only through an explicit reset', () => {
    let s = renderFlowReducer(initialRenderFlowState(), { type: 'quoted', quote });
    s = renderFlowReducer(s, { type: 'render_started', taskId: 'task_1' });
    expect(formLocked(s)).toBe(true);
    expect(isTaskActive(s)).toBe(true);
    expect(canQuote(s, true)).toBe(false);
    // Settings changes are ignored while locked.
    expect(renderFlowReducer(s, { type: 'settings', patch: { quality: 'high' } })).toBe(s);
    s = renderFlowReducer(s, { type: 'task_status', status: 'succeeded' });
    expect(isTaskActive(s)).toBe(false);
    expect(isTaskTerminal(s)).toBe(true);
    expect(formLocked(s)).toBe(true); // still showing the finished render until the user resets
    s = renderFlowReducer(s, { type: 'reset' });
    expect(formLocked(s)).toBe(false);
    expect(s.quote).toBeNull();
    expect(s.taskId).toBeNull();
    expect(s.settings).toEqual(quote.settings); // settings are kept for a repeat render
    expect(canQuote(s, true)).toBe(true);
  });

  it('approval requires an unexpired quote for the exact current project version and hash', () => {
    const s = renderFlowReducer(initialRenderFlowState(), { type: 'quoted', quote });
    expect(canApprove(s, now, project)).toBe(true);
    expect(canApprove(s, Date.parse('2026-08-29T10:16:00.000Z'), project)).toBe(false);
    expect(canApprove(s, now, { version: 4, contentHash: project.contentHash })).toBe(false);
    expect(canApprove(s, now, { version: 3, contentHash: 'b'.repeat(64) })).toBe(false);
    expect(canApprove(renderFlowReducer(s, { type: 'quoted', quote: { ...quote, status: 'consumed' } }), now, project)).toBe(false);
  });
});
