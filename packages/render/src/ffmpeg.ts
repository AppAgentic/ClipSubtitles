import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import type { FrameSize } from '@clipsubtitles/core';

export interface FfmpegProgress {
  outTimeMs: number;
  frame?: number;
  fps?: number;
}

export interface RunFfmpegOptions {
  ffmpegPath?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (p: FfmpegProgress) => void;
}

export interface RunFramePipeOptions extends RunFfmpegOptions {
  onInputFrame?: (frame: number) => void;
}

export class FfmpegError extends Error {
  readonly exitCode: number | null;
  readonly stderrTail: string;
  readonly cancelled: boolean;
  constructor(message: string, exitCode: number | null, stderrTail: string, cancelled = false) {
    super(message);
    this.name = 'FfmpegError';
    this.exitCode = exitCode;
    this.stderrTail = stderrTail;
    this.cancelled = cancelled;
  }
}

/**
 * Run ffmpeg with machine-readable progress on stdout. Arguments are passed
 * as an array (never through a shell). stderr is captured (bounded) for the
 * redacted audit trail only — it never reaches public clients.
 */
export function runFfmpeg(
  args: string[],
  opts: RunFfmpegOptions = {},
): Promise<{ stderrTail: string }> {
  const bin = opts.ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg';
  const fullArgs = ['-hide_banner', '-nostdin', '-y', '-nostats', '-progress', 'pipe:1', ...args];
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new FfmpegError('ffmpeg cancelled before start', null, '', true));
      return;
    }
    const child = spawn(bin, fullArgs, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    let stdoutBuf = '';
    let settled = false;
    let cancelled = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL');
          finish(
            new FfmpegError(
              `ffmpeg timed out after ${opts.timeoutMs} ms`,
              null,
              stderr.slice(-4000),
            ),
          );
        }, opts.timeoutMs)
      : undefined;
    const onAbort = () => {
      cancelled = true;
      child.kill('SIGKILL');
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    const finish = (err: Error | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else resolve({ stderrTail: stderr.slice(-4000) });
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8');
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() ?? '';
      const progress: FfmpegProgress = { outTimeMs: -1 };
      for (const line of lines) {
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const key = line.slice(0, eq).trim();
        const value = line.slice(eq + 1).trim();
        // ffmpeg reports out_time_us and out_time_ms both in microseconds.
        if (key === 'out_time_us' || key === 'out_time_ms') {
          const n = Number(value);
          if (Number.isFinite(n) && n >= 0) progress.outTimeMs = Math.round(n / 1000);
        } else if (key === 'frame') {
          const n = Number(value);
          if (Number.isFinite(n)) progress.frame = n;
        } else if (key === 'fps') {
          const n = Number(value);
          if (Number.isFinite(n)) progress.fps = n;
        } else if (key === 'progress' && progress.outTimeMs >= 0) {
          opts.onProgress?.({ ...progress });
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 64_000) stderr += chunk.toString('utf8');
    });
    child.on('error', (err) =>
      finish(new FfmpegError(`ffmpeg failed to start: ${err.message}`, null, '')),
    );
    child.on('close', (code) => {
      if (cancelled) finish(new FfmpegError('ffmpeg cancelled', code, stderr.slice(-4000), true));
      else if (code === 0) finish(null);
      else finish(new FfmpegError(`ffmpeg exited with code ${code}`, code, stderr.slice(-4000)));
    });
  });
}

/**
 * Feed a bounded async sequence of raw frames into ffmpeg stdin. Each write
 * observes Node stream backpressure, so a slow encoder cannot accumulate an
 * unbounded in-memory frame queue.
 */
export async function runFfmpegWithFrames(
  args: string[],
  frames: AsyncIterable<Buffer>,
  opts: RunFramePipeOptions = {},
): Promise<{ stderrTail: string }> {
  const bin = opts.ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg';
  const fullArgs = ['-hide_banner', '-nostdin', '-y', '-nostats', '-progress', 'pipe:1', ...args];
  if (opts.signal?.aborted) throw new FfmpegError('ffmpeg cancelled before start', null, '', true);
  const child = spawn(bin, fullArgs, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '';
  let stdoutBuf = '';
  let cancelled = false;
  let timedOut = false;
  child.stdin.on('error', () => undefined);
  child.stdout.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString('utf8');
    const lines = stdoutBuf.split('\n');
    stdoutBuf = lines.pop() ?? '';
    const progress: FfmpegProgress = { outTimeMs: -1 };
    for (const line of lines) {
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (key === 'out_time_us' || key === 'out_time_ms') {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) progress.outTimeMs = Math.round(n / 1000);
      } else if (key === 'frame') {
        const n = Number(value);
        if (Number.isFinite(n)) progress.frame = n;
      } else if (key === 'fps') {
        const n = Number(value);
        if (Number.isFinite(n)) progress.fps = n;
      } else if (key === 'progress' && progress.outTimeMs >= 0) {
        opts.onProgress?.({ ...progress });
      }
    }
  });
  child.stderr.on('data', (chunk: Buffer) => {
    if (stderr.length < 64_000) stderr += chunk.toString('utf8');
  });
  const onAbort = () => {
    cancelled = true;
    child.kill('SIGKILL');
  };
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = opts.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, opts.timeoutMs)
    : undefined;
  const completion = new Promise<void>((resolve, reject) => {
    child.on('error', (err) =>
      reject(new FfmpegError(`ffmpeg failed to start: ${err.message}`, null, '')),
    );
    child.on('close', (code) => {
      if (cancelled) reject(new FfmpegError('ffmpeg cancelled', code, stderr.slice(-4000), true));
      else if (timedOut)
        reject(
          new FfmpegError(`ffmpeg timed out after ${opts.timeoutMs} ms`, code, stderr.slice(-4000)),
        );
      else if (code === 0) resolve();
      else reject(new FfmpegError(`ffmpeg exited with code ${code}`, code, stderr.slice(-4000)));
    });
  });

  try {
    let frame = 0;
    for await (const bytes of frames) {
      if (opts.signal?.aborted)
        throw new FfmpegError('ffmpeg cancelled', null, stderr.slice(-4000), true);
      if (child.stdin.destroyed) await completion;
      if (!child.stdin.write(bytes)) await Promise.race([once(child.stdin, 'drain'), completion]);
      frame += 1;
      opts.onInputFrame?.(frame);
    }
    child.stdin.end();
    await completion;
    return { stderrTail: stderr.slice(-4000) };
  } catch (err) {
    child.stdin.destroy();
    child.kill('SIGKILL');
    await completion.catch(() => undefined);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

export interface ConcatEntry {
  file: string;
  durationMs: number;
}

function concatPath(p: string): string {
  return `'${p.replace(/'/g, "'\\''")}'`;
}

/**
 * ffconcat list for an image sequence with explicit durations. The last file
 * is repeated without a duration so ffmpeg honours the final entry's length.
 */
export async function writeConcatList(
  entries: readonly ConcatEntry[],
  listPath: string,
): Promise<void> {
  const lines = ['ffconcat version 1.0'];
  for (const e of entries) {
    lines.push(`file ${concatPath(e.file)}`);
    lines.push(`duration ${(Math.max(1, e.durationMs) / 1000).toFixed(6)}`);
  }
  const last = entries[entries.length - 1];
  if (last) lines.push(`file ${concatPath(last.file)}`);
  await writeFile(listPath, `${lines.join('\n')}\n`, 'utf8');
}

export type EncodeQuality = 'preview' | 'standard' | 'high';

const X264: Record<EncodeQuality, { preset: string; crf: string }> = {
  preview: { preset: 'ultrafast', crf: '30' },
  standard: { preset: 'medium', crf: '20' },
  high: { preset: 'slow', crf: '17' },
};

/** Flags that make container/encoder output reproducible for identical input. */
const BITEXACT = ['-fflags', '+bitexact', '-flags', '+bitexact', '-map_metadata', '-1'];

export interface ComposeMp4Input {
  sourcePath: string;
  frame: FrameSize;
  fps: number | null;
  startMs: number;
  durationMs: number;
  overlayListPath: string;
  outputPath: string;
  quality: EncodeQuality;
  includeAudio: boolean;
}

/** Scale the source, overlay the caption image timeline, encode H.264/AAC MP4. */
export function composeMp4Args(input: ComposeMp4Input): string[] {
  const { preset, crf } = X264[input.quality];
  const args: string[] = [];
  if (input.startMs > 0) args.push('-ss', (input.startMs / 1000).toFixed(3));
  args.push('-t', (input.durationMs / 1000).toFixed(3), '-i', input.sourcePath);
  args.push('-f', 'concat', '-safe', '0', '-i', input.overlayListPath);
  args.push(
    '-filter_complex',
    `[0:v]scale=${input.frame.width}:${input.frame.height}:flags=bicubic,setsar=1,format=yuv420p[base];[base][1:v]overlay=0:0:eof_action=pass:format=auto,format=yuv420p[v]`,
  );
  args.push('-map', '[v]');
  if (input.includeAudio) args.push('-map', '0:a?', '-c:a', 'aac', '-b:a', '128k');
  else args.push('-an');
  if (input.fps) args.push('-r', String(input.fps));
  args.push(
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
  );
  args.push(
    '-movflags',
    '+faststart',
    '-t',
    (input.durationMs / 1000).toFixed(3),
    ...BITEXACT,
    input.outputPath,
  );
  return args;
}

export interface ComposeOverlayInput {
  frame: FrameSize;
  fps: number;
  durationMs: number;
  overlayListPath: string;
  outputPath: string;
}

/** Transparent caption-only overlay as ProRes 4444 (alpha) in a MOV container. */
export function composeOverlayArgs(input: ComposeOverlayInput): string[] {
  return [
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    input.overlayListPath,
    '-vf',
    `scale=${input.frame.width}:${input.frame.height},format=yuva444p10le`,
    '-r',
    String(input.fps),
    '-t',
    (input.durationMs / 1000).toFixed(3),
    '-c:v',
    'prores_ks',
    '-profile:v',
    '4444',
    '-pix_fmt',
    'yuva444p10le',
    '-vendor',
    'apl0',
    ...BITEXACT,
    input.outputPath,
  ];
}
