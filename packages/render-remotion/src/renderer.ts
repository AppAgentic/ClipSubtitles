import { createReadStream, statSync } from 'node:fs';
import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import type { OutputSettings } from '@clipsubtitles/contracts';
import { outputDimensions, previewDimensions, sha256Hex, toSrt, toVtt } from '@clipsubtitles/core';
import { RenderCancelledError, RenderFailedError, type RenderExportInput, type RenderHooks, type RenderOutputFile, type RenderPreviewInput, type Renderer } from '@clipsubtitles/render';
import type { CaptionVideoProps } from './composition/props';
import { COMPOSITION_ID } from './root-id';

/** Serve one local file over loopback HTTP so the composition's <OffthreadVideo> can read it. */
async function serveFile(filePath: string): Promise<{ url: string; close: () => Promise<void> }> {
  const size = statSync(filePath).size;
  const server = http.createServer((req, res) => {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      res.writeHead(206, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': size });
    createReadStream(filePath).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}/source.mp4`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

async function fileInfo(p: string): Promise<{ bytes: number; sha256: string }> {
  const buf = await readFile(p);
  return { bytes: buf.length, sha256: sha256Hex(buf) };
}

/**
 * Remotion-backed renderer. Same inputs and outputs as the ffmpeg compositor;
 * captions are drawn by React in headless Chrome using the shared layout
 * engine. Requires a one-time Chrome Headless Shell download (`ensureBrowser`).
 */
export class RemotionRenderer implements Renderer {
  readonly id = 'remotion';
  private bundlePromise: Promise<string> | null = null;

  private ensureBundle(): Promise<string> {
    if (!this.bundlePromise) {
      const here = path.dirname(fileURLToPath(import.meta.url));
      this.bundlePromise = bundle({
        entryPoint: path.join(here, 'root.tsx'),
        publicDir: path.join(here, '..', 'public'),
        onProgress: () => undefined,
      });
    }
    return this.bundlePromise;
  }

  private async renderComposition(
    inputProps: CaptionVideoProps,
    outputLocation: string,
    kind: 'mp4' | 'overlay' | 'preview',
    hooks: RenderHooks,
    range: [number, number],
  ): Promise<void> {
    if (hooks.signal?.aborted) throw new RenderCancelledError();
    await ensureBrowser();
    const serveUrl = await this.ensureBundle();
    const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps });
    const [from, to] = range;
    try {
      await renderMedia({
        composition,
        serveUrl,
        inputProps,
        outputLocation,
        codec: kind === 'overlay' ? 'prores' : 'h264',
        ...(kind === 'overlay' ? { proResProfile: '4444' as const, pixelFormat: 'yuva444p10le' as const, imageFormat: 'png' as const } : { audioCodec: 'aac' as const, crf: kind === 'preview' ? 30 : 20 }),
        muted: kind === 'overlay' || !inputProps.sourceUrl,
        ...(hooks.signal ? { cancelSignal: (cancel: () => void) => hooks.signal?.addEventListener('abort', () => cancel(), { once: true }) } : {}),
        onProgress: ({ progress }) => hooks.onProgress?.(Math.round(from + (to - from) * progress), kind === 'overlay' ? 'encoding-overlay' : 'encoding'),
        logLevel: 'error',
      });
    } catch (err) {
      if (hooks.signal?.aborted) throw new RenderCancelledError();
      throw new RenderFailedError('Remotion render failed', err instanceof Error ? err.message : String(err));
    }
  }

  async renderExport(input: RenderExportInput, hooks: RenderHooks = {}): Promise<RenderOutputFile[]> {
    await mkdir(input.workDir, { recursive: true });
    const frame = outputDimensions(input.settings.resolution, { width: input.source.width, height: input.source.height });
    const fps = input.settings.fps === 'source' ? Math.round(input.source.fps ?? 30) : input.settings.fps;
    const outputs: RenderOutputFile[] = [];
    const served = await serveFile(input.source.path);
    try {
      const base: CaptionVideoProps = {
        sourceUrl: served.url,
        words: input.content.words,
        pages: input.content.pages,
        style: input.content.style,
        startMs: 0,
        durationMs: input.source.durationMs,
        fps,
        width: frame.width,
        height: frame.height,
      };
      for (const kind of input.settings.outputs as OutputSettings['outputs']) {
        if (kind === 'mp4') {
          const out = path.join(input.workDir, `${input.baseName}.mp4`);
          await this.renderComposition(base, out, 'mp4', hooks, [5, 70]);
          outputs.push({ kind, path: out, fileName: `${input.baseName}.mp4`, mimeType: 'video/mp4', ...(await fileInfo(out)), width: frame.width, height: frame.height, durationMs: input.source.durationMs });
        } else if (kind === 'overlay') {
          const out = path.join(input.workDir, `${input.baseName}-overlay.mov`);
          await this.renderComposition({ ...base, sourceUrl: null }, out, 'overlay', hooks, [70, 95]);
          outputs.push({ kind, path: out, fileName: `${input.baseName}-overlay.mov`, mimeType: 'video/quicktime', ...(await fileInfo(out)), width: frame.width, height: frame.height, durationMs: input.source.durationMs });
        } else if (kind === 'srt') {
          const out = path.join(input.workDir, `${input.baseName}.srt`);
          await writeFile(out, toSrt(input.content.pages), 'utf8');
          outputs.push({ kind, path: out, fileName: `${input.baseName}.srt`, mimeType: 'application/x-subrip', ...(await fileInfo(out)) });
        } else if (kind === 'vtt') {
          const out = path.join(input.workDir, `${input.baseName}.vtt`);
          await writeFile(out, toVtt(input.content.pages), 'utf8');
          outputs.push({ kind, path: out, fileName: `${input.baseName}.vtt`, mimeType: 'text/vtt', ...(await fileInfo(out)) });
        }
      }
    } finally {
      await served.close();
    }
    hooks.onProgress?.(100, 'done');
    return outputs;
  }

  async renderPreview(input: RenderPreviewInput, hooks: RenderHooks = {}): Promise<RenderOutputFile> {
    await mkdir(input.workDir, { recursive: true });
    const frame = previewDimensions(input.resolution, { width: input.source.width, height: input.source.height });
    const startMs = Math.max(0, Math.min(input.startMs, Math.max(0, input.source.durationMs - 500)));
    const durationMs = Math.max(500, Math.min(input.durationMs, input.source.durationMs - startMs));
    const served = await serveFile(input.source.path);
    const out = path.join(input.workDir, `${input.baseName}-preview.mp4`);
    try {
      await this.renderComposition(
        {
          sourceUrl: served.url,
          words: input.content.words,
          pages: input.content.pages,
          style: input.content.style,
          startMs,
          durationMs,
          fps: Math.round(input.source.fps ?? 30),
          width: frame.width,
          height: frame.height,
        },
        out,
        'preview',
        hooks,
        [5, 98],
      );
    } finally {
      await served.close();
    }
    hooks.onProgress?.(100, 'done');
    return { kind: 'preview', path: out, fileName: `${input.baseName}-preview.mp4`, mimeType: 'video/mp4', ...(await fileInfo(out)), width: frame.width, height: frame.height, durationMs };
  }
}
