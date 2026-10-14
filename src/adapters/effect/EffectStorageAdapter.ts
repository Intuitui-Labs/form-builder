import { Effect, Context, Layer } from 'effect';
import type { IResilientStoragePort } from '../../ports/IStoragePort.js';
import { Result } from '../../core/Result.js';
import type { StorageError } from '../../core/DomainErrors.js';
import {
  EffectStorageQuotaError,
  EffectStorageIOError,
  EffectStorageSecurityError,
  type EffectStorageError,
} from './EffectErrors.js';

export interface StorageServiceShape {
  readonly get: (key: string) => Effect.Effect<string | null, EffectStorageError>;
  readonly set: (key: string, value: string) => Effect.Effect<void, EffectStorageError>;
  readonly remove: (key: string) => Effect.Effect<void, EffectStorageError>;
  readonly keys: () => Effect.Effect<string[], EffectStorageError>;
}

/**
 * Tier 2 Hexagonal Adapter: Bridges IResilientStoragePort into Effect v4.
 * Uses Schema.TaggedError and Context.Service per official Effect 4.0 specification.
 */
export class EffectStorageAdapter implements IResilientStoragePort {
  private service: StorageServiceShape;

  constructor(service?: StorageServiceShape) {
    this.service = service ?? EffectStorageAdapter.createMemoryServiceShape();
  }

  public static createMemoryServiceShape(): StorageServiceShape {
    const memory = new Map<string, string>();
    return {
      get: (key: string) => Effect.succeed(memory.get(key) ?? null),
      set: (key: string, value: string) =>
        Effect.sync(() => {
          memory.set(key, value);
        }),
      remove: (key: string) =>
        Effect.sync(() => {
          memory.delete(key);
        }),
      keys: () => Effect.succeed(Array.from(memory.keys())),
    };
  }

  public static createWebStorageServiceShape(
    type: 'localStorage' | 'sessionStorage' = 'localStorage',
  ): StorageServiceShape {
    return {
      get: (key: string) =>
        Effect.try({
          try: () => {
            if (typeof window === 'undefined') return null;
            return window[type].getItem(key);
          },
          catch: (cause: any): EffectStorageError => {
            if (cause?.name === 'SecurityError' || cause?.code === 18) {
              return new EffectStorageSecurityError({ key, cause });
            }
            return new EffectStorageIOError({ key, cause });
          },
        }),
      set: (key: string, value: string) =>
        Effect.try({
          try: () => {
            if (typeof window !== 'undefined') {
              window[type].setItem(key, value);
            }
          },
          catch: (cause: any): EffectStorageError => {
            if (cause?.name === 'QuotaExceededError' || cause?.code === 22) {
              return new EffectStorageQuotaError({ key, cause });
            }
            if (cause?.name === 'SecurityError' || cause?.code === 18) {
              return new EffectStorageSecurityError({ key, cause });
            }
            return new EffectStorageIOError({ key, cause });
          },
        }),
      remove: (key: string) =>
        Effect.try({
          try: () => {
            if (typeof window !== 'undefined') {
              window[type].removeItem(key);
            }
          },
          catch: (cause: any): EffectStorageError => {
            if (cause?.name === 'SecurityError' || cause?.code === 18) {
              return new EffectStorageSecurityError({ key, cause });
            }
            return new EffectStorageIOError({ key, cause });
          },
        }),
      keys: () =>
        Effect.try({
          try: () => {
            if (typeof window === 'undefined') return [];
            return Object.keys(window[type]);
          },
          catch: (cause: any): EffectStorageError => {
            if (cause?.name === 'SecurityError' || cause?.code === 18) {
              return new EffectStorageSecurityError({ key: '*', cause });
            }
            return new EffectStorageIOError({ key: '*', cause });
          },
        }),
    };
  }

  public async getItemSafe(key: string): Promise<Result<string | null, StorageError>> {
    const program = this.service.get(key).pipe(
      Effect.map((val): Result<string | null, StorageError> => Result.ok(val)),
      Effect.catchTags({
        StorageQuotaExceeded: (err) =>
          Effect.succeed(
            Result.err({ _tag: 'StorageQuotaExceeded' as const, key: err.key, cause: err.cause }),
          ),
        StorageSecurityBlocked: (err) =>
          Effect.succeed(
            Result.err({ _tag: 'StorageSecurityBlocked' as const, key: err.key, cause: err.cause }),
          ),
        StorageIOError: (err) =>
          Effect.succeed(
            Result.err({ _tag: 'StorageIOError' as const, key: err.key, cause: err.cause }),
          ),
      }),
    );
    return Effect.runPromise(program);
  }

  public async setItemSafe(key: string, value: string): Promise<Result<void, StorageError>> {
    const program = this.service.set(key, value).pipe(
      Effect.map((): Result<void, StorageError> => Result.ok(undefined)),
      Effect.catchTags({
        StorageQuotaExceeded: (err) =>
          Effect.succeed(
            Result.err({ _tag: 'StorageQuotaExceeded' as const, key: err.key, cause: err.cause }),
          ),
        StorageSecurityBlocked: (err) =>
          Effect.succeed(
            Result.err({ _tag: 'StorageSecurityBlocked' as const, key: err.key, cause: err.cause }),
          ),
        StorageIOError: (err) =>
          Effect.succeed(
            Result.err({ _tag: 'StorageIOError' as const, key: err.key, cause: err.cause }),
          ),
      }),
    );
    return Effect.runPromise(program);
  }

  public async removeItemSafe(key: string): Promise<Result<void, StorageError>> {
    const program = this.service.remove(key).pipe(
      Effect.map((): Result<void, StorageError> => Result.ok(undefined)),
      Effect.catchTags({
        StorageQuotaExceeded: (err) =>
          Effect.succeed(
            Result.err({ _tag: 'StorageQuotaExceeded' as const, key: err.key, cause: err.cause }),
          ),
        StorageSecurityBlocked: (err) =>
          Effect.succeed(
            Result.err({ _tag: 'StorageSecurityBlocked' as const, key: err.key, cause: err.cause }),
          ),
        StorageIOError: (err) =>
          Effect.succeed(
            Result.err({ _tag: 'StorageIOError' as const, key: err.key, cause: err.cause }),
          ),
      }),
    );
    return Effect.runPromise(program);
  }

  public async getItem(key: string): Promise<string | null> {
    const res = await this.getItemSafe(key);
    return res.ok ? res.value : null;
  }

  public async setItem(key: string, value: string): Promise<void> {
    const res = await this.setItemSafe(key, value);
    if (!res.ok) {
      const err = new Error(`Storage failure: ${res.error._tag}`);
      Object.assign(err, res.error);
      throw err;
    }
  }

  public async removeItem(key: string): Promise<void> {
    await this.removeItemSafe(key);
  }

  public async getAllKeys(): Promise<string[]> {
    const program = this.service.keys().pipe(
      Effect.catchTags({
        StorageIOError: () => Effect.succeed([]),
        StorageQuotaExceeded: () => Effect.succeed([]),
        StorageSecurityBlocked: () => Effect.succeed([]),
      }),
    );
    return Effect.runPromise(program);
  }

  public async clear(): Promise<void> {
    const keys = await this.getAllKeys();
    for (const key of keys) {
      await this.removeItem(key);
    }
  }
}

/**
 * Official Effect 4.0 Service definition extending Context.Service
 */
export class StorageService extends Context.Service<StorageService, StorageServiceShape>()(
  '@intuitui-labs/StorageService',
) {
  public static readonly memoryLayer = Layer.succeed(
    StorageService,
    StorageService.of(EffectStorageAdapter.createMemoryServiceShape()),
  );

  public static readonly webStorageLayer = (type: 'localStorage' | 'sessionStorage' = 'localStorage') =>
    Layer.succeed(
      StorageService,
      StorageService.of(EffectStorageAdapter.createWebStorageServiceShape(type)),
    );
}
