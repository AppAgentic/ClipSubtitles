'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CaptionPage, StyleConfig, TranscriptWord } from '@clipsubtitles/contracts';
import {
  activeWordIndexInPage,
  captionMotionState,
  hexToRgba,
  layoutCaption,
  visualPageAtMs,
  type FrameSize,
} from '@clipsubtitles/core';
import { createDomMeasurer, ensureCaptionFonts } from '@/lib/measure';

/**
 * Live caption overlay. Runs the exact layout engine the renderer uses, at the
 * displayed frame size, so what you see is what the export draws.
 */
export function CaptionOverlay({
  words,
  pages,
  style,
  frame,
  timeMs,
}: {
  words: readonly TranscriptWord[];
  pages: readonly CaptionPage[];
  style: StyleConfig;
  frame: FrameSize;
  timeMs: number;
}) {
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    ensureCaptionFonts().then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);
  const measure = useMemo(() => createDomMeasurer(), [fontsReady]);
  const page = visualPageAtMs(pages, timeMs);
  if (!page || frame.width < 8) return null;
  const activeWordIndex =
    style.highlight.mode === 'word' || style.emoji.mode === 'auto'
      ? activeWordIndexInPage(page, words, timeMs)
      : null;
  const layout = layoutCaption({ page, words, style, frame, activeWordIndex, measure });
  const motion = captionMotionState({ page, words, style, timeMs, activeWordIndex });
  const shadow = layout.shadow
    ? `0 ${layout.shadow.offsetYPx}px ${layout.shadow.blurPx}px ${hexToRgba(layout.shadow.color)}`
    : 'none';
  const highlightBackground = layout.highlight.backgroundColor
    ? hexToRgba(layout.highlight.backgroundColor)
    : 'transparent';
  const activeLine = layout.lines.find((line) => line.words.some((word) => word.active));
  const activeWord = activeLine?.words.find((word) => word.active);
  const fromWord =
    motion.highlightFromWordIndex === null
      ? undefined
      : activeLine?.words.find((word) => word.wordIndex === motion.highlightFromWordIndex);
  const pill =
    activeLine && activeWord && layout.highlight.backgroundColor
      ? {
          x:
            (fromWord?.x ?? activeWord.x) +
            (activeWord.x - (fromWord?.x ?? activeWord.x)) * motion.highlightProgress,
          width:
            (fromWord?.width ?? activeWord.width) +
            (activeWord.width - (fromWord?.width ?? activeWord.width)) * motion.highlightProgress,
          y:
            activeLine.y +
            activeLine.height / 2 -
            layout.font.sizePx * 0.62 -
            layout.font.sizePx * 0.12,
          height: layout.font.sizePx * 1.24 + layout.font.sizePx * 0.24,
        }
      : null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          opacity: motion.opacity,
          transform: `translateY(${motion.translateYFactor * Math.min(frame.width, frame.height)}px) scale(${motion.scale})`,
          transformOrigin: `${layout.block.x + layout.block.width / 2}px ${layout.block.y + layout.block.height / 2}px`,
          filter:
            motion.blurFactor > 0
              ? `blur(${motion.blurFactor * Math.min(frame.width, frame.height)}px)`
              : undefined,
        }}
      >
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
        {pill ? (
          <div
            className="absolute"
            style={{
              left: pill.x - layout.font.sizePx * 0.18,
              top: pill.y,
              width: pill.width + layout.font.sizePx * 0.36,
              height: pill.height,
              borderRadius: layout.font.sizePx * 0.2,
              background: highlightBackground,
            }}
          />
        ) : null}
        {layout.emoji ? (
          <img
            src={`/emoji/${layout.emoji.codepoint}.svg`}
            alt=""
            className="absolute"
            style={{
              left: layout.emoji.x,
              top: layout.emoji.y,
              width: layout.emoji.size,
              height: layout.emoji.size,
              transform:
                style.emoji.animation === 'pop' &&
                layout.emoji.wordIndex === activeWordIndex &&
                motion.activeWordScale !== 1
                  ? `scale(${motion.activeWordScale})`
                  : undefined,
              transformOrigin: 'center center',
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
                  fontFamily: `"${layout.font.family}", sans-serif`,
                  fontSize: layout.font.sizePx,
                  fontWeight: layout.font.weight,
                  color: hexToRgba(active ? layout.highlight.color : layout.textColor),
                  WebkitTextStroke:
                    layout.strokePx > 0
                      ? `${layout.strokePx * 2}px ${hexToRgba(layout.strokeColor)}`
                      : undefined,
                  paintOrder: 'stroke fill',
                  textShadow: shadow,
                  transform:
                    active && motion.activeWordScale !== 1
                      ? `scale(${motion.activeWordScale})`
                      : undefined,
                }}
              >
                {w.text}
              </span>
            );
          }),
        )}
      </div>
    </div>
  );
}
