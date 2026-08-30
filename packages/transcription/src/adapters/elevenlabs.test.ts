import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsScribeProvider } from './elevenlabs';

describe('ElevenLabsScribeProvider', () => {
  let scratch: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (scratch) await rm(scratch, { recursive: true, force: true });
    scratch = undefined;
  });

  it('calls the direct Scribe API, normalizes BCP-47 language tags, and maps word timings', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'clipsubtitles-elevenlabs-'));
    const audioPath = join(scratch, 'audio.wav');
    await writeFile(audioPath, Buffer.alloc(64));

    let requestInput: Parameters<typeof fetch>[0] | undefined;
    let requestInit: RequestInit | undefined;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      requestInput = input;
      requestInit = init;
      return new Response(
        JSON.stringify({
          language_code: 'en',
          words: [
            { type: 'word', text: 'Hello', start: 0.101, end: 0.455, speaker_id: 'speaker_0' },
            { type: 'spacing', text: ' ', start: 0.455, end: 0.46 },
            { type: 'word', text: 'world', start: 0.5, end: 0.875, speaker_id: 'speaker_0' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const provider = new ElevenLabsScribeProvider({
      apiKey: 'test-key',
      fetchImpl,
      usdPerMinute: 0.22 / 60,
    });
    const result = await provider.transcribe({
      audioPath,
      durationMs: 60_000,
      sampleRate: 16_000,
      languageHint: 'en-GB',
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(String(requestInput)).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect(requestInit?.method).toBe('POST');
    expect(new Headers(requestInit?.headers).get('xi-api-key')).toBe('test-key');
    const form = requestInit?.body as FormData;
    expect(form.get('model_id')).toBe('scribe_v2');
    expect(form.get('timestamps_granularity')).toBe('word');
    expect(form.get('diarize')).toBe('true');
    expect(form.get('tag_audio_events')).toBe('false');
    expect(form.get('language_code')).toBe('en');
    expect(form.get('file')).toBeInstanceOf(Blob);
    expect(result).toMatchObject({
      provider: 'elevenlabs',
      model: 'scribe_v2',
      language: 'en',
      estimatedUsd: 0.22 / 60,
      words: [
        { text: 'Hello', startMs: 101, endMs: 455, speaker: 'speaker_0' },
        { text: 'world', startMs: 500, endMs: 875, speaker: 'speaker_0' },
      ],
    });
  });
});
