import { describe, expect, it } from 'vitest';
import { DEFAULT_SEGMENTATION, segmentWords, stylePreset, wordsFromText } from '@clipsubtitles/core';
import { durationInFrames, frameState, frameTimeMs } from './frame';

describe('frame helpers', () => {
  it('maps frames to media time and back', () => {
    expect(frameTimeMs(0, 30)).toBe(0);
    expect(frameTimeMs(30, 30)).toBe(1000);
    expect(frameTimeMs(15, 30, 500)).toBe(1000);
    expect(durationInFrames(1000, 30)).toBe(30);
    expect(durationInFrames(1001, 30)).toBe(31);
    expect(durationInFrames(0, 30)).toBe(1);
  });

  it('resolves the visible page and active word per frame', () => {
    const words = wordsFromText('one two | three', { pauseMs: 1000 });
    const pages = segmentWords(words, DEFAULT_SEGMENTATION);
    const karaoke = stylePreset('karaoke');
    const first = words[0];
    const state = frameState(words, pages, karaoke, first ? first.startMs + 10 : 0);
    expect(state.page?.id).toBe(pages[0]?.id);
    expect(state.activeWordIndex).toBe(0);
    const plain = frameState(words, pages, stylePreset('clean'), first ? first.startMs + 10 : 0);
    expect(plain.activeWordIndex).toBeNull();
    const gap = frameState(words, pages, karaoke, (pages[0]?.endMs ?? 0) + 1);
    expect(gap.page).toBeNull();
  });
});
