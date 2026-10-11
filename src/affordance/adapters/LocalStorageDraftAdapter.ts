import type { IDraftStoragePort } from '../../ports/IDraftStoragePort.js';
import type { FormDraftSnapshot } from '../../schema/FormDraft.js';

/**
 * Web LocalStorage draft persistence adapter.
 * Uses window.localStorage with safe SSR / unmounted checks and error boundaries.
 */
export class LocalStorageDraftAdapter implements IDraftStoragePort {
  private fallbackMemory = new Map<string, string>();

  constructor(private prefix: string = 'form_draft:') {}

  private getKey(schemaId: string): string {
    return `${this.prefix}${schemaId}`;
  }

  private isStorageAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  saveDraft(snapshot: FormDraftSnapshot): void {
    const key = this.getKey(snapshot.schemaId);
    const serialized = JSON.stringify(snapshot);

    if (this.isStorageAvailable()) {
      try {
        window.localStorage.setItem(key, serialized);
        return;
      } catch {
        // Fallback to memory on quota exceeded or security restriction
      }
    }
    this.fallbackMemory.set(key, serialized);
  }

  loadDraft(schemaId: string): FormDraftSnapshot | null {
    const key = this.getKey(schemaId);

    if (this.isStorageAvailable()) {
      try {
        const item = window.localStorage.getItem(key);
        if (item) {
          return JSON.parse(item) as FormDraftSnapshot;
        }
      } catch {
        // Fallback to memory
      }
    }

    const fallbackItem = this.fallbackMemory.get(key);
    return fallbackItem ? (JSON.parse(fallbackItem) as FormDraftSnapshot) : null;
  }

  clearDraft(schemaId: string): void {
    const key = this.getKey(schemaId);
    if (this.isStorageAvailable()) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore errors
      }
    }
    this.fallbackMemory.delete(key);
  }

  hasDraft(schemaId: string): boolean {
    const key = this.getKey(schemaId);
    if (this.isStorageAvailable()) {
      try {
        return window.localStorage.getItem(key) !== null;
      } catch {
        // Ignore errors
      }
    }
    return this.fallbackMemory.has(key);
  }
}
