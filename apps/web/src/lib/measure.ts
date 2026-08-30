import type { FontSpec, TextMeasurer } from '@clipsubtitles/core';

let ctx: CanvasRenderingContext2D | null = null;

/**
 * Browser text measurer backed by an offscreen canvas. The caption font is
 * self-hosted from the same TTF files the renderer registers, so layout in
 * the editor matches the rendered output.
 */
export function createDomMeasurer(): TextMeasurer {
  if (!ctx && typeof document !== 'undefined')
    ctx = document.createElement('canvas').getContext('2d');
  const cache = new Map<string, number>();
  return (text: string, font: FontSpec) => {
    if (!ctx) return text.length * font.sizePx * 0.55;
    const key = `${font.family}|${font.weight}|${font.sizePx}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    ctx.font = `${font.weight} ${font.sizePx}px "${font.family}"`;
    const width = ctx.measureText(text).width;
    cache.set(key, width);
    return width;
  };
}

/** Resolve once the caption faces are available (avoids a first-frame fallback-font layout). */
export async function ensureCaptionFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  await Promise.all(
    [
      ['Inter', [400, 500, 600, 700, 800, 900]],
      ['Bebas Neue', [400]],
      ['Nunito', [700, 800, 900]],
      ['Playfair Display', [600, 700]],
      ['Space Mono', [400, 700]],
    ].flatMap(([family, weights]) =>
      (weights as number[]).map((weight) =>
        document.fonts.load(`${weight} 24px "${family}"`).catch(() => undefined),
      ),
    ),
  );
}
