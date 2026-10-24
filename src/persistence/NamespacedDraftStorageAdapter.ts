import type { FormDraftSnapshot } from '../schema/FormDraft.js';
import type { IDraftStoragePort } from '../ports/IDraftStoragePort.js';
import type { IStoragePort } from '../ports/IStoragePort.js';

export interface NamespacedDraftStorageOptions {
  /** Prefix for generated storage keys. Default: 'form_draft:' */
  keyPrefix?: string;
  /**
   * Optional fallback namespace (e.g. for migrating anonymous guest drafts
   * to an authenticated account namespace upon login).
   */
  fallbackNamespace?: string;
}

/**
 * Headless namespaced draft storage adapter.
 * Partitions draft persistence by consumer-provided scope/namespace while preserving
 * seamless fallback resolution and atomic promotion when switching contexts.
 */
export class NamespacedDraftStorageAdapter implements IDraftStoragePort {
  private readonly keyPrefix: string;
  private readonly fallbackNamespace?: string;

  constructor(
    private readonly storage: IStoragePort,
    private readonly namespace: string,
    options?: NamespacedDraftStorageOptions,
  ) {
    this.keyPrefix = options?.keyPrefix ?? 'form_draft:';
    this.fallbackNamespace = options?.fallbackNamespace;
  }

  private getKeyFor(namespace: string, schemaId: string): string {
    return `${this.keyPrefix}${encodeURIComponent(namespace)}:${encodeURIComponent(schemaId)}`;
  }

  private getKey(schemaId: string): string {
    return this.getKeyFor(this.namespace, schemaId);
  }

  public async saveDraft(snapshot: FormDraftSnapshot): Promise<void> {
    await this.storage.setItem(this.getKey(snapshot.schemaId), JSON.stringify(snapshot));
  }

  public async loadDraft(schemaId: string): Promise<FormDraftSnapshot | null> {
    let raw = await this.storage.getItem(this.getKey(schemaId));

    // Fallback migration: if not in primary namespace, check fallback namespace
    if (!raw && this.fallbackNamespace) {
      const fallbackKey = this.getKeyFor(this.fallbackNamespace, schemaId);
      raw = await this.storage.getItem(fallbackKey);
      if (raw) {
        // Atomic promotion: save to current namespace and remove from fallback
        await this.storage.setItem(this.getKey(schemaId), raw);
        await this.storage.removeItem(fallbackKey);
      }
    }

    if (!raw) return null;

    try {
      const snapshot = JSON.parse(raw) as FormDraftSnapshot;
      if (snapshot.schemaId === schemaId && !snapshot.isSubmitted) {
        return snapshot;
      }
      return null;
    } catch {
      await this.clearDraft(schemaId);
      return null;
    }
  }

  public async clearDraft(schemaId: string): Promise<void> {
    await this.storage.removeItem(this.getKey(schemaId));
  }

  public async hasDraft(schemaId: string): Promise<boolean> {
    return (await this.loadDraft(schemaId)) !== null;
  }
}
