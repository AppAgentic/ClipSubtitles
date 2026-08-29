import { describe, expect, it } from 'vitest';
import { breakLines } from './lines';

describe('breakLines', () => {
  it('keeps short text on one line', () => {
    expect(breakLines(['hello', 'world'], 24, 2)).toEqual([{ start: 0, end: 1 }]);
  });

  it('balances two lines instead of one long and one short', () => {
    const words = ['captions', 'that', 'look', 'great', 'on', 'every', 'single', 'phone'];
    const lines = breakLines(words, 24, 2);
    expect(lines).toHaveLength(2);
    const texts = lines.map((l) => words.slice(l.start, l.end + 1).join(' '));
    expect(texts[0]!.length).toBeLessThanOrEqual(24);
    expect(texts[1]!.length).toBeLessThanOrEqual(24);
    expect(Math.abs(texts[0]!.length - texts[1]!.length)).toBeLessThanOrEqual(8);
  });

  it('never drops words even when the limit cannot be met', () => {
    const words = ['supercalifragilisticexpialidocious', 'and', 'more'];
    const lines = breakLines(words, 10, 1);
    expect(lines).toEqual([{ start: 0, end: 2 }]);
    const three = breakLines(words, 10, 3);
    expect(three[0]!.start).toBe(0);
    expect(three[three.length - 1]!.end).toBe(2);
  });

  it('respects maxLines', () => {
    const words = Array.from({ length: 12 }, () => 'word');
    expect(breakLines(words, 10, 3).length).toBeLessThanOrEqual(3);
    expect(breakLines(words, 10, 2).length).toBeLessThanOrEqual(2);
  });
});
