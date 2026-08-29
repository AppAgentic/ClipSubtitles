import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  createCaptionState,
  deterministicId,
  normalizeWords,
  outputDimensions,
  stylePreset,
} from '@clipsubtitles/core';
import {
  FfmpegCompositeRenderer,
  renderMotionPipe,
  type MotionFrameMetrics,
  type MotionFramePlan,
} from '@clipsubtitles/render';
import { parseTruth, probeMedia, resolveRepoRoot, runTool } from '@clipsubtitles/transcription';
import { RemotionRenderer } from '../renderer';

interface Result {
  approach: string;
  wallMs: number;
  peakRssMb: number;
  outputBytes: number;
  pipedBytes?: number;
  rasterMs?: number;
  band?: string;
  outputPath: string;
  note: string;
}

async function timed<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; wallMs: number; peakRssMb: number }> {
  let peak = process.memoryUsage().rss;
  const sample = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 10);
  const started = performance.now();
  try {
    const value = await fn();
    return { value, wallMs: performance.now() - started, peakRssMb: peak / 1024 / 1024 };
  } finally {
    clearInterval(sample);
  }
}

function row(result: Result): string {
  return `| ${result.approach} | ${(result.wallMs / 1000).toFixed(2)} s | ${result.peakRssMb.toFixed(1)} MiB | ${(result.outputBytes / 1024 / 1024).toFixed(2)} MiB | ${result.pipedBytes ? `${(result.pipedBytes / 1024 / 1024).toFixed(1)} MiB` : 'n/a'} | ${result.rasterMs ? `${result.rasterMs.toFixed(0)} ms` : 'n/a'} | ${result.band ?? 'n/a'} | ${result.note} |`;
}

function requiredOutput<T>(outputs: readonly T[], label: string): T {
  const output = outputs[0];
  if (!output) throw new Error(`${label} produced no output`);
  return output;
}

async function ssim(a: string, b: string): Promise<number | null> {
  const result = await runTool('ffmpeg', [
    '-hide_banner',
    '-nostdin',
    '-i',
    a,
    '-i',
    b,
    '-lavfi',
    'ssim',
    '-f',
    'null',
    '-',
  ]);
  const match = /All:([0-9.]+)/.exec(result.stderr);
  return match ? Number(match[1]) : null;
}

async function main(): Promise<void> {
  const root = resolveRepoRoot();
  const fixture =
    process.argv[2] ??
    path.join(root, 'fixtures', 'generated', 'demo', 'clean-en-product-demo.mp4');
  const outDir = path.join(root, '.data', 'motion-benchmark');
  await mkdir(outDir, { recursive: true });
  const truth = parseTruth(await readFile(`${fixture}.truth.json`, 'utf8'));
  const probe = await probeMedia(fixture);
  const durationMs = Math.min(6_000, probe.durationMs);
  const fps = 30;
  const words = normalizeWords(truth.words, {
    durationMs: probe.durationMs,
    wordId: (i) => deterministicId('word', `motion-benchmark:${i}`),
  });
  const state = createCaptionState({
    title: 'motion benchmark',
    words,
    style: stylePreset('karaoke'),
    revisionSeed: 'motion-benchmark',
    language: truth.language,
  });
  const source = {
    path: fixture,
    width: probe.width ?? 720,
    height: probe.height ?? 1280,
    durationMs,
    fps: probe.fps ?? fps,
    hasAudio: probe.hasAudio,
  };
  const frame = outputDimensions('720p', source);
  const content = {
    words: state.words,
    pages: state.pages,
    style: state.style,
    projectVersion: 1,
    contentHash: 'benchmark',
  };
  const results: Result[] = [];

  const staticStyle = {
    ...state.style,
    motion: { ...state.style.motion, preset: 'none' as const },
  };
  const staticRun = await timed(async () => {
    const output = await new FfmpegCompositeRenderer().renderExport({
      source,
      content: { ...content, style: staticStyle },
      settings: { outputs: ['mp4'], resolution: '720p', fps, quality: 'standard' },
      workDir: path.join(outDir, 'sparse-work'),
      baseName: 'sparse-static',
    });
    return requiredOutput(output, 'Sparse renderer');
  });
  results.push({
    approach: 'Sparse PNG control',
    wallMs: staticRun.wallMs,
    peakRssMb: staticRun.peakRssMb,
    outputBytes: staticRun.value.bytes,
    outputPath: staticRun.value.path,
    note: 'Fast control; discrete states, no easing.',
  });

  const runMotion = async (
    mode: 'full-frame' | 'caption-band',
    fileName: string,
  ): Promise<{ plan: MotionFramePlan; metrics: MotionFrameMetrics; outputPath: string }> => {
    const outputPath = path.join(outDir, fileName);
    const value = await renderMotionPipe({
      words: state.words,
      pages: state.pages,
      style: state.style,
      frame,
      fps,
      startMs: 0,
      durationMs,
      mode,
      sourcePath: fixture,
      outputPath,
      quality: 'standard',
      includeAudio: source.hasAudio,
      overlayOnly: false,
    });
    return { ...value, outputPath };
  };

  const full = await timed(() => runMotion('full-frame', 'motion-full-frame.mp4'));
  results.push({
    approach: 'Full-frame Skia pipe',
    wallMs: full.wallMs,
    peakRssMb: full.peakRssMb,
    outputBytes: (await stat(full.value.outputPath)).size,
    pipedBytes: full.value.metrics.bytesWritten,
    rasterMs: full.value.metrics.rasterMs,
    band: `${full.value.plan.band.width}×${full.value.plan.band.height}`,
    outputPath: full.value.outputPath,
    note: 'Same curves, but copies every pixel.',
  });

  const band = await timed(() => runMotion('caption-band', 'motion-caption-band.mp4'));
  results.push({
    approach: 'Cropped-band Skia pipe',
    wallMs: band.wallMs,
    peakRssMb: band.peakRssMb,
    outputBytes: (await stat(band.value.outputPath)).size,
    pipedBytes: band.value.metrics.bytesWritten,
    rasterMs: band.value.metrics.rasterMs,
    band: `${band.value.plan.band.width}×${band.value.plan.band.height} @ y=${band.value.plan.band.y}`,
    outputPath: band.value.outputPath,
    note: 'Production candidate; bounded one-frame backpressure.',
  });

  let remotionError: string | null = null;
  try {
    const remotion = await timed(async () => {
      const output = await new RemotionRenderer().renderExport({
        source,
        content,
        settings: { outputs: ['mp4'], resolution: '720p', fps, quality: 'standard' },
        workDir: path.join(outDir, 'remotion-work'),
        baseName: 'motion-remotion',
      });
      return requiredOutput(output, 'Remotion renderer');
    });
    results.push({
      approach: 'Remotion / Chromium',
      wallMs: remotion.wallMs,
      peakRssMb: remotion.peakRssMb,
      outputBytes: remotion.value.bytes,
      outputPath: remotion.value.path,
      note: 'DOM/browser reference using the same motion evaluator.',
    });
  } catch (error) {
    remotionError = error instanceof Error ? error.message : String(error);
  }

  const fullVsBand = await ssim(full.value.outputPath, band.value.outputPath);
  const sheet = path.join(outDir, 'motion-easing-contact-sheet.png');
  await runTool('ffmpeg', [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-i',
    band.value.outputPath,
    '-vf',
    'trim=duration=1,fps=8,scale=270:-1,tile=4x2:padding=6:margin=6:color=white',
    '-frames:v',
    '1',
    sheet,
  ]);
  const canaries: string[] = [];
  for (const preset of ['clean', 'bold-pop', 'karaoke'] as const) {
    const canaryState = createCaptionState({
      title: `${preset} canary`,
      words,
      style: stylePreset(preset),
      revisionSeed: `motion-canary:${preset}`,
      language: truth.language,
    });
    const outputPath = path.join(outDir, `canary-${preset}.mp4`);
    const rendered = await renderMotionPipe({
      words: canaryState.words,
      pages: canaryState.pages,
      style: canaryState.style,
      frame,
      fps,
      startMs: 0,
      durationMs: Math.min(3_000, durationMs),
      mode: 'caption-band',
      sourcePath: fixture,
      outputPath,
      quality: 'standard',
      includeAudio: source.hasAudio,
      overlayOnly: false,
    });
    const closeup = path.join(outDir, `canary-${preset}-closeup.png`);
    await runTool('ffmpeg', [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-i',
      outputPath,
      '-vf',
      `trim=duration=1.5,fps=6,crop=${rendered.plan.band.width}:${rendered.plan.band.height}:0:${rendered.plan.band.y},scale=${rendered.plan.band.width}:${rendered.plan.band.height},tile=3x3:padding=6:margin=6:color=#111111`,
      '-frames:v',
      '1',
      '-update',
      '1',
      closeup,
    ]);
    canaries.push(
      `${preset}: ${path.relative(root, outputPath)} and ${path.relative(root, closeup)}`,
    );
  }
  const report = [
    '# ClipSubtitles motion renderer bake-off',
    '',
    `Fixture: ${path.relative(root, fixture)} (${durationMs} ms, ${frame.width}×${frame.height}, ${fps} fps)`,
    '',
    '| Approach | Wall | Peak Node RSS* | Output | Raw bytes piped | Raster CPU | Raster region | Finding |',
    '|---|---:|---:|---:|---:|---:|---|---|',
    ...results.map(row),
    '',
    `Full-frame vs cropped-band SSIM: ${fullVsBand?.toFixed(6) ?? 'unavailable'}`,
    `Remotion error: ${remotionError ?? 'none'}`,
    '',
    `Contact sheet: ${path.relative(root, sheet)}`,
    ...canaries.map((canary) => `Canary ${canary}`),
    '',
    '*Peak Node RSS is sampled in one sequential benchmark process; raw bytes and wall time are the reliable cross-lane measurements. Isolated process RSS is a separate validation gate.',
  ].join('\n');
  await writeFile(path.join(outDir, 'report.md'), `${report}\n`, 'utf8');
  await writeFile(
    path.join(outDir, 'results.json'),
    `${JSON.stringify({ fixture, durationMs, frame, fps, fullVsBand, remotionError, results }, null, 2)}\n`,
    'utf8',
  );
  console.log(report);
}

main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
