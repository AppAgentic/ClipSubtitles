import type { SpeechRegion } from './provider';

export interface VadOptions {
  frameMs?: number;
  /** dB above the estimated noise floor required to count as speech. */
  marginDb?: number;
  /** Absolute floor: frames quieter than this are never speech. */
  minSpeechDb?: number;
  /** Keep speech active this long after energy drops (bridges short gaps). */
  hangoverMs?: number;
  /** Drop speech regions shorter than this. */
  minRegionMs?: number;
  /** Merge regions separated by less than this. */
  mergeGapMs?: number;
}

const DEFAULTS: Required<VadOptions> = {
  frameMs: 20,
  marginDb: 9,
  minSpeechDb: -50,
  hangoverMs: 160,
  minRegionMs: 120,
  mergeGapMs: 120,
};

export function frameEnergiesDb(samples: Int16Array, sampleRate: number, frameMs: number): Float64Array {
  const frameLen = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const frames = Math.floor(samples.length / frameLen);
  const out = new Float64Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let sum = 0;
    const base = f * frameLen;
    for (let i = 0; i < frameLen; i += 1) {
      const s = (samples[base + i] ?? 0) / 32768;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / frameLen);
    out[f] = 20 * Math.log10(rms + 1e-9);
  }
  return out;
}

function percentile(values: Float64Array, p: number): number {
  if (values.length === 0) return -100;
  const sorted = Float64Array.from(values).sort();
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx] ?? -100;
}

/**
 * Deterministic energy VAD with an adaptive noise floor. Good enough to chunk
 * audio for providers and to supply pause information to segmentation; not a
 * substitute for provider-side VAD in production.
 */
export function detectSpeech(samples: Int16Array, sampleRate: number, options: VadOptions = {}): SpeechRegion[] {
  const o = { ...DEFAULTS, ...options };
  const energies = frameEnergiesDb(samples, sampleRate, o.frameMs);
  if (energies.length === 0) return [];
  const noiseFloor = percentile(energies, 0.2);
  const peak = percentile(energies, 0.95);
  // Threshold sits above the floor but never above the loud percentile.
  const threshold = Math.max(o.minSpeechDb, Math.min(noiseFloor + o.marginDb, peak - 3));
  const hangFrames = Math.round(o.hangoverMs / o.frameMs);

  const regions: SpeechRegion[] = [];
  let active = false;
  let start = 0;
  let quiet = 0;
  for (let f = 0; f < energies.length; f += 1) {
    const isSpeech = (energies[f] ?? -100) >= threshold;
    if (isSpeech) {
      if (!active) {
        active = true;
        start = f;
      }
      quiet = 0;
    } else if (active) {
      quiet += 1;
      if (quiet > hangFrames) {
        regions.push({ startMs: start * o.frameMs, endMs: (f - quiet + 1) * o.frameMs });
        active = false;
        quiet = 0;
      }
    }
  }
  if (active) regions.push({ startMs: start * o.frameMs, endMs: energies.length * o.frameMs });

  // Merge close regions, then drop tiny ones.
  const merged: SpeechRegion[] = [];
  for (const r of regions) {
    const last = merged[merged.length - 1];
    if (last && r.startMs - last.endMs < o.mergeGapMs) last.endMs = r.endMs;
    else merged.push({ ...r });
  }
  return merged.filter((r) => r.endMs - r.startMs >= o.minRegionMs);
}

/** Split long regions so provider chunks stay under `maxChunkMs`. */
export function chunkRegions(regions: readonly SpeechRegion[], maxChunkMs: number): SpeechRegion[] {
  const out: SpeechRegion[] = [];
  for (const r of regions) {
    let s = r.startMs;
    while (r.endMs - s > maxChunkMs) {
      out.push({ startMs: s, endMs: s + maxChunkMs });
      s += maxChunkMs;
    }
    out.push({ startMs: s, endMs: r.endMs });
  }
  return out;
}

/** Fraction of `durationMs` covered by speech (benchmark metadata). */
export function speechRatio(regions: readonly SpeechRegion[], durationMs: number): number {
  if (durationMs <= 0) return 0;
  const covered = regions.reduce((sum, r) => sum + (r.endMs - r.startMs), 0);
  return Math.min(1, covered / durationMs);
}
