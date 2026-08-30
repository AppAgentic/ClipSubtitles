import type { CaptionPage, SegmentationParams, StyleConfig, TranscriptWord } from '@clipsubtitles/contracts';
import { computeContentHash } from './hash';
import { DEFAULT_SEGMENTATION, defaultStyle, segmentationForStyle } from './presets';
import { segmentWords } from './segmentation';

/**
 * The editable caption state of a project version. Pages are always derived
 * from words + segmentation + manual constraints, so they can never drift from
 * the transcript.
 */
export interface CaptionState {
  title: string;
  language: string | undefined;
  words: TranscriptWord[];
  pages: CaptionPage[];
  style: StyleConfig;
  segmentation: SegmentationParams;
  /** Word ids that must start a page (manual splits). */
  manualBreaks: string[];
  /** Word ids that may not start a page (manual merges). */
  manualJoins: string[];
  /** Seed for deterministic page ids (revision id). */
  revisionSeed: string;
}

export function createCaptionState(init: {
  title: string;
  words: TranscriptWord[];
  style?: StyleConfig;
  segmentation?: SegmentationParams;
  language?: string;
  revisionSeed: string;
}): CaptionState {
  const style = init.style ?? defaultStyle();
  const segmentation = init.segmentation ?? segmentationForStyle(style, DEFAULT_SEGMENTATION);
  const state: CaptionState = {
    title: init.title,
    language: init.language,
    words: init.words,
    pages: [],
    style,
    segmentation,
    manualBreaks: [],
    manualJoins: [],
    revisionSeed: init.revisionSeed,
  };
  return resegmentState(state);
}

/** Recompute pages honoring manual constraints. Pure. */
export function resegmentState(state: CaptionState): CaptionState {
  const indexById = new Map<string, number>();
  state.words.forEach((w, i) => indexById.set(w.id, i));
  const forcedBreaks = new Set<number>();
  const forbiddenBreaks = new Set<number>();
  const manualBreaks = state.manualBreaks.filter((id) => indexById.has(id));
  const manualJoins = state.manualJoins.filter((id) => indexById.has(id));
  for (const id of manualBreaks) {
    const idx = indexById.get(id);
    if (idx !== undefined && idx > 0) forcedBreaks.add(idx);
  }
  for (const id of manualJoins) {
    const idx = indexById.get(id);
    if (idx !== undefined && idx > 0 && !forcedBreaks.has(idx)) forbiddenBreaks.add(idx);
  }
  const pages = segmentWords(state.words, state.segmentation, {
    forcedBreaks,
    forbiddenBreaks,
    seed: state.revisionSeed,
  });
  return { ...state, pages, manualBreaks, manualJoins };
}

export function stateContentHash(state: CaptionState): string {
  return computeContentHash({ words: state.words, pages: state.pages, style: state.style });
}

/** Index of the word active at `ms` (last word whose start <= ms, while ms < end + grace). */
export function activeWordIndexAt(words: readonly TranscriptWord[], ms: number, graceMs = 0): number | null {
  if (words.length === 0) return null;
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = words[mid];
    if (!w) break;
    if (w.startMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null;
  const w = words[found];
  if (!w) return null;
  return ms < w.endMs + graceMs ? found : null;
}

/**
 * Active word for a visible caption page. Unlike raw speech activity, the most
 * recently started word stays highlighted through natural gaps and page tail
 * padding so animated and sparse render lanes show the same visual state.
 */
export function activeWordIndexInPage(
  page: CaptionPage,
  words: readonly TranscriptWord[],
  ms: number,
): number | null {
  if (ms < page.startMs || ms >= page.endMs) return null;
  let active = page.startWordIndex;
  for (let i = page.startWordIndex; i <= page.endWordIndex; i += 1) {
    const word = words[i];
    if (!word || word.startMs > ms) break;
    active = i;
  }
  return words[active] ? active : null;
}

/** Page visible at `ms`, if any. */
export function pageAtMs(pages: readonly CaptionPage[], ms: number): CaptionPage | null {
  let lo = 0;
  let hi = pages.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = pages[mid];
    if (!p) break;
    if (p.startMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null;
  const p = pages[found];
  return p && ms < p.endMs ? p : null;
}

/**
 * Distinct visual states over time: (page, activeWord) intervals. Used by
 * renderers to rasterize each state once instead of every frame.
 */
export interface VisualState {
  startMs: number;
  endMs: number;
  page: CaptionPage;
  activeWordIndex: number | null;
}

export function visualStates(
  words: readonly TranscriptWord[],
  pages: readonly CaptionPage[],
  highlightWords: boolean,
): VisualState[] {
  const states: VisualState[] = [];
  for (const page of pages) {
    if (!highlightWords) {
      states.push({ startMs: page.startMs, endMs: page.endMs, page, activeWordIndex: null });
      continue;
    }
    let cursor = page.startMs;
    for (let i = page.startWordIndex; i <= page.endWordIndex; i += 1) {
      const w = words[i];
      if (!w) continue;
      const next = words[i + 1];
      const wordEnd = i === page.endWordIndex ? page.endMs : Math.min(page.endMs, next ? next.startMs : w.endMs);
      if (wordEnd <= cursor) continue;
      states.push({ startMs: cursor, endMs: wordEnd, page, activeWordIndex: i });
      cursor = wordEnd;
    }
    if (cursor < page.endMs) {
      states.push({ startMs: cursor, endMs: page.endMs, page, activeWordIndex: page.endWordIndex });
    }
  }
  return states;
}
