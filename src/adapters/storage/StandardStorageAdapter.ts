import type { IResilientStoragePort } from '../../ports/IStoragePort.js';
import { Result } from '../../core/Result.js';
import type { StorageError } from '../../core/DomainErrors.js';
import { MemoryStorageAdapter } from './MemoryStorageAdapter.js';

export interface StandardStorageOptions {
  storage?: Storage;
  fallbackToMemory?: boolean;
}

/**
 * Tier 1 Standard zero-dependency storage adapter for web (localStorage/sessionStorage)
 * and mobile (wraps any synchronous or asynchronous key-value store).
 * Implements IResilientStoragePort with explicit QuotaExceeded and Security error detection.
 */
export class StandardStorageAdapter implements IResilientStoragePort {
  private rawStorage?: Storage;
  private memoryFallback = new MemoryStorageAdapter();
  private fallbackToMemory: boolean;

  constructor(options?: StandardStorageOptions) {
    this.fallbackToMemory = options?.fallbackToMemory ?? true;
    if (options?.storage) {
      this.rawStorage = options.storage;
    } else if (typeof window !== 'undefined' && window.localStorage) {
      try {
        this.rawStorage = window.localStorage;
      } catch {
        // Private mode or restricted iframe access
      }
    }
  }

  public async getItemSafe(key: string): Promise<Result<string | null, StorageError>> {
    if (!this.rawStorage) {
      if (this.fallbackToMemory) {
        return Result.ok(this.memoryFallback.getItem(key));
      }
      return Result.err({
        _tag: 'StorageSecurityBlocked',
        key,
        cause: 'Storage environment is unavailable or restricted',
      });
    }

    try {
      const val = this.rawStorage.getItem(key);
      return Result.ok(val);
    } catch (err: any) {
      if (err?.name === 'SecurityError') {
        return Result.err({ _tag: 'StorageSecurityBlocked', key, cause: err });
      }
      return Result.err({ _tag: 'StorageIOError', key, cause: err });
    }
  }

  public async setItemSafe(key: string, value: string): Promise<Result<void, StorageError>> {
    if (!this.rawStorage) {
      if (this.fallbackToMemory) {
        this.memoryFallback.setItem(key, value);
        return Result.ok(undefined);
      }
      return Result.err({
        _tag: 'StorageSecurityBlocked',
        key,
        cause: 'Storage environment is unavailable or restricted',
      });
    }

    try {
      this.rawStorage.setItem(key, value);
      return Result.ok(undefined);
    } catch (err: any) {
      // Modern browsers: QuotaExceededError (code 22 or 1014)
      if (
        err?.name === 'QuotaExceededError' ||
        err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err?.code === 22 ||
        err?.code === 1014
      ) {
        if (this.fallbackToMemory) {
          this.memoryFallback.setItem(key, value);
        }
        return Result.err({ _tag: 'StorageQuotaExceeded', key, cause: err });
      }

      if (err?.name === 'SecurityError') {
        return Result.err({ _tag: 'StorageSecurityBlocked', key, cause: err });
      }

      return Result.err({ _tag: 'StorageIOError', key, cause: err });
    }
  }

  public async removeItemSafe(key: string): Promise<Result<void, StorageError>> {
    if (!this.rawStorage) {
      this.memoryFallback.removeItem(key);
      return Result.ok(undefined);
    }

    try {
      this.rawStorage.removeItem(key);
      return Result.ok(undefined);
    } catch (err: any) {
      return Result.err({ _tag: 'StorageIOError', key, cause: err });
    }
  }

  // Standard IStoragePort compatibility methods
  public async getItem(key: string): Promise<string | null> {
    const res = await this.getItemSafe(key);
    return res.ok ? res.value : null;
  }

  public async setItem(key: string, value: string): Promise<void> {
    const res = await this.setItemSafe(key, value);
    if (!res.ok && res.error._tag === 'StorageQuotaExceeded') {
      const err = new Error(`Storage quota exceeded for key "${key}"`);
      err.name = 'QuotaExceededError';
      throw err;
    }
  }

  public async removeItem(key: string): Promise<void> {
    await this.removeItemSafe(key);
  }

  public getAllKeys(): string[] {
    if (!this.rawStorage) return this.memoryFallback.getAllKeys();
    try {
      return Object.keys(this.rawStorage);
    } catch {
      return this.memoryFallback.getAllKeys();
    }
  }
}
