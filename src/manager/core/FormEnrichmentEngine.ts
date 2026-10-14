import type { FormApi } from '@tanstack/form-core';
import type { FieldType, FormField, SemanticIntent } from '../../schema/FormSchema.js';
import { ValueNormalizer } from '../../core/ValueNormalizer.js';
import type { ITelemetryPort } from '../../ports/ITelemetryPort.js';
import type { AddressCandidate, PickedContact } from '../../ports/IAddressAutofillPort.js';
import type { IEntityExtractorPort } from '../../ports/IEntityExtractorPort.js';
import { RegexRuleExtractorAdapter } from '../../adapters/ai/RegexRuleExtractorAdapter.js';
import { AddressFieldMapper, type ExplicitAddressFieldMap } from '../../affordance/AddressFieldMapper.js';
import { ContactFieldMapper, type ExplicitContactFieldMap } from '../../affordance/ContactFieldMapper.js';
import type {
  BatchSetOptions,
  BatchEnrichmentResult,
  FieldOriginInfo,
} from '../../ports/index.js';
import type { FormConfig, FormFieldConfig } from '../FormManager.js';

export interface FormEnrichmentContext<T extends Record<string, unknown>> {
  config: FormConfig<T>;
  tsForm: FormApi<T, any>;
  formId: string;
  telemetry?: ITelemetryPort;
  touchedFields: Partial<Record<keyof T, boolean>>;
  fieldErrors: Partial<Record<keyof T, string>>;
  isFieldVisible: (field: keyof T) => boolean;
  validateField: (field: keyof T) => boolean;
  syncErrorMap: () => void;
  recomputeDependents: (fields: Array<keyof T>) => void;
  setFieldValue: <K extends keyof T>(
    field: K,
    value: T[K],
    options?: { skipNormalization?: boolean; origin?: string }
  ) => void;
}

export class FormEnrichmentEngine<T extends Record<string, unknown>> {
  private fieldOrigins: Map<keyof T, FieldOriginInfo> = new Map();

  public getFieldOrigin<K extends keyof T>(field: K): FieldOriginInfo | undefined {
    return this.fieldOrigins.get(field);
  }

  public setFieldOrigin<K extends keyof T>(field: K, info: FieldOriginInfo): void {
    this.fieldOrigins.set(field, info);
  }

  public getAllFieldOrigins(): Partial<Record<keyof T, FieldOriginInfo>> {
    const result: Partial<Record<keyof T, FieldOriginInfo>> = {};
    for (const [key, val] of this.fieldOrigins.entries()) {
      result[key] = val;
    }
    return result;
  }

  public clearFieldOrigins(): void {
    this.fieldOrigins.clear();
  }

  /**
   * Atomically enriches multiple form fields in a single transaction.
   * Respects overwrite policies to protect user agency, recalculates downstream
   * DAG dependencies once, and syncs validation without multiple render cascades.
   */
  public batchSetFieldValues(
    updates: Partial<T>,
    options: BatchSetOptions<T> | undefined,
    ctx: FormEnrichmentContext<T>
  ): BatchEnrichmentResult<T> {
    const rawPolicy = options?.overwritePolicy ?? 'always';
    const policy = rawPolicy === 'if-empty' ? 'empty-only' : rawPolicy;
    const origin = options?.origin ?? 'autofill';
    const appliedFields: Array<keyof T> = [];
    const skippedFields: BatchEnrichmentResult<T>['skippedFields'] = [];

    const currentValues = ctx.tsForm.state.values;

    for (const keyStr in updates) {
      const field = keyStr as keyof T;
      if (!(field in ctx.config.fields)) continue;

      const currentValue = currentValues[field];
      const nextValue = updates[field];
      const isCurrentEmpty =
        currentValue === undefined ||
        currentValue === null ||
        currentValue === '' ||
        (Array.isArray(currentValue) && currentValue.length === 0);

      const existingOrigin = this.fieldOrigins.get(field);
      const isUserEdited = existingOrigin?.origin === 'user';

      if (policy === 'empty-only' && !isCurrentEmpty) {
        skippedFields.push({
          field,
          reason: 'already_set',
          currentValue,
          attemptedValue: nextValue,
        });
        continue;
      }

      if (policy === 'preserve-user-edits' && isUserEdited && !isCurrentEmpty) {
        skippedFields.push({
          field,
          reason: 'user_edited',
          currentValue,
          attemptedValue: nextValue,
        });
        continue;
      }

      // Normalization check
      const fieldConfig = ctx.config.fields[field];
      let finalValue = nextValue as T[keyof T];
      if (fieldConfig?.normalizer && !options?.skipNormalization && fieldConfig.normalizeOn === 'change') {
        finalValue = ValueNormalizer.normalize(nextValue, fieldConfig.normalizer) as T[keyof T];
      }

      this.fieldOrigins.set(field, {
        origin,
        timestamp: Date.now(),
        previousValue: currentValue,
      });

      ctx.touchedFields[field] = true;
      ctx.tsForm.setFieldValue(field as any, finalValue as any);
      appliedFields.push(field);
    }

    if (appliedFields.length > 0) {
      // Re-evaluate visibility for dependent fields
      for (const otherField in ctx.config.fields) {
        if (!appliedFields.includes(otherField as keyof T) && ctx.config.fields[otherField].visibleIf) {
          if (!ctx.isFieldVisible(otherField)) {
            delete ctx.fieldErrors[otherField];
          }
        }
      }

      // Recompute derived fields in DAG order
      ctx.recomputeDependents(appliedFields);

      // Validate all newly enriched fields
      for (const field of appliedFields) {
        ctx.validateField(field);
      }

      ctx.syncErrorMap();

      if (ctx.telemetry && !options?.silent) {
        ctx.telemetry.dispatch({
          type: 'fields_enriched',
          formId: ctx.formId,
          source: origin,
          fieldNames: appliedFields.map(String),
          overwritePolicy: policy,
          appliedCount: appliedFields.length,
          skippedCount: skippedFields.length,
          timestamp: Date.now(),
        });
      }
    }

    return {
      appliedFields,
      appliedCount: appliedFields.length,
      skippedFields,
      rollback: () => this.revertEnrichedFields(appliedFields, ctx),
    };
  }

  /**
   * Reverts fields that were enriched via autofill back to their previous value.
   * If no specific fields are provided, all autofilled fields with recorded previous values are restored.
   */
  public revertEnrichedFields(
    fields: Array<keyof T> | undefined,
    ctx: FormEnrichmentContext<T>
  ): Array<keyof T> {
    const targetFields = fields ?? Array.from(this.fieldOrigins.keys());
    const reverted: Array<keyof T> = [];

    for (const field of targetFields) {
      const info = this.fieldOrigins.get(field);
      if (info && info.previousValue !== undefined && info.origin !== 'user') {
        ctx.setFieldValue(field, info.previousValue as T[keyof T], {
          origin: 'revert',
          skipNormalization: true,
        });
        reverted.push(field);
      }
    }

    return reverted;
  }

  public enrichFromAddressCandidate(
    candidate: Partial<AddressCandidate>,
    options: (BatchSetOptions<T> & { explicitMap?: ExplicitAddressFieldMap }) | undefined,
    ctx: FormEnrichmentContext<T>
  ): BatchEnrichmentResult<T> {
    let fieldMap = options?.explicitMap;
    if (!fieldMap) {
      const pseudoFields = Object.entries(ctx.config.fields).map(([name, conf]) => ({
        id: name,
        name,
        label: (conf as FormFieldConfig).label || name,
        type: ((conf as FormFieldConfig).type || 'text') as FieldType,
        semanticIntent: (conf as FormFieldConfig).semanticIntent,
        required: Boolean((conf as FormFieldConfig).required),
        order: 0,
      }));
      fieldMap = AddressFieldMapper.inferFieldMap(pseudoFields as unknown as FormField[]);
    }
    const updates = AddressFieldMapper.candidateToFormValues(candidate, fieldMap) as Partial<T>;
    return this.batchSetFieldValues(updates, {
      origin: options?.origin ?? 'autofill-address',
      overwritePolicy: options?.overwritePolicy ?? 'preserve-user-edits',
      ...options,
    }, ctx);
  }

  public enrichFromContact(
    contact: Partial<PickedContact>,
    options: (BatchSetOptions<T> & { explicitMap?: ExplicitContactFieldMap }) | undefined,
    ctx: FormEnrichmentContext<T>
  ): BatchEnrichmentResult<T> {
    let fieldMap = options?.explicitMap;
    if (!fieldMap) {
      const pseudoFields = Object.entries(ctx.config.fields).map(([name, conf]) => ({
        id: name,
        name,
        label: (conf as FormFieldConfig).label || name,
        type: ((conf as FormFieldConfig).type || 'text') as FieldType,
        semanticIntent: (conf as FormFieldConfig).semanticIntent,
        required: Boolean((conf as FormFieldConfig).required),
        order: 0,
      }));
      fieldMap = ContactFieldMapper.inferFieldMap(pseudoFields as unknown as FormField[]);
    }
    const updates = ContactFieldMapper.contactToFormValues(contact, fieldMap) as Partial<T>;
    return this.batchSetFieldValues(updates, {
      origin: options?.origin ?? 'autofill-contact',
      overwritePolicy: options?.overwritePolicy ?? 'preserve-user-edits',
      ...options,
    }, ctx);
  }

  public async enrichFromFreeformText(
    text: string,
    options: (BatchSetOptions<T> & {
      extractor?: IEntityExtractorPort;
      minConfidenceThreshold?: number;
    }) | undefined,
    ctx: FormEnrichmentContext<T>
  ): Promise<BatchEnrichmentResult<T>> {
    const extractor = options?.extractor ?? ctx.config.entityExtractor ?? new RegexRuleExtractorAdapter();
    const threshold = options?.minConfidenceThreshold ?? 0.7;

    const pseudoFields: FormField[] = Object.entries(ctx.config.fields).map(([name, conf]) => ({
      id: name,
      name,
      label: (conf as FormFieldConfig).label || name,
      type: ((conf as FormFieldConfig).type || 'text') as FieldType,
      semanticIntent: (conf as FormFieldConfig).semanticIntent as SemanticIntent | undefined,
      required: Boolean((conf as FormFieldConfig).required),
      order: 0,
    }));

    const entities = await extractor.extractEntities({
      text,
      targetFields: pseudoFields,
    });

    const updates: Partial<T> = {};
    for (const entity of entities) {
      if (entity.confidence >= threshold && entity.field in ctx.config.fields) {
        updates[entity.field as keyof T] = entity.value as T[keyof T];
      }
    }

    return this.batchSetFieldValues(updates, {
      origin: options?.origin ?? 'ghost-paste',
      overwritePolicy: options?.overwritePolicy ?? 'preserve-user-edits',
      ...options,
    }, ctx);
  }
}
