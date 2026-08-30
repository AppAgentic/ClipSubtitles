import { describe, expect, it } from 'vitest';
import { transcribeWithFallback } from './orchestrator';
import { ProviderError } from './provider';
import { ScriptedProvider } from './scripted';

const input = { audioPath: '/x.wav', durationMs: 1000, sampleRate: 16_000 };
const words = [{ text: 'hello', startMs: 0, endMs: 300 }];

describe('transcribeWithFallback', () => {
  it('uses the first configured provider and records skipped ones', async () => {
    const unconfigured = new ScriptedProvider('a', [], { configured: false });
    const ok = new ScriptedProvider('b', [{ kind: 'result', result: { words, language: 'en', latencyMs: 5 } }]);
    const out = await transcribeWithFallback([unconfigured, ok], input);
    expect(out.providerId).toBe('b');
    expect(out.fallbackFrom).toBeUndefined();
    expect(out.attempts.map((a) => a.outcome)).toEqual(['skipped_unconfigured', 'succeeded']);
    expect(unconfigured.calls).toHaveLength(0);
  });

  it('falls back only when the primary fails and never alters the fallback result', async () => {
    const primary = new ScriptedProvider('a', [{ kind: 'error', error: new ProviderError('a', 'UNAVAILABLE', 'down', true) }]);
    const fallback = new ScriptedProvider('b', [{ kind: 'result', result: { words, language: 'en', latencyMs: 5 } }]);
    const out = await transcribeWithFallback([primary, fallback], input);
    expect(out.providerId).toBe('b');
    expect(out.fallbackFrom).toBe('a');
    expect(out.result.words).toEqual(words);
    expect(out.attempts[0]).toMatchObject({
      providerId: 'a',
      outcome: 'failed',
      errorCode: 'UNAVAILABLE',
      errorMessage: 'down',
    });
  });

  it('does not fall back after a success (a later provider is never consulted)', async () => {
    const primary = new ScriptedProvider('a', [{ kind: 'result', result: { words, language: 'en', latencyMs: 5 } }]);
    const other = new ScriptedProvider('b', [{ kind: 'result', result: { words: [], language: 'xx', latencyMs: 5 } }]);
    const out = await transcribeWithFallback([primary, other], input);
    expect(out.providerId).toBe('a');
    expect(other.calls).toHaveLength(0);
  });

  it('reports UNAVAILABLE when all configured providers fail and NOT_CONFIGURED when none are', async () => {
    const a = new ScriptedProvider('a', [{ kind: 'error', error: new ProviderError('a', 'TIMEOUT', 't', true) }]);
    const b = new ScriptedProvider('b', [{ kind: 'error', error: new ProviderError('b', 'INVALID_RESPONSE', 'bad') }]);
    await expect(transcribeWithFallback([a, b], input)).rejects.toMatchObject({ code: 'UNAVAILABLE', retryable: true });
    const none = new ScriptedProvider('c', [], { configured: false });
    await expect(transcribeWithFallback([none], input)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('does not retry an exhausted chain when every provider rejection is permanent', async () => {
    const rejected = new ScriptedProvider('a', [
      { kind: 'error', error: new ProviderError('a', 'UNAVAILABLE', 'Provider rejected the request (401).', false) },
    ]);
    await expect(transcribeWithFallback([rejected], input)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      retryable: false,
    });
  });

  it('propagates allowlisted provider diagnostics to attempts and the terminal error', async () => {
    const diagnostic = {
      httpStatus: 401,
      providerErrorCode: 'detected_unusual_activity',
      requestId: 'req_123',
    };
    const rejected = new ScriptedProvider('elevenlabs', [
      {
        kind: 'error',
        error: new ProviderError(
          'elevenlabs',
          'UNAVAILABLE',
          'Provider rejected the request (401).',
          false,
          diagnostic,
        ),
      },
    ]);
    const attempts: unknown[] = [];

    await expect(
      transcribeWithFallback([rejected], input, { onAttempt: (attempt) => attempts.push(attempt) }),
    ).rejects.toMatchObject({ diagnostic });
    expect(attempts).toEqual([
      expect.objectContaining({ providerId: 'elevenlabs', diagnostic }),
    ]);
  });

  it('propagates cancellation immediately without trying the next provider', async () => {
    const a = new ScriptedProvider('a', [{ kind: 'error', error: new ProviderError('a', 'CANCELLED', 'c') }]);
    const b = new ScriptedProvider('b', [{ kind: 'result', result: { words, language: 'en', latencyMs: 5 } }]);
    await expect(transcribeWithFallback([a, b], input)).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(b.calls).toHaveLength(0);
  });
});
