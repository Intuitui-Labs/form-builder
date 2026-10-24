import type { FormDraftSnapshot, IDraftStoragePort } from '@intuitui-labs/form-builder-engine';
import type { IEntityStore } from '../domain/ports/IEntityStore';

/** Persists respondent drafts without allowing account, organization, or survey crossover. */
export class ScopedDraftStorage implements IDraftStoragePort {
  constructor(
    private readonly store: IEntityStore,
    private readonly scopeKey: string,
    private readonly fallbackScopeKey?: string,
  ) {}

  private key(schemaId: string): string {
    return this.keyForScope(this.scopeKey, schemaId);
  }

  private keyForScope(scopeKey: string, schemaId: string): string {
    return `respondent-draft:${encodeURIComponent(scopeKey)}:${encodeURIComponent(schemaId)}`;
  }

  async saveDraft(snapshot: FormDraftSnapshot): Promise<void> {
    await this.store.setItem(this.key(snapshot.schemaId), JSON.stringify(snapshot));
  }

  async loadDraft(schemaId: string): Promise<FormDraftSnapshot | null> {
    let raw = await this.store.getItem(this.key(schemaId));
    const fallbackKey = this.fallbackScopeKey ? this.keyForScope(this.fallbackScopeKey, schemaId) : null;
    if (!raw && fallbackKey) {
      raw = await this.store.getItem(fallbackKey);
      if (raw) {
        await this.store.setItem(this.key(schemaId), raw);
        await this.store.removeItem(fallbackKey);
      }
    }
    if (!raw) return null;
    try {
      const snapshot = JSON.parse(raw) as FormDraftSnapshot;
      return snapshot.schemaId === schemaId && !snapshot.isSubmitted ? snapshot : null;
    } catch {
      await this.clearDraft(schemaId);
      return null;
    }
  }

  async clearDraft(schemaId: string): Promise<void> {
    await this.store.removeItem(this.key(schemaId));
  }

  async hasDraft(schemaId: string): Promise<boolean> {
    return (await this.loadDraft(schemaId)) !== null;
  }
}
