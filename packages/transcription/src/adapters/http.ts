import { readFile } from 'node:fs/promises';
import { ProviderError } from '../provider';

export type FetchLike = typeof fetch;

export interface HttpOptions {
  providerId: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
}

/**
 * Bounded HTTP helper for live adapters. Maps transport/HTTP failures to
 * ProviderError codes WITHOUT carrying provider response bodies into messages
 * (those may contain user audio text or provider internals).
 */
export async function providerFetchJson<T>(url: string, init: RequestInit, opts: HttpOptions): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, signal: controller.signal });
    } catch {
      if (opts.signal?.aborted) throw new ProviderError(opts.providerId, 'CANCELLED', 'Cancelled.');
      throw new ProviderError(opts.providerId, controller.signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE', 'Provider request failed.', true);
    }
    if (res.status === 429) throw new ProviderError(opts.providerId, 'RATE_LIMITED', 'Provider rate limited.', true);
    if (res.status >= 500) throw new ProviderError(opts.providerId, 'UNAVAILABLE', `Provider returned ${res.status}.`, true);
    if (res.status >= 400) throw new ProviderError(opts.providerId, 'UNAVAILABLE', `Provider rejected the request (${res.status}).`, false);
    try {
      return (await res.json()) as T;
    } catch {
      throw new ProviderError(opts.providerId, 'INVALID_RESPONSE', 'Provider returned a non-JSON response.', false);
    }
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

export async function audioFormData(audioPath: string, fieldName: string, extra: Record<string, string>): Promise<FormData> {
  const bytes = await readFile(audioPath);
  const form = new FormData();
  form.append(fieldName, new Blob([bytes], { type: 'audio/wav' }), 'audio.wav');
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
}

export function secondsToMs(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
}
