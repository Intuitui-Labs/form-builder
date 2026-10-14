import type {
  AddressCandidate,
  PickedContact,
  BatchSetOptions,
  BatchEnrichmentResult,
  FieldOriginInfo,
} from '../../ports/index.js';
import type { IEntityExtractorPort } from '../../ports/IEntityExtractorPort.js';
import { RegexRuleExtractorAdapter } from '../../adapters/ai/RegexRuleExtractorAdapter.js';
import { AddressFieldMapper, type ExplicitAddressFieldMap } from '../../affordance/AddressFieldMapper.js';
import { ContactFieldMapper, type ExplicitContactFieldMap } from '../../affordance/ContactFieldMapper.js';
import type { MultiStepCoordinatorContext } from './types.js';

export class FieldEnrichmentCoordinator<T extends Record<string, unknown>> {
  constructor(private ctx: MultiStepCoordinatorContext<T>) {}

  /**
   * Atomically enriches multiple form fields in a single transaction.
   * Dispatches lifecycle transitions and auto-saves drafts when appropriate.
   */
  public batchSetFieldValues(
    updates: Partial<T>,
    options?: BatchSetOptions<T>,
  ): BatchEnrichmentResult<T> {
    const result = this.ctx.formManager.batchSetFieldValues(updates, options);
    if (result.appliedFields.length > 0) {
      for (const field of result.appliedFields) {
        const val = this.ctx.formManager.getState().values[field];
        this.ctx.lifecyclePort.send({
          type: 'FIELD_CHANGE',
          field,
          value: val,
        });
      }
      if (this.ctx.autoSaveDraft && this.ctx.isHydrated()) {
        this.ctx.scheduleAutoSaveDraft();
      }
      this.ctx.notify();
    }
    return result;
  }

  /**
   * Reverts fields that were enriched via autofill back to their previous values.
   */
  public revertEnrichedFields(fields?: Array<keyof T>): Array<keyof T> {
    const reverted = this.ctx.formManager.revertEnrichedFields(fields);
    if (reverted.length > 0) {
      for (const field of reverted) {
        const val = this.ctx.formManager.getState().values[field];
        this.ctx.lifecyclePort.send({
          type: 'FIELD_CHANGE',
          field,
          value: val,
        });
      }
      if (this.ctx.autoSaveDraft && this.ctx.isHydrated()) {
        this.ctx.scheduleAutoSaveDraft();
      }
      this.ctx.notify();
    }
    return reverted;
  }

  /**
   * Retrieves audit origin information for a field.
   */
  public getFieldOrigin<K extends keyof T>(field: K): FieldOriginInfo | undefined {
    return this.ctx.formManager.getFieldOrigin(field);
  }

  /**
   * Enriches multi-step form fields from an AddressCandidate, automatically inferring
   * mappings across all schema pages.
   */
  public enrichFromAddressCandidate(
    candidate: Partial<AddressCandidate>,
    options?: BatchSetOptions<T> & { explicitMap?: ExplicitAddressFieldMap },
  ): BatchEnrichmentResult<T> {
    const allFields = this.ctx.schema.pages.flatMap((p) => p.fields);
    const fieldMap = options?.explicitMap ?? AddressFieldMapper.inferFieldMap(allFields);
    const updates = AddressFieldMapper.candidateToFormValues(candidate, fieldMap) as Partial<T>;
    return this.batchSetFieldValues(updates, {
      origin: options?.origin ?? 'autofill-address',
      overwritePolicy: options?.overwritePolicy ?? 'preserve-user-edits',
      ...options,
    });
  }

  /**
   * Alias for enrichFromAddressCandidate.
   */
  public enrichFromAddress(
    candidate: Partial<AddressCandidate>,
    options?: BatchSetOptions<T> & { explicitMap?: ExplicitAddressFieldMap },
  ): BatchEnrichmentResult<T> {
    return this.enrichFromAddressCandidate(candidate, options);
  }

  /**
   * Enriches multi-step form fields from a PickedContact, decomposing name components,
   * assigning contact channels, and unpacking addresses across pages.
   */
  public enrichFromContact(
    contact: Partial<PickedContact>,
    options?: BatchSetOptions<T> & { explicitMap?: ExplicitContactFieldMap },
  ): BatchEnrichmentResult<T> {
    const allFields = this.ctx.schema.pages.flatMap((p) => p.fields);
    const fieldMap = options?.explicitMap ?? ContactFieldMapper.inferFieldMap(allFields);
    const updates = ContactFieldMapper.contactToFormValues(contact, fieldMap) as Partial<T>;
    return this.batchSetFieldValues(updates, {
      origin: options?.origin ?? 'autofill-contact',
      overwritePolicy: options?.overwritePolicy ?? 'preserve-user-edits',
      ...options,
    });
  }

  /**
   * Enriches multi-step form fields from freeform unstructured text across all pages.
   */
  public async enrichFromFreeformText(
    text: string,
    options?: BatchSetOptions<T> & {
      extractor?: IEntityExtractorPort;
      minConfidenceThreshold?: number;
    },
  ): Promise<BatchEnrichmentResult<T>> {
    const extractor = options?.extractor ?? new RegexRuleExtractorAdapter();
    const threshold = options?.minConfidenceThreshold ?? 0.7;
    const allFields = this.ctx.schema.pages.flatMap((p) => p.fields);

    const entities = await extractor.extractEntities({
      text,
      targetFields: allFields,
    });

    const updates: Partial<T> = {};
    const fieldMap = new Set(allFields.map((f) => f.name));
    for (const entity of entities) {
      if (entity.confidence >= threshold && fieldMap.has(entity.field)) {
        updates[entity.field as keyof T] = entity.value as T[keyof T];
      }
    }

    return this.batchSetFieldValues(updates, {
      origin: options?.origin ?? 'ghost-paste',
      overwritePolicy: options?.overwritePolicy ?? 'preserve-user-edits',
      ...options,
    });
  }
}
