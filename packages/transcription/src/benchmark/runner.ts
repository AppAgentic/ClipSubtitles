import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readWav } from '../audio';
import { ProviderError, type TranscriptionInput, type TranscriptionProvider } from '../provider';
import type { ProviderRegistry } from '../registry';
import { parseTruth } from '../truth';
import { detectSpeech } from '../vad';
import { BENCHMARK_CASES, type BenchmarkCase } from './corpus';
import {
  aggregateScores,
  evaluateGates,
  failedScore,
  scoreTranscript,
  type CaseScore,
  type GateResult,
  type ProviderAggregate,
} from './scoring';

export interface BenchmarkRun {
  startedAt: string;
  finishedAt: string;
  fixturesDir: string;
  providerIds: string[];
  /** True when at least one non-mock provider produced results. Only then can a provider be selected. */
  live: boolean;
  baselineId: string;
  repeats: number;
  scores: CaseScore[];
  aggregates: ProviderAggregate[];
  gates: GateResult[];
  notes: string[];
}

export interface RunBenchmarkOptions {
  registry: ProviderRegistry;
  providerIds: string[];
  fixturesDir: string;
  cases?: BenchmarkCase[];
  repeats?: number;
  baselineId?: string;
  signal?: AbortSignal;
  onProgress?: (msg: string) => void;
  now?: () => number;
}

export function isMockProvider(p: TranscriptionProvider): boolean {
  return p.id.startsWith('mock');
}

export async function runBenchmark(opts: RunBenchmarkOptions): Promise<BenchmarkRun> {
  const now = opts.now ?? Date.now;
  const startedAt = new Date(now()).toISOString();
  const cases = opts.cases ?? BENCHMARK_CASES;
  const repeats = Math.max(1, opts.repeats ?? 1);
  const baselineId = opts.baselineId ?? 'gemini';
  const scores: CaseScore[] = [];
  const notes: string[] = [];
  const providers: TranscriptionProvider[] = [];
  for (const id of opts.providerIds) {
    const p = opts.registry.byId(id);
    if (!p) {
      notes.push(`Unknown provider id "${id}" skipped.`);
      continue;
    }
    if (!p.isConfigured()) {
      notes.push(`Provider "${id}" is not configured (missing credentials) and was skipped.`);
      continue;
    }
    providers.push(p);
  }

  for (const c of cases) {
    const wavPath = path.join(opts.fixturesDir, 'benchmark', `${c.id}.wav`);
    const truth = parseTruth(await readFile(`${wavPath}.truth.json`, 'utf8'));
    const pcm = await readWav(wavPath);
    const durationMs = Math.round((pcm.samples.length / pcm.sampleRate) * 1000);
    const speechRegions = detectSpeech(pcm.samples, pcm.sampleRate);
    for (const provider of providers) {
      for (let r = 0; r < repeats; r += 1) {
        if (opts.signal?.aborted)
          throw new ProviderError(provider.id, 'CANCELLED', 'Benchmark cancelled.');
        const input: TranscriptionInput = {
          audioPath: wavPath,
          durationMs,
          sampleRate: pcm.sampleRate,
          languageHint: c.language,
          speechRegions,
          fixtureId: c.id,
        };
        const started = now();
        try {
          const result = await provider.transcribe(input, opts.signal);
          const latencyMs = result.latencyMs || now() - started;
          scores.push(
            scoreTranscript(truth, result.words, {
              caseId: c.id,
              category: c.category,
              providerId: provider.id,
              latencyMs,
              durationMs,
              estimatedUsd:
                result.estimatedUsd ??
                (provider.usdPerMinute !== null
                  ? (durationMs / 60_000) * provider.usdPerMinute
                  : null),
            }),
          );
          opts.onProgress?.(`${provider.id} ✓ ${c.id}`);
        } catch (err) {
          const code = err instanceof ProviderError ? err.code : 'UNKNOWN';
          if (code === 'CANCELLED') throw err;
          scores.push(
            failedScore(
              {
                caseId: c.id,
                category: c.category,
                providerId: provider.id,
                latencyMs: now() - started,
                durationMs,
              },
              code,
              truth.words.length,
            ),
          );
          opts.onProgress?.(`${provider.id} ✗ ${c.id} (${code})`);
        }
      }
    }
  }

  const aggregates = aggregateScores(scores);
  const live = providers.some((p) => !isMockProvider(p));
  if (!live) {
    notes.push(
      'Only mock providers ran. These numbers validate the harness and scorer; they are NOT evidence about any real provider.',
    );
  }
  if (!aggregates.some((a) => a.providerId === baselineId)) {
    notes.push(
      `Baseline provider "${baselineId}" did not run; "better than baseline" gates are unevaluated.`,
    );
  }
  return {
    startedAt,
    finishedAt: new Date(now()).toISOString(),
    fixturesDir: opts.fixturesDir,
    providerIds: providers.map((p) => p.id),
    live,
    baselineId,
    repeats,
    scores,
    aggregates,
    gates: evaluateGates(aggregates, baselineId),
    notes,
  };
}
