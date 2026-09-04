/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/** Browser entry: bundled at build time; never imports the node renderer. */
import type { CaptionPage, StyleConfig, TranscriptWord } from '@clipsubtitles/contracts';
import {
  activeWordIndexInPage,
  captionMotionState,
  hexToRgba,
  layoutCaption,
  visualPageAtMs,
  type CaptionLayout,
} from '@clipsubtitles/core';

export interface OverlayProject {
  words: readonly TranscriptWord[];
  pages: readonly CaptionPage[];
  style: StyleConfig;
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
  ctx: CanvasRenderingContext2D,
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
  ctx: CanvasRenderingContext2D,
  layout: CaptionLayout,
  motion: DrawLayoutMotion = {},
  getEmoji: (codepoint: string) => HTMLImageElement | undefined = () => undefined,
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

  ctx.font = `${layout.font.weight} ${layout.font.sizePx}px "${layout.font.family}"`;
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
    const emoji = getEmoji(layout.emoji.codepoint);
    if (emoji)
      ctx.drawImage(emoji, layout.emoji.x, layout.emoji.y, layout.emoji.size, layout.emoji.size);
    ctx.restore();
  }
  ctx.restore();
}

const FONT_FILES: Record<string, Record<number, string>> = {
  Inter: {
    400: 'Inter_400Regular',
    500: 'Inter_500Medium',
    600: 'Inter_600SemiBold',
    700: 'Inter_700Bold',
    800: 'Inter_800ExtraBold',
    900: 'Inter_900Black',
  },
  'Bebas Neue': { 400: 'BebasNeue_400Regular' },
  Nunito: { 700: 'Nunito_700Bold', 800: 'Nunito_800ExtraBold', 900: 'Nunito_900Black' },
  'Playfair Display': { 600: 'PlayfairDisplay_600SemiBold', 700: 'PlayfairDisplay_700Bold' },
  'Space Mono': { 400: 'SpaceMono_400Regular', 700: 'SpaceMono_700Bold' },
};
const fontLoads = new Map<string, Promise<void>>();
function loadFont(style: StyleConfig, origin: string): Promise<void> {
  const file = FONT_FILES[style.fontFamily]?.[style.fontWeight];
  if (!file || typeof FontFace === 'undefined') return Promise.resolve();
  const key = `${origin}/${file}`;
  let pending = fontLoads.get(key);
  if (!pending) {
    const face = new FontFace(style.fontFamily, `url("${origin}/fonts/${file}.ttf")`, {
      weight: String(style.fontWeight),
    });
    pending = face
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
      })
      .catch(() => {
        fontLoads.delete(key);
      });
    fontLoads.set(key, pending);
  }
  return pending;
}

/**
 * Canvas must be an absolute, pointer-events:none sibling covering the video's
 * element box. We compute its contained media rectangle, keeping captions out
 * of letterboxing. Call update after any project/style patch; destroy on teardown.
 */
export function attachCaptionOverlay(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  initial: OverlayProject,
  assetOrigin: string,
) {
  const context = canvas.getContext('2d');
  let project = initial;
  let disposed = false;
  let animation = 0;
  const emojiImages = new Map<string, HTMLImageElement>();
  const pendingEmoji = new Set<string>();
  const measurements = new Map<string, number>();
  assetOrigin = assetOrigin.replace(/\/$/, '');

  function getEmoji(codepoint: string): HTMLImageElement | undefined {
    const loaded = emojiImages.get(codepoint);
    if (loaded || pendingEmoji.has(codepoint)) return loaded;
    pendingEmoji.add(codepoint);
    const img = new Image();
    img.onload = () => {
      if (!disposed) {
        emojiImages.set(codepoint, img);
        draw();
      }
    };
    img.src = `${assetOrigin}/emoji/${codepoint}.svg`;
    return undefined;
  }

  function draw() {
    if (disposed || !context) return;
    const ctx = context;
    const box = video.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(box.width * ratio);
    const height = Math.round(box.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      measurements.clear();
    }
    context.clearRect(0, 0, width, height);
    if (!width || !height || !video.videoWidth || !video.videoHeight) return;
    const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
    const frame = { width: video.videoWidth * scale, height: video.videoHeight * scale };
    const timeMs = Math.round(video.currentTime * 1000);
    const page = visualPageAtMs(project.pages, timeMs);
    if (!page) return;
    const activeWordIndex =
      project.style.highlight.mode === 'word' || project.style.emoji.mode === 'auto'
        ? activeWordIndexInPage(page, project.words, timeMs)
        : null;
    const layout = layoutCaption({
      page,
      words: project.words,
      style: project.style,
      frame,
      activeWordIndex,
      measure(text, font) {
        const fontValue = `${font.weight} ${font.sizePx}px "${font.family}"`;
        const key = fontValue + '|' + text;
        const hit = measurements.get(key);
        if (hit !== undefined) return hit;
        ctx.font = fontValue;
        const measured = ctx.measureText(text).width;
        measurements.set(key, measured);
        return measured;
      },
    });
    const motion = captionMotionState({
      page,
      words: project.words,
      style: project.style,
      timeMs,
      activeWordIndex,
    });
    const shorter = Math.min(frame.width, frame.height);
    context.save();
    context.translate((width - frame.width) / 2, (height - frame.height) / 2);
    drawLayout(
      context,
      layout,
      {
        ...motion,
        translateY: motion.translateYFactor * shorter,
        blurPx: motion.blurFactor * shorter,
      },
      getEmoji,
    );
    context.restore();
  }

  function tick() {
    animation = 0;
    draw();
    if (!disposed && !video.paused && !video.ended) animation = requestAnimationFrame(tick);
  }
  function play() {
    if (!animation && !disposed) animation = requestAnimationFrame(tick);
  }
  function update(next: OverlayProject) {
    project = next;
    measurements.clear();
    draw();
    void loadFont(next.style, assetOrigin).then(() => {
      measurements.clear();
      draw();
    });
  }
  const events = ['timeupdate', 'seeked', 'loadedmetadata', 'pause', 'ended', 'resize'] as const;
  events.forEach((event) => video.addEventListener(event, draw));
  video.addEventListener('play', play);
  const resize = new ResizeObserver(draw);
  resize.observe(video);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  update(initial);
  if (!video.paused) play();
  return {
    update,
    draw,
    destroy() {
      disposed = true;
      cancelAnimationFrame(animation);
      resize.disconnect();
      events.forEach((event) => video.removeEventListener(event, draw));
      video.removeEventListener('play', play);
      context?.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
