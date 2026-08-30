import type { CaptionPage, StyleConfig, TranscriptWord } from '@clipsubtitles/contracts';

export interface FrameSize {
  width: number;
  height: number;
}

export interface FontSpec {
  family: string;
  weight: number;
  sizePx: number;
}

/** Width in px of `text` rendered with `font`. Injected per environment (DOM canvas, node canvas, approximation). */
export type TextMeasurer = (text: string, font: FontSpec) => number;

export interface LayoutWordBox {
  wordIndex: number;
  text: string;
  x: number;
  width: number;
  active: boolean;
}

export interface LayoutLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  words: LayoutWordBox[];
}

export interface CaptionLayout {
  frame: FrameSize;
  font: FontSpec;
  lineHeightPx: number;
  strokePx: number;
  strokeColor: string;
  textColor: string;
  textTransform: StyleConfig['textTransform'];
  block: { x: number; y: number; width: number; height: number };
  background: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    color: string;
  } | null;
  shadow: { color: string; blurPx: number; offsetYPx: number } | null;
  highlight: StyleConfig['highlight'];
  activeWordIndex: number | null;
  lines: LayoutLine[];
}

/** Captions keep at least this fraction of the width clear on each side. */
export const HORIZONTAL_MARGIN_PCT = 0.05;
/** Fit-to-width never shrinks text below this fraction of the styled size. */
export const MIN_FIT_SCALE = 0.55;

export function displayText(text: string, transform: StyleConfig['textTransform']): string {
  return transform === 'uppercase' ? text.toLocaleUpperCase() : text;
}

/**
 * Approximate measurer used in tests and as a fallback. Inter's average glyph
 * advance is ~0.55em for mixed-case Latin text; uppercase runs wider.
 */
export function createApproxMeasurer(): TextMeasurer {
  return (text, font) => {
    let w = 0;
    for (const ch of text) {
      if (ch === ' ') w += 0.28;
      else if (/[A-Z]/.test(ch)) w += 0.68;
      else if (/[ijl.,'!|]/.test(ch)) w += 0.3;
      else if (/[mw]/.test(ch)) w += 0.85;
      else w += 0.55;
    }
    const weightBoost = 1 + Math.max(0, font.weight - 400) / 8000;
    return w * font.sizePx * weightBoost;
  };
}

export interface LayoutInput {
  page: CaptionPage;
  words: readonly TranscriptWord[];
  style: StyleConfig;
  frame: FrameSize;
  activeWordIndex?: number | null;
  measure: TextMeasurer;
}

/**
 * Pure geometry shared by the browser overlay, the canvas rasterizer, and the
 * Remotion composition so every surface agrees on where captions sit.
 */
export function layoutCaption(input: LayoutInput): CaptionLayout {
  const { page, words, style, frame, measure } = input;
  const H = frame.height;
  const W = frame.width;
  // Sizes scale with the shorter side so portrait and landscape frames get the same visual weight.
  const S = Math.min(W, H);
  const activeWordIndex = input.activeWordIndex ?? null;
  const padX = style.background.enabled ? style.background.paddingXPct * S : 0;
  const padY = style.background.enabled ? style.background.paddingYPct * S : 0;
  // Horizontal safe area: captions never run into the frame edge.
  const availableWidth = Math.max(16, W * (1 - 2 * HORIZONTAL_MARGIN_PCT) - padX * 2);

  const measureLines = (font: FontSpec) => {
    const spaceWidth = measure(' ', font);
    const lines = page.lines.map((line) => {
      const boxes: Array<{
        wordIndex: number;
        text: string;
        width: number;
        allocatedWidth: number;
      }> = [];
      for (let i = line.startWordIndex; i <= line.endWordIndex; i += 1) {
        const word = words[i];
        if (!word) continue;
        const text = displayText(word.text, style.textTransform);
        const width = measure(text, font);
        // Reserve the active word's maximum scaled footprint in geometry. The
        // rasterizer scales around the glyph centre; without this allocation a
        // pop animation visually collides with both neighbours.
        const allocatedWidth =
          activeWordIndex === i && style.highlight.mode === 'word'
            ? width * style.highlight.scale
            : width;
        boxes.push({ wordIndex: i, text, width, allocatedWidth });
      }
      const width = boxes.reduce(
        (sum, b, idx) => sum + b.allocatedWidth + (idx > 0 ? spaceWidth : 0),
        0,
      );
      return { boxes, width };
    });
    return { lines, spaceWidth, contentWidth: Math.max(0, ...lines.map((l) => l.width)) };
  };

  let fontPx = Math.max(8, Math.round(style.fontSizePct * S));
  let font: FontSpec = { family: style.fontFamily, weight: style.fontWeight, sizePx: fontPx };
  let measured = measureLines(font);
  // Fit to width: shrink (never below MIN_FIT_SCALE) when the widest line would overflow the safe area.
  if (measured.contentWidth > availableWidth) {
    const scale = Math.max(MIN_FIT_SCALE, availableWidth / measured.contentWidth);
    fontPx = Math.max(8, Math.floor(fontPx * scale));
    font = { ...font, sizePx: fontPx };
    measured = measureLines(font);
  }
  const { lines: measuredLines, spaceWidth, contentWidth } = measured;
  const lineHeightPx = Math.round(fontPx * style.lineHeight);
  const contentHeight = lineHeightPx * Math.max(1, measuredLines.length);
  const blockWidth = contentWidth + padX * 2;
  const blockHeight = contentHeight + padY * 2;

  let blockTop: number;
  switch (style.position) {
    case 'top':
      blockTop = style.safeMarginPct * H;
      break;
    case 'center':
      blockTop = (H - blockHeight) / 2;
      break;
    case 'lower-third':
      blockTop = H - style.lowerThirdOffsetPct * H - blockHeight;
      break;
    case 'bottom':
    default:
      blockTop = H - style.safeMarginPct * H - blockHeight;
      break;
  }
  blockTop = Math.round(Math.max(0, Math.min(H - blockHeight, blockTop)));
  const blockLeft = Math.round((W - blockWidth) / 2);
  const contentLeft = blockLeft + padX;

  const lines: LayoutLine[] = measuredLines.map((line, idx) => {
    let x: number;
    if (style.textAlign === 'left') x = contentLeft;
    else if (style.textAlign === 'right') x = contentLeft + contentWidth - line.width;
    else x = contentLeft + (contentWidth - line.width) / 2;
    const y = blockTop + padY + idx * lineHeightPx;
    let cursor = x;
    const wordBoxes: LayoutWordBox[] = line.boxes.map((b, wi) => {
      if (wi > 0) cursor += spaceWidth;
      const box: LayoutWordBox = {
        wordIndex: b.wordIndex,
        text: b.text,
        x: cursor + (b.allocatedWidth - b.width) / 2,
        width: b.width,
        active: activeWordIndex === b.wordIndex,
      };
      cursor += b.allocatedWidth;
      return box;
    });
    return {
      text: line.boxes.map((b) => b.text).join(' '),
      x,
      y,
      width: line.width,
      height: lineHeightPx,
      words: wordBoxes,
    };
  });

  return {
    frame,
    font,
    lineHeightPx,
    strokePx: style.stroke.widthPct * S,
    strokeColor: style.stroke.color,
    textColor: style.textColor,
    textTransform: style.textTransform,
    block: { x: blockLeft, y: blockTop, width: blockWidth, height: blockHeight },
    background: style.background.enabled
      ? {
          x: blockLeft,
          y: blockTop,
          width: blockWidth,
          height: blockHeight,
          radius: style.background.radiusPct * S,
          color: style.background.color,
        }
      : null,
    shadow: style.shadow.enabled
      ? {
          color: style.shadow.color,
          blurPx: style.shadow.blurPct * S,
          offsetYPx: style.shadow.offsetYPct * S,
        }
      : null,
    highlight: style.highlight,
    activeWordIndex,
    lines,
  };
}

/** Parse #RRGGBB / #RRGGBBAA into CSS rgba() for canvas contexts. */
export function hexToRgba(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(hex);
  if (!m || !m[1]) return hex;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  const a = m[2] ? parseInt(m[2], 16) / 255 : 1;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}
