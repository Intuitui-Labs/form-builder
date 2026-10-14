/**
 * Lightweight, zero-dependency Result type for functional error handling in the core engine.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T; readonly error?: never }
  | { readonly ok: false; readonly error: E; readonly value?: never };

export const Result = {
  ok: <T>(value: T): Result<T, never> => ({ ok: true, value }),
  err: <E>(error: E): Result<never, E> => ({ ok: false, error }),
  
  isOk: <T, E>(result: Result<T, E>): result is { readonly ok: true; readonly value: T } => result.ok,
  isErr: <T, E>(result: Result<T, E>): result is { readonly ok: false; readonly error: E } => !result.ok,

  match: <T, E, R>(
    result: Result<T, E>,
    handlers: { ok: (value: T) => R; err: (error: E) => R }
  ): R => (result.ok ? handlers.ok(result.value) : handlers.err(result.error)),

  map: <T, E, U>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
    result.ok ? Result.ok(fn(result.value)) : result,

  mapErr: <T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> =>
    result.ok ? result : Result.err(fn(result.error)),

  unwrapOr: <T, E>(result: Result<T, E>, fallback: T): T =>
    result.ok ? result.value : fallback,
};
