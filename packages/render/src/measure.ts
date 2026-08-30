import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import type { FontSpec, TextMeasurer } from '@clipsubtitles/core';
import { ensureFontsRegistered } from './fonts';

export function cssFont(font: FontSpec): string {
  return `${font.weight} ${font.sizePx}px "${font.family}"`;
}

let shared: SKRSContext2D | null = null;

/** Text measurer backed by the same Skia engine the rasterizer draws with. */
export function createCanvasMeasurer(): TextMeasurer {
  ensureFontsRegistered();
  if (!shared) shared = createCanvas(4, 4).getContext('2d');
  const ctx = shared;
  const cache = new Map<string, number>();
  return (text, font) => {
    const key = `${font.weight}|${font.sizePx}|${font.family}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    ctx.font = cssFont(font);
    const width = ctx.measureText(text).width;
    cache.set(key, width);
    return width;
  };
}
