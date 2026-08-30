import type {
  CaptionPosition,
  SegmentationParams,
  StyleConfig,
  StylePatch,
  StylePresetId,
} from '@clipsubtitles/contracts';
import { StyleConfigSchema } from '@clipsubtitles/contracts';

export const DEFAULT_SEGMENTATION: SegmentationParams = {
  maxCharsPerPage: 44,
  maxLinesPerPage: 2,
  maxCharsPerLine: 22,
  maxPageDurationMs: 4_000,
  minPageDurationMs: 600,
  maxWordsPerPage: 9,
  pauseBreakMs: 350,
  targetCps: 15,
  maxCps: 22,
  tailPaddingMs: 190,
};

/**
 * Presets are calibrated for 1080-wide vertical and 1080-tall landscape video
 * (shorter side = 1080): the widest allowed line stays inside the 90% safe
 * width at the preset's font size, so fit-to-width rarely has to kick in.
 */
const BASE: StyleConfig = {
  preset: 'clean',
  position: 'bottom',
  fontFamily: 'Inter',
  fontWeight: 700,
  fontSizePct: 0.062,
  lineHeight: 1.2,
  maxLines: 2,
  maxCharsPerLine: 22,
  textAlign: 'center',
  textTransform: 'none',
  textColor: '#FFFFFF',
  stroke: { widthPct: 0.005, color: '#000000' },
  shadow: { enabled: true, color: '#000000B3', blurPct: 0.01, offsetYPct: 0.004 },
  background: {
    enabled: false,
    color: '#000000A6',
    paddingXPct: 0.02,
    paddingYPct: 0.01,
    radiusPct: 0.01,
  },
  highlight: { mode: 'none', color: '#FFD84D', scale: 1 },
  motion: { preset: 'soft-rise', enterDurationMs: 150, exitDurationMs: 100, wordTransitionMs: 100 },
  emoji: {
    mode: 'off',
    timing: 'active-word',
    position: 'above-word',
    sizeEm: 1.15,
    animation: 'pop',
  },
  safeMarginPct: 0.08,
  lowerThirdOffsetPct: 0.22,
};

export const STYLE_PRESETS: Record<StylePresetId, StyleConfig> = {
  clean: { ...BASE, preset: 'clean' },
  'bold-pop': {
    ...BASE,
    preset: 'bold-pop',
    fontWeight: 900,
    fontSizePct: 0.072,
    textTransform: 'uppercase',
    lineHeight: 1.1,
    maxCharsPerLine: 15,
    maxLines: 2,
    stroke: { widthPct: 0.006, color: '#000000' },
    shadow: { enabled: true, color: '#000000B3', blurPct: 0.016, offsetYPct: 0.006 },
    highlight: { mode: 'word', color: '#FFD84D', scale: 1.06 },
    motion: {
      preset: 'spring-pop',
      enterDurationMs: 180,
      exitDurationMs: 80,
      wordTransitionMs: 100,
    },
    position: 'lower-third',
  },
  'lower-third': {
    ...BASE,
    preset: 'lower-third',
    position: 'lower-third',
    fontWeight: 600,
    fontSizePct: 0.05,
    maxLines: 2,
    maxCharsPerLine: 30,
    stroke: { widthPct: 0, color: '#000000' },
    shadow: { enabled: false, color: '#000000', blurPct: 0, offsetYPct: 0 },
    background: {
      enabled: true,
      color: '#000000B8',
      paddingXPct: 0.024,
      paddingYPct: 0.012,
      radiusPct: 0.012,
    },
    textAlign: 'left',
    motion: {
      preset: 'soft-rise',
      enterDurationMs: 150,
      exitDurationMs: 100,
      wordTransitionMs: 100,
    },
    lowerThirdOffsetPct: 0.24,
  },
  karaoke: {
    ...BASE,
    preset: 'karaoke',
    fontWeight: 800,
    fontSizePct: 0.066,
    maxCharsPerLine: 20,
    highlight: { mode: 'word', color: '#7CFC00', backgroundColor: '#00000040', scale: 1.08 },
    stroke: { widthPct: 0.006, color: '#000000' },
    position: 'bottom',
    motion: {
      preset: 'karaoke-slide',
      enterDurationMs: 160,
      exitDurationMs: 100,
      wordTransitionMs: 100,
    },
  },
  minimal: {
    ...BASE,
    preset: 'minimal',
    fontWeight: 500,
    fontSizePct: 0.05,
    maxLines: 1,
    maxCharsPerLine: 32,
    stroke: { widthPct: 0, color: '#000000' },
    shadow: { enabled: true, color: '#00000099', blurPct: 0.008, offsetYPct: 0.003 },
    background: {
      enabled: true,
      color: '#00000080',
      paddingXPct: 0.018,
      paddingYPct: 0.009,
      radiusPct: 0.008,
    },
    position: 'lower-third',
    lowerThirdOffsetPct: 0.24,
    motion: {
      preset: 'soft-rise',
      enterDurationMs: 150,
      exitDurationMs: 100,
      wordTransitionMs: 100,
    },
  },
  'viral-beast': {
    ...BASE,
    preset: 'viral-beast',
    fontFamily: 'Bebas Neue',
    fontWeight: 400,
    fontSizePct: 0.088,
    lineHeight: 1.02,
    maxLines: 2,
    maxCharsPerLine: 11,
    textTransform: 'uppercase',
    stroke: { widthPct: 0.008, color: '#050505' },
    shadow: { enabled: true, color: '#000000CC', blurPct: 0.012, offsetYPct: 0.008 },
    highlight: { mode: 'word', color: '#FFE600', scale: 1.12 },
    motion: {
      preset: 'spring-pop',
      enterDurationMs: 160,
      exitDurationMs: 70,
      wordTransitionMs: 90,
    },
    position: 'lower-third',
  },
  'submagic-pop': {
    ...BASE,
    preset: 'submagic-pop',
    fontFamily: 'Nunito',
    fontWeight: 900,
    fontSizePct: 0.074,
    lineHeight: 1.08,
    maxLines: 2,
    maxCharsPerLine: 14,
    stroke: { widthPct: 0.007, color: '#050505' },
    shadow: { enabled: true, color: '#000000B8', blurPct: 0.015, offsetYPct: 0.006 },
    highlight: { mode: 'word', color: '#39FF14', backgroundColor: '#0000004D', scale: 1.1 },
    motion: {
      preset: 'spring-pop',
      enterDurationMs: 180,
      exitDurationMs: 80,
      wordTransitionMs: 100,
    },
    position: 'lower-third',
  },
  'smooth-pill': {
    ...BASE,
    preset: 'smooth-pill',
    fontFamily: 'Nunito',
    fontWeight: 800,
    fontSizePct: 0.062,
    lineHeight: 1.12,
    maxLines: 1,
    maxCharsPerLine: 19,
    stroke: { widthPct: 0, color: '#000000' },
    shadow: { enabled: false, color: '#000000', blurPct: 0, offsetYPct: 0 },
    background: {
      enabled: true,
      color: '#11131ACC',
      paddingXPct: 0.026,
      paddingYPct: 0.014,
      radiusPct: 0.025,
    },
    highlight: { mode: 'word', color: '#FFFFFF', backgroundColor: '#7657FFFF', scale: 1.04 },
    motion: {
      preset: 'karaoke-slide',
      enterDurationMs: 160,
      exitDurationMs: 90,
      wordTransitionMs: 110,
    },
    position: 'lower-third',
  },
  'editorial-serif': {
    ...BASE,
    preset: 'editorial-serif',
    fontFamily: 'Playfair Display',
    fontWeight: 700,
    fontSizePct: 0.064,
    lineHeight: 1.16,
    maxLines: 2,
    maxCharsPerLine: 24,
    textColor: '#FFF9ED',
    stroke: { widthPct: 0.002, color: '#000000' },
    shadow: { enabled: true, color: '#000000CC', blurPct: 0.014, offsetYPct: 0.005 },
    highlight: { mode: 'word', color: '#EBCB86', scale: 1.03 },
    motion: {
      preset: 'soft-rise',
      enterDurationMs: 200,
      exitDurationMs: 120,
      wordTransitionMs: 120,
    },
    position: 'lower-third',
  },
  'neon-box': {
    ...BASE,
    preset: 'neon-box',
    fontFamily: 'Space Mono',
    fontWeight: 700,
    fontSizePct: 0.058,
    lineHeight: 1.12,
    maxLines: 2,
    maxCharsPerLine: 18,
    textTransform: 'uppercase',
    textColor: '#ECFEFF',
    stroke: { widthPct: 0, color: '#000000' },
    shadow: { enabled: true, color: '#00E5FFFF', blurPct: 0.02, offsetYPct: 0 },
    background: {
      enabled: true,
      color: '#061316E6',
      paddingXPct: 0.024,
      paddingYPct: 0.014,
      radiusPct: 0.006,
    },
    highlight: { mode: 'word', color: '#00E5FF', backgroundColor: '#00E5FF2E', scale: 1.06 },
    motion: {
      preset: 'karaoke-slide',
      enterDurationMs: 150,
      exitDurationMs: 80,
      wordTransitionMs: 90,
    },
    position: 'lower-third',
  },
  'kinetic-flow': {
    ...BASE,
    preset: 'kinetic-flow',
    fontWeight: 800,
    fontSizePct: 0.068,
    lineHeight: 1.08,
    maxLines: 2,
    maxCharsPerLine: 17,
    stroke: { widthPct: 0.005, color: '#000000' },
    shadow: { enabled: true, color: '#00000099', blurPct: 0.012, offsetYPct: 0.004 },
    highlight: { mode: 'word', color: '#75A7FF', backgroundColor: '#0A2D6659', scale: 1.06 },
    motion: {
      preset: 'karaoke-slide',
      enterDurationMs: 150,
      exitDurationMs: 90,
      wordTransitionMs: 110,
    },
    position: 'top',
    safeMarginPct: 0.13,
  },
  'retro-arcade': {
    ...BASE,
    preset: 'retro-arcade',
    fontFamily: 'Space Mono',
    fontWeight: 700,
    fontSizePct: 0.06,
    lineHeight: 1.08,
    maxLines: 2,
    maxCharsPerLine: 15,
    textTransform: 'uppercase',
    textColor: '#F8FFE8',
    stroke: { widthPct: 0.004, color: '#0B1700' },
    shadow: { enabled: true, color: '#79FF00CC', blurPct: 0.01, offsetYPct: 0.006 },
    background: {
      enabled: true,
      color: '#071006E6',
      paddingXPct: 0.02,
      paddingYPct: 0.012,
      radiusPct: 0,
    },
    highlight: { mode: 'word', color: '#79FF00', scale: 1.08 },
    motion: {
      preset: 'spring-pop',
      enterDurationMs: 140,
      exitDurationMs: 60,
      wordTransitionMs: 80,
    },
    position: 'lower-third',
  },
  documentary: {
    ...BASE,
    preset: 'documentary',
    fontFamily: 'Playfair Display',
    fontWeight: 600,
    fontSizePct: 0.056,
    lineHeight: 1.22,
    maxLines: 2,
    maxCharsPerLine: 30,
    textAlign: 'left',
    textColor: '#F7F2E8',
    stroke: { widthPct: 0, color: '#000000' },
    shadow: { enabled: false, color: '#000000', blurPct: 0, offsetYPct: 0 },
    background: {
      enabled: true,
      color: '#090909B8',
      paddingXPct: 0.025,
      paddingYPct: 0.014,
      radiusPct: 0.004,
    },
    highlight: { mode: 'none', color: '#D8BC84', scale: 1 },
    motion: {
      preset: 'soft-rise',
      enterDurationMs: 200,
      exitDurationMs: 120,
      wordTransitionMs: 120,
    },
    position: 'lower-third',
    lowerThirdOffsetPct: 0.24,
  },
};

const PRESET_MAX_WORDS: Record<StylePresetId, number> = {
  clean: 8,
  'bold-pop': 4,
  'lower-third': 9,
  karaoke: 6,
  minimal: 7,
  'viral-beast': 3,
  'submagic-pop': 4,
  'smooth-pill': 4,
  'editorial-serif': 7,
  'neon-box': 4,
  'kinetic-flow': 5,
  'retro-arcade': 3,
  documentary: 9,
};

export function stylePreset(id: StylePresetId): StyleConfig {
  return structuredClone(STYLE_PRESETS[id]);
}

export function defaultStyle(): StyleConfig {
  return stylePreset('clean');
}

function definedEntries<T extends object>(obj: T | undefined): Partial<T> {
  if (!obj) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

/** Apply a partial patch and validate the full result (rejects out-of-range values). */
export function applyStylePatch(base: StyleConfig, patch: StylePatch): StyleConfig {
  const flat = definedEntries(patch);
  const merged = {
    ...base,
    ...flat,
    stroke: { ...base.stroke, ...definedEntries(patch.stroke) },
    shadow: { ...base.shadow, ...definedEntries(patch.shadow) },
    background: { ...base.background, ...definedEntries(patch.background) },
    highlight: { ...base.highlight, ...definedEntries(patch.highlight) },
    motion: { ...base.motion, ...definedEntries(patch.motion) },
    emoji: { ...base.emoji, ...definedEntries(patch.emoji) },
  };
  return StyleConfigSchema.parse(merged);
}

export function withPosition(style: StyleConfig, position: CaptionPosition): StyleConfig {
  return { ...style, position };
}

/** Segmentation derived from style so line limits stay consistent with rendering. */
export function segmentationForStyle(
  style: StyleConfig,
  base: SegmentationParams = DEFAULT_SEGMENTATION,
): SegmentationParams {
  return {
    ...base,
    maxLinesPerPage: style.maxLines,
    maxCharsPerLine: style.maxCharsPerLine,
    maxCharsPerPage: Math.min(120, style.maxCharsPerLine * style.maxLines),
    maxWordsPerPage: PRESET_MAX_WORDS[style.preset],
  };
}
