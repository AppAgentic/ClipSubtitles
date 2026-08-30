import type { RawWord } from '@clipsubtitles/core';

export type { RawWord };

/** Input handed to every adapter: a mono 16 kHz PCM WAV plus hints. */
export interface TranscriptionInput {
  audioPath: string;
  durationMs: number;
  sampleRate: number;
  languageHint?: string;
  vocabulary?: readonly string[];
  /** Speech regions from VAD (adapters may chunk on them). */
  speechRegions?: readonly SpeechRegion[];
  /** Fixture identity for mock providers and benchmarks (never derived from user input). */
  fixtureId?: string;
}

export interface SpeechRegion {
  startMs: number;
  endMs: number;
}

export interface TranscriptionResult {
  words: RawWord[];
  language: string;
  provider: string;
  model: string;
  latencyMs: number;
  /** Provider-reported or estimated USD cost, when known. */
  estimatedUsd?: number;
}

export interface ProviderCapabilities {
  wordTimestamps: boolean;
  speakerLabels: boolean;
  languageDetection: boolean;
  vocabularyBiasing: boolean;
  verbatim: boolean;
}

export type ProviderErrorCode =
  | 'NOT_CONFIGURED'
  | 'UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'UNSUPPORTED';

/**
 * Strictly allowlisted provider error metadata for private diagnostics.
 * Never add response messages, bodies, credentials, or media-derived content.
 */
export interface ProviderDiagnostic {
  httpStatus?: number;
  providerErrorType?: string;
  providerErrorCode?: string;
  requestId?: string;
  traceId?: string;
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly providerId: string;
  readonly retryable: boolean;
  readonly diagnostic: ProviderDiagnostic | undefined;
  constructor(
    providerId: string,
    code: ProviderErrorCode,
    message: string,
    retryable = false,
    diagnostic?: ProviderDiagnostic,
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.providerId = providerId;
    this.retryable = retryable;
    this.diagnostic = diagnostic;
  }
}

export interface TranscriptionProvider {
  readonly id: string;
  readonly displayName: string;
  readonly model: string;
  readonly capabilities: ProviderCapabilities;
  /** Public list price, when known; null for mocks. */
  readonly usdPerMinute: number | null;
  /** True when credentials/config are present. Unconfigured providers are skipped, never guessed. */
  isConfigured(): boolean;
  transcribe(input: TranscriptionInput, signal?: AbortSignal): Promise<TranscriptionResult>;
}

export function throwIfAborted(providerId: string, signal?: AbortSignal): void {
  if (signal?.aborted) throw new ProviderError(providerId, 'CANCELLED', 'Transcription cancelled.', false);
}
