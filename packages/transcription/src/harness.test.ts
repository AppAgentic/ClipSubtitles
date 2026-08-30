import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodeWav, extractAudio, parseWav, probeMedia, readWav } from './audio';
import { BENCHMARK_CASES, tokenizeScript, truthFromCase } from './benchmark/corpus';
import { buildFixtures } from './benchmark/fixtures';
import { renderMarkdown, writeReport } from './benchmark/report';
import { runBenchmark } from './benchmark/runner';
import { createProviderRegistry, KNOWN_PROVIDER_IDS } from './registry';
import { detectSpeech } from './vad';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'clipsubtitles-bench-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('corpus', () => {
  it('covers every required category with original scripts', () => {
    const categories = new Set(BENCHMARK_CASES.map((c) => c.category));
    for (const required of [
      'clean',
      'music',
      'accent',
      'code_switching',
      'poor_mic',
      'multilingual',
    ]) {
      expect(categories.has(required as never)).toBe(true);
    }
    expect(new Set(BENCHMARK_CASES.map((c) => c.id)).size).toBe(BENCHMARK_CASES.length);
  });

  it('derives deterministic ground truth with entity marks and sentence starts', () => {
    const c = BENCHMARK_CASES.find((x) => x.id === 'entities-en-brands')!;
    const a = truthFromCase(c);
    const b = truthFromCase(c);
    expect(a).toEqual(b);
    expect(a.truth.words.some((w) => w.entity)).toBe(true);
    expect(a.truth.words.find((w) => w.text.startsWith('Scribe'))?.entity).toBe(true);
    expect(a.truth.sentenceStarts?.[0]).toBe(0);
    expect(tokenizeScript('a [[Big Co]]. b')).toEqual([
      { text: 'a', entity: false },
      { text: 'Big', entity: true },
      { text: 'Co.', entity: true },
      { text: 'b', entity: false },
    ]);
  });
});

describe('audio + fixtures + benchmark end to end', () => {
  it('exposes only Gemini and ElevenLabs as live transcription providers', () => {
    const registry = createProviderRegistry({
      TRANSCRIPTION_PROVIDERS: 'gemini,elevenlabs,unknown-provider',
      GEMINI_API_KEY: 'configured-for-registry-test',
      ELEVENLABS_API_KEY: 'configured-for-registry-test',
    });
    expect(KNOWN_PROVIDER_IDS).toEqual([
      'mock',
      'mock-noisy',
      'mock-drifty',
      'mock-flaky',
      'gemini',
      'elevenlabs',
    ]);
    expect(registry.chain.map((provider) => provider.id)).toEqual(['gemini', 'elevenlabs']);
    expect(
      registry.all
        .filter((provider) => !provider.id.startsWith('mock'))
        .map((provider) => provider.id),
    ).toEqual(['gemini', 'elevenlabs']);
  });

  it('WAV encode/parse round trips', () => {
    const samples = new Int16Array([0, 1000, -1000, 32767, -32768]);
    const parsed = parseWav(encodeWav(samples, 16_000));
    expect(parsed.sampleRate).toBe(16_000);
    expect(Array.from(parsed.samples)).toEqual(Array.from(samples));
  });

  it('builds fixtures, probes them with ffprobe, extracts audio, detects speech, and ranks mock profiles', async () => {
    const cases = BENCHMARK_CASES.filter((c) =>
      ['clean-en-product-demo', 'poor-mic-en-podcast'].includes(c.id),
    );
    const built = await buildFixtures({ outDir: dir, cases, skipVideo: true });
    expect(built).toHaveLength(2);
    const wav = built[0]!.wavPath;
    const probe = await probeMedia(wav);
    expect(probe.hasAudio).toBe(true);
    expect(probe.durationMs).toBeGreaterThan(5000);

    const extracted = path.join(dir, 'extracted.wav');
    await extractAudio(wav, extracted);
    const pcm = await readWav(extracted);
    expect(pcm.sampleRate).toBe(16_000);
    const regions = detectSpeech(pcm.samples, pcm.sampleRate);
    const truth = JSON.parse(await readFile(built[0]!.truthPath, 'utf8')) as {
      words: Array<{ startMs: number }>;
    };
    expect(regions.length).toBeGreaterThan(3);
    expect(Math.abs(regions[0]!.startMs - truth.words[0]!.startMs)).toBeLessThan(120);

    const registry = createProviderRegistry({ TRANSCRIPTION_PROVIDERS: 'mock' });
    const run = await runBenchmark({
      registry,
      providerIds: ['mock', 'mock-noisy', 'mock-drifty', 'gemini'],
      fixturesDir: dir,
      cases,
      baselineId: 'mock',
    });
    expect(run.live).toBe(false);
    expect(run.providerIds).toEqual(['mock', 'mock-noisy', 'mock-drifty']);
    expect(run.notes.some((n) => n.includes('gemini'))).toBe(true);
    const mock = run.aggregates.find((a) => a.providerId === 'mock')!;
    const noisy = run.aggregates.find((a) => a.providerId === 'mock-noisy')!;
    const drifty = run.aggregates.find((a) => a.providerId === 'mock-drifty')!;
    expect(mock.meanWer).toBe(0);
    expect(noisy.meanWer).toBeGreaterThan(mock.meanWer);
    expect(drifty.maxDriftSlopeMsPerMin).toBeGreaterThan(mock.maxDriftSlopeMsPerMin);
    expect(run.gates.find((g) => g.providerId === 'mock-drifty')?.noCumulativeDrift).toBe(false);
    // Mock runs demonstrate the harness only; no provider can pass without live evidence.
    expect(run.gates.every((g) => g.passes === false && g.liveEvidence === false)).toBe(true);

    const md = renderMarkdown(run);
    expect(md).toContain('No provider winner is claimed');
    const { jsonPath, mdPath } = await writeReport(run, path.join(dir, 'reports'), 'test');
    expect((await readFile(jsonPath, 'utf8')).length).toBeGreaterThan(100);
    expect((await readFile(mdPath, 'utf8')).startsWith('# Transcription benchmark report')).toBe(
      true,
    );
  });
});
