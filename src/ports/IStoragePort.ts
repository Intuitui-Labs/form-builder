import type { Result } from '../core/Result.js';
import type { StorageError } from '../core/DomainErrors.js';

/**
 * Outbound Port: Contract for key-value storage.
 * Compatible with in-memory storage, Web localStorage/sessionStorage,
 * React Native MMKV, AsyncStorage, Expo SQLite, and WatermelonDB.
 */
export interface IStoragePort {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
  getAllKeys?(): Promise<string[]> | string[];
}

/**
 * Hardened Outbound Port: Contract for storage adapters that return
 * typed Result monads rather than throwing untyped runtime exceptions.
 */
export interface IResilientStoragePort extends IStoragePort {
  getItemSafe(key: string): Promise<Result<string | null, StorageError>>;
  setItemSafe(key: string, value: string): Promise<Result<void, StorageError>>;
  removeItemSafe(key: string): Promise<Result<void, StorageError>>;
}
