import { mkdtemp, rm, writeFile, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAIWhisperProvider } from './openai-whisper';
import { createProviderRegistry } from '../registry';

describe('OpenAIWhisperProvider', () => {
  let scratch: string;
  let audioPath: string;
  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'whisper-test-'));
    audioPath = join(scratch, 'audio.wav');
    await writeFile(audioPath, Buffer.alloc(64));
  });
  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });
  const response = (language = 'spanish') => ({
    language,
    words: [{ word: 'Hola', start: 0.123, end: 1.2 }],
  });
  const input = () => ({ audioPath, durationMs: 1000, sampleRate: 16000 });

  it('uses transcription word timestamps, preserves auto language, clips timings without inventing confidence', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(response())));
    const result = await new OpenAIWhisperProvider({ apiKey: 'test-key', fetchImpl }).transcribe(
      input(),
    );
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    const form = init?.body as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('timestamp_granularities[]')).toBe('word');
    expect(form.has('language')).toBe(false);
    expect(form.get('file')).toBeInstanceOf(Blob);
    expect(result.language).toBe('es');
    expect(result.words).toEqual([{ text: 'Hola', startMs: 123, endMs: 1000 }]);
    expect(result.estimatedUsd).toBeCloseTo(0.0001);
  });

  it.each([
    ['french', 'fr'],
    ['ja', 'ja'],
    ['made-up language', 'und'],
  ])('normalizes known language %s only', async (language, expected) => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(response(language))),
    );
    const result = await new OpenAIWhisperProvider({ apiKey: 'test-key', fetchImpl }).transcribe({
      ...input(),
      languageHint: 'fr-CA',
    });
    expect((fetchImpl.mock.calls[0]![1]?.body as FormData).get('language')).toBe('fr');
    expect(result.language).toBe(expected);
  });

  it.each([
    {},
    { language: 'en', words: [{ word: 'secret transcript', start: -1, end: 2 }] },
    { language: 'en', words: [{ word: 'x', start: 2, end: 1 }] },
  ])('rejects malformed words without payload leakage', async (payload) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload)));
    await expect(
      new OpenAIWhisperProvider({ apiKey: 'test-key', fetchImpl }).transcribe(input()),
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      message: 'Invalid Whisper word-timestamp response.',
    });
  });

  it('rejects oversize files before any provider request', async () => {
    await truncate(audioPath, 25_000_001);
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      new OpenAIWhisperProvider({ apiKey: 'test-key', fetchImpl }).transcribe(input()),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('propagates in-flight cancellation', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
          controller.abort();
        }),
    );
    await expect(
      new OpenAIWhisperProvider({ apiKey: 'test-key', fetchImpl }).transcribe(
        input(),
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('redacts upstream error details and keeps 429 retryable', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response('secret transcript and key', { status: 429 }),
    );
    await expect(
      new OpenAIWhisperProvider({ apiKey: 'test-key', fetchImpl }).transcribe(input()),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', retryable: true });
  });

  it('keeps the default chain unchanged and requires explicit provider selection plus key', () => {
    expect(createProviderRegistry({}).chain.map((p) => p.id)).toEqual(['mock']);
    expect(
      createProviderRegistry({ TRANSCRIPTION_PROVIDERS: 'elevenlabs,gemini' }).chain.map(
        (p) => p.id,
      ),
    ).toEqual(['elevenlabs', 'gemini']);
    expect(new OpenAIWhisperProvider().isConfigured()).toBe(false);
    expect(() => new OpenAIWhisperProvider({ model: 'gpt-4o-transcribe' })).toThrow(
      'Only whisper-1',
    );
    expect(
      createProviderRegistry({
        TRANSCRIPTION_PROVIDERS: 'openai-whisper',
        OPENAI_API_KEY: 'test-key',
      }).chain[0]?.isConfigured(),
    ).toBe(true);
  });
});
