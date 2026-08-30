import type { ErrorCode, TaskError } from '@clipsubtitles/contracts';
import { ERROR_MESSAGES } from '@clipsubtitles/contracts';
import { RenderCancelledError, RenderFailedError } from '@clipsubtitles/render';
import { StorageError } from '@clipsubtitles/storage';
import { MediaToolError, ProviderError } from '@clipsubtitles/transcription';
import { ApiError } from '../errors';

/** Thrown by handlers to fail a task with a bounded public error. */
export class TaskFailure extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly internal: unknown;
  constructor(code: ErrorCode, message?: string, opts: { retryable?: boolean; internal?: unknown } = {}) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = 'TaskFailure';
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.internal = opts.internal;
  }
}

export class TaskCancelled extends Error {
  constructor() {
    super('Task cancelled');
    this.name = 'TaskCancelled';
  }
}

export function isCancellation(err: unknown): boolean {
  if (err instanceof TaskCancelled || err instanceof RenderCancelledError) return true;
  if (err instanceof ProviderError && err.code === 'CANCELLED') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (err instanceof MediaToolError && /cancelled/i.test(err.message)) return true;
  return false;
}

/** Map any handler failure to a bounded, redacted public TaskError. */
export function toTaskError(err: unknown): { error: TaskError; internal: unknown } {
  if (err instanceof TaskFailure) return { error: { code: err.code, message: err.message.slice(0, 300), retryable: err.retryable }, internal: err.internal ?? err };
  if (err instanceof ApiError) return { error: { code: err.code, message: err.message.slice(0, 300), retryable: false }, internal: err.internal ?? err };
  if (err instanceof ProviderError) {
    return { error: { code: 'PROVIDER_UNAVAILABLE', message: ERROR_MESSAGES.PROVIDER_UNAVAILABLE, retryable: err.retryable }, internal: err };
  }
  if (err instanceof RenderFailedError) return { error: { code: 'RENDER_FAILED', message: ERROR_MESSAGES.RENDER_FAILED, retryable: false }, internal: err.detail };
  if (err instanceof MediaToolError) return { error: { code: 'UNSUPPORTED_MEDIA', message: 'The media could not be processed.', retryable: false }, internal: err.stderrTail };
  if (err instanceof StorageError && err.code === 'VERSION_CONFLICT') {
    return { error: { code: 'VERSION_CONFLICT', message: ERROR_MESSAGES.VERSION_CONFLICT, retryable: true }, internal: err };
  }
  return { error: { code: 'INTERNAL', message: ERROR_MESSAGES.INTERNAL, retryable: false }, internal: err };
}
