import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CaptionPage,
  ExportKind,
  OutputSettings,
  PreviewResolution,
  StyleConfig,
  TranscriptWord,
} from '@clipsubtitles/contracts';
import {
  outputDimensions,
  previewDimensions,
  toSrt,
  toVtt,
  type FrameSize,
} from '@clipsubtitles/core';
import {
  composeMp4Args,
  composeOverlayArgs,
  runFfmpeg,
  writeConcatList,
  FfmpegError,
  type ConcatEntry,
} from './ffmpeg';
import { createCanvasMeasurer } from './measure';
import { planStates, rasterizePlan } from './states';
import { renderMotionPipe, type MotionRasterMode } from './motion-render';

export interface RenderSource {
  path: string;
  width: number;
  height: number;
  durationMs: number;
  fps?: number;
  hasAudio: boolean;
}

export interface RenderContent {
  words: TranscriptWord[];
  pages: CaptionPage[];
  style: StyleConfig;
  projectVersion: number;
  contentHash: string;
}

export interface RenderOutputFile {
  kind: ExportKind;
  path: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface RenderHooks {
  signal?: AbortSignal;
  onProgress?: (progress: number, stage: string) => void;
}

export interface RenderExportInput {
  source: RenderSource;
  content: RenderContent;
  settings: OutputSettings;
  workDir: string;
  baseName: string;
}

export interface RenderPreviewInput {
  source: RenderSource;
  content: RenderContent;
  startMs: number;
  durationMs: number;
  resolution: PreviewResolution;
  workDir: string;
  baseName: string;
}

export interface Renderer {
  readonly id: string;
  renderExport(input: RenderExportInput, hooks?: RenderHooks): Promise<RenderOutputFile[]>;
  renderPreview(input: RenderPreviewInput, hooks?: RenderHooks): Promise<RenderOutputFile>;
}

export class RenderCancelledError extends Error {
  constructor() {
    super('Render cancelled');
    this.name = 'RenderCancelledError';
  }
}

export class RenderFailedError extends Error {
  readonly detail: string;
  constructor(message: string, detail: string) {
    super(message);
    this.name = 'RenderFailedError';
    this.detail = detail;
  }
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new RenderCancelledError();
}

async function fileInfo(p: string): Promise<{ bytes: number; sha256: string }> {
  const buf = await readFile(p);
  return { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
}

export interface FfmpegRendererOptions {
  ffmpegPath?: string;
  /** Hard cap on a single ffmpeg invocation. */
  ffmpegTimeoutMs?: number;
  /** Primarily for controlled benchmarks; production defaults to the cropped caption band. */
  motionRasterMode?: MotionRasterMode;
}

/**
 * Deterministic renderer: captions are rasterized once per visual state with
 * the shared layout engine, then composited by ffmpeg with bit-exact flags.
 * No Chromium, no font fallbacks, identical output for identical input.
 */
export class FfmpegCompositeRenderer implements Renderer {
  readonly id = 'ffmpeg-composite';
  private readonly ffmpegPath: string | undefined;
  private readonly timeoutMs: number;
  private readonly motionRasterMode: MotionRasterMode;

  constructor(opts: FfmpegRendererOptions = {}) {
    this.ffmpegPath = opts.ffmpegPath;
    this.timeoutMs = opts.ffmpegTimeoutMs ?? 30 * 60_000;
    this.motionRasterMode = opts.motionRasterMode ?? 'caption-band';
  }

  private async prepareOverlay(
    input: {
      content: RenderContent;
      frame: FrameSize;
      startMs: number;
      endMs: number;
      workDir: string;
      tag: string;
    },
    hooks: RenderHooks,
    progressRange: [number, number],
  ): Promise<string> {
    checkCancelled(hooks.signal);
    const plan = planStates({
      words: input.content.words,
      pages: input.content.pages,
      style: input.content.style,
      frame: input.frame,
      windowStartMs: input.startMs,
      windowEndMs: input.endMs,
    });
    const measure = createCanvasMeasurer();
    const statesDir = path.join(input.workDir, `states-${input.tag}`);
    await mkdir(statesDir, { recursive: true });
    const [from, to] = progressRange;
    const rasterized = rasterizePlan(
      plan,
      { words: input.content.words, style: input.content.style, measure },
      (done, total) => {
        hooks.onProgress?.(Math.round(from + ((to - from) * done) / total), 'rasterizing');
      },
    );
    const fileByKey = new Map<string, string>();
    const written = new Set<string>();
    for (const state of rasterized.values()) {
      const file = path.join(statesDir, `${state.sha256}.png`);
      if (!written.has(file)) {
        await writeFile(file, state.png);
        written.add(file);
      }
      fileByKey.set(state.key, file);
    }
    const entries: ConcatEntry[] = plan.timeline.map((seg) => ({
      file: fileByKey.get(seg.key) ?? (fileByKey.get(plan.blankKey) as string),
      durationMs: seg.endMs - seg.startMs,
    }));
    const listPath = path.join(statesDir, 'overlay.ffconcat');
    await writeConcatList(entries, listPath);
    return listPath;
  }

  private async run(
    args: string[],
    hooks: RenderHooks,
    totalMs: number,
    range: [number, number],
    stage: string,
  ): Promise<void> {
    checkCancelled(hooks.signal);
    const [from, to] = range;
    try {
      await runFfmpeg(args, {
        ...(this.ffmpegPath ? { ffmpegPath: this.ffmpegPath } : {}),
        ...(hooks.signal ? { signal: hooks.signal } : {}),
        timeoutMs: this.timeoutMs,
        onProgress: (p) => {
          const frac = totalMs > 0 ? Math.min(1, p.outTimeMs / totalMs) : 1;
          hooks.onProgress?.(Math.round(from + (to - from) * frac), stage);
        },
      });
    } catch (err) {
      if (err instanceof FfmpegError && err.cancelled) throw new RenderCancelledError();
      if (err instanceof FfmpegError) throw new RenderFailedError('ffmpeg failed', err.stderrTail);
      throw err;
    }
  }

  private async runMotion(
    input: Parameters<typeof renderMotionPipe>[0],
    hooks: RenderHooks,
    range: [number, number],
  ): Promise<void> {
    checkCancelled(hooks.signal);
    const [from, to] = range;
    const totalFrames = Math.max(1, Math.ceil((input.durationMs / 1000) * input.fps));
    const rasterEnd = from + (to - from) * 0.72;
    let lastProgress = from - 1;
    const emit = (progress: number, stage: string) => {
      const bounded = Math.max(from, Math.min(to, Math.round(progress)));
      if (bounded <= lastProgress) return;
      lastProgress = bounded;
      hooks.onProgress?.(bounded, stage);
    };
    try {
      await renderMotionPipe(input, {
        ...(this.ffmpegPath ? { ffmpegPath: this.ffmpegPath } : {}),
        ...(hooks.signal ? { signal: hooks.signal } : {}),
        timeoutMs: this.timeoutMs,
        onInputFrame: (frame) =>
          emit(from + ((rasterEnd - from) * frame) / totalFrames, 'rasterizing'),
        onProgress: (progress) => {
          const fraction = Math.min(1, progress.outTimeMs / Math.max(1, input.durationMs));
          emit(
            rasterEnd + (to - rasterEnd) * fraction,
            input.overlayOnly ? 'encoding-overlay' : 'encoding',
          );
        },
      });
    } catch (err) {
      if (err instanceof FfmpegError && err.cancelled) throw new RenderCancelledError();
      if (err instanceof FfmpegError)
        throw new RenderFailedError('ffmpeg motion render failed', err.stderrTail);
      throw err;
    }
  }

  async renderExport(
    input: RenderExportInput,
    hooks: RenderHooks = {},
  ): Promise<RenderOutputFile[]> {
    await mkdir(input.workDir, { recursive: true });
    const frame = outputDimensions(input.settings.resolution, {
      width: input.source.width,
      height: input.source.height,
    });
    const fps = input.settings.fps === 'source' ? null : input.settings.fps;
    const overlayFps = fps ?? Math.round(input.source.fps ?? 30);
    const durationMs = input.source.durationMs;
    const outputs: RenderOutputFile[] = [];
    const wantsVideo =
      input.settings.outputs.includes('mp4') || input.settings.outputs.includes('overlay');
    const motionEnabled = input.content.style.motion.preset !== 'none';
    hooks.onProgress?.(1, 'planning');

    let overlayList: string | null = null;
    if (wantsVideo && !motionEnabled) {
      overlayList = await this.prepareOverlay(
        {
          content: input.content,
          frame,
          startMs: 0,
          endMs: durationMs,
          workDir: input.workDir,
          tag: 'export',
        },
        hooks,
        [2, 25],
      );
    }

    for (const kind of input.settings.outputs) {
      checkCancelled(hooks.signal);
      if (kind === 'mp4' && motionEnabled) {
        const outputPath = path.join(input.workDir, `${input.baseName}.mp4`);
        await this.runMotion(
          {
            words: input.content.words,
            pages: input.content.pages,
            style: input.content.style,
            frame,
            fps: overlayFps,
            startMs: 0,
            durationMs,
            mode: this.motionRasterMode,
            sourcePath: input.source.path,
            outputPath,
            quality: input.settings.quality,
            includeAudio: input.source.hasAudio,
            overlayOnly: false,
          },
          hooks,
          [2, 80],
        );
        outputs.push({
          kind,
          path: outputPath,
          fileName: `${input.baseName}.mp4`,
          mimeType: 'video/mp4',
          ...(await fileInfo(outputPath)),
          width: frame.width,
          height: frame.height,
          durationMs,
        });
      } else if (kind === 'mp4' && overlayList) {
        const outputPath = path.join(input.workDir, `${input.baseName}.mp4`);
        await this.run(
          composeMp4Args({
            sourcePath: input.source.path,
            frame,
            fps,
            startMs: 0,
            durationMs,
            overlayListPath: overlayList,
            outputPath,
            quality: input.settings.quality,
            includeAudio: input.source.hasAudio,
          }),
          hooks,
          durationMs,
          [25, 80],
          'encoding',
        );
        outputs.push({
          kind,
          path: outputPath,
          fileName: `${input.baseName}.mp4`,
          mimeType: 'video/mp4',
          ...(await fileInfo(outputPath)),
          width: frame.width,
          height: frame.height,
          durationMs,
        });
      } else if (kind === 'overlay' && motionEnabled) {
        const outputPath = path.join(input.workDir, `${input.baseName}-overlay.mov`);
        await this.runMotion(
          {
            words: input.content.words,
            pages: input.content.pages,
            style: input.content.style,
            frame,
            fps: overlayFps,
            startMs: 0,
            durationMs,
            mode: this.motionRasterMode,
            outputPath,
            quality: input.settings.quality,
            includeAudio: false,
            overlayOnly: true,
          },
          hooks,
          [80, 95],
        );
        outputs.push({
          kind,
          path: outputPath,
          fileName: `${input.baseName}-overlay.mov`,
          mimeType: 'video/quicktime',
          ...(await fileInfo(outputPath)),
          width: frame.width,
          height: frame.height,
          durationMs,
        });
      } else if (kind === 'overlay' && overlayList) {
        const outputPath = path.join(input.workDir, `${input.baseName}-overlay.mov`);
        await this.run(
          composeOverlayArgs({
            frame,
            fps: overlayFps,
            durationMs,
            overlayListPath: overlayList,
            outputPath,
          }),
          hooks,
          durationMs,
          [80, 95],
          'encoding-overlay',
        );
        outputs.push({
          kind,
          path: outputPath,
          fileName: `${input.baseName}-overlay.mov`,
          mimeType: 'video/quicktime',
          ...(await fileInfo(outputPath)),
          width: frame.width,
          height: frame.height,
          durationMs,
        });
      } else if (kind === 'srt') {
        const outputPath = path.join(input.workDir, `${input.baseName}.srt`);
        await writeFile(outputPath, toSrt(input.content.pages), 'utf8');
        outputs.push({
          kind,
          path: outputPath,
          fileName: `${input.baseName}.srt`,
          mimeType: 'application/x-subrip',
          ...(await fileInfo(outputPath)),
        });
      } else if (kind === 'vtt') {
        const outputPath = path.join(input.workDir, `${input.baseName}.vtt`);
        await writeFile(outputPath, toVtt(input.content.pages), 'utf8');
        outputs.push({
          kind,
          path: outputPath,
          fileName: `${input.baseName}.vtt`,
          mimeType: 'text/vtt',
          ...(await fileInfo(outputPath)),
        });
      }
    }
    hooks.onProgress?.(100, 'done');
    return outputs;
  }

  async renderPreview(
    input: RenderPreviewInput,
    hooks: RenderHooks = {},
  ): Promise<RenderOutputFile> {
    await mkdir(input.workDir, { recursive: true });
    const frame = previewDimensions(input.resolution, {
      width: input.source.width,
      height: input.source.height,
    });
    const startMs = Math.max(
      0,
      Math.min(input.startMs, Math.max(0, input.source.durationMs - 500)),
    );
    const durationMs = Math.max(500, Math.min(input.durationMs, input.source.durationMs - startMs));
    hooks.onProgress?.(1, 'planning');
    if (input.content.style.motion.preset !== 'none') {
      const fps = Math.round(input.source.fps ?? 30);
      const outputPath = path.join(input.workDir, `${input.baseName}-preview.mp4`);
      await this.runMotion(
        {
          words: input.content.words,
          pages: input.content.pages,
          style: input.content.style,
          frame,
          fps,
          startMs,
          durationMs,
          mode: this.motionRasterMode,
          sourcePath: input.source.path,
          outputPath,
          quality: 'preview',
          includeAudio: input.source.hasAudio,
          overlayOnly: false,
        },
        hooks,
        [2, 98],
      );
      hooks.onProgress?.(100, 'done');
      return {
        kind: 'preview',
        path: outputPath,
        fileName: `${input.baseName}-preview.mp4`,
        mimeType: 'video/mp4',
        ...(await fileInfo(outputPath)),
        width: frame.width,
        height: frame.height,
        durationMs,
      };
    }
    const overlayList = await this.prepareOverlay(
      {
        content: input.content,
        frame,
        startMs,
        endMs: startMs + durationMs,
        workDir: input.workDir,
        tag: 'preview',
      },
      hooks,
      [2, 30],
    );
    const outputPath = path.join(input.workDir, `${input.baseName}-preview.mp4`);
    await this.run(
      composeMp4Args({
        sourcePath: input.source.path,
        frame,
        fps: null,
        startMs,
        durationMs,
        overlayListPath: overlayList,
        outputPath,
        quality: 'preview',
        includeAudio: input.source.hasAudio,
      }),
      hooks,
      durationMs,
      [30, 98],
      'encoding',
    );
    hooks.onProgress?.(100, 'done');
    const info = await fileInfo(outputPath);
    const s = await stat(outputPath);
    return {
      kind: 'preview',
      path: outputPath,
      fileName: `${input.baseName}-preview.mp4`,
      mimeType: 'video/mp4',
      bytes: s.size,
      sha256: info.sha256,
      width: frame.width,
      height: frame.height,
      durationMs,
    };
  }
}
