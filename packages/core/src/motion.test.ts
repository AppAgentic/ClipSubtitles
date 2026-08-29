import { describe, expect, it } from 'vitest';
import { stylePreset } from './presets';
import { captionMotionState, easeInOutCubic, easeOutCubic, springProgress } from './motion';
import { DEFAULT_SEGMENTATION } from './presets';
import { segmentWords } from './segmentation';
import { wordsFromText } from './test-utils';

describe('caption motion', () => {
  it('keeps easing endpoints exact and the spring bounded', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(springProgress(0)).toBe(0);
    expect(springProgress(1)).toBe(1);
    for (let i = 0; i <= 100; i += 1) {
      const value = springProgress(i / 100);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1.3);
    }
  });

  it('settles page motion and interpolates karaoke highlights from the prior word', () => {
    const words = wordsFromText('smooth captions move beautifully');
    const page = segmentWords(words, DEFAULT_SEGMENTATION)[0]!;
    const style = stylePreset('karaoke');
    const activeWordIndex = page.startWordIndex + 1;
    const word = words[activeWordIndex]!;
    const start = captionMotionState({ page, words, style, activeWordIndex, timeMs: word.startMs });
    const settled = captionMotionState({
      page,
      words,
      style,
      activeWordIndex,
      timeMs: word.startMs + style.motion.wordTransitionMs,
    });
    expect(start.highlightFromWordIndex).toBe(activeWordIndex - 1);
    expect(start.highlightProgress).toBe(0);
    expect(settled.highlightProgress).toBe(1);
    expect(settled.activeWordScale).toBeCloseTo(style.highlight.scale, 8);
  });
});
