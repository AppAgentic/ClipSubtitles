import { stat } from 'node:fs/promises';
import { z } from 'zod';
import {
  ProviderError,
  throwIfAborted,
  type ProviderCapabilities,
  type TranscriptionInput,
  type TranscriptionProvider,
  type TranscriptionResult,
} from '../provider';
import { audioFormData, providerFetchJson, type FetchLike } from './http';

const responseSchema = z.object({
  language: z.string().trim().min(1),
  words: z.array(
    z
      .object({
        word: z.string().trim().min(1),
        start: z.number().finite().nonnegative(),
        end: z.number().finite().nonnegative(),
      })
      .refine((word) => word.end >= word.start),
  ),
});

// Explicit ISO-639-1 codes supported by the documented Whisper language list.
const languageCodes =
  'af ar hy az be bs bg ca zh hr cs da nl en et fi fr gl de el he hi hu is id it ja kn kk ko lv lt mk ms mr mi ne no fa pl pt ro ru sr sk sl es sw sv tl ta th tr uk ur vi cy'.split(
    ' ',
  );
const englishNames = new Intl.DisplayNames(['en'], { type: 'language' });
function normalizeLanguage(value: string): string {
  const normalized = value.trim().toLowerCase();
  return (
    languageCodes.find(
      (code) => code === normalized || englishNames.of(code)?.toLowerCase() === normalized,
    ) ?? 'und'
  );
}

export interface OpenAIWhisperOptions {
  apiKey?: string;
  /** Only whisper-1 supports this adapter's word timestamp contract. */
  model?: string;
  fetchImpl?: FetchLike;
}

/** Opt-in only. No speaker labels, vocabulary hints, or streaming progress. */
export class OpenAIWhisperProvider implements TranscriptionProvider {
  readonly id = 'openai-whisper';
  readonly displayName = 'OpenAI Whisper';
  readonly model = 'whisper-1';
  readonly usdPerMinute = 0.006;
  readonly capabilities: ProviderCapabilities = {
    wordTimestamps: true,
    speakerLabels: false,
    languageDetection: true,
    vocabularyBiasing: false,
    verbatim: false,
  };
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: FetchLike | undefined;

  constructor(opts: OpenAIWhisperOptions = {}) {
    if (opts.model?.trim() && opts.model.trim() !== this.model) {
      throw new ProviderError(this.id, 'UNSUPPORTED', 'Only whisper-1 is supported.');
    }
    this.apiKey = opts.apiKey?.trim() || undefined;
    this.fetchImpl = opts.fetchImpl;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async transcribe(input: TranscriptionInput, signal?: AbortSignal): Promise<TranscriptionResult> {
    if (!this.apiKey)
      throw new ProviderError(this.id, 'NOT_CONFIGURED', 'OPENAI_API_KEY is not set.');
    throwIfAborted(this.id, signal);
    // Enforce before reading/uploading; current ten-minute PCM16 input is ~19.2 MB.
    if ((await stat(input.audioPath)).size > 25_000_000) {
      throw new ProviderError(
        this.id,
        'UNSUPPORTED',
        'Whisper audio exceeds the 25 MB upload limit.',
      );
    }
    if (!Number.isFinite(input.durationMs) || input.durationMs <= 0) {
      throw new ProviderError(
        this.id,
        'UNSUPPORTED',
        'Whisper requires a finite positive duration.',
      );
    }
    const fields: Record<string, string> = {
      model: this.model,
      response_format: 'verbose_json',
      'timestamp_granularities[]': 'word',
    };
    if (input.languageHint) {
      const primary = input.languageHint.split(/[-_]/)[0]?.toLowerCase();
      if (!primary || !/^[a-z]{2}$/.test(primary)) {
        throw new ProviderError(
          this.id,
          'UNSUPPORTED',
          'Whisper requires an ISO-639-1 language hint.',
        );
      }
      fields.language = primary;
    }
    const body = await audioFormData(input.audioPath, 'file', fields);
    if ((body.get('file') as Blob).size > 25_000_000) {
      throw new ProviderError(
        this.id,
        'UNSUPPORTED',
        'Whisper audio exceeds the 25 MB upload limit.',
      );
    }
    throwIfAborted(this.id, signal);
    const started = Date.now();
    const raw = await providerFetchJson<unknown>(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body,
      },
      {
        providerId: this.id,
        timeoutMs: 300_000,
        ...(signal ? { signal } : {}),
        ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
      },
    );
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success) {
      // Never include schema issues or provider payloads: they can contain user speech.
      throw new ProviderError(
        this.id,
        'INVALID_RESPONSE',
        'Invalid Whisper word-timestamp response.',
      );
    }
    return {
      words: parsed.data.words.map((word) => ({
        text: word.word,
        startMs: Math.min(input.durationMs, Math.round(word.start * 1000)),
        endMs: Math.min(input.durationMs, Math.round(word.end * 1000)),
      })),
      language: normalizeLanguage(parsed.data.language),
      provider: this.id,
      model: this.model,
      latencyMs: Date.now() - started,
      estimatedUsd: (input.durationMs / 60_000) * this.usdPerMinute,
    };
  }
}
