import type { IDraftStoragePort } from '../ports/IDraftStoragePort.js';
import type { IStoragePort, IResilientStoragePort } from '../ports/IStoragePort.js';
import type { FormDraftSnapshot } from '../schema/FormDraft.js';
import { MemoryStorageAdapter } from '../adapters/storage/MemoryStorageAdapter.js';
import { Result } from '../core/Result.js';
import type { StorageError, HydrationError } from '../core/DomainErrors.js';

export interface DraftManagerOptions {
  storage?: IStoragePort;
  keyPrefix?: string;
  debounceMs?: number;
  targetSchemaVersion?: string;
  migrateDraft?: (snapshot: FormDraftSnapshot, targetVersion: string) => FormDraftSnapshot | null;
}

/**
 * Manages debounced auto-saving, local persistence, schema version migration,
 * and resilient restoration of form session drafts.
 */
export class DraftManager implements IDraftStoragePort {
  private storage: IStoragePort;
  private keyPrefix: string;
  private debounceMs: number;
  private targetSchemaVersion?: string;
  private migrateDraft?: (snapshot: FormDraftSnapshot, targetVersion: string) => FormDraftSnapshot | null;
  private debounceTimer: any = null;
  private pendingSnapshot: FormDraftSnapshot | null = null;

  constructor(options?: DraftManagerOptions) {
    this.storage = options?.storage ?? new MemoryStorageAdapter();
    this.keyPrefix = options?.keyPrefix ?? 'intuitui_draft_';
    this.debounceMs = options?.debounceMs ?? 500;
    this.targetSchemaVersion = options?.targetSchemaVersion;
    this.migrateDraft = options?.migrateDraft;
  }

  private getKey(schemaId: string): string {
    return `${this.keyPrefix}${schemaId}`;
  }

  public async saveDraft(snapshot: FormDraftSnapshot): Promise<void> {
    const res = await this.saveDraftSafe(snapshot);
    if (!res.ok) {
      // For backward compatibility: log warning on quota exhaustion
      console.warn(`[DraftManager] Failed to persist draft: ${res.error._tag}`, res.error);
    }
  }

  public async saveDraftSafe(snapshot: FormDraftSnapshot): Promise<Result<void, StorageError>> {
    const key = this.getKey(snapshot.schemaId);
    try {
      const serialized = JSON.stringify(snapshot);
      if ('setItemSafe' in this.storage) {
        return await (this.storage as IResilientStoragePort).setItemSafe(key, serialized);
      }
      await this.storage.setItem(key, serialized);
      return Result.ok(undefined);
    } catch (err: any) {
      if (err?.name === 'QuotaExceededError' || err?.code === 22) {
        return Result.err({ _tag: 'StorageQuotaExceeded', key, cause: err });
      }
      return Result.err({ _tag: 'StorageIOError', key, cause: err });
    }
  }

  public async loadDraft(schemaId: string): Promise<FormDraftSnapshot | null> {
    const res = await this.loadDraftSafe(schemaId);
    return res.ok ? res.value : null;
  }

  public async loadDraftSafe(
    schemaId: string,
  ): Promise<Result<FormDraftSnapshot | null, StorageError | HydrationError>> {
    const key = this.getKey(schemaId);
    let serialized: string | null = null;

    try {
      if ('getItemSafe' in this.storage) {
        const fetchRes = await (this.storage as IResilientStoragePort).getItemSafe(key);
        if (!fetchRes.ok) return fetchRes;
        serialized = fetchRes.value;
      } else {
        serialized = await this.storage.getItem(key);
      }
    } catch (err) {
      return Result.err({ _tag: 'StorageIOError', key, cause: err });
    }

    if (!serialized) return Result.ok(null);

    let parsed: FormDraftSnapshot;
    try {
      parsed = JSON.parse(serialized) as FormDraftSnapshot;
    } catch (err) {
      return Result.err({
        _tag: 'HydrationCorruptedPayload',
        schemaId,
        reason: 'Malformed JSON payload in draft storage',
      });
    }

    // Check schema version compatibility
    if (this.targetSchemaVersion && parsed.schemaVersion !== this.targetSchemaVersion) {
      if (this.migrateDraft) {
        const migrated = this.migrateDraft(parsed, this.targetSchemaVersion);
        if (migrated) return Result.ok(migrated);
      }
      return Result.err({
        _tag: 'HydrationSchemaVersionMismatch',
        draftVersion: parsed.schemaVersion,
        targetVersion: this.targetSchemaVersion,
      });
    }

    return Result.ok(parsed);
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
    onError?: (error: StorageError) => void,
  ): void {
    this.pendingSnapshot = snapshot;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      if (this.pendingSnapshot) {
        const snap = this.pendingSnapshot;
        this.pendingSnapshot = null;
        const res = await this.saveDraftSafe(snap);
        if (res.ok) {
          onSaved?.(snap);
        } else {
          onError?.(res.error);
        }
      }
      this.debounceTimer = null;
    }, this.debounceMs);
  }

  public flush(): Promise<void> {
    return this.flushPendingSave();
  }

  public flushPendingSave(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      if (this.pendingSnapshot) {
        const snap = this.pendingSnapshot;
        this.pendingSnapshot = null;
        return this.saveDraft(snap);
      }
    }
    return Promise.resolve();
  }
}
