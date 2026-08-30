import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  constructor: vi.fn(),
  upload: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    files = { upload: sdk.upload, delete: sdk.delete };
    interactions = { create: sdk.create };

    constructor(options: unknown) {
      sdk.constructor(options);
    }
  },
}));

import { GeminiTranscribeProvider } from './gemini';

describe('GeminiTranscribeProvider', () => {
  let scratch: string | undefined;

  afterEach(async () => {
    vi.clearAllMocks();
    if (scratch) await rm(scratch, { recursive: true, force: true });
    scratch = undefined;
  });

  it('uses the dedicated Interactions API with verbatim timestamps and deletes the upload', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'clipsubtitles-gemini-'));
    const audioPath = join(scratch, 'audio.wav');
    await writeFile(audioPath, Buffer.alloc(64));
    sdk.upload.mockResolvedValue({
      name: 'files/test',
      uri: 'https://files.test/audio',
      mimeType: 'audio/wav',
    });
    sdk.create.mockResolvedValue({
      steps: [
        {
          content: [
            {
              annotations: [
                {
                  type: 'word_info',
                  text: 'Hello',
                  start_offset: '0.100s',
                  end_offset: '0.450s',
                  speaker: 'spk:0',
                },
                {
                  type: 'word_info',
                  text: 'world',
                  start_offset: '0.500s',
                  end_offset: '0.850s',
                  speaker: 'spk:0',
                },
              ],
            },
          ],
        },
      ],
    });
    sdk.delete.mockResolvedValue({});

    const provider = new GeminiTranscribeProvider({ apiKey: 'test-key' });
    const result = await provider.transcribe({
      audioPath,
      durationMs: 1_000,
      sampleRate: 16_000,
      languageHint: 'en-GB',
      vocabulary: ['ClipSubtitles'],
    });

    expect(result.model).toBe('gemini-3.5-transcribe');
    expect(result.words).toEqual([
      { text: 'Hello', startMs: 100, endMs: 450, speaker: 'spk:0' },
      { text: 'world', startMs: 500, endMs: 850, speaker: 'spk:0' },
    ]);
    expect(sdk.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3.5-transcribe',
        input: [{ type: 'audio', uri: 'https://files.test/audio', mime_type: 'audio/wav' }],
        generation_config: {
          transcription_config: {
            language_codes: ['en-GB'],
            mode: {
              type: 'verbatim',
              diarization_mode: 'speaker',
              timestamp_granularities: ['word'],
            },
          },
        },
      }),
      expect.objectContaining({ timeout: 300_000 }),
    );
    // The preview service rejects custom_vocabulary together with word timestamps.
    expect(
      sdk.create.mock.calls[0]?.[0]?.generation_config?.transcription_config,
    ).not.toHaveProperty('custom_vocabulary');
    expect(sdk.delete).toHaveBeenCalledWith({ name: 'files/test' });
  });
});
