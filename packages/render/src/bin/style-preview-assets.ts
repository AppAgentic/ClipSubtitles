/**
 * Build the landing-page style previews with the production caption renderer.
 *
 * Every output uses the same source frame and word timings so only the selected
 * style/motion changes. The browser loads one compact MP4 at a time; these are
 * deliberately video assets rather than GIFs for smoother playback and much
 * smaller transfers.
 *
 *   pnpm --filter @clipsubtitles/render previews:styles
 */
import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  createCaptionState,
  deterministicId,
  normalizeWords,
  stylePreset,
} from '@clipsubtitles/core';
import { resolveRepoRoot, runTool } from '@clipsubtitles/transcription';
import { FfmpegCompositeRenderer } from '../renderer';

const STYLES = ['clean', 'bold-pop', 'lower-third', 'karaoke', 'minimal'] as const;
const MOTIONS = ['none', 'soft-rise', 'spring-pop', 'karaoke-slide'] as const;
const DEFAULT_MOTION = {
  clean: 'soft-rise',
  'bold-pop': 'spring-pop',
  'lower-third': 'soft-rise',
  karaoke: 'karaoke-slide',
  minimal: 'soft-rise',
} as const;

const DURATION_MS = 3_200;
const FPS = 30;

async function main(): Promise<void> {
  const root = resolveRepoRoot();
  const sourceImage = path.join(root, 'apps', 'web', 'public', 'marketing', 'creator-studio.webp');
  const publicDir = path.join(root, 'apps', 'web', 'public', 'marketing', 'style-previews');
  const workRoot = path.join(root, '.data', 'style-previews');
  const sourcePath = path.join(workRoot, 'creator-master.mp4');

  await rm(workRoot, { recursive: true, force: true });
  await mkdir(workRoot, { recursive: true });
  await mkdir(publicDir, { recursive: true });

  await runTool('ffmpeg', [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-loop',
    '1',
    '-i',
    sourceImage,
    '-t',
    String(DURATION_MS / 1000),
    '-vf',
    'scale=360:640:force_original_aspect_ratio=increase,crop=360:640,format=yuv420p',
    '-r',
    String(FPS),
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '25',
    '-movflags',
    '+faststart',
    sourcePath,
  ]);

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
          width: 360,
          height: 640,
          durationMs: DURATION_MS,
          fps: FPS,
          hasAudio: false,
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

    const posterSource = path.join(publicDir, `${styleId}--${DEFAULT_MOTION[styleId]}.mp4`);
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
