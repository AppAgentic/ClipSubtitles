import { describe, expect, it } from 'vitest';
import { aggregateScores, evaluateGates, failedScore, scoreTranscript } from './benchmark/scoring';
import type { TruthTranscript } from './truth';

const truth: TruthTranscript = {
  language: 'en',
  words: [
    { text: 'We', startMs: 0, endMs: 200 },
    { text: 'love', startMs: 250, endMs: 500 },
    { text: 'ClipSubtitles.', startMs: 550, endMs: 1100, entity: true },
    { text: 'It', startMs: 1800, endMs: 1900 },
    { text: 'works.', startMs: 1950, endMs: 2300 },
  ],
};

const meta = { caseId: 'c', category: 'clean' as const, providerId: 'p', latencyMs: 500, durationMs: 3000 };

describe('scoreTranscript', () => {
  it('scores a perfect hypothesis with zero WER and drift', () => {
    const s = scoreTranscript(truth, truth.words, meta);
    expect(s.wer).toBe(0);
    expect(s.entityAccuracy).toBe(1);
    expect(s.driftMeanAbsMs).toBe(0);
    expect(s.driftSlopeMsPerMin).toBe(0);
    expect(s.breakF1).toBe(1);
    expect(s.realtimeFactor).toBeCloseTo(500 / 3000, 3);
  });

  it('counts substitutions, deletions, insertions and entity misses', () => {
    const hyp = [
      { text: 'We', startMs: 0, endMs: 200 },
      { text: 'love', startMs: 250, endMs: 500 },
      { text: 'Clip', startMs: 550, endMs: 800 },
      { text: 'Subtitles.', startMs: 800, endMs: 1100 },
      { text: 'works.', startMs: 1950, endMs: 2300 },
    ];
    const s = scoreTranscript(truth, hyp, meta);
    expect(s.substitutions + s.deletions + s.insertions).toBeGreaterThanOrEqual(2);
    expect(s.wer).toBeGreaterThan(0);
    expect(s.entityAccuracy).toBe(0);
  });

  it('detects cumulative drift as a positive slope', () => {
    const hyp = truth.words.map((w) => ({ text: w.text, startMs: w.startMs + Math.round(w.startMs * 0.05), endMs: w.endMs + Math.round(w.endMs * 0.05) }));
    const s = scoreTranscript(truth, hyp, meta);
    // 5% drift = 3000 ms per minute.
    expect(s.driftSlopeMsPerMin).toBeGreaterThan(2500);
    expect(s.driftSlopeMsPerMin).toBeLessThan(3500);
  });

  it('aggregates and evaluates gates against a baseline', () => {
    const good = scoreTranscript(truth, truth.words, { ...meta, providerId: 'good' });
    const drifty = scoreTranscript(
      truth,
      truth.words.map((w) => ({ text: w.text, startMs: w.startMs + Math.round(w.startMs * 0.05), endMs: w.endMs + Math.round(w.endMs * 0.05) })),
      { ...meta, providerId: 'drifty' },
    );
    const failed = failedScore({ ...meta, providerId: 'flaky' }, 'UNAVAILABLE', truth.words.length);
    const okFlaky = scoreTranscript(truth, truth.words, { ...meta, providerId: 'flaky' });
    const aggregates = aggregateScores([good, drifty, failed, okFlaky]);
    expect(aggregates[0]?.providerId).toBe('good');
    const flaky = aggregates.find((a) => a.providerId === 'flaky');
    expect(flaky?.failureRate).toBe(0.5);
    const gates = evaluateGates(aggregates, 'good');
    expect(gates.find((g) => g.providerId === 'drifty')?.noCumulativeDrift).toBe(false);
    expect(gates.find((g) => g.providerId === 'flaky')?.failureRateOk).toBe(false);
    expect(gates.find((g) => g.providerId === 'good')?.betterThanBaseline).toBeNull();
  });
});
