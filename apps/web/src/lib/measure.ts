import type { FontSpec, TextMeasurer } from '@clipsubtitles/core';

let ctx: CanvasRenderingContext2D | null = null;

/**
 * Browser text measurer backed by an offscreen canvas. The caption font is
 * self-hosted from the same TTF files the renderer registers, so layout in
 * the editor matches the rendered output.
 */
export function createDomMeasurer(): TextMeasurer {
  if (!ctx && typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
  const cache = new Map<string, number>();
  return (text: string, font: FontSpec) => {
    if (!ctx) return text.length * font.sizePx * 0.55;
    const key = `${font.weight}|${font.sizePx}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    ctx.font = `${font.weight} ${font.sizePx}px Inter`;
    const width = ctx.measureText(text).width;
    cache.set(key, width);
    return width;
  };
}

/** Resolve once the caption faces are available (avoids a first-frame fallback-font layout). */
export async function ensureCaptionFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  await Promise.all([400, 500, 600, 700, 800, 900].map((w) => document.fonts.load(`${w} 24px Inter`).catch(() => undefined)));
}
