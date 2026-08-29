import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_FFMPEG_TOOLS, encodeWav, runTool, type FfmpegTools } from '../audio';
import { BENCHMARK_CASES, truthFromCase, type BenchmarkCase } from './corpus';
import { synthesizeCaseAudio } from './synth';

/** Walk up from `start` to the pnpm workspace root. */
export function resolveRepoRoot(start = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export function defaultFixturesDir(): string {
  return path.join(resolveRepoRoot(), 'fixtures', 'generated');
}

export interface BuiltFixture {
  caseId: string;
  wavPath: string;
  truthPath: string;
  durationMs: number;
  demoVideoPath?: string;
}

export interface BuildFixturesOptions {
  outDir?: string;
  cases?: BenchmarkCase[];
  tools?: FfmpegTools;
  /** Skip MP4 generation (tests). */
  skipVideo?: boolean;
  force?: boolean;
}

/**
 * Build WAV + truth sidecars for every case (and demo MP4s for cases flagged
 * demoVideo). Idempotent: existing files are kept unless `force`.
 */
export async function buildFixtures(opts: BuildFixturesOptions = {}): Promise<BuiltFixture[]> {
  const outDir = opts.outDir ?? defaultFixturesDir();
  const cases = opts.cases ?? BENCHMARK_CASES;
  const tools = opts.tools ?? DEFAULT_FFMPEG_TOOLS;
  const benchDir = path.join(outDir, 'benchmark');
  const demoDir = path.join(outDir, 'demo');
  await mkdir(benchDir, { recursive: true });
  await mkdir(demoDir, { recursive: true });
  const built: BuiltFixture[] = [];
  for (const c of cases) {
    const { truth, durationMs } = truthFromCase(c);
    const wavPath = path.join(benchDir, `${c.id}.wav`);
    const truthPath = `${wavPath}.truth.json`;
    if (opts.force || !existsSync(wavPath) || !existsSync(truthPath)) {
      const pcm = synthesizeCaseAudio(c, truth, durationMs);
      await writeFile(wavPath, encodeWav(pcm, 16_000));
      await writeFile(truthPath, JSON.stringify(truth, null, 2));
    }
    const item: BuiltFixture = { caseId: c.id, wavPath, truthPath, durationMs };
    if (c.demoVideo && !opts.skipVideo) {
      const mp4 = path.join(demoDir, `${c.id}.mp4`);
      if (opts.force || !existsSync(mp4)) {
        await runTool(
          tools.ffmpegPath,
          [
            '-hide_banner',
            '-nostdin',
            '-y',
            '-f',
            'lavfi',
            '-i',
            `testsrc2=size=720x1280:rate=30:duration=${(durationMs / 1000).toFixed(3)}`,
            '-i',
            wavPath,
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '28',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '96k',
            '-shortest',
            '-movflags',
            '+faststart',
            mp4,
          ],
          { timeoutMs: 120_000 },
        );
        await writeFile(`${mp4}.truth.json`, JSON.stringify(truth, null, 2));
      }
      item.demoVideoPath = mp4;
    }
    built.push(item);
  }
  await writeFile(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(
      {
        generatedBy: '@clipsubtitles/transcription build-fixtures',
        note: 'Synthetic tone-burst audio aligned to original scripts. Not speech. Regenerate with `pnpm fixtures:build`.',
        fixtures: built.map((b) => ({ ...b, wavPath: path.relative(outDir, b.wavPath), truthPath: path.relative(outDir, b.truthPath), demoVideoPath: b.demoVideoPath ? path.relative(outDir, b.demoVideoPath) : undefined })),
      },
      null,
      2,
    ),
  );
  return built;
}
