import { stat } from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';
import type { RawWord } from '@clipsubtitles/core';
import {
  ProviderError,
  throwIfAborted,
  type ProviderCapabilities,
  type TranscriptionInput,
  type TranscriptionProvider,
  type TranscriptionResult,
} from '../provider';

export interface GeminiOptions {
  apiKey?: string;
  /** Dedicated prerecorded transcription model. Defaults to Gemini 3.5 Transcribe. */
  model?: string;
  baseUrl?: string;
  usdPerMinute?: number | null;
  /** Local safety cap before uploading audio through the Gemini Files API. */
  maxUploadBytes?: number;
}

interface WordInfoAnnotation {
  type: 'word_info';
  text?: string;
  start_offset?: string;
  end_offset?: string;
  speaker?: string;
}

interface InteractionContent {
  annotations?: unknown[];
}

interface InteractionStep {
  content?: InteractionContent[];
}

interface InteractionResponse {
  steps?: InteractionStep[];
}

function isWordInfo(value: unknown): value is WordInfoAnnotation {
  return Boolean(
    value && typeof value === 'object' && (value as { type?: unknown }).type === 'word_info',
  );
}

function offsetToMs(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(value.trim());
  return match ? Math.round(Number(match[1]) * 1_000) : 0;
}

function mapProviderError(error: unknown, providerId: string, signal?: AbortSignal): ProviderError {
  if (error instanceof ProviderError) return error;
  if (signal?.aborted) return new ProviderError(providerId, 'CANCELLED', 'Cancelled.');
  const status = Number((error as { status?: unknown } | null)?.status);
  if (status === 429)
    return new ProviderError(providerId, 'RATE_LIMITED', 'Provider rate limited.', true);
  if (status >= 500)
    return new ProviderError(providerId, 'UNAVAILABLE', `Provider returned ${status}.`, true);
  if (status >= 400)
    return new ProviderError(
      providerId,
      'UNAVAILABLE',
      `Provider rejected the request (${status}).`,
    );
  return new ProviderError(providerId, 'UNAVAILABLE', 'Provider request failed.', true);
}

/**
 * Gemini's dedicated prerecorded speech-to-text adapter. Audio is uploaded via
 * the Files API and transcribed by `gemini-3.5-transcribe` through the
 * Interactions API in verbatim mode with provider-native word annotations.
 */
export class GeminiTranscribeProvider implements TranscriptionProvider {
  readonly id = 'gemini';
  readonly displayName = 'Gemini 3.5 Transcribe';
  readonly model: string;
  readonly capabilities: ProviderCapabilities = {
    wordTimestamps: true,
    speakerLabels: true,
    languageDetection: true,
    // The public-preview API currently rejects custom_vocabulary when word
    // timestamps are enabled, despite the documentation showing both fields.
    vocabularyBiasing: false,
    verbatim: true,
  };
  readonly usdPerMinute: number | null;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string | undefined;
  private readonly maxUploadBytes: number;

  constructor(opts: GeminiOptions = {}) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'gemini-3.5-transcribe';
    this.baseUrl = opts.baseUrl;
    this.usdPerMinute = opts.usdPerMinute ?? null;
    this.maxUploadBytes = opts.maxUploadBytes ?? 250 * 1024 * 1024;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.model);
  }

  async transcribe(input: TranscriptionInput, signal?: AbortSignal): Promise<TranscriptionResult> {
    if (!this.apiKey || !this.model) {
      throw new ProviderError(
        this.id,
        'NOT_CONFIGURED',
        'GEMINI_API_KEY / GEMINI_TRANSCRIBE_MODEL are not set.',
      );
    }
    throwIfAborted(this.id, signal);
    const started = Date.now();
    const metadata = await stat(input.audioPath);
    if (metadata.size > this.maxUploadBytes) {
      throw new ProviderError(
        this.id,
        'UNSUPPORTED',
        'Audio exceeds the configured Gemini upload limit.',
      );
    }

    const ai = new GoogleGenAI({
      apiKey: this.apiKey,
      apiVersion: 'v1beta',
      ...(this.baseUrl ? { httpOptions: { baseUrl: this.baseUrl } } : {}),
    });
    let uploadedName: string | undefined;
    try {
      const uploaded = await ai.files.upload({
        file: input.audioPath,
        config: { mimeType: 'audio/wav', ...(signal ? { abortSignal: signal } : {}) },
      });
      uploadedName = uploaded.name;
      if (!uploaded.uri)
        throw new ProviderError(
          this.id,
          'INVALID_RESPONSE',
          'Gemini upload did not return a file URI.',
        );
      throwIfAborted(this.id, signal);

      const response = (await ai.interactions.create(
        {
          model: this.model,
          input: [
            { type: 'audio', uri: uploaded.uri, mime_type: uploaded.mimeType ?? 'audio/wav' },
          ],
          generation_config: {
            transcription_config: {
              ...(input.languageHint ? { language_codes: [input.languageHint] } : {}),
              mode: {
                type: 'verbatim',
                diarization_mode: 'speaker',
                timestamp_granularities: ['word'],
              },
            },
          },
        },
        { timeout: 300_000, ...(signal ? { signal } : {}) },
      )) as InteractionResponse;

      const annotations = (response.steps ?? [])
        .flatMap((step) => step.content ?? [])
        .flatMap((content) => content.annotations ?? [])
        .filter(isWordInfo);
      const words: RawWord[] = annotations.flatMap((annotation) => {
        const text = annotation.text?.trim();
        if (!text) return [];
        const startMs = offsetToMs(annotation.start_offset);
        const endMs = offsetToMs(annotation.end_offset);
        if (endMs <= startMs) return [];
        const word: RawWord = { text, startMs, endMs };
        if (annotation.speaker) word.speaker = annotation.speaker;
        return [word];
      });
      if (!words.length)
        throw new ProviderError(
          this.id,
          'INVALID_RESPONSE',
          'Gemini returned no word annotations.',
        );

      const result: TranscriptionResult = {
        words,
        language: input.languageHint ?? 'und',
        provider: this.id,
        model: this.model,
        latencyMs: Date.now() - started,
      };
      if (this.usdPerMinute !== null)
        result.estimatedUsd = (input.durationMs / 60_000) * this.usdPerMinute;
      return result;
    } catch (error) {
      throw mapProviderError(error, this.id, signal);
    } finally {
      if (uploadedName) {
        try {
          await ai.files.delete({
            name: uploadedName,
            ...(signal ? { config: { abortSignal: signal } } : {}),
          });
        } catch {
          // Cleanup is best-effort; the provider's own file retention still applies.
        }
      }
    }
  }
}
