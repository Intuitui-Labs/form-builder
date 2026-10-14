/**
 * Exhaustive domain error taxonomy for hexagonal engine ports and core evaluation.
 * Modeled as tagged discriminated unions for zero-dependency pattern matching.
 */

export type StorageError =
  | { readonly _tag: 'StorageQuotaExceeded'; readonly key: string; readonly cause?: unknown }
  | { readonly _tag: 'StorageSecurityBlocked'; readonly key: string; readonly cause?: unknown }
  | { readonly _tag: 'StorageCorruptedData'; readonly key: string; readonly raw: string; readonly cause?: unknown }
  | { readonly _tag: 'StorageIOError'; readonly key: string; readonly cause: unknown };

export type TransportError =
  | { readonly _tag: 'TransportNetworkOffline'; readonly retryable: true; readonly message?: string }
  | { readonly _tag: 'TransportServerError'; readonly status: number; readonly retryable: true; readonly message?: string }
  | { readonly _tag: 'TransportClientRejected'; readonly status: number; readonly retryable: false; readonly details?: unknown }
  | { readonly _tag: 'TransportTimeout'; readonly durationMs: number; readonly retryable: true };

export type OutboxDeadLetterError = {
  readonly _tag: 'DeadLetterMaxRetriesExceeded';
  readonly envelopeId: string;
  readonly attempts: number;
  readonly lastError: TransportError | string;
};

export type ValidationError =
  | { readonly _tag: 'ValidationConstraintViolation'; readonly field: string; readonly message: string }
  | { readonly _tag: 'ValidationMalformedRule'; readonly field: string; readonly reason: string }
  | { readonly _tag: 'ValidationAborted'; readonly field: string; readonly reason?: string };

export type HydrationError =
  | { readonly _tag: 'HydrationSchemaVersionMismatch'; readonly draftVersion?: string; readonly targetVersion: string }
  | { readonly _tag: 'HydrationCorruptedPayload'; readonly schemaId: string; readonly reason: string };
