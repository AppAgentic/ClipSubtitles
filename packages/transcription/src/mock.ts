import type { RawWord } from '@clipsubtitles/core';
import { createPrng } from './prng';
import {
  ProviderError,
  throwIfAborted,
  type ProviderCapabilities,
  type TranscriptionInput,
  type TranscriptionProvider,
  type TranscriptionResult,
} from './provider';
import { SidecarTruthSource, type TruthSource, type TruthTranscript } from './truth';

/**
 * Deterministic noise model applied to ground truth. Lets the benchmark
 * harness be validated end-to-end (it must rank a noisy profile below an
 * accurate one) without pretending to be evidence about real providers.
 */
export interface NoiseProfile {
  id: string;
  displayName: string;
  /** Word error budget (substitutions + deletions + insertions) as a fraction of words. */
  wer: number;
  /** Timestamp drift accumulated per second of audio. */
  driftMsPerSecond: number;
  /** Uniform timing jitter (± ms). */
  jitterMs: number;
  /** Synthetic latency per audio minute (ms) reported, not slept. */
  latencyMsPerMinute: number;
  /** Probability that a call fails with a retryable error. */
  failRate: number;
  /** Drop trailing punctuation from words (hurts caption-break quality). */
  dropPunctuation: boolean;
}

export const ACCURATE_MOCK_PROFILE: NoiseProfile = {
  id: 'mock',
  displayName: 'Mock (ground truth)',
  wer: 0,
  driftMsPerSecond: 0,
  jitterMs: 0,
  latencyMsPerMinute: 1500,
  failRate: 0,
  dropPunctuation: false,
};

export const MOCK_PROFILES: Record<string, NoiseProfile> = {
  mock: ACCURATE_MOCK_PROFILE,
  'mock-noisy': {
    id: 'mock-noisy',
    displayName: 'Mock (noisy words)',
    wer: 0.12,
    driftMsPerSecond: 0,
    jitterMs: 35,
    latencyMsPerMinute: 4000,
    failRate: 0,
    dropPunctuation: true,
  },
  'mock-drifty': {
    id: 'mock-drifty',
    displayName: 'Mock (timestamp drift)',
    wer: 0.02,
    driftMsPerSecond: 12,
    jitterMs: 20,
    latencyMsPerMinute: 2500,
    failRate: 0,
    dropPunctuation: false,
  },
  'mock-flaky': {
    id: 'mock-flaky',
    displayName: 'Mock (fails 40%)',
    wer: 0.04,
    driftMsPerSecond: 0,
    jitterMs: 10,
    latencyMsPerMinute: 3000,
    failRate: 0.4,
    dropPunctuation: false,
  },
};

const CONFUSABLES: Record<string, string> = {
  their: 'there',
  there: 'their',
  to: 'two',
  two: 'too',
  for: 'four',
  your: "you're",
  its: "it's",
  then: 'than',
  than: 'then',
  we: 'wee',
  see: 'sea',
  new: 'knew',
};

function mutateWord(text: string, rnd: () => number): string {
  const bare = text.replace(/[\p{P}\p{S}]+$/u, '');
  const trailing = text.slice(bare.length);
  const lower = bare.toLowerCase();
  const confusable = CONFUSABLES[lower];
  if (confusable && rnd() < 0.6) return confusable + trailing;
  if (bare.length <= 2) return bare + 'a' + trailing;
  const pos = Math.floor(rnd() * bare.length);
  const replacement = String.fromCharCode(97 + Math.floor(rnd() * 26));
  return bare.slice(0, pos) + replacement + bare.slice(pos + 1) + trailing;
}

export interface MockProviderOptions {
  profile?: NoiseProfile;
  truthSources?: TruthSource[];
  /** Used when no truth is available (real uploads in local dev). */
  placeholderWhenNoTruth?: boolean;
}

/**
 * Mock transcription provider. Reads ground truth (fixture sidecar or map),
 * applies its deterministic noise profile, and returns provider-shaped words.
 * Without truth it emits an honest placeholder transcript derived from VAD so
 * the local product flow still works end-to-end.
 */
export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly id: string;
  readonly displayName: string;
  readonly model: string;
  readonly capabilities: ProviderCapabilities = {
    wordTimestamps: true,
    speakerLabels: true,
    languageDetection: true,
    vocabularyBiasing: false,
    verbatim: true,
  };
  readonly usdPerMinute = null;
  private readonly profile: NoiseProfile;
  private readonly truthSources: TruthSource[];
  private readonly placeholder: boolean;

  constructor(options: MockProviderOptions = {}) {
    this.profile = options.profile ?? ACCURATE_MOCK_PROFILE;
    this.id = this.profile.id;
    this.displayName = this.profile.displayName;
    this.model = `${this.profile.id}-v1`;
    this.truthSources = options.truthSources ?? [new SidecarTruthSource()];
    this.placeholder = options.placeholderWhenNoTruth ?? true;
  }

  isConfigured(): boolean {
    return true;
  }

  async transcribe(input: TranscriptionInput, signal?: AbortSignal): Promise<TranscriptionResult> {
    throwIfAborted(this.id, signal);
    const seed = `${this.profile.id}:${input.fixtureId ?? input.audioPath}:${input.durationMs}`;
    const rnd = createPrng(seed);
    if (this.profile.failRate > 0 && rnd() < this.profile.failRate) {
      throw new ProviderError(this.id, 'UNAVAILABLE', 'Mock provider simulated an outage.', true);
    }
    let truth: TruthTranscript | null = null;
    for (const source of this.truthSources) {
      truth = await source.lookup(input);
      if (truth) break;
    }
    const minutes = input.durationMs / 60_000;
    const latencyMs = Math.round(this.profile.latencyMsPerMinute * Math.max(0.05, minutes));
    if (!truth) {
      if (!this.placeholder) throw new ProviderError(this.id, 'UNSUPPORTED', 'No ground truth for this audio.');
      return {
        words: placeholderWords(input),
        language: input.languageHint ?? 'und',
        provider: this.id,
        model: this.model,
        latencyMs,
      };
    }
    throwIfAborted(this.id, signal);
    const words = applyNoise(truth, this.profile, rnd);
    return { words, language: truth.language, provider: this.id, model: this.model, latencyMs };
  }
}

export function applyNoise(truth: TruthTranscript, profile: NoiseProfile, rnd: () => number): RawWord[] {
  const out: RawWord[] = [];
  for (const w of truth.words) {
    const roll = rnd();
    const drift = (w.startMs / 1000) * profile.driftMsPerSecond;
    const jitter = profile.jitterMs ? (rnd() * 2 - 1) * profile.jitterMs : 0;
    const startMs = Math.max(0, Math.round(w.startMs + drift + jitter));
    const endMs = Math.max(startMs + 20, Math.round(w.endMs + drift + jitter));
    let text = w.text;
    if (profile.dropPunctuation) text = text.replace(/[.,!?;:]+$/u, '') || text;
    if (profile.wer > 0) {
      if (roll < profile.wer * 0.25) continue; // deletion
      if (roll < profile.wer * 0.75) text = mutateWord(text, rnd); // substitution
      else if (roll < profile.wer) {
        // insertion of a filler after this word
        const word: RawWord = { text, startMs, endMs, confidence: 0.6 };
        if (w.speaker) word.speaker = w.speaker;
        out.push(word);
        out.push({ text: rnd() < 0.5 ? 'um' : 'uh', startMs: endMs, endMs: endMs + 120, confidence: 0.4 });
        continue;
      }
    }
    const word: RawWord = { text, startMs, endMs, confidence: profile.wer > 0 ? 0.7 + rnd() * 0.3 : 0.99 };
    if (w.speaker) word.speaker = w.speaker;
    out.push(word);
  }
  return out;
}

/** Honest placeholder: one token per ~400 ms of detected speech; clearly synthetic. */
export function placeholderWords(input: TranscriptionInput): RawWord[] {
  const regions = input.speechRegions?.length
    ? input.speechRegions
    : [{ startMs: 0, endMs: Math.max(400, input.durationMs) }];
  const words: RawWord[] = [];
  let n = 0;
  for (const region of regions) {
    const slots = Math.max(1, Math.round((region.endMs - region.startMs) / 400));
    const slotMs = (region.endMs - region.startMs) / slots;
    for (let i = 0; i < slots; i += 1) {
      n += 1;
      const startMs = Math.round(region.startMs + i * slotMs);
      const endMs = Math.round(region.startMs + (i + 1) * slotMs);
      words.push({ text: `mock${n}`, startMs, endMs: Math.max(endMs, startMs + 40), confidence: 0.5 });
    }
  }
  return words;
}
