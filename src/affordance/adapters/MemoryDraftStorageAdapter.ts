import type { IDraftStoragePort } from '../../ports/IDraftStoragePort.js';
import type { FormDraftSnapshot } from '../../schema/FormDraft.js';

/**
 * In-memory draft persistence adapter.
 * Ideal for Node.js environments, Vitest testing, and headless SSR executions.
 */
export class MemoryDraftStorageAdapter implements IDraftStoragePort {
  private drafts: Map<string, FormDraftSnapshot> = new Map();

  saveDraft(snapshot: FormDraftSnapshot): void {
    // Deep clone to isolate stored snapshot from active mutable references
    this.drafts.set(snapshot.schemaId, JSON.parse(JSON.stringify(snapshot)));
  }

  loadDraft(schemaId: string): FormDraftSnapshot | null {
    const draft = this.drafts.get(schemaId);
    if (!draft) return null;
    return JSON.parse(JSON.stringify(draft));
  }

  clearDraft(schemaId: string): void {
    this.drafts.delete(schemaId);
  }

  hasDraft(schemaId: string): boolean {
    return this.drafts.has(schemaId);
  }
}
