import type { CaptionPage, StyleConfig, TranscriptWord } from '@clipsubtitles/contracts';
import { sha256Hex, visualStates, type FrameSize, type TextMeasurer } from '@clipsubtitles/core';
import { rasterizeCaption, transparentPng } from './rasterize';

export interface PlannedState {
  /** Stable key; identical page+word states share one image. */
  key: string;
  page: CaptionPage | null;
  activeWordIndex: number | null;
}

export interface TimelineSegment {
  startMs: number;
  endMs: number;
  key: string;
}

export interface StatePlan {
  frame: FrameSize;
  states: Map<string, PlannedState>;
  /** Contiguous segments covering [windowStart, windowEnd) with no gaps. */
  timeline: TimelineSegment[];
  blankKey: string;
}

export const BLANK_KEY = 'blank';

/**
 * Turn pages + words into a gap-free timeline of caption states over the
 * requested window. Each distinct (page, activeWord) becomes one image key.
 */
export function planStates(input: {
  words: readonly TranscriptWord[];
  pages: readonly CaptionPage[];
  style: StyleConfig;
  frame: FrameSize;
  windowStartMs: number;
  windowEndMs: number;
}): StatePlan {
  const needsWordStates =
    input.style.highlight.mode === 'word' || input.style.emoji.mode === 'auto';
  const raw = visualStates(input.words, input.pages, needsWordStates);
  const states = new Map<string, PlannedState>();
  states.set(BLANK_KEY, { key: BLANK_KEY, page: null, activeWordIndex: null });
  const timeline: TimelineSegment[] = [];
  let cursor = input.windowStartMs;
  for (const s of raw) {
    const start = Math.max(s.startMs, input.windowStartMs);
    const end = Math.min(s.endMs, input.windowEndMs);
    if (end <= start) continue;
    if (start > cursor) timeline.push({ startMs: cursor, endMs: start, key: BLANK_KEY });
    const key = `${s.page.id}:${s.activeWordIndex ?? '-'}`;
    if (!states.has(key))
      states.set(key, { key, page: s.page, activeWordIndex: s.activeWordIndex });
    timeline.push({ startMs: start, endMs: end, key });
    cursor = end;
  }
  if (cursor < input.windowEndMs)
    timeline.push({ startMs: cursor, endMs: input.windowEndMs, key: BLANK_KEY });
  return { frame: input.frame, states, timeline, blankKey: BLANK_KEY };
}

export interface RasterizedState {
  key: string;
  png: Buffer;
  sha256: string;
}

/** Rasterize every planned state once. Deterministic for identical input. */
export function rasterizePlan(
  plan: StatePlan,
  input: { words: readonly TranscriptWord[]; style: StyleConfig; measure?: TextMeasurer },
  onProgress?: (done: number, total: number) => void,
): Map<string, RasterizedState> {
  const out = new Map<string, RasterizedState>();
  const total = plan.states.size;
  let done = 0;
  for (const state of plan.states.values()) {
    let png: Buffer;
    if (!state.page) {
      png = transparentPng(plan.frame);
    } else {
      png = rasterizeCaption({
        page: state.page,
        words: input.words,
        style: input.style,
        frame: plan.frame,
        activeWordIndex: state.activeWordIndex,
        ...(input.measure ? { measure: input.measure } : {}),
      }).png;
    }
    out.set(state.key, { key: state.key, png, sha256: sha256Hex(png) });
    done += 1;
    onProgress?.(done, total);
  }
  return out;
}
