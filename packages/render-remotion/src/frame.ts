import type { CaptionPage, StyleConfig, TranscriptWord } from '@clipsubtitles/contracts';
import { activeWordIndexInPage, visualPageAtMs } from '@clipsubtitles/core';

/** Media time for a composition frame, given the composition starts at `startMs`. */
export function frameTimeMs(frame: number, fps: number, startMs = 0): number {
  return startMs + Math.round((frame / fps) * 1000);
}

export function durationInFrames(durationMs: number, fps: number): number {
  return Math.max(1, Math.ceil((durationMs / 1000) * fps));
}

export interface FrameState {
  page: CaptionPage | null;
  activeWordIndex: number | null;
}

/** Pure per-frame resolution shared with the ffmpeg planner's semantics. */
export function frameState(
  words: readonly TranscriptWord[],
  pages: readonly CaptionPage[],
  style: StyleConfig,
  timeMs: number,
): FrameState {
  const page = visualPageAtMs(pages, timeMs);
  if (!page) return { page: null, activeWordIndex: null };
  return {
    page,
    activeWordIndex:
      style.highlight.mode === 'word' || style.emoji.mode === 'auto'
        ? activeWordIndexInPage(page, words, timeMs)
        : null,
  };
}
