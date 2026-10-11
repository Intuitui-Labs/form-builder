import type { IStoragePort } from '../../ports/IStoragePort.js';
import { MemoryStorageAdapter } from './MemoryStorageAdapter.js';

export type WebStorageType = 'localStorage' | 'sessionStorage';

/**
 * Safe browser Web Storage adapter with automatic SSR/security exception fallback to MemoryStorageAdapter.
 */
export class WebStorageAdapter implements IStoragePort {
  private fallback = new MemoryStorageAdapter();
  private storageType: WebStorageType;

  constructor(type: WebStorageType = 'localStorage') {
    this.storageType = type;
  }

  private getStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
      return window[this.storageType] ?? null;
    } catch {
      // In private browsing or restricted iframe, accessing window[type] may throw
      return null;
    }
  }

  public getItem(key: string): string | null {
    const storage = this.getStorage();
    if (!storage) return this.fallback.getItem(key);
    try {
      return storage.getItem(key);
    } catch {
      return this.fallback.getItem(key);
    }
  }

  public setItem(key: string, value: string): void {
    const storage = this.getStorage();
    if (!storage) {
      this.fallback.setItem(key, value);
      return;
    }
    try {
      storage.setItem(key, value);
    } catch {
      // Quota exceeded or storage disabled
      this.fallback.setItem(key, value);
    }
  }

  public removeItem(key: string): void {
    const storage = this.getStorage();
    if (!storage) {
      this.fallback.removeItem(key);
      return;
    }
    try {
      storage.removeItem(key);
    } catch {
      this.fallback.removeItem(key);
    }
  }

  public getAllKeys(): string[] {
    const storage = this.getStorage();
    if (!storage) return this.fallback.getAllKeys();
    try {
      return Object.keys(storage);
    } catch {
      return this.fallback.getAllKeys();
    }
  }
}
