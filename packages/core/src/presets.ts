import type {
  CaptionPosition,
  SegmentationParams,
  StyleConfig,
  StylePatch,
  StylePresetId,
} from '@clipsubtitles/contracts';
import { StyleConfigSchema } from '@clipsubtitles/contracts';

export const DEFAULT_SEGMENTATION: SegmentationParams = {
  maxCharsPerPage: 42,
  maxLinesPerPage: 2,
  maxCharsPerLine: 24,
  maxPageDurationMs: 4_000,
  minPageDurationMs: 600,
  maxWordsPerPage: 9,
  pauseBreakMs: 350,
  targetCps: 15,
  maxCps: 22,
  tailPaddingMs: 250,
};

const BASE: StyleConfig = {
  preset: 'clean',
  position: 'bottom',
  fontFamily: 'Inter',
  fontWeight: 700,
  fontSizePct: 0.052,
  lineHeight: 1.2,
  maxLines: 2,
  maxCharsPerLine: 24,
  textAlign: 'center',
  textTransform: 'none',
  textColor: '#FFFFFF',
  stroke: { widthPct: 0.004, color: '#000000' },
  shadow: { enabled: true, color: '#000000B3', blurPct: 0.008, offsetYPct: 0.003 },
  background: { enabled: false, color: '#000000A6', paddingXPct: 0.016, paddingYPct: 0.008, radiusPct: 0.008 },
  highlight: { mode: 'none', color: '#FFD84D', scale: 1 },
  safeMarginPct: 0.08,
  lowerThirdOffsetPct: 0.22,
};

export const STYLE_PRESETS: Record<StylePresetId, StyleConfig> = {
  clean: { ...BASE, preset: 'clean' },
  'bold-pop': {
    ...BASE,
    preset: 'bold-pop',
    fontWeight: 900,
    fontSizePct: 0.062,
    textTransform: 'uppercase',
    maxCharsPerLine: 18,
    maxLines: 2,
    stroke: { widthPct: 0.007, color: '#000000' },
    shadow: { enabled: true, color: '#000000CC', blurPct: 0.01, offsetYPct: 0.004 },
    highlight: { mode: 'word', color: '#FFD84D', scale: 1.08 },
    position: 'center',
  },
  'lower-third': {
    ...BASE,
    preset: 'lower-third',
    position: 'lower-third',
    fontWeight: 600,
    fontSizePct: 0.044,
    maxLines: 2,
    maxCharsPerLine: 32,
    stroke: { widthPct: 0, color: '#000000' },
    shadow: { enabled: false, color: '#000000', blurPct: 0, offsetYPct: 0 },
    background: { enabled: true, color: '#000000B8', paddingXPct: 0.02, paddingYPct: 0.01, radiusPct: 0.01 },
    textAlign: 'left',
  },
  karaoke: {
    ...BASE,
    preset: 'karaoke',
    fontWeight: 800,
    fontSizePct: 0.056,
    maxCharsPerLine: 22,
    highlight: { mode: 'word', color: '#7CFC00', backgroundColor: '#FFFFFF1A', scale: 1.1 },
    stroke: { widthPct: 0.005, color: '#000000' },
    position: 'bottom',
  },
  minimal: {
    ...BASE,
    preset: 'minimal',
    fontWeight: 500,
    fontSizePct: 0.04,
    maxLines: 1,
    maxCharsPerLine: 36,
    stroke: { widthPct: 0, color: '#000000' },
    shadow: { enabled: true, color: '#00000099', blurPct: 0.006, offsetYPct: 0.002 },
    background: { enabled: true, color: '#00000080', paddingXPct: 0.014, paddingYPct: 0.007, radiusPct: 0.006 },
    position: 'bottom',
  },
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
  };
  return StyleConfigSchema.parse(merged);
}

export function withPosition(style: StyleConfig, position: CaptionPosition): StyleConfig {
  return { ...style, position };
}

/** Segmentation derived from style so line limits stay consistent with rendering. */
export function segmentationForStyle(style: StyleConfig, base: SegmentationParams = DEFAULT_SEGMENTATION): SegmentationParams {
  return {
    ...base,
    maxLinesPerPage: style.maxLines,
    maxCharsPerLine: style.maxCharsPerLine,
    maxCharsPerPage: Math.min(120, style.maxCharsPerLine * style.maxLines),
  };
}
