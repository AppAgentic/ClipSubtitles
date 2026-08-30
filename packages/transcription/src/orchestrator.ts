import { ProviderError, type TranscriptionInput, type TranscriptionProvider, type TranscriptionResult } from './provider';

export interface FallbackAttempt {
  providerId: string;
  outcome: 'succeeded' | 'skipped_unconfigured' | 'failed';
  errorCode?: string;
  /** Sanitized adapter message (status class only; never response bodies or credentials). */
  errorMessage?: string;
  latencyMs: number;
}

export interface FallbackOutcome {
  result: TranscriptionResult;
  providerId: string;
  /** Provider that failed before this one produced the transcript, if any. */
  fallbackFrom?: string;
  attempts: FallbackAttempt[];
}

/**
 * Try providers in order. Fallback only happens when a provider fails BEFORE
 * producing a transcript; a successful result is returned untouched, so a
 * fallback can never silently replace or rewrite words.
 */
export async function transcribeWithFallback(
  providers: readonly TranscriptionProvider[],
  input: TranscriptionInput,
  opts: { signal?: AbortSignal; onAttempt?: (attempt: FallbackAttempt) => void; now?: () => number } = {},
): Promise<FallbackOutcome> {
  const now = opts.now ?? Date.now;
  const attempts: FallbackAttempt[] = [];
  let lastFailure: string | undefined;
  let lastError: ProviderError | undefined;
  let hasRetryableFailure = false;
  for (const provider of providers) {
    if (opts.signal?.aborted) throw new ProviderError(provider.id, 'CANCELLED', 'Transcription cancelled.');
    const started = now();
    if (!provider.isConfigured()) {
      const attempt: FallbackAttempt = { providerId: provider.id, outcome: 'skipped_unconfigured', latencyMs: 0 };
      attempts.push(attempt);
      opts.onAttempt?.(attempt);
      continue;
    }
    try {
      const result = await provider.transcribe(input, opts.signal);
      const attempt: FallbackAttempt = { providerId: provider.id, outcome: 'succeeded', latencyMs: now() - started };
      attempts.push(attempt);
      opts.onAttempt?.(attempt);
      const outcome: FallbackOutcome = { result, providerId: provider.id, attempts };
      if (lastFailure) outcome.fallbackFrom = lastFailure;
      return outcome;
    } catch (err) {
      const pe =
        err instanceof ProviderError
          ? err
          : new ProviderError(provider.id, 'UNAVAILABLE', 'Provider call failed.', true);
      if (pe.code === 'CANCELLED') throw pe;
      const attempt: FallbackAttempt = {
        providerId: provider.id,
        outcome: 'failed',
        errorCode: pe.code,
        errorMessage: pe.message,
        latencyMs: now() - started,
      };
      attempts.push(attempt);
      opts.onAttempt?.(attempt);
      lastFailure = provider.id;
      lastError = pe;
      hasRetryableFailure ||= pe.retryable;
    }
  }
  const anyConfigured = attempts.some((a) => a.outcome !== 'skipped_unconfigured');
  throw new ProviderError(
    lastError?.providerId ?? 'none',
    anyConfigured ? 'UNAVAILABLE' : 'NOT_CONFIGURED',
    anyConfigured ? 'All configured transcription providers failed.' : 'No transcription provider is configured.',
    anyConfigured && hasRetryableFailure,
  );
}
