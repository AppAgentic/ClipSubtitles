import { useEffect, useMemo, useState } from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  captionMotionState,
  hexToRgba,
  layoutCaption,
  type CaptionLayout,
  type CaptionMotionState,
  type FontSpec,
  type TextMeasurer,
} from '@clipsubtitles/core';
import { frameState, frameTimeMs } from '../frame';
import type { CaptionVideoProps } from './props';

export type { CaptionVideoProps } from './props';

const FACES: Array<{ family: string; weight: number; file: string }> = [
  { family: 'Inter', weight: 400, file: 'Inter_400Regular.ttf' },
  { family: 'Inter', weight: 500, file: 'Inter_500Medium.ttf' },
  { family: 'Inter', weight: 600, file: 'Inter_600SemiBold.ttf' },
  { family: 'Inter', weight: 700, file: 'Inter_700Bold.ttf' },
  { family: 'Inter', weight: 800, file: 'Inter_800ExtraBold.ttf' },
  { family: 'Inter', weight: 900, file: 'Inter_900Black.ttf' },
  { family: 'Bebas Neue', weight: 400, file: 'BebasNeue_400Regular.ttf' },
  { family: 'Nunito', weight: 700, file: 'Nunito_700Bold.ttf' },
  { family: 'Nunito', weight: 800, file: 'Nunito_800ExtraBold.ttf' },
  { family: 'Nunito', weight: 900, file: 'Nunito_900Black.ttf' },
  { family: 'Playfair Display', weight: 600, file: 'PlayfairDisplay_600SemiBold.ttf' },
  { family: 'Playfair Display', weight: 700, file: 'PlayfairDisplay_700Bold.ttf' },
  { family: 'Space Mono', weight: 400, file: 'SpaceMono_400Regular.ttf' },
  { family: 'Space Mono', weight: 700, file: 'SpaceMono_700Bold.ttf' },
];

function fontFaceCss(): string {
  return FACES.map(
    (f) =>
      `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:normal;src:url('${staticFile(`fonts/${f.file}`)}') format('truetype');}`,
  ).join('\n');
}

let sharedCtx: CanvasRenderingContext2D | null = null;

function browserMeasurer(): TextMeasurer {
  if (!sharedCtx) sharedCtx = document.createElement('canvas').getContext('2d');
  const cache = new Map<string, number>();
  return (text: string, font: FontSpec) => {
    if (!sharedCtx) return text.length * font.sizePx * 0.55;
    const key = `${font.family}|${font.weight}|${font.sizePx}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    sharedCtx.font = `${font.weight} ${font.sizePx}px "${font.family}"`;
    const w = sharedCtx.measureText(text).width;
    cache.set(key, w);
    return w;
  };
}

/** Draw a layout as absolutely positioned DOM text (same geometry as the canvas rasterizer). */
export function CaptionLayer({
  layout,
  motion,
}: {
  layout: CaptionLayout;
  motion: CaptionMotionState;
}) {
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
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: motion.opacity,
        transform: `translateY(${motion.translateYFactor * Math.min(layout.frame.width, layout.frame.height)}px) scale(${motion.scale})`,
        transformOrigin: `${layout.block.x + layout.block.width / 2}px ${layout.block.y + layout.block.height / 2}px`,
        filter:
          motion.blurFactor > 0
            ? `blur(${motion.blurFactor * Math.min(layout.frame.width, layout.frame.height)}px)`
            : undefined,
      }}
    >
      {layout.background ? (
        <div
          style={{
            position: 'absolute',
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
          style={{
            position: 'absolute',
            left: pill.x - layout.font.sizePx * 0.18,
            top: pill.y,
            width: pill.width + layout.font.sizePx * 0.36,
            height: pill.height,
            borderRadius: layout.font.sizePx * 0.2,
            background: highlightBackground,
          }}
        />
      ) : null}
      {layout.lines.map((line, li) =>
        line.words.map((w) => {
          const active = w.active && layout.highlight.mode === 'word';
          return (
            <span
              key={`${li}-${w.wordIndex}`}
              style={{
                position: 'absolute',
                left: w.x,
                top: line.y,
                height: line.height,
                lineHeight: `${line.height}px`,
                whiteSpace: 'pre',
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
                transformOrigin: 'center center',
              }}
            >
              {w.text}
            </span>
          );
        }),
      )}
    </AbsoluteFill>
  );
}

export const CaptionVideo: React.FC<CaptionVideoProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const [fontsReady, setFontsReady] = useState(false);
  const [handle] = useState(() => delayRender('Loading caption fonts'));

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = fontFaceCss();
    document.head.appendChild(style);
    Promise.all(FACES.map((f) => document.fonts.load(`${f.weight} 24px "${f.family}"`)))
      .catch(() => undefined)
      .finally(() => {
        setFontsReady(true);
        continueRender(handle);
      });
    return () => {
      document.head.removeChild(style);
    };
  }, [handle]);

  const measure = useMemo(() => browserMeasurer(), [fontsReady]);
  const timeMs = frameTimeMs(frame, fps, props.startMs);
  const state = frameState(props.words, props.pages, props.style, timeMs);
  const layout = state.page
    ? layoutCaption({
        page: state.page,
        words: props.words,
        style: props.style,
        frame: { width, height },
        activeWordIndex: state.activeWordIndex,
        measure,
      })
    : null;
  const motion = state.page
    ? captionMotionState({
        page: state.page,
        words: props.words,
        style: props.style,
        timeMs,
        activeWordIndex: state.activeWordIndex,
      })
    : null;

  return (
    <AbsoluteFill style={{ backgroundColor: props.sourceUrl ? 'black' : 'transparent' }}>
      {props.sourceUrl ? (
        <OffthreadVideo
          src={props.sourceUrl}
          startFrom={Math.round((props.startMs / 1000) * fps)}
          style={{ width, height, objectFit: 'contain' }}
        />
      ) : null}
      {layout && motion && fontsReady ? <CaptionLayer layout={layout} motion={motion} /> : null}
    </AbsoluteFill>
  );
};
