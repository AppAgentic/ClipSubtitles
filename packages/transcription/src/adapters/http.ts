import { readFile } from 'node:fs/promises';
import { ProviderError, type ProviderDiagnostic } from '../provider';

export type FetchLike = typeof fetch;

export interface HttpOptions {
  providerId: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
  /** Parse only allowlisted error codes and request IDs; never retain the response message/body. */
  captureErrorDiagnostic?: boolean;
}

const SAFE_DIAGNOSTIC_VALUE = /^[A-Za-z0-9._:/-]{1,160}$/;

function safeDiagnosticValue(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_DIAGNOSTIC_VALUE.test(value) ? value : undefined;
}

async function readErrorDiagnostic(res: Response): Promise<ProviderDiagnostic> {
  const diagnostic: ProviderDiagnostic = { httpStatus: res.status };
  const requestId =
    res.headers.get('x-request-id') ??
    res.headers.get('request-id') ??
    res.headers.get('x-elevenlabs-request-id');
  const traceId = res.headers.get('x-trace-id') ?? res.headers.get('trace-id');
  const safeRequestId = safeDiagnosticValue(requestId);
  const safeTraceId = safeDiagnosticValue(traceId);
  if (safeRequestId) diagnostic.requestId = safeRequestId;
  if (safeTraceId) diagnostic.traceId = safeTraceId;

  try {
    // Error payloads are expected to be tiny. Bound parsing so a provider can
    // never make diagnostics retain an unbounded body.
    const raw = (await res.text()).slice(0, 16_384);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const detail =
      parsed.detail && typeof parsed.detail === 'object' && !Array.isArray(parsed.detail)
        ? (parsed.detail as Record<string, unknown>)
        : undefined;
    const errorType = safeDiagnosticValue(detail?.type ?? parsed.type);
    // ElevenLabs uses `status` for some account-policy errors and `code` for others.
    const errorCode = safeDiagnosticValue(detail?.code ?? detail?.status ?? parsed.code);
    if (errorType) diagnostic.providerErrorType = errorType;
    if (errorCode) diagnostic.providerErrorCode = errorCode;
  } catch {
    // A missing/non-JSON error body is not itself diagnostic.
  }
  return diagnostic;
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
    const diagnostic =
      res.status >= 400 && opts.captureErrorDiagnostic
        ? await readErrorDiagnostic(res)
        : undefined;
    if (res.status === 429) throw new ProviderError(opts.providerId, 'RATE_LIMITED', 'Provider rate limited.', true, diagnostic);
    if (res.status >= 500) throw new ProviderError(opts.providerId, 'UNAVAILABLE', `Provider returned ${res.status}.`, true, diagnostic);
    if (res.status >= 400) throw new ProviderError(opts.providerId, 'UNAVAILABLE', `Provider rejected the request (${res.status}).`, false, diagnostic);
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
