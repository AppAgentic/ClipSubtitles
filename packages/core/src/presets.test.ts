import { StyleConfigSchema } from '@clipsubtitles/contracts';
import { describe, expect, it } from 'vitest';
import { STYLE_PRESETS, segmentationForStyle, stylePreset } from './presets';

describe('style presets', () => {
  it('keeps every preset valid, face-safe by default, and segmentation-aligned', () => {
    expect(Object.keys(STYLE_PRESETS)).toHaveLength(13);
    expect(new Set(Object.values(STYLE_PRESETS).map((preset) => preset.fontFamily)).size).toBe(5);
    for (const [id, preset] of Object.entries(STYLE_PRESETS)) {
      expect(StyleConfigSchema.parse(preset)).toEqual(preset);
      expect(preset.position, `${id} should not default across a talking-head face`).not.toBe(
        'center',
      );
      const segmentation = segmentationForStyle(preset);
      expect(segmentation.maxLinesPerPage).toBe(preset.maxLines);
      expect(segmentation.maxCharsPerLine).toBe(preset.maxCharsPerLine);
    }
  });

  it('returns an isolated clone and preserves the tuned Bold Pop contract', () => {
    const first = stylePreset('bold-pop');
    first.position = 'top';
    const fresh = stylePreset('bold-pop');
    expect(fresh.position).toBe('lower-third');
    expect(fresh.lineHeight).toBe(1.1);
    expect(fresh.stroke.widthPct).toBe(0.006);
    expect(fresh.highlight.scale).toBe(1.06);
    expect(fresh.motion).toEqual({
      preset: 'spring-pop',
      enterDurationMs: 180,
      exitDurationMs: 80,
      wordTransitionMs: 100,
    });
  });

  it('ships competitor-grade presets as distinct layout and motion contracts', () => {
    expect(segmentationForStyle(stylePreset('viral-beast')).maxWordsPerPage).toBe(3);
    expect(stylePreset('editorial-serif').fontFamily).toBe('Playfair Display');
    expect(stylePreset('smooth-pill').highlight.backgroundColor).toBe('#7657FFFF');
    expect(stylePreset('kinetic-flow').position).toBe('top');
    expect(stylePreset('retro-arcade').background.radiusPct).toBe(0);
  });
});
