'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CaptionPage, StyleConfig, TranscriptWord } from '@clipsubtitles/contracts';
import { activeWordIndexAt, hexToRgba, layoutCaption, pageAtMs, type FrameSize } from '@clipsubtitles/core';
import { createDomMeasurer, ensureCaptionFonts } from '@/lib/measure';

/**
 * Live caption overlay. Runs the exact layout engine the renderer uses, at the
 * displayed frame size, so what you see is what the export draws.
 */
export function CaptionOverlay({ words, pages, style, frame, timeMs }: { words: readonly TranscriptWord[]; pages: readonly CaptionPage[]; style: StyleConfig; frame: FrameSize; timeMs: number }) {
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    ensureCaptionFonts().then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);
  const measure = useMemo(() => createDomMeasurer(), [fontsReady]);
  const page = pageAtMs(pages, timeMs);
  if (!page || frame.width < 8) return null;
  const activeWordIndex = style.highlight.mode === 'word' ? activeWordIndexAt(words, timeMs, 0) : null;
  const layout = layoutCaption({ page, words, style, frame, activeWordIndex, measure });
  const shadow = layout.shadow ? `0 ${layout.shadow.offsetYPx}px ${layout.shadow.blurPx}px ${hexToRgba(layout.shadow.color)}` : 'none';
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {layout.background ? (
        <div
          className="absolute"
          style={{
            left: layout.background.x,
            top: layout.background.y,
            width: layout.background.width,
            height: layout.background.height,
            borderRadius: layout.background.radius,
            background: hexToRgba(layout.background.color),
          }}
        />
      ) : null}
      {layout.lines.map((line, li) =>
        line.words.map((w) => {
          const active = w.active && layout.highlight.mode === 'word';
          return (
            <span
              key={`${li}-${w.wordIndex}`}
              className="caption-word"
              style={{
                left: w.x,
                top: line.y,
                height: line.height,
                lineHeight: `${line.height}px`,
                fontSize: layout.font.sizePx,
                fontWeight: layout.font.weight,
                color: hexToRgba(active ? layout.highlight.color : layout.textColor),
                WebkitTextStroke: layout.strokePx > 0 ? `${layout.strokePx * 2}px ${hexToRgba(layout.strokeColor)}` : undefined,
                textShadow: shadow,
                transform: active && layout.highlight.scale !== 1 ? `scale(${layout.highlight.scale})` : undefined,
                background: active && layout.highlight.backgroundColor ? hexToRgba(layout.highlight.backgroundColor) : undefined,
                borderRadius: active && layout.highlight.backgroundColor ? layout.font.sizePx * 0.2 : undefined,
                padding: active && layout.highlight.backgroundColor ? `0 ${layout.font.sizePx * 0.18}px` : undefined,
                marginLeft: active && layout.highlight.backgroundColor ? -layout.font.sizePx * 0.18 : undefined,
              }}
            >
              {w.text}
            </span>
          );
        }),
      )}
    </div>
  );
}
