import { FormApi } from '@tanstack/form-core';
import { applyRule, type ValidationResult } from '../validation/ValidationEngine.js';
import type { Condition } from '../schema/FormBranching.js';
import type { NormalizerType, ValidatorRule, FieldType, SemanticIntent, FormField } from '../schema/FormSchema.js';
import { ConditionEvaluator } from '../core/ConditionEvaluator.js';
import { FieldDependencyGraph } from '../core/DependencyGraph.js';
import { ValueNormalizer } from '../core/ValueNormalizer.js';

import type { ITelemetryPort } from '../ports/ITelemetryPort.js';
import type { AddressCandidate, PickedContact } from '../ports/IAddressAutofillPort.js';
import type { IEntityExtractorPort } from '../ports/IEntityExtractorPort.js';
import type { IHapticFeedbackPort } from '../ports/IHapticFeedbackPort.js';
import { RegexRuleExtractorAdapter } from '../adapters/ai/RegexRuleExtractorAdapter.js';
import { AddressFieldMapper, type ExplicitAddressFieldMap } from '../affordance/AddressFieldMapper.js';
import { ContactFieldMapper, type ExplicitContactFieldMap } from '../affordance/ContactFieldMapper.js';

export interface FormFieldConfig<T = unknown> {
  label?: string;
  type: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: T;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  scaleType?: 'emoji' | 'numeric';
  validators?: Array<(value: T, allValues?: Record<string, unknown>) => ValidationResult>;
  rules?: ValidatorRule[];
  visibleIf?: Condition;
  clearValueOnHide?: boolean;
  dependsOn?: string[];
  normalizer?: NormalizerType | ((value: unknown) => unknown);
  normalizeOn?: 'blur' | 'change';
  computed?: {
    expression?: string;
    fn?: (values: Record<string, unknown>) => unknown;
    dependsOn?: string[];
  };
  semanticIntent?: SemanticIntent;
}

export interface FormConfig<T extends Record<string, unknown> = Record<string, unknown>> {
  fields: { [K in keyof T]: FormFieldConfig<T[K]> };
  onSubmit: (values: T) => Promise<void> | void;
  onError?: (error: string) => void;
  telemetry?: ITelemetryPort;
  hapticPort?: IHapticFeedbackPort;
  formId?: string;
  schemaVersion?: string;
  experimentLineage?: {
    experimentKey: string;
    variantId: string;
  };
  entityExtractor?: IEntityExtractorPort;
}

export type FormState<T extends Record<string, unknown>> = {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
  isDirty: boolean;
  isValid: boolean;
  submitError: string | null;
  submitSuccess: boolean;
};

export type OverwritePolicy = 'always' | 'empty-only' | 'preserve-user-edits' | 'if-empty';

export interface BatchSetOptions<T> {
  overwritePolicy?: OverwritePolicy;
  origin?: string;
  skipNormalization?: boolean;
  silent?: boolean;
}

export interface FieldOriginInfo {
  origin: string;
  timestamp: number;
  previousValue?: unknown;
}

export interface BatchEnrichmentResult<T> {
  appliedFields: Array<keyof T>;
  appliedCount: number;
  skippedFields: Array<{
    field: keyof T;
    reason: 'already_set' | 'user_edited';
    currentValue: unknown;
    attemptedValue: unknown;
  }>;
  rollback: () => Array<keyof T>;
}

function getInitialFieldValue(fieldConfig: { defaultValue?: unknown; type?: string }): unknown {
  if (fieldConfig.defaultValue !== undefined) {

    return fieldConfig.defaultValue;
  }
  switch (fieldConfig.type) {
    case 'number':
    case 'slider':
    case 'rating':
      return null;
    case 'checkbox':
    case 'switch':
      return false;
    case 'multiselect':
    case 'tags':
      return [];
    default:
      return '';
  }
}

export class FormManager<T extends Record<string, unknown>> {
  private tsForm: FormApi<T, any>;
  public config: FormConfig<T>;
  private fieldErrors: Partial<Record<keyof T, string>> = {};
  private touchedFields: Partial<Record<keyof T, boolean>> = {};
  private submitError: string | null = null;
  private submitSuccess = false;
  private dependencyGraph: FieldDependencyGraph = new FieldDependencyGraph();
  private telemetry?: ITelemetryPort;
  private formId: string;
  private formStartTime: number;
  private fieldFocusTimestamps: Map<keyof T, number> = new Map();
  private fieldOrigins: Map<keyof T, FieldOriginInfo> = new Map();

  constructor(config: FormConfig<T>) {
    this.config = config;
    this.telemetry = config.telemetry;
    this.formId = config.formId ?? 'form_root';
    this.formStartTime = Date.now();

    if (this.telemetry) {
      this.telemetry.dispatch({
        type: 'form_mounted',
        formId: this.formId,
        schemaVersion: config.schemaVersion ?? '1.0.0',
        experimentLineage: config.experimentLineage,
        timestamp: this.formStartTime,
      });
    }

    // Register dependency edges in DAG
    for (const fieldName in config.fields) {
      const fieldConfig = config.fields[fieldName];
      if (!fieldConfig) continue;

      if (fieldConfig.dependsOn) {
        for (const dep of fieldConfig.dependsOn) {
          this.dependencyGraph.addDependency(fieldName, dep);
        }
      }

      if (fieldConfig.computed?.dependsOn) {
        for (const dep of fieldConfig.computed.dependsOn) {
          this.dependencyGraph.addDependency(fieldName, dep);
        }
      }

      if (fieldConfig.rules) {
        if (!fieldConfig.validators) {
          fieldConfig.validators = fieldConfig.rules.map((rule) => {
            return (val: unknown, allVals?: Record<string, unknown>) =>
              applyRule(rule, val, fieldConfig.label || fieldName, allVals);
          });
        }
        for (const rule of fieldConfig.rules) {
          if ('targetField' in rule && rule.targetField) {
            this.dependencyGraph.addDependency(fieldName, rule.targetField);
          }
        }
      }
    }

    // Detect circular dependency cycles
    const cycle = this.dependencyGraph.detectCycles();
    if (cycle) {
      throw new Error(
        `Circular dependency detected in form schema between fields: ${cycle.join(' -> ')}`
      );
    }

    const initialValues = {} as T;
    for (const key in config.fields) {
      (initialValues as Record<string, unknown>)[key] = getInitialFieldValue(config.fields[key]);
    }

    this.tsForm = new FormApi<T, any>({
      defaultValues: initialValues,
      onSubmit: async ({ value }: { value: T }) => {
        this.submitError = null;
        this.submitSuccess = false;
        try {
          // Prune hidden field values where clearValueOnHide !== false
          const sanitizedValues = { ...value } as T;
          for (const key in this.config.fields) {
            const fieldConfig = this.config.fields[key];
            if (fieldConfig && !this.isFieldVisible(key) && fieldConfig.clearValueOnHide !== false) {
              delete (sanitizedValues as Record<string, unknown>)[key];
            }
          }
          await this.config.onSubmit(sanitizedValues);
          this.submitSuccess = true;
        } catch (err) {
          this.submitError = err instanceof Error ? err.message : 'An error occurred';
          if (this.config.onError) this.config.onError(this.submitError);
          throw err;
        }
      },
    });
    this.tsForm.mount?.();
  }

  public getState(): FormState<T> {
    const tsState = this.tsForm.state;
    const errorsCount = Object.keys(this.fieldErrors).length;

    return {
      values: tsState.values,
      errors: { ...this.fieldErrors },
      touched: { ...this.touchedFields },
      isSubmitting: tsState.isSubmitting,
      isDirty: tsState.isDirty,
      isValid: errorsCount === 0,
      submitError: this.submitError,
      submitSuccess: this.submitSuccess,
    };
  }

  public getConfig(): FormConfig<T> {
    return this.config;
  }

  public subscribe(callback: (state: FormState<T>) => void): () => void {
    callback(this.getState());
    return this.tsForm.store.subscribe(() => {
      callback(this.getState());
    });
  }

  /**
   * Subscribes specifically to changes affecting a single field (value, error, visibility).
   * Prevents full-form 60 FPS re-renders during high-frequency typing on mobile.
   */
  public subscribeToField<K extends keyof T>(
    field: K,
    callback: (value: T[K], error?: string, isVisible?: boolean) => void,
  ): () => void {
    let lastValue = this.tsForm.state.values[field];
    let lastError = this.fieldErrors[field];
    let lastVisible = this.isFieldVisible(field);

    callback(lastValue, lastError, lastVisible);

    return this.tsForm.store.subscribe(() => {
      const currentValue = this.tsForm.state.values[field];
      const currentError = this.fieldErrors[field];
      const currentVisible = this.isFieldVisible(field);

      if (
        currentValue !== lastValue ||
        currentError !== lastError ||
        currentVisible !== lastVisible
      ) {
        lastValue = currentValue;
        lastError = currentError;
        lastVisible = currentVisible;
        callback(currentValue, currentError, currentVisible);
      }
    });
  }

  public setFieldTouched<K extends keyof T>(field: K, isTouched = true): void {
    this.touchedFields[field] = isTouched;
    this.syncErrorMap();
  }

  public isFieldTouched<K extends keyof T>(field: K): boolean {
    return Boolean(this.touchedFields[field]);
  }

  public resetFieldValidation<K extends keyof T>(field: K): void {
    delete this.fieldErrors[field];
    delete this.touchedFields[field];
    this.syncErrorMap();
  }



  /**
   * Evaluates reactive visibility for a given field based on current form values.
   */
  public isFieldVisible(field: keyof T): boolean {
    const fieldConfig = this.config.fields[field];
    if (!fieldConfig || !fieldConfig.visibleIf) {
      return true;
    }
    return ConditionEvaluator.evaluate(
      fieldConfig.visibleIf,
      this.tsForm.state.values as Record<string, unknown>,
    );
  }

  /**
   * Records field focus timestamp and emits field_focused telemetry.
   */
  public focusField(field: keyof T): void {
    this.fieldFocusTimestamps.set(field, Date.now());
    if (this.telemetry) {
      this.telemetry.dispatch({
        type: 'field_focused',
        formId: this.formId,
        stepIndex: 0,
        fieldName: String(field),
        timestamp: Date.now(),
      });
    }
  }

  public blurField<K extends keyof T>(field: K): void {
    const focusTime = this.fieldFocusTimestamps.get(field);
    const dwellMs = focusTime ? Math.max(0, Date.now() - focusTime) : 0;
    this.fieldFocusTimestamps.delete(field);

    const val = this.tsForm.state.values[field];
    const hasValue = val !== undefined && val !== null && val !== '';
    const valueLength =
      typeof val === 'string'
        ? val.length
        : Array.isArray(val)
          ? val.length
          : undefined;

    if (this.telemetry) {
      this.telemetry.dispatch({
        type: 'field_blurred',
        formId: this.formId,
        stepIndex: 0,
        fieldName: String(field),
        dwellMs,
        hasValue,
        valueLength,
        timestamp: Date.now(),
      });
    }

    this.setFieldTouched(field, true);
    const fieldConfig = this.config.fields[field];
    if (fieldConfig?.normalizer && fieldConfig.normalizeOn !== 'change') {
      const currentVal = this.tsForm.state.values[field];
      const normalized = ValueNormalizer.normalize(currentVal, fieldConfig.normalizer) as T[K];
      if (normalized !== currentVal) {
        this.setFieldValue(field, normalized, { skipNormalization: true });
      }
    }
  }

  public getDependencyGraph(): FieldDependencyGraph {
    return this.dependencyGraph;
  }

  public getFieldValue<K extends keyof T>(field: K): T[K] {
    return this.tsForm.state.values[field];
  }

  public setFieldValue<K extends keyof T>(
    field: K,
    value: T[K],
    options?: { skipNormalization?: boolean; origin?: string },
  ) {
    const previousValue = this.tsForm.state.values[field];
    const fieldConfig = this.config.fields[field];
    let finalValue = value;
    if (fieldConfig?.normalizer && !options?.skipNormalization && fieldConfig.normalizeOn === 'change') {
      finalValue = ValueNormalizer.normalize(value, fieldConfig.normalizer) as T[K];
    }

    this.fieldOrigins.set(field, {
      origin: options?.origin ?? 'user',
      timestamp: Date.now(),
      previousValue,
    });

    this.touchedFields[field] = true;
    this.tsForm.setFieldValue(field as any, finalValue as any);
    this.validateField(field);

    // Re-evaluate visibility for dependent fields and clean up errors for newly hidden fields
    for (const otherField in this.config.fields) {
      if ((otherField as keyof T) !== field && this.config.fields[otherField].visibleIf) {
        if (!this.isFieldVisible(otherField)) {
          delete this.fieldErrors[otherField];
        }
      }
    }

    // Reactive topological dependency updates:
    const dependents = this.dependencyGraph.getDependents(String(field));
    for (const dep of dependents) {
      const depConfig = this.config.fields[dep as keyof T];
      if (depConfig) {
        // 1. Recompute derived value if computed
        if (depConfig.computed?.fn) {
          const derived = depConfig.computed.fn(
            this.tsForm.state.values as Record<string, unknown>
          );
          this.tsForm.setFieldValue(dep as any, derived as any);
        }
        // 2. Re-validate dependent field with latest values
        this.validateField(dep as keyof T);
      }
    }

    this.syncErrorMap();
  }

  /**
   * Atomically enriches multiple form fields in a single transaction.
   * Respects overwrite policies to protect user agency, recalculates downstream
   * DAG dependencies once, and syncs validation without multiple render cascades.
   */
  public batchSetFieldValues(
    updates: Partial<T>,
    options?: BatchSetOptions<T>,
  ): BatchEnrichmentResult<T> {
    const rawPolicy = options?.overwritePolicy ?? 'always';
    const policy = rawPolicy === 'if-empty' ? 'empty-only' : rawPolicy;
    const origin = options?.origin ?? 'autofill';
    const appliedFields: Array<keyof T> = [];
    const skippedFields: BatchEnrichmentResult<T>['skippedFields'] = [];

    const currentValues = this.tsForm.state.values;

    for (const keyStr in updates) {
      const field = keyStr as keyof T;
      if (!(field in this.config.fields)) continue;

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
      const fieldConfig = this.config.fields[field];
      let finalValue = nextValue as T[keyof T];
      if (fieldConfig?.normalizer && !options?.skipNormalization && fieldConfig.normalizeOn === 'change') {
        finalValue = ValueNormalizer.normalize(nextValue, fieldConfig.normalizer) as T[keyof T];
      }

      this.fieldOrigins.set(field, {
        origin,
        timestamp: Date.now(),
        previousValue: currentValue,
      });

      this.touchedFields[field] = true;
      this.tsForm.setFieldValue(field as any, finalValue as any);
      appliedFields.push(field);
    }

    if (appliedFields.length > 0) {
      // Re-evaluate visibility for dependent fields
      for (const otherField in this.config.fields) {
        if (!appliedFields.includes(otherField as keyof T) && this.config.fields[otherField].visibleIf) {
          if (!this.isFieldVisible(otherField)) {
            delete this.fieldErrors[otherField];
          }
        }
      }

      // Collect all downstream dependents across all applied fields
      const allDependents = new Set<string>();
      for (const field of appliedFields) {
        const deps = this.dependencyGraph.getDependents(String(field));
        for (const d of deps) {
          allDependents.add(d);
        }
      }

      // Recompute derived fields in DAG order
      for (const dep of allDependents) {
        const depConfig = this.config.fields[dep as keyof T];
        if (depConfig) {
          if (depConfig.computed?.fn) {
            const derived = depConfig.computed.fn(
              this.tsForm.state.values as Record<string, unknown>
            );
            this.tsForm.setFieldValue(dep as any, derived as any);
          }
          this.validateField(dep as keyof T);
        }
      }

      // Validate all newly enriched fields
      for (const field of appliedFields) {
        this.validateField(field);
      }

      this.syncErrorMap();

      if (this.telemetry && !options?.silent) {
        this.telemetry.dispatch({
          type: 'fields_enriched',
          formId: this.formId,
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
      rollback: () => this.revertEnrichedFields(appliedFields),
    };
  }

  /**
   * Reverts fields that were enriched via autofill back to their previous value.
   * If no specific fields are provided, all autofilled fields with recorded previous values are restored.
   */
  public revertEnrichedFields(fields?: Array<keyof T>): Array<keyof T> {
    const targetFields = fields ?? Array.from(this.fieldOrigins.keys());
    const reverted: Array<keyof T> = [];

    for (const field of targetFields) {
      const info = this.fieldOrigins.get(field);
      if (info && info.previousValue !== undefined && info.origin !== 'user') {
        this.setFieldValue(field, info.previousValue as T[keyof T], {
          origin: 'revert',
          skipNormalization: true,
        });
        reverted.push(field);
      }
    }

    return reverted;
  }

  public getFieldOrigin<K extends keyof T>(field: K): FieldOriginInfo | undefined {
    return this.fieldOrigins.get(field);
  }

  public getAllFieldOrigins(): Partial<Record<keyof T, FieldOriginInfo>> {
    const result: Partial<Record<keyof T, FieldOriginInfo>> = {};
    for (const [key, val] of this.fieldOrigins.entries()) {
      result[key] = val;
    }
    return result;
  }

  /**
   * Enriches form fields from an AddressCandidate, automatically inferring schema mappings
   * if no explicit map is supplied.
   */
  public enrichFromAddressCandidate(
    candidate: Partial<AddressCandidate>,
    options?: BatchSetOptions<T> & { explicitMap?: ExplicitAddressFieldMap },
  ): BatchEnrichmentResult<T> {
    let fieldMap = options?.explicitMap;
    if (!fieldMap) {
      const pseudoFields = Object.entries(this.config.fields).map(([name, conf]) => ({
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
   * Enriches form fields from a PickedContact, decomposing name parts, mapping contact details,
   * and populating embedded postal address fields.
   */
  public enrichFromContact(
    contact: Partial<PickedContact>,
    options?: BatchSetOptions<T> & { explicitMap?: ExplicitContactFieldMap },
  ): BatchEnrichmentResult<T> {
    let fieldMap = options?.explicitMap;
    if (!fieldMap) {
      const pseudoFields = Object.entries(this.config.fields).map(([name, conf]) => ({
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
    });
  }

  /**
   * Enriches form fields from freeform unstructured text (the "Ghost Form" pattern).
   * Extracts candidate entities, filters by confidence threshold, and applies batch updates.
   */
  public async enrichFromFreeformText(
    text: string,
    options?: BatchSetOptions<T> & {
      extractor?: IEntityExtractorPort;
      minConfidenceThreshold?: number;
    },
  ): Promise<BatchEnrichmentResult<T>> {
    const extractor = options?.extractor ?? this.config.entityExtractor ?? new RegexRuleExtractorAdapter();
    const threshold = options?.minConfidenceThreshold ?? 0.7;

    const pseudoFields: FormField[] = Object.entries(this.config.fields).map(([name, conf]) => ({
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
      if (entity.confidence >= threshold && entity.field in this.config.fields) {
        updates[entity.field as keyof T] = entity.value as T[keyof T];
      }
    }

    return this.batchSetFieldValues(updates, {
      origin: options?.origin ?? 'ghost-paste',
      overwritePolicy: options?.overwritePolicy ?? 'preserve-user-edits',
      ...options,
    });
  }

  public validateField(field: keyof T): boolean {
    const fieldConfig = this.config.fields[field];
    if (!fieldConfig) return true;

    // Hidden fields bypass validation completely and clear existing errors
    if (!this.isFieldVisible(field)) {
      if (this.fieldErrors[field]) {
        delete this.fieldErrors[field];
        this.syncErrorMap();
      }
      return true;
    }

    const value = this.tsForm.state.values[field];
    const allValues = this.tsForm.state.values as Record<string, unknown>;

    const isValueEmpty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0);

    if (fieldConfig.required && isValueEmpty) {
      this.fieldErrors[field] = `${fieldConfig.label || String(field)} is required`;
    } else if (fieldConfig.validators) {
      let errorFound = false;
      for (const validator of fieldConfig.validators) {
        const result = validator(value, allValues);
        if (!result.isValid) {
          this.fieldErrors[field] = result.error;
          errorFound = true;
          break;
        }
      }
      if (!errorFound) {
        delete this.fieldErrors[field];
      }
    } else {
      delete this.fieldErrors[field];
    }

    this.syncErrorMap();
    const hasError = Boolean(this.fieldErrors[field]);

    if (hasError && this.telemetry) {
      const fieldConfig = this.config.fields[field];
      const errorRule =
        fieldConfig?.rules?.[0]?.type ??
        (fieldConfig?.required && isValueEmpty ? 'required' : 'validation_failed');
      this.telemetry.dispatch({
        type: 'field_error',
        formId: this.formId,
        stepIndex: 0,
        fieldName: String(field),
        errorRule,
        errorMessage: this.fieldErrors[field],
        timestamp: Date.now(),
      });
    }

    return !hasError;
  }

  public validate(): boolean {
    let allValid = true;
    for (const field in this.config.fields) {
      if (this.isFieldVisible(field)) {
        if (!this.validateField(field)) {
          allValid = false;
        }
      } else {
        delete this.fieldErrors[field];
      }
    }
    this.syncErrorMap();
    return allValid;
  }

  private syncErrorMap() {
    const store: any = (this.tsForm as any).baseStore ?? (this.tsForm as any).store;
    if (store && store.setState) {
      store.setState((prev: any) => ({
        ...prev,
        errorMap: { ...this.fieldErrors },
      }));
    }
  }

  public async submit(options?: { skipValidation?: boolean }) {
    if (!options?.skipValidation && !this.validate()) {
      if (this.telemetry) {
        this.telemetry.dispatch({
          type: 'form_submitted',
          formId: this.formId,
          totalDurationMs: Date.now() - this.formStartTime,
          success: false,
          errorCount: Object.keys(this.fieldErrors).length,
          experimentLineage: this.config.experimentLineage,
          timestamp: Date.now(),
        });
      }
      return;
    }
    try {
      await this.tsForm.handleSubmit();
      if (this.telemetry) {
        const success = this.submitSuccess;
        this.telemetry.dispatch({
          type: 'form_submitted',
          formId: this.formId,
          totalDurationMs: Date.now() - this.formStartTime,
          success,
          errorCount: success ? 0 : 1,
          experimentLineage: this.config.experimentLineage,
          timestamp: Date.now(),
        });
        this.telemetry.flush?.();
      }
    } catch {
      // Handled inside onSubmit callback
      if (this.telemetry) {
        this.telemetry.dispatch({
          type: 'form_submitted',
          formId: this.formId,
          totalDurationMs: Date.now() - this.formStartTime,
          success: false,
          errorCount: 1,
          experimentLineage: this.config.experimentLineage,
          timestamp: Date.now(),
        });
        this.telemetry.flush?.();
      }
    }
  }

  public reset(options?: { recordAbandoned?: boolean }) {
    if (options?.recordAbandoned !== false && this.tsForm.state.isDirty && this.telemetry) {
      this.telemetry.dispatch({
        type: 'form_abandoned',
        formId: this.formId,
        lastStepIndex: 0,
        completedSteps: 0,
        totalDurationMs: Date.now() - this.formStartTime,
        experimentLineage: this.config.experimentLineage,
        timestamp: Date.now(),
      });
    }
    this.fieldErrors = {};
    this.touchedFields = {};
    this.submitError = null;
    this.submitSuccess = false;
    this.tsForm.reset();
    this.syncErrorMap();
  }
}

