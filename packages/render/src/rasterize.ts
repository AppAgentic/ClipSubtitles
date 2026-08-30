import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import type { CaptionPage, StyleConfig, TranscriptWord } from '@clipsubtitles/contracts';
import {
  hexToRgba,
  layoutCaption,
  type CaptionLayout,
  type FrameSize,
  type TextMeasurer,
} from '@clipsubtitles/core';
import { ensureFontsRegistered } from './fonts';
import { cssFont, createCanvasMeasurer } from './measure';
import { emojiImage } from './emoji-assets';

export interface RasterizeInput {
  page: CaptionPage;
  words: readonly TranscriptWord[];
  style: StyleConfig;
  frame: FrameSize;
  activeWordIndex?: number | null;
  measure?: TextMeasurer;
}

export interface DrawLayoutMotion {
  opacity?: number;
  scale?: number;
  translateY?: number;
  blurPx?: number;
  activeWordScale?: number;
  highlightFromWordIndex?: number | null;
  highlightProgress?: number;
}

function roundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Draw a computed layout onto a transparent canvas context. Shared by stills and video states. */
export function drawLayout(
  ctx: SKRSContext2D,
  layout: CaptionLayout,
  motion: DrawLayoutMotion = {},
): void {
  ctx.save();
  ctx.globalAlpha = motion.opacity ?? 1;
  if ((motion.blurPx ?? 0) > 0.01) ctx.filter = `blur(${motion.blurPx}px)`;
  const blockCenterX = layout.block.x + layout.block.width / 2;
  const blockCenterY = layout.block.y + layout.block.height / 2;
  const pageScale = motion.scale ?? 1;
  ctx.translate(blockCenterX, blockCenterY + (motion.translateY ?? 0));
  ctx.scale(pageScale, pageScale);
  ctx.translate(-blockCenterX, -blockCenterY);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  if (layout.background) {
    ctx.fillStyle = hexToRgba(layout.background.color);
    roundRect(
      ctx,
      layout.background.x,
      layout.background.y,
      layout.background.width,
      layout.background.height,
      layout.background.radius,
    );
    ctx.fill();
  }

  ctx.font = cssFont(layout.font);
  for (const line of layout.lines) {
    const centerY = line.y + line.height / 2;
    for (const word of line.words) {
      const active = word.active && layout.highlight.mode === 'word';
      const scale = active ? (motion.activeWordScale ?? layout.highlight.scale) : 1;
      const cx = word.x + word.width / 2;
      ctx.save();
      if (scale !== 1) {
        ctx.translate(cx, centerY);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -centerY);
      }
      if (active && layout.highlight.backgroundColor) {
        let pillX = word.x;
        let pillWidth = word.width;
        const fromIndex = motion.highlightFromWordIndex;
        const progress = Math.max(0, Math.min(1, motion.highlightProgress ?? 1));
        if (fromIndex !== null && fromIndex !== undefined && progress < 1) {
          const fromLine = layout.lines.find((candidate) =>
            candidate.words.some((candidateWord) => candidateWord.wordIndex === fromIndex),
          );
          const from = fromLine?.words.find(
            (candidateWord) => candidateWord.wordIndex === fromIndex,
          );
          if (from && fromLine === line) {
            pillX = from.x + (word.x - from.x) * progress;
            pillWidth = from.width + (word.width - from.width) * progress;
          }
        }
        ctx.fillStyle = hexToRgba(layout.highlight.backgroundColor);
        const padX = layout.font.sizePx * 0.18;
        const padY = layout.font.sizePx * 0.12;
        roundRect(
          ctx,
          pillX - padX,
          centerY - layout.font.sizePx * 0.62 - padY,
          pillWidth + padX * 2,
          layout.font.sizePx * 1.24 + padY * 2,
          layout.font.sizePx * 0.2,
        );
        ctx.fill();
      }
      if (layout.shadow) {
        ctx.shadowColor = hexToRgba(layout.shadow.color);
        ctx.shadowBlur = layout.shadow.blurPx;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = layout.shadow.offsetYPx;
      }
      if (layout.strokePx > 0) {
        ctx.lineWidth = layout.strokePx * 2; // half of the stroke is covered by the fill
        ctx.strokeStyle = hexToRgba(layout.strokeColor);
        ctx.strokeText(word.text, word.x, centerY);
      }
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = hexToRgba(active ? layout.highlight.color : layout.textColor);
      ctx.fillText(word.text, word.x, centerY);
      ctx.restore();
    }
  }
  if (layout.emoji) {
    const emojiScale =
      layout.emoji.animation === 'pop' &&
      layout.emoji.wordIndex === layout.activeWordIndex &&
      motion.activeWordScale &&
      motion.activeWordScale > 1
        ? motion.activeWordScale
        : 1;
    const cx = layout.emoji.x + layout.emoji.size / 2;
    const cy = layout.emoji.y + layout.emoji.size / 2;
    ctx.save();
    if (emojiScale !== 1) {
      ctx.translate(cx, cy);
      ctx.scale(emojiScale, emojiScale);
      ctx.translate(-cx, -cy);
    }
    ctx.drawImage(
      emojiImage(layout.emoji.codepoint),
      layout.emoji.x,
      layout.emoji.y,
      layout.emoji.size,
      layout.emoji.size,
    );
    ctx.restore();
  }
  ctx.restore();
}

/** Rasterize one caption state to a transparent PNG at frame size. Deterministic. */
export function rasterizeCaption(input: RasterizeInput): { png: Buffer; layout: CaptionLayout } {
  ensureFontsRegistered();
  const measure = input.measure ?? createCanvasMeasurer();
  const layout = layoutCaption({
    page: input.page,
    words: input.words,
    style: input.style,
    frame: input.frame,
    activeWordIndex: input.activeWordIndex ?? null,
    measure,
  });
  const canvas = createCanvas(input.frame.width, input.frame.height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, input.frame.width, input.frame.height);
  drawLayout(ctx, layout);
  return { png: canvas.toBuffer('image/png'), layout };
}

/** Fully transparent frame-sized PNG used for caption gaps. */
export function transparentPng(frame: FrameSize): Buffer {
  const canvas = createCanvas(frame.width, frame.height);
  canvas.getContext('2d').clearRect(0, 0, frame.width, frame.height);
  return canvas.toBuffer('image/png');
}

/** Read back RGBA at a pixel of a PNG (tests and QA tooling). */
export async function pixelAt(
  png: Buffer,
  x: number,
  y: number,
): Promise<[number, number, number, number]> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0];
}

/** Bounding box of non-transparent pixels (tests). Returns null for a fully transparent image. */
export async function opaqueBounds(
  png: Buffer,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height).data;
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if ((data[(y * image.width + x) * 4 + 3] ?? 0) > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
