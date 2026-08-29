import type {
  CaptionPage,
  MotionPreset,
  StyleConfig,
  TranscriptWord,
} from '@clipsubtitles/contracts';

export interface CaptionMotionState {
  opacity: number;
  scale: number;
  translateYFactor: number;
  blurFactor: number;
  activeWordScale: number;
  highlightFromWordIndex: number | null;
  highlightProgress: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function easeOutCubic(value: number): number {
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

export function easeInOutCubic(value: number): number {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Bounded, closed-form spring. It overshoots but resolves to exactly 1 at t=1. */
export function springProgress(value: number): number {
  const t = clamp01(value);
  if (t === 0 || t === 1) return t;
  const raw = 1 - Math.exp(-6 * t) * Math.cos(10 * t);
  const end = 1 - Math.exp(-6) * Math.cos(10);
  return raw / end;
}

function enterProgress(page: CaptionPage, timeMs: number, durationMs: number): number {
  return clamp01((timeMs - page.startMs) / Math.max(1, durationMs));
}

function exitOpacity(page: CaptionPage, timeMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return clamp01((page.endMs - timeMs) / durationMs);
}

function previousWordIndex(page: CaptionPage, activeWordIndex: number | null): number | null {
  if (activeWordIndex === null || activeWordIndex <= page.startWordIndex) return null;
  return activeWordIndex - 1;
}

export function captionMotionState(input: {
  page: CaptionPage;
  words: readonly TranscriptWord[];
  style: StyleConfig;
  timeMs: number;
  activeWordIndex: number | null;
}): CaptionMotionState {
  const { page, words, style, timeMs, activeWordIndex } = input;
  const preset: MotionPreset = style.motion.preset;
  if (preset === 'none') {
    return {
      opacity: 1,
      scale: 1,
      translateYFactor: 0,
      blurFactor: 0,
      activeWordScale: style.highlight.scale,
      highlightFromWordIndex: null,
      highlightProgress: 1,
    };
  }

  const enterT = enterProgress(page, timeMs, style.motion.enterDurationMs);
  const enterEase = preset === 'spring-pop' ? springProgress(enterT) : easeOutCubic(enterT);
  const opacity = Math.min(
    easeOutCubic(enterT),
    exitOpacity(page, timeMs, style.motion.exitDurationMs),
  );
  let scale = 0.98 + 0.02 * enterEase;
  let translateYFactor = 0.035 * (1 - enterEase);
  let blurFactor = preset === 'soft-rise' ? 0.012 * (1 - clamp01(enterEase)) : 0;
  if (preset === 'spring-pop') {
    scale = 0.78 + 0.22 * enterEase;
    translateYFactor = 0.018 * (1 - clamp01(enterEase));
    blurFactor = 0.003 * (1 - clamp01(enterEase));
  }

  const active = activeWordIndex === null ? undefined : words[activeWordIndex];
  const wordT = active
    ? clamp01((timeMs - active.startMs) / Math.max(1, style.motion.wordTransitionMs))
    : 1;
  const wordEase = preset === 'spring-pop' ? springProgress(wordT) : easeInOutCubic(wordT);
  const activeWordScale = 1 + (style.highlight.scale - 1) * wordEase;
  return {
    opacity,
    scale,
    translateYFactor,
    blurFactor,
    activeWordScale,
    highlightFromWordIndex:
      preset === 'karaoke-slide' ? previousWordIndex(page, activeWordIndex) : null,
    highlightProgress: preset === 'karaoke-slide' ? wordEase : 1,
  };
}
