import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import {
  STYLE_PRESETS,
  layoutCaption,
  segmentWords,
  segmentationForStyle,
  wordsFromText,
  captionMotionState,
} from '@clipsubtitles/core';
import { drawLayout as drawExport } from '@clipsubtitles/render';
import { ensureFontsRegistered } from '@clipsubtitles/render';
import { createCanvasMeasurer } from '@clipsubtitles/render';
import { drawLayout } from './widget-overlay';

describe('widget caption drawing', () => {
  it.each(Object.entries(STYLE_PRESETS))(
    'matches the export canvas for %s including active-word motion',
    (_name, preset) => {
      ensureFontsRegistered();
      const words = wordsFromText('These captions look great');
      const style = { ...preset, emoji: { ...preset.emoji, mode: 'off' as const } };
      const page = segmentWords(words, segmentationForStyle(style))[0]!;
      const layout = layoutCaption({
        page,
        words,
        style,
        frame: { width: 360, height: 640 },
        activeWordIndex: 1,
        measure: createCanvasMeasurer(),
      });
      const motion = captionMotionState({
        page,
        words,
        style,
        timeMs: words[1]!.startMs + 30,
        activeWordIndex: 1,
      });
      const drawMotion = {
        ...motion,
        translateY: motion.translateYFactor * 360,
        blurPx: motion.blurFactor * 360,
      };
      const expected = createCanvas(360, 640);
      const actual = createCanvas(360, 640);
      drawExport(expected.getContext('2d'), layout, drawMotion);
      drawLayout(
        actual.getContext('2d') as unknown as CanvasRenderingContext2D,
        layout,
        drawMotion,
      );
      expect(actual.toBuffer('image/png').equals(expected.toBuffer('image/png'))).toBe(true);
    },
  );
});
