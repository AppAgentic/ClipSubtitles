import type { RawWord } from '@clipsubtitles/core';
import {
  ProviderError,
  throwIfAborted,
  type ProviderCapabilities,
  type TranscriptionInput,
  type TranscriptionProvider,
  type TranscriptionResult,
} from '../provider';
import { audioFormData, providerFetchJson, secondsToMs, type FetchLike } from './http';

interface ScribeWord {
  text?: string;
  start?: number;
  end?: number;
  type?: string;
  speaker_id?: string;
}

interface ScribeResponse {
  language_code?: string;
  words?: ScribeWord[];
}

export interface ElevenLabsOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  usdPerMinute?: number | null;
  captureErrorDiagnostic?: boolean;
}

/**
 * Direct ElevenLabs Scribe adapter (config-gated). The model was selected by a
 * bounded live product-clip benchmark through ElevenLabs' official fal partner
 * route. This direct API mapping has not yet had its staging smoke; production
 * credential binding remains an external gate — see PARKED_ACTIONS.md.
 */
export class ElevenLabsScribeProvider implements TranscriptionProvider {
  readonly id = 'elevenlabs';
  readonly displayName = 'ElevenLabs Scribe';
  readonly model: string;
  readonly capabilities: ProviderCapabilities = {
    wordTimestamps: true,
    speakerLabels: true,
    languageDetection: true,
    vocabularyBiasing: false,
    verbatim: true,
  };
  readonly usdPerMinute: number | null;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike | undefined;
  private readonly captureErrorDiagnostic: boolean;

  constructor(opts: ElevenLabsOptions = {}) {
    this.apiKey = opts.apiKey?.trim() || undefined;
    this.model = opts.model?.trim() || 'scribe_v2';
    this.baseUrl = opts.baseUrl ?? 'https://api.elevenlabs.io';
    this.fetchImpl = opts.fetchImpl;
    this.captureErrorDiagnostic = opts.captureErrorDiagnostic ?? false;
    this.usdPerMinute = opts.usdPerMinute ?? null;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async transcribe(input: TranscriptionInput, signal?: AbortSignal): Promise<TranscriptionResult> {
    if (!this.apiKey) throw new ProviderError(this.id, 'NOT_CONFIGURED', 'ELEVENLABS_API_KEY is not set.');
    throwIfAborted(this.id, signal);
    const started = Date.now();
    const fields: Record<string, string> = {
      model_id: this.model,
      timestamps_granularity: 'word',
      diarize: 'true',
      tag_audio_events: 'false',
    };
    if (input.languageHint) {
      // Scribe accepts ISO-639 language codes, while our public contract accepts
      // BCP-47 tags. Keep only the primary subtag (for example en-GB -> en).
      const [primaryLanguage] = input.languageHint.split(/[-_]/, 1);
      if (primaryLanguage) fields.language_code = primaryLanguage.toLowerCase();
    }
    const form = await audioFormData(input.audioPath, 'file', fields);
    const httpOpts = {
      providerId: this.id,
      timeoutMs: 300_000,
      captureErrorDiagnostic: this.captureErrorDiagnostic,
      ...(signal ? { signal } : {}),
      ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
    };
    const res = await providerFetchJson<ScribeResponse>(
      `${this.baseUrl}/v1/speech-to-text`,
      { method: 'POST', headers: { 'xi-api-key': this.apiKey }, body: form },
      httpOpts,
    );
    if (!Array.isArray(res.words)) throw new ProviderError(this.id, 'INVALID_RESPONSE', 'Missing words.');
    const words: RawWord[] = [];
    for (const w of res.words) {
      if (w.type && w.type !== 'word') continue;
      if (!w.text) continue;
      const word: RawWord = { text: w.text, startMs: secondsToMs(w.start), endMs: secondsToMs(w.end) };
      if (w.speaker_id) word.speaker = w.speaker_id;
      words.push(word);
    }
    const result: TranscriptionResult = {
      words,
      language: res.language_code ?? input.languageHint ?? 'und',
      provider: this.id,
      model: this.model,
      latencyMs: Date.now() - started,
    };
    if (this.usdPerMinute !== null) result.estimatedUsd = (input.durationMs / 60_000) * this.usdPerMinute;
    return result;
  }
}
