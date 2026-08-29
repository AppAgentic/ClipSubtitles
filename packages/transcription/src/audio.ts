import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

export interface MediaProbe {
  durationMs: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width?: number;
  height?: number;
  fps?: number;
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
}

export interface FfmpegTools {
  ffmpegPath: string;
  ffprobePath: string;
}

export const DEFAULT_FFMPEG_TOOLS: FfmpegTools = {
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH ?? 'ffprobe',
};

export class MediaToolError extends Error {
  readonly exitCode: number | null;
  readonly stderrTail: string;
  constructor(message: string, exitCode: number | null, stderrTail: string) {
    super(message);
    this.name = 'MediaToolError';
    this.exitCode = exitCode;
    this.stderrTail = stderrTail;
  }
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

/** Run a media tool with bounded output capture. Never passes user strings unquoted to a shell. */
export function runTool(
  bin: string,
  args: string[],
  opts: { signal?: AbortSignal; timeoutMs?: number; maxOutputBytes?: number } = {},
): Promise<RunResult> {
  const maxOut = opts.maxOutputBytes ?? 4 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL');
          finish(new MediaToolError(`${bin} timed out after ${opts.timeoutMs} ms`, null, stderr.slice(-2000)));
        }, opts.timeoutMs)
      : undefined;
    const onAbort = () => {
      child.kill('SIGKILL');
      finish(new MediaToolError(`${bin} cancelled`, null, stderr.slice(-2000)));
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    const finish = (err: Error | null, result?: RunResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else if (result) resolve(result);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < maxOut) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < maxOut) stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => finish(new MediaToolError(`${bin} failed to start: ${err.message}`, null, '')));
    child.on('close', (code) => {
      if (code === 0) finish(null, { stdout, stderr });
      else finish(new MediaToolError(`${bin} exited with code ${code}`, code, stderr.slice(-2000)));
    });
  });
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  duration?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string; format_name?: string };
}

function parseFps(rate: string | undefined): number | undefined {
  if (!rate) return undefined;
  const [num, den] = rate.split('/').map(Number);
  if (!num || !den) return undefined;
  const fps = num / den;
  return Number.isFinite(fps) && fps > 0 ? Math.round(fps * 1000) / 1000 : undefined;
}

export async function probeMedia(path: string, tools: FfmpegTools = DEFAULT_FFMPEG_TOOLS): Promise<MediaProbe> {
  const { stdout } = await runTool(
    tools.ffprobePath,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
    { timeoutMs: 60_000 },
  );
  let parsed: FfprobeOutput;
  try {
    parsed = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    throw new MediaToolError('ffprobe returned invalid JSON', null, '');
  }
  const streams = parsed.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video' && s.codec_name !== 'mjpeg' && s.codec_name !== 'png');
  const audio = streams.find((s) => s.codec_type === 'audio');
  const durationSec = Number(parsed.format?.duration ?? video?.duration ?? audio?.duration ?? 0);
  const probe: MediaProbe = {
    durationMs: Math.max(0, Math.round(durationSec * 1000)),
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
  };
  if (video?.width) probe.width = video.width;
  if (video?.height) probe.height = video.height;
  const fps = parseFps(video?.avg_frame_rate) ?? parseFps(video?.r_frame_rate);
  if (fps) probe.fps = fps;
  if (parsed.format?.format_name) probe.container = parsed.format.format_name;
  if (video?.codec_name) probe.videoCodec = video.codec_name;
  if (audio?.codec_name) probe.audioCodec = audio.codec_name;
  return probe;
}

/** Extract mono 16 kHz PCM WAV for transcription/VAD. */
export async function extractAudio(
  inputPath: string,
  outputWavPath: string,
  opts: { sampleRate?: number; tools?: FfmpegTools; signal?: AbortSignal } = {},
): Promise<{ sampleRate: number }> {
  const sampleRate = opts.sampleRate ?? 16_000;
  const tools = opts.tools ?? DEFAULT_FFMPEG_TOOLS;
  const args: string[] = [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    String(sampleRate),
    '-c:a',
    'pcm_s16le',
    '-f',
    'wav',
    outputWavPath,
  ];
  const runOpts: { timeoutMs: number; signal?: AbortSignal } = { timeoutMs: 10 * 60_000 };
  if (opts.signal) runOpts.signal = opts.signal;
  await runTool(tools.ffmpegPath, args, runOpts);
  return { sampleRate };
}

export interface PcmAudio {
  sampleRate: number;
  channels: number;
  samples: Int16Array;
}

/** Minimal RIFF/WAVE reader for 16-bit PCM (what extractAudio produces). */
export async function readWav(path: string): Promise<PcmAudio> {
  const buf = await readFile(path);
  return parseWav(buf);
}

export function parseWav(buf: Buffer): PcmAudio {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new MediaToolError('Not a RIFF/WAVE file', null, '');
  }
  let offset = 12;
  let sampleRate = 16_000;
  let channels = 1;
  let bits = 16;
  let dataStart = -1;
  let dataLen = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
    } else if (id === 'data') {
      dataStart = body;
      dataLen = Math.min(size, buf.length - body);
      break;
    }
    offset = body + size + (size % 2);
  }
  if (dataStart < 0) throw new MediaToolError('WAV has no data chunk', null, '');
  if (bits !== 16) throw new MediaToolError(`Unsupported WAV bit depth ${bits}`, null, '');
  const sampleCount = Math.floor(dataLen / 2);
  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) samples[i] = buf.readInt16LE(dataStart + i * 2);
  return { sampleRate, channels, samples };
}

/** Encode 16-bit PCM mono samples as WAV (used by fixture generation). */
export function encodeWav(samples: Int16Array, sampleRate: number): Buffer {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < samples.length; i += 1) buf.writeInt16LE(samples[i] ?? 0, 44 + i * 2);
  return buf;
}
