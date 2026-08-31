/**
 * Build the landing-page style previews with the production caption renderer.
 *
 * Landing outputs use the same genuinely moving source clip and word timings so
 * only the selected style/motion changes. Product pickers use a second text-only
 * stage: users can compare typography and animation without a backing video
 * competing with the treatment. Each UI only plays the selected or hovered MP4;
 * posters keep the full picker grid cheap to display.
 *
 *   pnpm --filter @clipsubtitles/render previews:styles
 */
import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { MotionPreset, StylePresetId } from '@clipsubtitles/contracts';
import {
  STYLE_PRESETS,
  createCaptionState,
  deterministicId,
  normalizeWords,
  stylePreset,
} from '@clipsubtitles/core';
import { probeMedia, resolveRepoRoot, runTool } from '@clipsubtitles/transcription';
import { FfmpegCompositeRenderer } from '../renderer';

const STYLES = Object.keys(STYLE_PRESETS) as StylePresetId[];
const MOTIONS: MotionPreset[] = ['none', 'soft-rise', 'spring-pop', 'karaoke-slide'];

const DURATION_MS = 3_200;
const FPS = 30;

async function main(): Promise<void> {
  const root = resolveRepoRoot();
  const sourcePath = path.join(root, 'fixtures', 'marketing', 'style-preview-master.mp4');
  const publicDir = path.join(root, 'apps', 'web', 'public', 'marketing', 'style-previews');
  const workRoot = path.join(root, '.data', 'style-previews');
  const uiSourcePath = path.join(workRoot, 'ui-text-stage.mp4');

  await rm(workRoot, { recursive: true, force: true });
  await rm(publicDir, { recursive: true, force: true });
  await mkdir(workRoot, { recursive: true });
  await mkdir(publicDir, { recursive: true });
  const source = await probeMedia(sourcePath);
  await runTool('ffmpeg', [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=0x0A0B0D:s=640x360:r=${FPS}:d=${DURATION_MS / 1000}`,
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    uiSourcePath,
  ]);
  const uiSource = await probeMedia(uiSourcePath);

  const words = normalizeWords(
    [
      { text: 'captions', startMs: 180, endMs: 600 },
      { text: 'that', startMs: 650, endMs: 900 },
      { text: 'move', startMs: 950, endMs: 1_350 },
      { text: 'with', startMs: 1_400, endMs: 1_700 },
      { text: 'every', startMs: 1_750, endMs: 2_150 },
      { text: 'word', startMs: 2_200, endMs: 2_700 },
    ],
    {
      durationMs: DURATION_MS,
      wordId: (index) => deterministicId('word', `landing-style-preview:${index}`),
    },
  );
  const pickerWords = normalizeWords(
    [
      { text: 'captions', startMs: 180, endMs: 850 },
      { text: 'that', startMs: 900, endMs: 1_500 },
      { text: 'move', startMs: 1_550, endMs: 2_700 },
    ],
    {
      durationMs: DURATION_MS,
      wordId: (index) => deterministicId('word', `style-picker-preview:${index}`),
    },
  );
  const renderer = new FfmpegCompositeRenderer();

  for (const styleId of STYLES) {
    for (const motionId of MOTIONS) {
      const preset = stylePreset(styleId);
      const style = { ...preset, motion: { ...preset.motion, preset: motionId } };
      const state = createCaptionState({
        title: `${styleId} ${motionId} landing preview`,
        words,
        style,
        revisionSeed: `landing-style-preview:${styleId}:${motionId}`,
        language: 'en',
      });
      const workDir = path.join(workRoot, `${styleId}--${motionId}`);
      const rendered = await renderer.renderPreview({
        source: {
          path: sourcePath,
          width: source.width ?? 360,
          height: source.height ?? 640,
          durationMs: source.durationMs,
          fps: source.fps ?? FPS,
          hasAudio: source.hasAudio,
        },
        content: {
          words: state.words,
          pages: state.pages,
          style: state.style,
          projectVersion: 1,
          contentHash: `landing-style-preview:${styleId}:${motionId}`,
        },
        startMs: 0,
        durationMs: DURATION_MS,
        resolution: '360p',
        workDir,
        baseName: `${styleId}--${motionId}`,
      });
      const destination = path.join(publicDir, `${styleId}--${motionId}.mp4`);
      await copyFile(rendered.path, destination);
      process.stdout.write(`rendered ${path.relative(root, destination)}\n`);
    }

    const uiPreset = stylePreset(styleId);
    const uiState = createCaptionState({
      title: `${styleId} picker preview`,
      words: pickerWords,
      style: {
        ...uiPreset,
        position: 'center',
        textAlign: 'center',
        fontSizePct: Math.max(uiPreset.fontSizePct, 0.16),
        maxCharsPerLine: Math.min(uiPreset.maxCharsPerLine, 12),
      },
      revisionSeed: `style-picker-preview:${styleId}`,
      language: 'en',
    });
    const uiWorkDir = path.join(workRoot, `ui-${styleId}`);
    const uiRendered = await renderer.renderPreview({
      source: {
        path: uiSourcePath,
        width: uiSource.width ?? 640,
        height: uiSource.height ?? 360,
        durationMs: uiSource.durationMs,
        fps: uiSource.fps ?? FPS,
        hasAudio: false,
      },
      content: {
        words: uiState.words,
        pages: uiState.pages,
        style: uiState.style,
        projectVersion: 1,
        contentHash: `style-picker-preview:${styleId}`,
      },
      startMs: 0,
      durationMs: DURATION_MS,
      resolution: '360p',
      workDir: uiWorkDir,
      baseName: `ui-${styleId}`,
    });
    const uiDestination = path.join(publicDir, `ui-${styleId}.mp4`);
    await copyFile(uiRendered.path, uiDestination);
    await runTool('ffmpeg', [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-ss',
      '1.0',
      '-i',
      uiDestination,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      path.join(publicDir, `ui-${styleId}.jpg`),
    ]);
    process.stdout.write(`rendered ${path.relative(root, uiDestination)}\n`);

    const posterSource = path.join(
      publicDir,
      `${styleId}--${STYLE_PRESETS[styleId].motion.preset}.mp4`,
    );
    await runTool('ffmpeg', [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-ss',
      '1.4',
      '-i',
      posterSource,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      path.join(publicDir, `${styleId}.jpg`),
    ]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
