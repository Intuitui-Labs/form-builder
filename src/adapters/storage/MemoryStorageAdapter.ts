import type { IStoragePort } from '../../ports/IStoragePort.js';

/**
 * In-memory storage adapter for testing, SSR, Node.js, and zero-dependency default fallback.
 */
export class MemoryStorageAdapter implements IStoragePort {
  private store = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }

  public getAllKeys(): string[] {
    return Array.from(this.store.keys());
  }

  public clear(): void {
    this.store.clear();
  }
}
