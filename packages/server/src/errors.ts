import {
  ERROR_HTTP_STATUS,
  ERROR_MESSAGES,
  ERROR_RETRYABLE,
  type ApiError as ApiErrorBody,
  type ErrorCode,
  type ValidationIssue,
} from '@clipsubtitles/contracts';
import { PatchError } from '@clipsubtitles/core';
import { StorageError } from '@clipsubtitles/storage';
import { ProviderError } from '@clipsubtitles/transcription';
import { ZodError } from 'zod';

/**
 * Typed public error. `message` must be safe for clients; anything internal
 * goes into `internal` (logged/audited with redaction, never returned).
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ValidationIssue[] | undefined;
  readonly internal: unknown;
  errorRef: string | undefined;

  constructor(code: ErrorCode, message?: string, opts: { details?: ValidationIssue[]; internal?: unknown; errorRef?: string } = {}) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = 'ApiError';
    this.code = code;
    this.status = ERROR_HTTP_STATUS[code];
    this.details = opts.details;
    this.internal = opts.internal;
    this.errorRef = opts.errorRef;
  }

  toBody(): ApiErrorBody {
    const error: ApiErrorBody['error'] = { code: this.code, message: this.message, retryable: ERROR_RETRYABLE[this.code] };
    if (this.errorRef) error.errorRef = this.errorRef;
    if (this.details?.length) error.details = this.details.slice(0, 50);
    return { error };
  }
}

export function zodIssues(err: ZodError): ValidationIssue[] {
  return err.issues.slice(0, 50).map((i) => ({ path: i.path.map(String).join('.') || '(root)', message: i.message.slice(0, 300) }));
}

/** Normalize any thrown value into an ApiError without leaking internals. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof ZodError) return new ApiError('VALIDATION_FAILED', undefined, { details: zodIssues(err) });
  if (err instanceof StorageError) {
    switch (err.code) {
      case 'VERSION_CONFLICT':
        return new ApiError('VERSION_CONFLICT');
      case 'INSUFFICIENT_CREDITS':
        return new ApiError('INSUFFICIENT_CREDITS');
      case 'NOT_FOUND':
        return new ApiError('NOT_FOUND');
      case 'IDEMPOTENCY_KEY_REUSED':
        return new ApiError('IDEMPOTENCY_KEY_REUSED');
      default:
        return new ApiError('CONFLICT', undefined, { internal: err });
    }
  }
  if (err instanceof PatchError) {
    return err.code === 'NOT_FOUND'
      ? new ApiError('NOT_FOUND', err.message)
      : new ApiError('VALIDATION_FAILED', undefined, { details: [{ path: err.path, message: err.message }] });
  }
  if (err instanceof ProviderError) {
    return new ApiError('PROVIDER_UNAVAILABLE', undefined, { internal: err });
  }
  return new ApiError('INTERNAL', undefined, { internal: err });
}
