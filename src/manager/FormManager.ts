import { FormApi } from '@tanstack/form-core';
import type { ValidationResult } from '@intuitui-labs/form-builder-engine/validation/ValidationEngine';

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
  validators?: Array<(value: T) => ValidationResult>;
}

export interface FormConfig<T extends Record<string, unknown> = Record<string, unknown>> {
  fields: { [K in keyof T]: FormFieldConfig<T[K]> };
  onSubmit: (values: T) => Promise<void> | void;
  onError?: (error: string) => void;
}

export type FormState<T extends Record<string, unknown>> = {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  isSubmitting: boolean;
  isDirty: boolean;
  isValid: boolean;
  submitError: string | null;
  submitSuccess: boolean;
};

export class FormManager<T extends Record<string, unknown>> {
  private tsForm: FormApi<T, any>;
  public config: FormConfig<T>;
  private fieldErrors: Partial<Record<keyof T, string>> = {};
  private submitError: string | null = null;
  private submitSuccess = false;

  constructor(config: FormConfig<T>) {
    this.config = config;

    const initialValues = {} as T;
    for (const key in config.fields) {
      (initialValues as Record<string, unknown>)[key] = config.fields[key].defaultValue ?? '';
    }

    this.tsForm = new FormApi<T, any>({
      defaultValues: initialValues,
      onSubmit: async ({ value }: { value: T }) => {
        this.submitError = null;
        this.submitSuccess = false;
        try {
          await this.config.onSubmit(value);
          this.submitSuccess = true;
        } catch (err) {
          this.submitError = err instanceof Error ? err.message : 'An error occurred';
          if (this.config.onError) this.config.onError(this.submitError);
          throw err;
        }
      },
    });
  }

  public getState(): FormState<T> {
    const tsState = this.tsForm.state;
    const errorsCount = Object.keys(this.fieldErrors).length;

    return {
      values: tsState.values,
      errors: { ...this.fieldErrors },
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

  public setFieldValue<K extends keyof T>(field: K, value: T[K]) {
    this.tsForm.setFieldValue(field as any, value as any, { touch: true });
    this.validateField(field);
  }

  public validateField(field: keyof T): boolean {
    const fieldConfig = this.config.fields[field];
    const value = this.tsForm.state.values[field];

    if (fieldConfig.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
      this.fieldErrors[field] = `${fieldConfig.label || String(field)} is required`;
    } else if (fieldConfig.validators) {
      let errorFound = false;
      for (const validator of fieldConfig.validators) {
        const result = validator(value);
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

    this.tsForm.store.setState((prev: any) => ({
      ...prev,
      errorMap: {
        ...prev.errorMap,
        ...this.fieldErrors,
      },
    }));

    return !this.fieldErrors[field];
  }

  public validate(): boolean {
    let allValid = true;
    for (const field in this.config.fields) {
      if (!this.validateField(field)) {
        allValid = false;
      }
    }
    return allValid;
  }

  public async submit() {
    if (!this.validate()) return;
    try {
      await this.tsForm.handleSubmit();
    } catch {
      // Handled inside onSubmit callback
    }
  }

  public reset() {
    this.fieldErrors = {};
    this.submitError = null;
    this.submitSuccess = false;
    this.tsForm.reset();
  }
}
