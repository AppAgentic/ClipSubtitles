import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SEGMENTATION, segmentWords, stylePreset, wordsFromText } from '@clipsubtitles/core';
import { probeMedia, runTool } from '@clipsubtitles/transcription';
import { createCanvasMeasurer } from './measure';
import { opaqueBounds, rasterizeCaption, transparentPng } from './rasterize';
import { FfmpegCompositeRenderer, RenderCancelledError, type RenderContent, type RenderSource } from './renderer';
import { BLANK_KEY, planStates, rasterizePlan } from './states';
import { writeConcatList } from './ffmpeg';

const frame = { width: 320, height: 568 };
const words = wordsFromText('Captions that look great on every phone. | And they never rewrite a word.');
const pages = segmentWords(words, DEFAULT_SEGMENTATION);

describe('rasterizeCaption', () => {
  it('produces a deterministic transparent PNG with text in the expected region', async () => {
    const style = stylePreset('clean');
    const a = rasterizeCaption({ page: pages[0]!, words, style, frame });
    const b = rasterizeCaption({ page: pages[0]!, words, style, frame });
    expect(a.png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(a.png.equals(b.png)).toBe(true);
    const bounds = await opaqueBounds(a.png);
    expect(bounds).not.toBeNull();
    // Bottom position: ink sits in the lower part of the frame, horizontally centred.
    expect(bounds!.y).toBeGreaterThan(frame.height * 0.6);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(frame.height - frame.height * 0.08 + 10);
    const cx = bounds!.x + bounds!.width / 2;
    expect(Math.abs(cx - frame.width / 2)).toBeLessThan(12);
  });

  it('moves ink with the position and draws a background for lower-third', async () => {
    const top = rasterizeCaption({ page: pages[0]!, words, style: { ...stylePreset('clean'), position: 'top' }, frame });
    const bounds = await opaqueBounds(top.png);
    expect(bounds!.y).toBeLessThan(frame.height * 0.2);
    // Fit-to-width keeps ink inside the horizontal safe area even on a narrow frame.
    expect(bounds!.x).toBeGreaterThanOrEqual(frame.width * 0.05 - 4);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(frame.width * 0.95 + 4);
    const lower = rasterizeCaption({ page: pages[0]!, words, style: stylePreset('lower-third'), frame });
    const lb = await opaqueBounds(lower.png);
    expect(lb).not.toBeNull();
    expect(lower.layout.background).not.toBeNull();
    expect(lb!.y + lb!.height).toBeLessThanOrEqual(frame.height - frame.height * 0.22 + 4);
  });

  it('uses the canvas measurer for widths consistent with the layout', () => {
    const measure = createCanvasMeasurer();
    const w1 = measure('hello', { family: 'Inter', weight: 700, sizePx: 40 });
    const w2 = measure('hello hello', { family: 'Inter', weight: 700, sizePx: 40 });
    expect(w2).toBeGreaterThan(w1 * 1.8);
    expect(measure('hello', { family: 'Inter', weight: 700, sizePx: 80 })).toBeCloseTo(w1 * 2, 0);
  });

  it('transparent frames are fully transparent', async () => {
    expect(await opaqueBounds(transparentPng(frame))).toBeNull();
  });
});

describe('planStates', () => {
  it('covers the window without gaps and dedupes identical states', () => {
    const plan = planStates({ words, pages, style: stylePreset('clean'), frame, windowStartMs: 0, windowEndMs: 8000 });
    expect(plan.timeline[0]?.startMs).toBe(0);
    expect(plan.timeline[plan.timeline.length - 1]?.endMs).toBe(8000);
    for (let i = 1; i < plan.timeline.length; i += 1) expect(plan.timeline[i]!.startMs).toBe(plan.timeline[i - 1]!.endMs);
    expect(plan.states.size).toBe(pages.length + 1);
    expect(plan.states.has(BLANK_KEY)).toBe(true);
    const karaoke = planStates({ words, pages, style: stylePreset('karaoke'), frame, windowStartMs: 0, windowEndMs: 8000 });
    expect(karaoke.states.size).toBe(words.length + 1);
    const raster = rasterizePlan(plan, { words, style: stylePreset('clean') });
    expect(raster.size).toBe(plan.states.size);
  });
});

describe('FfmpegCompositeRenderer', () => {
  let dir: string;
  let source: RenderSource;
  const content: RenderContent = { words, pages, style: stylePreset('bold-pop'), projectVersion: 3, contentHash: 'c'.repeat(64) };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'clipsubtitles-render-'));
    const src = path.join(dir, 'source.mp4');
    await runTool('ffmpeg', [
      '-hide_banner', '-nostdin', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=320x568:rate=30:duration=3',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src,
    ]);
    const probe = await probeMedia(src);
    source = { path: src, width: probe.width ?? 320, height: probe.height ?? 568, durationMs: probe.durationMs, fps: probe.fps ?? 30, hasAudio: probe.hasAudio };
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('renders mp4 + overlay + srt + vtt deterministically', async () => {
    const renderer = new FfmpegCompositeRenderer();
    const progress: Array<[number, string]> = [];
    const outputs = await renderer.renderExport(
      { source, content, settings: { outputs: ['mp4', 'overlay', 'srt', 'vtt'], resolution: 'source', fps: 'source', quality: 'standard' }, workDir: path.join(dir, 'run1'), baseName: 'clip' },
      { onProgress: (p, s) => progress.push([p, s]) },
    );
    expect(outputs.map((o) => o.kind)).toEqual(['mp4', 'overlay', 'srt', 'vtt']);
    const mp4 = outputs[0]!;
    const probe = await probeMedia(mp4.path);
    expect(probe.width).toBe(320);
    expect(probe.height).toBe(568);
    expect(Math.abs(probe.durationMs - 3000)).toBeLessThan(150);
    expect(probe.hasAudio).toBe(true);
    const overlay = await probeMedia(outputs[1]!.path);
    expect(overlay.videoCodec).toBe('prores');
    const srt = await readFile(outputs[2]!.path, 'utf8');
    expect(srt.replace(/\n/g, ' ')).toContain('Captions that look great on every phone.');
    expect((await readFile(outputs[3]!.path, 'utf8')).startsWith('WEBVTT')).toBe(true);
    expect(progress.some(([, s]) => s === 'rasterizing')).toBe(true);
    expect(progress.some(([, s]) => s === 'encoding')).toBe(true);
    expect(progress[progress.length - 1]?.[0]).toBe(100);

    const again = await renderer.renderExport(
      { source, content, settings: { outputs: ['mp4'], resolution: 'source', fps: 'source', quality: 'standard' }, workDir: path.join(dir, 'run2'), baseName: 'clip' },
    );
    expect(again[0]!.sha256).toBe(mp4.sha256);
  });

  it('renders a bounded low-resolution preview window', async () => {
    const renderer = new FfmpegCompositeRenderer();
    const out = await renderer.renderPreview({ source, content, startMs: 500, durationMs: 1500, resolution: '360p', workDir: path.join(dir, 'preview'), baseName: 'clip' });
    expect(out.kind).toBe('preview');
    const probe = await probeMedia(out.path);
    expect(Math.abs(probe.durationMs - 1500)).toBeLessThan(150);
    expect(probe.width).toBe(320); // 360p never upscales a 320px-wide source
  });

  it('scales to 720p by the shorter side', async () => {
    const renderer = new FfmpegCompositeRenderer();
    const outputs = await renderer.renderExport(
      { source, content, settings: { outputs: ['mp4'], resolution: '720p', fps: 24, quality: 'standard' }, workDir: path.join(dir, 'run720'), baseName: 'clip' },
    );
    const probe = await probeMedia(outputs[0]!.path);
    expect(probe.width).toBe(720);
    expect(probe.height).toBe(1278);
    expect(probe.fps).toBe(24);
  });

  it('honours cancellation', async () => {
    const renderer = new FfmpegCompositeRenderer();
    const ac = new AbortController();
    ac.abort();
    await expect(
      renderer.renderExport(
        { source, content, settings: { outputs: ['mp4'], resolution: 'source', fps: 'source', quality: 'standard' }, workDir: path.join(dir, 'cancel'), baseName: 'clip' },
        { signal: ac.signal },
      ),
    ).rejects.toBeInstanceOf(RenderCancelledError);
  });

  it('writes ffconcat lists that repeat the last file', async () => {
    const p = path.join(dir, 'list.ffconcat');
    await writeConcatList([{ file: "/tmp/a'b.png", durationMs: 1000 }, { file: '/tmp/c.png', durationMs: 250 }], p);
    const text = await readFile(p, 'utf8');
    expect(text).toContain("file '/tmp/a'\\''b.png'");
    expect(text.trim().endsWith("file '/tmp/c.png'")).toBe(true);
    expect(text).toContain('duration 0.250000');
  });
});
