export type StorageErrorCode =
  | 'VERSION_CONFLICT'
  | 'INSUFFICIENT_CREDITS'
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'IDEMPOTENCY_KEY_REUSED';

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
  }
}
