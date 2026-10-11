import { FormApi } from '@tanstack/form-core';
import { applyRule, type ValidationResult } from '../validation/ValidationEngine.js';
import type { Condition } from '../schema/FormBranching.js';
import type { NormalizerType, ValidatorRule } from '../schema/FormSchema.js';
import { ConditionEvaluator } from '../core/ConditionEvaluator.js';
import { FieldDependencyGraph } from '../core/DependencyGraph.js';
import { ValueNormalizer } from '../core/ValueNormalizer.js';

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
}

export interface FormConfig<T extends Record<string, unknown> = Record<string, unknown>> {
  fields: { [K in keyof T]: FormFieldConfig<T[K]> };
  onSubmit: (values: T) => Promise<void> | void;
  onError?: (error: string) => void;
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

  constructor(config: FormConfig<T>) {
    this.config = config;

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

  public blurField<K extends keyof T>(field: K): void {
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

  public setFieldValue<K extends keyof T>(
    field: K,
    value: T[K],
    options?: { skipNormalization?: boolean },
  ) {
    const fieldConfig = this.config.fields[field];
    let finalValue = value;
    if (fieldConfig?.normalizer && !options?.skipNormalization && fieldConfig.normalizeOn === 'change') {
      finalValue = ValueNormalizer.normalize(value, fieldConfig.normalizer) as T[K];
    }

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
    return !this.fieldErrors[field];
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
    if (!options?.skipValidation && !this.validate()) return;
    try {
      await this.tsForm.handleSubmit();
    } catch {
      // Handled inside onSubmit callback
    }
  }

  public reset() {
    this.fieldErrors = {};
    this.touchedFields = {};
    this.submitError = null;
    this.submitSuccess = false;
    this.tsForm.reset();
    this.syncErrorMap();
  }
}

