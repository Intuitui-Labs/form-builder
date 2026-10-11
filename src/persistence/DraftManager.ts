import type { IDraftStoragePort } from '../ports/IDraftStoragePort.js';
import type { IStoragePort } from '../ports/IStoragePort.js';
import type { FormDraftSnapshot } from '../schema/FormDraft.js';
import { MemoryStorageAdapter } from '../adapters/storage/MemoryStorageAdapter.js';

export interface DraftManagerOptions {
  storage?: IStoragePort;
  keyPrefix?: string;
  debounceMs?: number;
}

/**
 * Manages debounced auto-saving, local persistence, and restoration of form session drafts.
 * Backed by any hexagonal IStoragePort (MMKV, AsyncStorage, SQLite, localStorage, or in-memory).
 */
export class DraftManager implements IDraftStoragePort {
  private storage: IStoragePort;
  private keyPrefix: string;
  private debounceMs: number;
  private debounceTimer: any = null;
  private pendingSnapshot: FormDraftSnapshot | null = null;

  constructor(options?: DraftManagerOptions) {
    this.storage = options?.storage ?? new MemoryStorageAdapter();
    this.keyPrefix = options?.keyPrefix ?? 'intuitui_draft_';
    this.debounceMs = options?.debounceMs ?? 500;
  }

  private getKey(schemaId: string): string {
    return `${this.keyPrefix}${schemaId}`;
  }

  public async saveDraft(snapshot: FormDraftSnapshot): Promise<void> {
    const key = this.getKey(snapshot.schemaId);
    const serialized = JSON.stringify(snapshot);
    await this.storage.setItem(key, serialized);
  }

  public async loadDraft(schemaId: string): Promise<FormDraftSnapshot | null> {
    const key = this.getKey(schemaId);
    const serialized = await this.storage.getItem(key);
    if (!serialized) return null;

    try {
      return JSON.parse(serialized) as FormDraftSnapshot;
    } catch {
      return null;
    }
  }

  public async clearDraft(schemaId: string): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      this.pendingSnapshot = null;
    }
    const key = this.getKey(schemaId);
    await this.storage.removeItem(key);
  }

  public async hasDraft(schemaId: string): Promise<boolean> {
    const key = this.getKey(schemaId);
    const item = await this.storage.getItem(key);
    return item !== null && item !== undefined && item !== '';
  }

  /**
   * Debounces repeated draft updates (e.g. fast typing) to minimize write overhead on durable storage.
   */
  public scheduleAutoSave(
    snapshot: FormDraftSnapshot,
    onSaved?: (snapshot: FormDraftSnapshot) => void,
  ): void {
    this.pendingSnapshot = snapshot;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      if (this.pendingSnapshot) {
        const toSave = this.pendingSnapshot;
        this.pendingSnapshot = null;
        this.debounceTimer = null;
        await this.saveDraft(toSave);
        onSaved?.(toSave);
      }
    }, this.debounceMs);
  }

  /**
   * Flushes any pending debounced auto-save write immediately.
   */
  public async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.pendingSnapshot) {
      const toSave = this.pendingSnapshot;
      this.pendingSnapshot = null;
      await this.saveDraft(toSave);
    }
  }
}
