import { Schema } from 'effect';

/**
 * Effect v4 Tagged Errors defined with Schema.TaggedError per official Effect 4.0 specification.
 */
export class EffectStorageQuotaError extends Schema.TaggedError<EffectStorageQuotaError>()(
  'StorageQuotaExceeded',
  {
    key: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

export class EffectStorageIOError extends Schema.TaggedError<EffectStorageIOError>()(
  'StorageIOError',
  {
    key: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

export class EffectStorageSecurityError extends Schema.TaggedError<EffectStorageSecurityError>()(
  'StorageSecurityBlocked',
  {
    key: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

export type EffectStorageError =
  | EffectStorageQuotaError
  | EffectStorageIOError
  | EffectStorageSecurityError;
