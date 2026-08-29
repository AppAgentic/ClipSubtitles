/**
 * Deterministic render smoke test against the generated demo fixture.
 * Renders the same project twice and verifies byte-identical MP4 output.
 *
 *   pnpm smoke:render            # uses fixtures/generated/demo/clean-en-product-demo.mp4
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createCaptionState, deterministicId, normalizeWords, stylePreset } from '@clipsubtitles/core';
import { parseTruth, probeMedia, resolveRepoRoot } from '@clipsubtitles/transcription';
import { FfmpegCompositeRenderer } from '../renderer';

async function main(): Promise<void> {
  const root = resolveRepoRoot();
  const fixture = process.argv[2] ?? path.join(root, 'fixtures', 'generated', 'demo', 'clean-en-product-demo.mp4');
  const truth = parseTruth(await readFile(`${fixture}.truth.json`, 'utf8'));
  const probe = await probeMedia(fixture);
  const words = normalizeWords(truth.words, { durationMs: probe.durationMs, wordId: (i) => deterministicId('word', `smoke:${i}`) });
  const state = createCaptionState({ title: 'smoke', words, style: stylePreset('bold-pop'), revisionSeed: 'smoke', language: truth.language });
  const renderer = new FfmpegCompositeRenderer();
  const source = {
    path: fixture,
    width: probe.width ?? 720,
    height: probe.height ?? 1280,
    durationMs: probe.durationMs,
    fps: probe.fps ?? 30,
    hasAudio: probe.hasAudio,
  };
  const content = { words: state.words, pages: state.pages, style: state.style, projectVersion: 1, contentHash: 'smoke' };
  const outDir = path.join(root, '.data', 'smoke');
  const started = Date.now();
  const run = (n: number) =>
    renderer.renderExport(
      { source, content, settings: { outputs: ['mp4', 'overlay', 'srt', 'vtt'], resolution: '720p', fps: 'source', quality: 'standard' }, workDir: path.join(outDir, `run${n}`), baseName: 'demo' },
      { onProgress: (p, s) => process.stdout.write(`\rrun${n}: ${s} ${p}%   `) },
    );
  const a = await run(1);
  const b = await run(2);
  process.stdout.write('\n');
  for (const o of a) console.log(`${o.kind.padEnd(8)} ${o.bytes.toString().padStart(9)} B  ${o.sha256}  ${o.path}`);
  const same = a.every((o, i) => o.sha256 === b[i]?.sha256);
  console.log(`\nDeterministic across two runs: ${same ? 'YES' : 'NO'}  (${((Date.now() - started) / 1000).toFixed(1)} s total)`);
  if (!same) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  process.exit(1);
});
