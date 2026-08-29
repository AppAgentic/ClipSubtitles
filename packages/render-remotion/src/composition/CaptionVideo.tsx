import { useEffect, useMemo, useState } from 'react';
import { AbsoluteFill, OffthreadVideo, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { hexToRgba, layoutCaption, type CaptionLayout, type FontSpec, type TextMeasurer } from '@clipsubtitles/core';
import { frameState, frameTimeMs } from '../frame';
import type { CaptionVideoProps } from './props';

export type { CaptionVideoProps } from './props';

const FACES: Array<{ weight: number; file: string }> = [
  { weight: 400, file: 'Inter_400Regular.ttf' },
  { weight: 500, file: 'Inter_500Medium.ttf' },
  { weight: 600, file: 'Inter_600SemiBold.ttf' },
  { weight: 700, file: 'Inter_700Bold.ttf' },
  { weight: 800, file: 'Inter_800ExtraBold.ttf' },
  { weight: 900, file: 'Inter_900Black.ttf' },
];

function fontFaceCss(): string {
  return FACES.map((f) => `@font-face{font-family:'Inter';font-weight:${f.weight};font-style:normal;src:url('${staticFile(`fonts/${f.file}`)}') format('truetype');}`).join('\n');
}

let sharedCtx: CanvasRenderingContext2D | null = null;

function browserMeasurer(): TextMeasurer {
  if (!sharedCtx) sharedCtx = document.createElement('canvas').getContext('2d');
  const cache = new Map<string, number>();
  return (text: string, font: FontSpec) => {
    if (!sharedCtx) return text.length * font.sizePx * 0.55;
    const key = `${font.weight}|${font.sizePx}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    sharedCtx.font = `${font.weight} ${font.sizePx}px Inter`;
    const w = sharedCtx.measureText(text).width;
    cache.set(key, w);
    return w;
  };
}

/** Draw a layout as absolutely positioned DOM text (same geometry as the canvas rasterizer). */
export function CaptionLayer({ layout }: { layout: CaptionLayout }) {
  const shadow = layout.shadow ? `0 ${layout.shadow.offsetYPx}px ${layout.shadow.blurPx}px ${hexToRgba(layout.shadow.color)}` : 'none';
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
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
                fontFamily: 'Inter, sans-serif',
                fontSize: layout.font.sizePx,
                fontWeight: layout.font.weight,
                color: hexToRgba(active ? layout.highlight.color : layout.textColor),
                WebkitTextStroke: layout.strokePx > 0 ? `${layout.strokePx * 2}px ${hexToRgba(layout.strokeColor)}` : undefined,
                paintOrder: 'stroke fill',
                textShadow: shadow,
                transform: active && layout.highlight.scale !== 1 ? `scale(${layout.highlight.scale})` : undefined,
                transformOrigin: 'center center',
                background: active && layout.highlight.backgroundColor ? hexToRgba(layout.highlight.backgroundColor) : undefined,
                borderRadius: active && layout.highlight.backgroundColor ? layout.font.sizePx * 0.2 : undefined,
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
    Promise.all(FACES.map((f) => document.fonts.load(`${f.weight} 24px Inter`)))
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
    ? layoutCaption({ page: state.page, words: props.words, style: props.style, frame: { width, height }, activeWordIndex: state.activeWordIndex, measure })
    : null;

  return (
    <AbsoluteFill style={{ backgroundColor: props.sourceUrl ? 'black' : 'transparent' }}>
      {props.sourceUrl ? (
        <OffthreadVideo src={props.sourceUrl} startFrom={Math.round((props.startMs / 1000) * fps)} style={{ width, height, objectFit: 'contain' }} />
      ) : null}
      {layout && fontsReady ? <CaptionLayer layout={layout} /> : null}
    </AbsoluteFill>
  );
};
