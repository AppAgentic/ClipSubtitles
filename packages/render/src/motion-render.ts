import { performance } from 'node:perf_hooks';
import { createCanvas } from '@napi-rs/canvas';
import type { CaptionPage, StyleConfig, TranscriptWord } from '@clipsubtitles/contracts';
import {
  activeWordIndexAt,
  captionMotionState,
  layoutCaption,
  pageAtMs,
  type CaptionLayout,
  type FrameSize,
} from '@clipsubtitles/core';
import { runFfmpegWithFrames, type EncodeQuality, type RunFramePipeOptions } from './ffmpeg';
import { createCanvasMeasurer } from './measure';
import { drawLayout } from './rasterize';

export type MotionRasterMode = 'full-frame' | 'caption-band';

export interface MotionFramePlan {
  frame: FrameSize;
  fps: number;
  startMs: number;
  durationMs: number;
  totalFrames: number;
  band: { y: number; width: number; height: number };
  bytesPerFrame: number;
  layouts: Map<string, CaptionLayout>;
}

export interface MotionFrameInput {
  words: readonly TranscriptWord[];
  pages: readonly CaptionPage[];
  style: StyleConfig;
  frame: FrameSize;
  fps: number;
  startMs: number;
  durationMs: number;
  mode: MotionRasterMode;
}

export interface MotionFrameMetrics {
  renderedFrames: number;
  rasterMs: number;
  bytesWritten: number;
}

function layoutKey(page: CaptionPage, activeWordIndex: number | null): string {
  return `${page.id}:${activeWordIndex ?? '-'}`;
}

export function planMotionFrames(input: MotionFrameInput): MotionFramePlan {
  const measure = createCanvasMeasurer();
  const layouts = new Map<string, CaptionLayout>();
  let minY = input.frame.height;
  let maxY = 0;
  for (const page of input.pages) {
    const activeIndexes: Array<number | null> =
      input.style.highlight.mode === 'word'
        ? [
            null,
            ...Array.from(
              { length: page.endWordIndex - page.startWordIndex + 1 },
              (_, offset) => page.startWordIndex + offset,
            ),
          ]
        : [null];
    for (const activeWordIndex of activeIndexes) {
      const layout = layoutCaption({
        page,
        words: input.words,
        style: input.style,
        frame: input.frame,
        activeWordIndex,
        measure,
      });
      layouts.set(layoutKey(page, activeWordIndex), layout);
      minY = Math.min(minY, layout.block.y);
      maxY = Math.max(maxY, layout.block.y + layout.block.height);
    }
  }
  const shorter = Math.min(input.frame.width, input.frame.height);
  const movementPadding = Math.ceil(shorter * 0.12);
  const y = input.mode === 'full-frame' ? 0 : Math.max(0, Math.floor(minY - movementPadding));
  const bottom =
    input.mode === 'full-frame'
      ? input.frame.height
      : Math.min(input.frame.height, Math.ceil(maxY + movementPadding));
  const height = Math.max(2, bottom - y);
  const totalFrames = Math.max(1, Math.ceil((input.durationMs / 1000) * input.fps));
  return {
    frame: input.frame,
    fps: input.fps,
    startMs: input.startMs,
    durationMs: input.durationMs,
    totalFrames,
    band: { y, width: input.frame.width, height },
    bytesPerFrame: input.frame.width * height * 4,
    layouts,
  };
}

export async function* renderMotionFrames(
  input: MotionFrameInput,
  plan: MotionFramePlan,
  metrics: MotionFrameMetrics,
): AsyncGenerator<Buffer> {
  const canvas = createCanvas(plan.band.width, plan.band.height);
  const ctx = canvas.getContext('2d');
  const shorter = Math.min(input.frame.width, input.frame.height);
  for (let frameIndex = 0; frameIndex < plan.totalFrames; frameIndex += 1) {
    const started = performance.now();
    const timeMs = input.startMs + Math.round((frameIndex / input.fps) * 1000);
    ctx.clearRect(0, 0, plan.band.width, plan.band.height);
    const page = pageAtMs(input.pages, timeMs);
    if (page) {
      const activeWordIndex =
        input.style.highlight.mode === 'word' ? activeWordIndexAt(input.words, timeMs, 0) : null;
      const layout = plan.layouts.get(layoutKey(page, activeWordIndex));
      if (layout) {
        const motion = captionMotionState({
          page,
          words: input.words,
          style: input.style,
          timeMs,
          activeWordIndex,
        });
        ctx.save();
        ctx.translate(0, -plan.band.y);
        drawLayout(ctx, layout, {
          opacity: motion.opacity,
          scale: motion.scale,
          translateY: motion.translateYFactor * shorter,
          blurPx: motion.blurFactor * shorter,
          activeWordScale: motion.activeWordScale,
          highlightFromWordIndex: motion.highlightFromWordIndex,
          highlightProgress: motion.highlightProgress,
        });
        ctx.restore();
      }
    }
    const pixels = ctx.getImageData(0, 0, plan.band.width, plan.band.height).data;
    metrics.renderedFrames += 1;
    metrics.rasterMs += performance.now() - started;
    metrics.bytesWritten += pixels.byteLength;
    yield Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  }
}

function x264(quality: EncodeQuality): { preset: string; crf: string } {
  if (quality === 'preview') return { preset: 'ultrafast', crf: '30' };
  if (quality === 'high') return { preset: 'slow', crf: '17' };
  return { preset: 'medium', crf: '20' };
}

const BITEXACT = ['-fflags', '+bitexact', '-flags', '+bitexact', '-map_metadata', '-1'];

export interface MotionPipeInput extends MotionFrameInput {
  sourcePath?: string;
  outputPath: string;
  quality: EncodeQuality;
  includeAudio: boolean;
  overlayOnly: boolean;
}

export async function renderMotionPipe(
  input: MotionPipeInput,
  opts: RunFramePipeOptions = {},
): Promise<{ plan: MotionFramePlan; metrics: MotionFrameMetrics }> {
  const plan = planMotionFrames(input);
  const metrics: MotionFrameMetrics = { renderedFrames: 0, rasterMs: 0, bytesWritten: 0 };
  const rawInput = [
    '-f',
    'rawvideo',
    '-pixel_format',
    'rgba',
    '-video_size',
    `${plan.band.width}x${plan.band.height}`,
    '-framerate',
    String(input.fps),
    '-i',
    'pipe:0',
  ];
  let args: string[];
  if (input.overlayOnly) {
    args = [
      ...rawInput,
      '-filter_complex',
      `[0:v]format=rgba,pad=${input.frame.width}:${input.frame.height}:0:${plan.band.y}:color=black@0,format=yuva444p10le[v]`,
      '-map',
      '[v]',
      '-an',
      '-c:v',
      'prores_ks',
      '-profile:v',
      '4444',
      '-pix_fmt',
      'yuva444p10le',
      '-vendor',
      'apl0',
      '-t',
      (input.durationMs / 1000).toFixed(3),
      ...BITEXACT,
      input.outputPath,
    ];
  } else {
    if (!input.sourcePath) throw new Error('sourcePath is required for an MP4 motion render');
    const { preset, crf } = x264(input.quality);
    const sourceArgs: string[] = [];
    if (input.startMs > 0) sourceArgs.push('-ss', (input.startMs / 1000).toFixed(3));
    sourceArgs.push('-t', (input.durationMs / 1000).toFixed(3), '-i', input.sourcePath);
    args = [
      ...sourceArgs,
      ...rawInput,
      '-filter_complex',
      `[0:v]scale=${input.frame.width}:${input.frame.height}:flags=bicubic,setsar=1,fps=${input.fps},format=yuv420p[base];[1:v]format=rgba[caption];[base][caption]overlay=0:${plan.band.y}:eof_action=endall:shortest=1:format=auto,format=yuv420p[v]`,
      '-map',
      '[v]',
    ];
    if (input.includeAudio) args.push('-map', '0:a?', '-c:a', 'aac', '-b:a', '128k');
    else args.push('-an');
    args.push(
      '-r',
      String(input.fps),
      '-c:v',
      'libx264',
      '-preset',
      preset,
      '-crf',
      crf,
      '-profile:v',
      'high',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-t',
      (input.durationMs / 1000).toFixed(3),
      ...BITEXACT,
      input.outputPath,
    );
  }
  await runFfmpegWithFrames(args, renderMotionFrames(input, plan, metrics), opts);
  return { plan, metrics };
}
