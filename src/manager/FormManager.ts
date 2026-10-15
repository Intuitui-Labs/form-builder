import { FormApi } from '@tanstack/form-core';
import type { ValidationResult } from '../validation/ValidationEngine.js';
import type { Condition } from '../schema/FormBranching.js';
import type { NormalizerType, ValidatorRule, SemanticIntent } from '../schema/FormSchema.js';
import { ConditionEvaluator } from '../core/ConditionEvaluator.js';
import { FieldDependencyGraph } from '../core/DependencyGraph.js';
import { ValueNormalizer } from '../core/ValueNormalizer.js';
import type { ITelemetryPort } from '../ports/ITelemetryPort.js';
import type { AddressCandidate, PickedContact } from '../ports/IAddressAutofillPort.js';
import type { IEntityExtractorPort } from '../ports/IEntityExtractorPort.js';
import type { IHapticFeedbackPort } from '../ports/IHapticFeedbackPort.js';
import type { ExplicitAddressFieldMap } from '../affordance/AddressFieldMapper.js';
import type { ExplicitContactFieldMap } from '../affordance/ContactFieldMapper.js';
import type {
  FormState,
  OverwritePolicy,
  BatchSetOptions,
  FieldOriginInfo,
  BatchEnrichmentResult,
} from '../ports/index.js';
import {
  FormEnrichmentEngine,
  type FormEnrichmentContext,
} from './core/FormEnrichmentEngine.js';
import { FormDagEngine } from './core/FormDagEngine.js';
import { FormValidationEngine } from './core/FormValidationEngine.js';

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

export type {
  FormState,
  OverwritePolicy,
  BatchSetOptions,
  FieldOriginInfo,
  BatchEnrichmentResult,
};

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
  private telemetry?: ITelemetryPort;
  private formId: string;
  private formStartTime: number;
  private fieldFocusTimestamps: Map<keyof T, number> = new Map();

  // Modular Sub-Engines
  private dagEngine: FormDagEngine<T>;
  private validationEngine: FormValidationEngine<T>;
  private enrichmentEngine: FormEnrichmentEngine<T>;

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

    // Initialize Sub-Engines
    this.dagEngine = new FormDagEngine<T>(config);
    this.validationEngine = new FormValidationEngine<T>();
    this.enrichmentEngine = new FormEnrichmentEngine<T>();

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

  private getEnrichmentContext(): FormEnrichmentContext<T> {
    return {
      config: this.config,
      tsForm: this.tsForm,
      formId: this.formId,
      telemetry: this.telemetry,
      touchedFields: this.touchedFields,
      fieldErrors: this.fieldErrors,
      isFieldVisible: (f) => this.isFieldVisible(f),
      validateField: (f) => this.validateField(f),
      syncErrorMap: () => this.syncErrorMap(),
      recomputeDependents: (fields) =>
        this.dagEngine.recomputeDependents(fields, this.config, this.tsForm, (f) => this.validateField(f)),
      setFieldValue: (f, v, opts) => this.setFieldValue(f, v, opts),
    };
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
   * Dynamically registers a new field into the active form runtime.
   * Preserves existing form values and updates the dependency DAG.
   */
  public registerField<K extends keyof T>(fieldName: K, fieldConfig: FormFieldConfig<T[K]>): void {
    this.config.fields[fieldName] = fieldConfig;
    const currentValues = this.tsForm.state.values as Record<string, unknown>;
    if (currentValues[fieldName as string] === undefined) {
      const initialVal = getInitialFieldValue(fieldConfig);
      this.tsForm.setFieldValue(fieldName as any, initialVal as any);
    }
    this.dagEngine = new FormDagEngine<T>(this.config);
  }

  /**
   * Dynamically unregisters a field from the active form runtime.
   */
  public unregisterField<K extends keyof T>(fieldName: K): void {
    delete this.config.fields[fieldName];
    delete this.fieldErrors[fieldName];
    delete this.touchedFields[fieldName];
    const anyStore = this.tsForm?.store as any;
    if (typeof anyStore?.setState === 'function') {
      anyStore.setState((prev: any) => {
        const nextValues = { ...(prev?.values || {}) };
        delete nextValues[fieldName as string];
        const nextFields = { ...(prev?.fields || {}) };
        delete nextFields[fieldName as string];
        return {
          ...prev,
          values: nextValues as T,
          fields: nextFields,
        };
      });
    } else if (this.tsForm?.state?.values) {
      delete (this.tsForm.state.values as Record<string, unknown>)[fieldName as string];
    }
    this.dagEngine = new FormDagEngine<T>(this.config);
  }

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
    return this.dagEngine.getDependencyGraph();
  }

  public getFieldValue<K extends keyof T>(field: K): T[K] {
    return this.tsForm.state.values[field];
  }

  public setFieldValue<K extends keyof T>(
    field: K,
    value: T[K],
    options?: { skipNormalization?: boolean; origin?: string },
  ): void {
    const previousValue = this.tsForm.state.values[field];
    const fieldConfig = this.config.fields[field];
    let finalValue = value;
    if (fieldConfig?.normalizer && !options?.skipNormalization && fieldConfig.normalizeOn === 'change') {
      finalValue = ValueNormalizer.normalize(value, fieldConfig.normalizer) as T[K];
    }

    this.enrichmentEngine.setFieldOrigin(field, {
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

    // Reactive topological dependency updates via dagEngine
    this.dagEngine.recomputeDependents([field], this.config, this.tsForm, (dep) =>
      this.validateField(dep)
    );

    this.syncErrorMap();
  }

  public batchSetFieldValues(
    updates: Partial<T>,
    options?: BatchSetOptions<T>,
  ): BatchEnrichmentResult<T> {
    return this.enrichmentEngine.batchSetFieldValues(updates, options, this.getEnrichmentContext());
  }

  public revertEnrichedFields(fields?: Array<keyof T>): Array<keyof T> {
    return this.enrichmentEngine.revertEnrichedFields(fields, this.getEnrichmentContext());
  }

  public getFieldOrigin<K extends keyof T>(field: K): FieldOriginInfo | undefined {
    return this.enrichmentEngine.getFieldOrigin(field);
  }

  public getAllFieldOrigins(): Partial<Record<keyof T, FieldOriginInfo>> {
    return this.enrichmentEngine.getAllFieldOrigins();
  }

  public enrichFromAddressCandidate(
    candidate: Partial<AddressCandidate>,
    options?: BatchSetOptions<T> & { explicitMap?: ExplicitAddressFieldMap },
  ): BatchEnrichmentResult<T> {
    return this.enrichmentEngine.enrichFromAddressCandidate(candidate, options, this.getEnrichmentContext());
  }

  public enrichFromAddress(
    candidate: Partial<AddressCandidate>,
    options?: BatchSetOptions<T> & { explicitMap?: ExplicitAddressFieldMap },
  ): BatchEnrichmentResult<T> {
    return this.enrichFromAddressCandidate(candidate, options);
  }

  public enrichFromContact(
    contact: Partial<PickedContact>,
    options?: BatchSetOptions<T> & { explicitMap?: ExplicitContactFieldMap },
  ): BatchEnrichmentResult<T> {
    return this.enrichmentEngine.enrichFromContact(contact, options, this.getEnrichmentContext());
  }

  public async enrichFromFreeformText(
    text: string,
    options?: BatchSetOptions<T> & {
      extractor?: IEntityExtractorPort;
      minConfidenceThreshold?: number;
    },
  ): Promise<BatchEnrichmentResult<T>> {
    return this.enrichmentEngine.enrichFromFreeformText(text, options, this.getEnrichmentContext());
  }

  public validateField(field: keyof T): boolean {
    return this.validationEngine.validateField(
      field,
      this.config,
      this.tsForm,
      this.fieldErrors,
      (f) => this.isFieldVisible(f),
      () => this.syncErrorMap(),
      this.telemetry,
      this.formId
    );
  }

  public validate(): boolean {
    return this.validationEngine.validate(
      this.config,
      this.fieldErrors,
      (f) => this.isFieldVisible(f),
      (f) => this.validateField(f),
      () => this.syncErrorMap()
    );
  }

  private syncErrorMap() {
    this.validationEngine.syncErrorMap(this.tsForm, this.fieldErrors);
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
    this.enrichmentEngine.clearFieldOrigins();
    this.tsForm.reset();
    this.syncErrorMap();
  }
}
