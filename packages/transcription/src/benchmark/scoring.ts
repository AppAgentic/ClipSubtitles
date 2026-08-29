import { DEFAULT_SEGMENTATION, deterministicId, normalizeWords, segmentWords, type RawWord } from '@clipsubtitles/core';
import { alignTokens, normalizeToken } from '../align';
import type { TruthTranscript } from '../truth';
import type { BenchmarkCategory } from './corpus';

export interface CaseScore {
  caseId: string;
  category: BenchmarkCategory;
  providerId: string;
  ok: boolean;
  errorCode?: string;
  wordCount: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  wer: number;
  entityCount: number;
  entityAccuracy: number | null;
  driftMeanAbsMs: number;
  driftMaxAbsMs: number;
  /** Least-squares slope of (hyp - truth) start offset over time, ms per minute. */
  driftSlopeMsPerMin: number;
  breakF1: number;
  latencyMs: number;
  realtimeFactor: number;
  durationMs: number;
  estimatedUsd: number | null;
}

export interface ScoreMeta {
  caseId: string;
  category: BenchmarkCategory;
  providerId: string;
  latencyMs: number;
  durationMs: number;
  estimatedUsd?: number | null;
}

export function failedScore(meta: ScoreMeta, errorCode: string, truthWordCount: number): CaseScore {
  return {
    caseId: meta.caseId,
    category: meta.category,
    providerId: meta.providerId,
    ok: false,
    errorCode,
    wordCount: truthWordCount,
    substitutions: 0,
    deletions: truthWordCount,
    insertions: 0,
    wer: 1,
    entityCount: 0,
    entityAccuracy: null,
    driftMeanAbsMs: 0,
    driftMaxAbsMs: 0,
    driftSlopeMsPerMin: 0,
    breakF1: 0,
    latencyMs: meta.latencyMs,
    realtimeFactor: meta.durationMs > 0 ? meta.latencyMs / meta.durationMs : 0,
    durationMs: meta.durationMs,
    estimatedUsd: meta.estimatedUsd ?? null,
  };
}

/** Score a hypothesis against ground truth. Pure and deterministic. */
export function scoreTranscript(truth: TruthTranscript, hyp: readonly RawWord[], meta: ScoreMeta): CaseScore {
  const refTokens = truth.words.map((w) => w.text);
  const hypTokens = hyp.map((w) => w.text);
  const steps = alignTokens(refTokens, hypTokens);
  let subs = 0;
  let dels = 0;
  let ins = 0;
  const refToHyp = new Map<number, number>();
  for (const s of steps) {
    if (s.op === 'sub') subs += 1;
    else if (s.op === 'del') dels += 1;
    else if (s.op === 'ins') ins += 1;
    if ((s.op === 'match' || s.op === 'sub') && s.ref !== undefined && s.hyp !== undefined) refToHyp.set(s.ref, s.hyp);
  }
  const n = Math.max(1, refTokens.length);
  const wer = (subs + dels + ins) / n;

  // Entity accuracy: every entity word must be matched exactly (normalized).
  let entityCount = 0;
  let entityCorrect = 0;
  truth.words.forEach((w, i) => {
    if (!w.entity) return;
    entityCount += 1;
    const h = refToHyp.get(i);
    if (h !== undefined && normalizeToken(hypTokens[h] ?? '') === normalizeToken(w.text)) entityCorrect += 1;
  });

  // Timestamp drift on matched words.
  const offsets: Array<{ t: number; d: number }> = [];
  for (const s of steps) {
    if (s.op !== 'match' || s.ref === undefined || s.hyp === undefined) continue;
    const r = truth.words[s.ref];
    const h = hyp[s.hyp];
    if (!r || !h) continue;
    offsets.push({ t: r.startMs, d: h.startMs - r.startMs });
  }
  let meanAbs = 0;
  let maxAbs = 0;
  let slope = 0;
  if (offsets.length > 0) {
    meanAbs = offsets.reduce((s, o) => s + Math.abs(o.d), 0) / offsets.length;
    maxAbs = Math.max(...offsets.map((o) => Math.abs(o.d)));
    if (offsets.length >= 3) {
      const mt = offsets.reduce((s, o) => s + o.t, 0) / offsets.length;
      const md = offsets.reduce((s, o) => s + o.d, 0) / offsets.length;
      let num = 0;
      let den = 0;
      for (const o of offsets) {
        num += (o.t - mt) * (o.d - md);
        den += (o.t - mt) * (o.t - mt);
      }
      slope = den > 0 ? (num / den) * 60_000 : 0; // ms per minute
    }
  }

  // Caption-break quality: segment truth and hypothesis, compare break positions in truth index space.
  const truthWords = normalizeWords(
    truth.words.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })),
    { wordId: (i) => deterministicId('word', `truth:${i}`) },
  );
  const hypWords = normalizeWords(hyp, { wordId: (i) => deterministicId('word', `hyp:${i}`) });
  const truthBreaks = new Set(segmentWords(truthWords, DEFAULT_SEGMENTATION).map((p) => p.startWordIndex));
  const hypBreaksInTruthSpace = new Set<number>();
  const hypStarts = segmentWords(hypWords, DEFAULT_SEGMENTATION).map((p) => p.startWordIndex);
  const hypToRef = new Map<number, number>();
  for (const [r, h] of refToHyp) hypToRef.set(h, r);
  for (const hs of hypStarts) {
    const r = hypToRef.get(hs);
    if (r !== undefined) hypBreaksInTruthSpace.add(r);
  }
  let tp = 0;
  for (const b of hypBreaksInTruthSpace) if (truthBreaks.has(b)) tp += 1;
  const precision = hypBreaksInTruthSpace.size ? tp / hypBreaksInTruthSpace.size : 0;
  const recall = truthBreaks.size ? tp / truthBreaks.size : 0;
  const breakF1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    caseId: meta.caseId,
    category: meta.category,
    providerId: meta.providerId,
    ok: true,
    wordCount: refTokens.length,
    substitutions: subs,
    deletions: dels,
    insertions: ins,
    wer: round(wer, 4),
    entityCount,
    entityAccuracy: entityCount ? round(entityCorrect / entityCount, 4) : null,
    driftMeanAbsMs: round(meanAbs, 1),
    driftMaxAbsMs: round(maxAbs, 1),
    driftSlopeMsPerMin: round(slope, 2),
    breakF1: round(breakF1, 4),
    latencyMs: meta.latencyMs,
    realtimeFactor: meta.durationMs > 0 ? round(meta.latencyMs / meta.durationMs, 3) : 0,
    durationMs: meta.durationMs,
    estimatedUsd: meta.estimatedUsd ?? null,
  };
}

export interface ProviderAggregate {
  providerId: string;
  cases: number;
  failures: number;
  failureRate: number;
  meanWer: number;
  medianWer: number;
  entityAccuracy: number | null;
  meanDriftAbsMs: number;
  maxDriftSlopeMsPerMin: number;
  meanBreakF1: number;
  meanRealtimeFactor: number;
  totalUsd: number | null;
  byCategory: Record<string, { cases: number; meanWer: number; failures: number }>;
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function aggregateScores(scores: readonly CaseScore[]): ProviderAggregate[] {
  const byProvider = new Map<string, CaseScore[]>();
  for (const s of scores) {
    const arr = byProvider.get(s.providerId) ?? [];
    arr.push(s);
    byProvider.set(s.providerId, arr);
  }
  const out: ProviderAggregate[] = [];
  for (const [providerId, list] of byProvider) {
    const ok = list.filter((s) => s.ok);
    const failures = list.length - ok.length;
    const entity = ok.filter((s) => s.entityAccuracy !== null);
    const usd = list.map((s) => s.estimatedUsd);
    const byCategory: ProviderAggregate['byCategory'] = {};
    for (const s of list) {
      const c = (byCategory[s.category] ??= { cases: 0, meanWer: 0, failures: 0 });
      c.cases += 1;
      if (!s.ok) c.failures += 1;
    }
    for (const [cat, c] of Object.entries(byCategory)) {
      c.meanWer = round(mean(list.filter((s) => s.category === cat).map((s) => s.wer)), 4);
    }
    out.push({
      providerId,
      cases: list.length,
      failures,
      failureRate: round(failures / Math.max(1, list.length), 4),
      meanWer: round(mean(list.map((s) => s.wer)), 4),
      medianWer: round(median(list.map((s) => s.wer)), 4),
      entityAccuracy: entity.length ? round(mean(entity.map((s) => s.entityAccuracy ?? 0)), 4) : null,
      meanDriftAbsMs: round(mean(ok.map((s) => s.driftMeanAbsMs)), 1),
      maxDriftSlopeMsPerMin: round(Math.max(0, ...ok.map((s) => Math.abs(s.driftSlopeMsPerMin))), 2),
      meanBreakF1: round(mean(ok.map((s) => s.breakF1)), 4),
      meanRealtimeFactor: round(mean(ok.map((s) => s.realtimeFactor)), 3),
      totalUsd: usd.every((u) => u === null) ? null : round(usd.reduce<number>((a, b) => a + (b ?? 0), 0), 4),
      byCategory,
    });
  }
  return out.sort((a, b) => a.meanWer - b.meanWer || a.failureRate - b.failureRate);
}

export interface GateResult {
  providerId: string;
  noCumulativeDrift: boolean;
  driftWithinTolerance: boolean;
  failureRateOk: boolean;
  betterThanBaseline: boolean | null;
  entityAccuracyOk: boolean | null;
  passes: boolean;
}

export const GATE_THRESHOLDS = {
  maxDriftSlopeMsPerMin: 20,
  maxMeanDriftAbsMs: 80,
  maxFailureRate: 0.05,
  minEntityAccuracy: 0.9,
} as const;

/** Acceptance gates from the plan, evaluated per provider against the baseline aggregate. */
export function evaluateGates(aggregates: readonly ProviderAggregate[], baselineId: string): GateResult[] {
  const baseline = aggregates.find((a) => a.providerId === baselineId) ?? null;
  return aggregates.map((a) => {
    const noCumulativeDrift = a.maxDriftSlopeMsPerMin <= GATE_THRESHOLDS.maxDriftSlopeMsPerMin;
    const driftWithinTolerance = a.meanDriftAbsMs <= GATE_THRESHOLDS.maxMeanDriftAbsMs;
    const failureRateOk = a.failureRate <= GATE_THRESHOLDS.maxFailureRate;
    const betterThanBaseline = baseline && baseline.providerId !== a.providerId ? a.meanWer <= baseline.meanWer : null;
    const entityAccuracyOk = a.entityAccuracy === null ? null : a.entityAccuracy >= GATE_THRESHOLDS.minEntityAccuracy;
    return {
      providerId: a.providerId,
      noCumulativeDrift,
      driftWithinTolerance,
      failureRateOk,
      betterThanBaseline,
      entityAccuracyOk,
      passes: noCumulativeDrift && driftWithinTolerance && failureRateOk && (betterThanBaseline ?? true) && (entityAccuracyOk ?? true),
    };
  });
}
