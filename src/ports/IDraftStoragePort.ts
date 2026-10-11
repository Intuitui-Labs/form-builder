import type { FormDraftSnapshot } from '../schema/FormDraft.js';

/**
 * Outbound Port: Contract for persisting, retrieving, and clearing local form drafts.
 */
export interface IDraftStoragePort {
  saveDraft(snapshot: FormDraftSnapshot): Promise<void> | void;
  loadDraft(schemaId: string): Promise<FormDraftSnapshot | null> | FormDraftSnapshot | null;
  clearDraft(schemaId: string): Promise<void> | void;
  hasDraft(schemaId: string): Promise<boolean> | boolean;
}
