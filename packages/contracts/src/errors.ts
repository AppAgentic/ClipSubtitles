import { z } from 'zod';

/**
 * Stable public error codes. Clients (web, MCP, agents) branch on `code`, never on
 * message text. Provider/internal details never leave the server; `errorRef`
 * correlates a public failure with the redacted audit record.
 */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'INSUFFICIENT_SCOPE',
  'NOT_FOUND',
  'CONFLICT',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_IN_PROGRESS',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA',
  'SOURCE_NOT_READY',
  'SOURCE_URL_REJECTED',
  'TRANSCRIPT_MISSING',
  'QUOTE_EXPIRED',
  'QUOTE_INVALIDATED',
  'QUOTE_MISMATCH',
  'INSUFFICIENT_CREDITS',
  'TASK_NOT_CANCELLABLE',
  'TASK_FAILED',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'RENDER_FAILED',
  'RETENTION_EXPIRED',
  'INTERNAL',
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INSUFFICIENT_SCOPE: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  SOURCE_NOT_READY: 409,
  SOURCE_URL_REJECTED: 422,
  TRANSCRIPT_MISSING: 409,
  QUOTE_EXPIRED: 410,
  QUOTE_INVALIDATED: 409,
  QUOTE_MISMATCH: 409,
  INSUFFICIENT_CREDITS: 402,
  TASK_NOT_CANCELLABLE: 409,
  TASK_FAILED: 500,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 503,
  RENDER_FAILED: 500,
  RETENTION_EXPIRED: 410,
  INTERNAL: 500,
};

/** Which errors a client may retry without changing the request. */
export const ERROR_RETRYABLE: Record<ErrorCode, boolean> = {
  VALIDATION_FAILED: false,
  UNAUTHENTICATED: false,
  FORBIDDEN: false,
  INSUFFICIENT_SCOPE: false,
  NOT_FOUND: false,
  CONFLICT: false,
  VERSION_CONFLICT: false,
  IDEMPOTENCY_KEY_REUSED: false,
  IDEMPOTENCY_IN_PROGRESS: true,
  PAYLOAD_TOO_LARGE: false,
  UNSUPPORTED_MEDIA: false,
  SOURCE_NOT_READY: true,
  SOURCE_URL_REJECTED: false,
  TRANSCRIPT_MISSING: false,
  QUOTE_EXPIRED: false,
  QUOTE_INVALIDATED: false,
  QUOTE_MISMATCH: false,
  INSUFFICIENT_CREDITS: false,
  TASK_NOT_CANCELLABLE: false,
  TASK_FAILED: false,
  RATE_LIMITED: true,
  PROVIDER_UNAVAILABLE: true,
  RENDER_FAILED: false,
  RETENTION_EXPIRED: false,
  INTERNAL: true,
};

export const ValidationIssueSchema = z.object({
  path: z.string().max(200).describe('JSON pointer-ish path of the invalid field'),
  message: z.string().max(300),
});

export const ApiErrorSchema = z
  .object({
    error: z.object({
      code: ErrorCodeSchema,
      message: z.string().max(500).describe('Stable, human-readable, never contains provider output'),
      retryable: z.boolean(),
      errorRef: z.string().max(64).optional().describe('Correlation id for support/audit lookup'),
      details: z.array(ValidationIssueSchema).max(50).optional(),
    }),
  })
  .describe('Public error envelope').meta({ id: 'ApiError' });

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

/** Default public messages: intentionally generic, no internal state leaks. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'The request did not match the expected schema.',
  UNAUTHENTICATED: 'Authentication is required.',
  FORBIDDEN: 'You do not have access to this resource.',
  INSUFFICIENT_SCOPE: 'The credential does not include the required scope.',
  NOT_FOUND: 'The requested resource does not exist in this workspace.',
  CONFLICT: 'The request conflicts with the current state.',
  VERSION_CONFLICT: 'The project changed since you last read it. Re-fetch and retry with the current version.',
  IDEMPOTENCY_KEY_REUSED: 'This idempotency key was already used with a different request.',
  IDEMPOTENCY_IN_PROGRESS: 'A request with this idempotency key is still being processed.',
  PAYLOAD_TOO_LARGE: 'The payload exceeds the allowed size.',
  UNSUPPORTED_MEDIA: 'The media type is not supported.',
  SOURCE_NOT_READY: 'The project source media is not ready yet.',
  SOURCE_URL_REJECTED: 'The source URL was rejected by policy.',
  TRANSCRIPT_MISSING: 'The project has no transcript yet. Generate captions first.',
  QUOTE_EXPIRED: 'The render quote has expired. Request a new quote.',
  QUOTE_INVALIDATED: 'The render quote is no longer valid because the project, style, settings, or price changed.',
  QUOTE_MISMATCH: 'The approval does not match the quoted cost or project version.',
  INSUFFICIENT_CREDITS: 'The workspace does not have enough credits for this render.',
  TASK_NOT_CANCELLABLE: 'The task is already finished and cannot be cancelled.',
  TASK_FAILED: 'The task failed.',
  RATE_LIMITED: 'Too many requests. Slow down and retry later.',
  PROVIDER_UNAVAILABLE: 'A required provider is unavailable. Retry later.',
  RENDER_FAILED: 'Rendering failed. No credits were charged.',
  RETENTION_EXPIRED: 'This media has been removed by the retention policy.',
  INTERNAL: 'An internal error occurred.',
};
