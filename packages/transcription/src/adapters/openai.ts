import type { RawWord } from '@clipsubtitles/core';
import { alignTextToTimedWords } from '../align';
import {
  ProviderError,
  throwIfAborted,
  type ProviderCapabilities,
  type TranscriptionInput,
  type TranscriptionProvider,
  type TranscriptionResult,
} from '../provider';
import { audioFormData, providerFetchJson, secondsToMs, type FetchLike } from './http';

interface WhisperWord {
  word?: string;
  start?: number;
  end?: number;
}

interface WhisperVerboseResponse {
  language?: string;
  text?: string;
  words?: WhisperWord[];
}

interface TranscribeJsonResponse {
  text?: string;
}

export interface OpenAIOptions {
  apiKey?: string;
  transcribeModel?: string;
  whisperModel?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  usdPerMinute?: number | null;
}

const OPENAI_CAPS: ProviderCapabilities = {
  wordTimestamps: true,
  speakerLabels: false,
  languageDetection: true,
  vocabularyBiasing: true,
  verbatim: false,
};

function baseOpts(id: string, signal: AbortSignal | undefined, fetchImpl: FetchLike | undefined) {
  return { providerId: id, timeoutMs: 300_000, ...(signal ? { signal } : {}), ...(fetchImpl ? { fetchImpl } : {}) };
}

/**
 * Whisper baseline via the OpenAI transcription endpoint (`whisper-1`) with
 * word-level timestamps. Config-gated; NOT exercised live in this repository.
 */
export class WhisperApiProvider implements TranscriptionProvider {
  readonly id = 'whisper';
  readonly displayName = 'Whisper (baseline)';
  readonly model: string;
  readonly capabilities = OPENAI_CAPS;
  readonly usdPerMinute: number | null;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike | undefined;

  constructor(opts: OpenAIOptions = {}) {
    this.apiKey = opts.apiKey;
    this.model = opts.whisperModel ?? 'whisper-1';
    this.baseUrl = opts.baseUrl ?? 'https://api.openai.com';
    this.fetchImpl = opts.fetchImpl;
    this.usdPerMinute = opts.usdPerMinute ?? null;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async transcribe(input: TranscriptionInput, signal?: AbortSignal): Promise<TranscriptionResult> {
    if (!this.apiKey) throw new ProviderError(this.id, 'NOT_CONFIGURED', 'OPENAI_API_KEY is not set.');
    throwIfAborted(this.id, signal);
    const started = Date.now();
    const res = await whisperVerbose(this.baseUrl, this.apiKey, this.model, input, this.id, signal, this.fetchImpl);
    const words: RawWord[] = (res.words ?? [])
      .filter((w) => typeof w.word === 'string' && w.word.trim())
      .map((w) => ({ text: (w.word ?? '').trim(), startMs: secondsToMs(w.start), endMs: secondsToMs(w.end) }));
    const result: TranscriptionResult = {
      words,
      language: res.language ?? input.languageHint ?? 'und',
      provider: this.id,
      model: this.model,
      latencyMs: Date.now() - started,
    };
    if (this.usdPerMinute !== null) result.estimatedUsd = (input.durationMs / 60_000) * this.usdPerMinute;
    return result;
  }
}

async function whisperVerbose(
  baseUrl: string,
  apiKey: string,
  model: string,
  input: TranscriptionInput,
  providerId: string,
  signal: AbortSignal | undefined,
  fetchImpl: FetchLike | undefined,
): Promise<WhisperVerboseResponse> {
  const fields: Record<string, string> = {
    model,
    response_format: 'verbose_json',
    'timestamp_granularities[]': 'word',
  };
  if (input.languageHint) fields.language = input.languageHint.split('-')[0] ?? input.languageHint;
  if (input.vocabulary?.length) fields.prompt = input.vocabulary.join(', ');
  const form = await audioFormData(input.audioPath, 'file', fields);
  return providerFetchJson<WhisperVerboseResponse>(
    `${baseUrl}/v1/audio/transcriptions`,
    { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form },
    baseOpts(providerId, signal, fetchImpl),
  );
}

/**
 * "GPT Transcribe + alignment": transcript text from a gpt-*-transcribe model
 * (no word timestamps) aligned onto whisper-1 word timings by token alignment.
 * A production deployment should swap the aligner for a forced aligner
 * (WhisperX/NeMo) — see PARKED_ACTIONS.md. Config-gated; NOT exercised live.
 */
export class GptTranscribeAlignedProvider implements TranscriptionProvider {
  readonly id = 'gpt-transcribe';
  readonly displayName = 'GPT Transcribe + alignment';
  readonly model: string;
  readonly capabilities = OPENAI_CAPS;
  readonly usdPerMinute: number | null;
  private readonly apiKey: string | undefined;
  private readonly whisperModel: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike | undefined;

  constructor(opts: OpenAIOptions = {}) {
    this.apiKey = opts.apiKey;
    this.model = opts.transcribeModel ?? 'gpt-4o-transcribe';
    this.whisperModel = opts.whisperModel ?? 'whisper-1';
    this.baseUrl = opts.baseUrl ?? 'https://api.openai.com';
    this.fetchImpl = opts.fetchImpl;
    this.usdPerMinute = opts.usdPerMinute ?? null;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async transcribe(input: TranscriptionInput, signal?: AbortSignal): Promise<TranscriptionResult> {
    if (!this.apiKey) throw new ProviderError(this.id, 'NOT_CONFIGURED', 'OPENAI_API_KEY is not set.');
    throwIfAborted(this.id, signal);
    const started = Date.now();
    const fields: Record<string, string> = { model: this.model, response_format: 'json' };
    if (input.languageHint) fields.language = input.languageHint.split('-')[0] ?? input.languageHint;
    if (input.vocabulary?.length) fields.prompt = input.vocabulary.join(', ');
    const form = await audioFormData(input.audioPath, 'file', fields);
    const [textRes, timed] = await Promise.all([
      providerFetchJson<TranscribeJsonResponse>(
        `${this.baseUrl}/v1/audio/transcriptions`,
        { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}` }, body: form },
        baseOpts(this.id, signal, this.fetchImpl),
      ),
      whisperVerbose(this.baseUrl, this.apiKey, this.whisperModel, input, this.id, signal, this.fetchImpl),
    ]);
    if (typeof textRes.text !== 'string') throw new ProviderError(this.id, 'INVALID_RESPONSE', 'Missing text.');
    const anchors = (timed.words ?? [])
      .filter((w) => typeof w.word === 'string' && w.word.trim())
      .map((w) => ({ text: (w.word ?? '').trim(), startMs: secondsToMs(w.start), endMs: secondsToMs(w.end) }));
    const aligned = alignTextToTimedWords(textRes.text, anchors, input.durationMs);
    const result: TranscriptionResult = {
      words: aligned.map((t) => ({ text: t.text, startMs: t.startMs, endMs: t.endMs })),
      language: timed.language ?? input.languageHint ?? 'und',
      provider: this.id,
      model: `${this.model}+${this.whisperModel}`,
      latencyMs: Date.now() - started,
    };
    if (this.usdPerMinute !== null) result.estimatedUsd = (input.durationMs / 60_000) * this.usdPerMinute;
    return result;
  }
}
