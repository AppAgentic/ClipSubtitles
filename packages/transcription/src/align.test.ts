import { describe, expect, it } from 'vitest';
import { alignTextToTimedWords, alignTokens, normalizeToken } from './align';

describe('alignTokens', () => {
  it('produces match/sub/ins/del steps', () => {
    const steps = alignTokens(['the', 'cat', 'sat', 'down'], ['the', 'cat', 'sits', 'right', 'down']);
    const ops = steps.map((s) => s.op);
    expect(ops.filter((o) => o === 'match')).toHaveLength(3);
    expect(ops).toContain('sub');
    expect(ops).toContain('ins');
    expect(alignTokens(['a', 'b'], []).map((s) => s.op)).toEqual(['del', 'del']);
  });

  it('normalizes case and punctuation', () => {
    expect(normalizeToken('Hello,')).toBe('hello');
    expect(alignTokens(['Hello,'], ['hello']).map((s) => s.op)).toEqual(['match']);
  });
});

describe('alignTextToTimedWords', () => {
  it('inherits anchor timings and interpolates unmatched runs monotonically', () => {
    const timed = [
      { text: 'we', startMs: 0, endMs: 200 },
      { text: 'ship', startMs: 250, endMs: 500 },
      { text: 'captions', startMs: 600, endMs: 1000 },
    ];
    const out = alignTextToTimedWords('we ship great captions fast', timed, 1500);
    expect(out.map((t) => t.text)).toEqual(['we', 'ship', 'great', 'captions', 'fast']);
    expect(out[0]).toMatchObject({ startMs: 0, endMs: 200 });
    expect(out[3]).toMatchObject({ startMs: 600, endMs: 1000 });
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]!.startMs).toBeGreaterThanOrEqual(out[i - 1]!.endMs);
      expect(out[i]!.endMs).toBeGreaterThan(out[i]!.startMs);
    }
    expect(out[4]!.endMs).toBeLessThanOrEqual(1500);
  });

  it('handles empty text and no anchors', () => {
    expect(alignTextToTimedWords('', [], 1000)).toEqual([]);
    const out = alignTextToTimedWords('one two', [], 1000);
    expect(out.map((t) => t.text)).toEqual(['one', 'two']);
    expect(out[1]!.endMs).toBe(1000);
  });
});
