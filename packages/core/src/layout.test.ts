import { describe, expect, it } from 'vitest';
import { HORIZONTAL_MARGIN_PCT, MIN_FIT_SCALE, createApproxMeasurer, hexToRgba, layoutCaption } from './layout';
import { DEFAULT_SEGMENTATION, segmentationForStyle, stylePreset } from './presets';
import { segmentWords } from './segmentation';
import { activeWordIndexAt, pageAtMs, visualStates } from './state';
import { wordsFromText } from './test-utils';

const measure = createApproxMeasurer();
const frame = { width: 1080, height: 1920 };

describe('layoutCaption', () => {
  const words = wordsFromText('captions that look great on every phone');
  const pages = segmentWords(words, DEFAULT_SEGMENTATION);
  const page = pages[0]!;

  it('positions blocks explicitly for each caption position', () => {
    const bottom = layoutCaption({ page, words, style: stylePreset('clean'), frame, measure });
    const top = layoutCaption({ page, words, style: { ...stylePreset('clean'), position: 'top' }, frame, measure });
    const center = layoutCaption({ page, words, style: { ...stylePreset('clean'), position: 'center' }, frame, measure });
    const lower = layoutCaption({ page, words, style: stylePreset('lower-third'), frame, measure });
    expect(top.block.y).toBe(Math.round(0.08 * frame.height));
    expect(bottom.block.y + bottom.block.height).toBeCloseTo(frame.height - 0.08 * frame.height, 0);
    expect(Math.abs(center.block.y + center.block.height / 2 - frame.height / 2)).toBeLessThan(2);
    expect(lower.block.y + lower.block.height).toBeCloseTo(frame.height - 0.22 * frame.height, 0);
    expect(lower.background).not.toBeNull();
    expect(bottom.background).toBeNull();
  });

  it('centres the block horizontally and lays words left to right without overlap', () => {
    const layout = layoutCaption({ page, words, style: stylePreset('clean'), frame, measure });
    expect(Math.abs(layout.block.x + layout.block.width / 2 - frame.width / 2)).toBeLessThan(1);
    for (const line of layout.lines) {
      for (let i = 1; i < line.words.length; i += 1) {
        expect(line.words[i]!.x).toBeGreaterThan(line.words[i - 1]!.x + line.words[i - 1]!.width);
      }
      expect(line.words.map((w) => w.text).join(' ')).toBe(line.text);
    }
  });

  it('marks the active word and applies uppercase transform', () => {
    const style = stylePreset('bold-pop');
    const boldPages = segmentWords(words, segmentationForStyle(style));
    const layout = layoutCaption({ page: boldPages[0]!, words, style, frame, measure, activeWordIndex: 1 });
    const active = layout.lines.flatMap((l) => l.words).filter((w) => w.active);
    expect(active).toHaveLength(1);
    expect(active[0]?.text).toBe('THAT');
    // Sizes scale with the shorter side; the preset line length fits the safe width without shrinking.
    expect(layout.font.sizePx).toBe(Math.round(style.fontSizePct * Math.min(frame.width, frame.height)));
  });

  it('shrinks text to fit the horizontal safe area when a line would overflow', () => {
    const narrow = { width: 240, height: 426 };
    const style = { ...stylePreset('clean'), maxCharsPerLine: 60 };
    const oneLine = segmentWords(words, { ...DEFAULT_SEGMENTATION, maxCharsPerLine: 60, maxCharsPerPage: 120, maxWordsPerPage: 30 });
    expect(oneLine).toHaveLength(1);
    const layout = layoutCaption({ page: oneLine[0]!, words, style, frame: narrow, measure });
    const styled = Math.round(style.fontSizePct * Math.min(narrow.width, narrow.height));
    expect(layout.font.sizePx).toBeLessThan(styled);
    expect(layout.font.sizePx).toBeGreaterThanOrEqual(Math.floor(styled * MIN_FIT_SCALE));
    for (const line of layout.lines) {
      expect(line.x).toBeGreaterThanOrEqual(narrow.width * HORIZONTAL_MARGIN_PCT - 1);
      expect(line.x + line.width).toBeLessThanOrEqual(narrow.width * (1 - HORIZONTAL_MARGIN_PCT) + 1);
    }
  });

  it('every preset keeps its longest allowed line inside the safe width at 1080p', () => {
    for (const id of ['clean', 'bold-pop', 'lower-third', 'karaoke', 'minimal'] as const) {
      const style = stylePreset(id);
      const text = Array.from({ length: style.maxCharsPerLine }, (_, i) => (i % 5 === 4 ? ' ' : 'M')).join('').trim();
      const w = wordsFromText(text.replace(/\s+/g, ' '));
      const p = segmentWords(w, { ...segmentationForStyle(style), maxWordsPerPage: 30 });
      const layout = layoutCaption({ page: p[0]!, words: w, style, frame, measure });
      expect(layout.font.sizePx).toBeGreaterThanOrEqual(Math.floor(style.fontSizePct * 1080 * 0.85));
    }
  });

  it('hexToRgba handles alpha', () => {
    expect(hexToRgba('#FF0000')).toBe('rgba(255, 0, 0, 1)');
    expect(hexToRgba('#00000080')).toBe('rgba(0, 0, 0, 0.502)');
  });
});

describe('state time lookups', () => {
  const words = wordsFromText('one two | three', { pauseMs: 1000 });
  const pages = segmentWords(words, DEFAULT_SEGMENTATION);

  it('finds the active word and page by time', () => {
    expect(activeWordIndexAt(words, words[1]!.startMs + 5)).toBe(1);
    expect(activeWordIndexAt(words, words[1]!.endMs + 5)).toBeNull();
    expect(activeWordIndexAt(words, words[1]!.endMs + 5, 100)).toBe(1);
    expect(activeWordIndexAt(words, -1)).toBeNull();
    expect(pageAtMs(pages, pages[0]!.startMs)?.id).toBe(pages[0]!.id);
    expect(pageAtMs(pages, pages[0]!.endMs + 1)).toBeNull();
  });

  it('visual states tile each page contiguously', () => {
    const states = visualStates(words, pages, true);
    for (const page of pages) {
      const own = states.filter((s) => s.page.id === page.id);
      expect(own[0]?.startMs).toBe(page.startMs);
      expect(own[own.length - 1]?.endMs).toBe(page.endMs);
      for (let i = 1; i < own.length; i += 1) expect(own[i]!.startMs).toBe(own[i - 1]!.endMs);
    }
    const plain = visualStates(words, pages, false);
    expect(plain).toHaveLength(pages.length);
  });
});
