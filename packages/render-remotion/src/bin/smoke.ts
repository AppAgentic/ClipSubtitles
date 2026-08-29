/**
 * Remotion renderer smoke: downloads Chrome Headless Shell if needed, renders
 * the first 3 seconds of the demo fixture at 360p (MP4 + overlay), and prints
 * output sizes. Compares nothing byte-for-byte: browser rendering is not
 * guaranteed deterministic; the ffmpeg renderer is the deterministic default.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createCaptionState, deterministicId, normalizeWords, stylePreset } from '@clipsubtitles/core';
import { parseTruth, probeMedia, resolveRepoRoot } from '@clipsubtitles/transcription';
import { RemotionRenderer } from '../renderer';

async function main(): Promise<void> {
  const root = resolveRepoRoot();
  const fixture = process.argv[2] ?? path.join(root, 'fixtures', 'generated', 'demo', 'clean-en-product-demo.mp4');
  const truth = parseTruth(await readFile(`${fixture}.truth.json`, 'utf8'));
  const probe = await probeMedia(fixture);
  const words = normalizeWords(truth.words, { durationMs: probe.durationMs, wordId: (i) => deterministicId('word', `remotion:${i}`) });
  const state = createCaptionState({ title: 'smoke', words, style: stylePreset('karaoke'), revisionSeed: 'remotion', language: truth.language });
  const renderer = new RemotionRenderer();
  const source = { path: fixture, width: probe.width ?? 720, height: probe.height ?? 1280, durationMs: probe.durationMs, fps: probe.fps ?? 30, hasAudio: probe.hasAudio };
  const content = { words: state.words, pages: state.pages, style: state.style, projectVersion: 1, contentHash: 'smoke' };
  const started = Date.now();
  const preview = await renderer.renderPreview(
    { source, content, startMs: 0, durationMs: 3000, resolution: '360p', workDir: path.join(root, '.data', 'smoke-remotion'), baseName: 'demo' },
    { onProgress: (p, s) => process.stdout.write(`\rpreview: ${s} ${p}%   `) },
  );
  process.stdout.write('\n');
  console.log(`preview  ${preview.bytes.toString().padStart(9)} B  ${preview.width}x${preview.height}  ${preview.path}`);
  const overlay = await renderer.renderExport(
    { source: { ...source, durationMs: 3000 }, content, settings: { outputs: ['overlay', 'srt'], resolution: '720p', fps: 30, quality: 'standard' }, workDir: path.join(root, '.data', 'smoke-remotion'), baseName: 'demo' },
    { onProgress: (p, s) => process.stdout.write(`\rexport: ${s} ${p}%   `) },
  );
  process.stdout.write('\n');
  for (const o of overlay) console.log(`${o.kind.padEnd(8)} ${o.bytes.toString().padStart(9)} B  ${o.path}`);
  console.log(`Remotion smoke passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  process.exit(1);
});
