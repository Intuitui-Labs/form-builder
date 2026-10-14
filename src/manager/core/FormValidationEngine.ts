import type { FormApi } from '@tanstack/form-core';
import type { FormConfig } from '../FormManager.js';
import type { ITelemetryPort } from '../../ports/ITelemetryPort.js';

export class FormValidationEngine<T extends Record<string, unknown>> {
  public validateField(
    field: keyof T,
    config: FormConfig<T>,
    tsForm: FormApi<T, any>,
    fieldErrors: Partial<Record<keyof T, string>>,
    isFieldVisible: (f: keyof T) => boolean,
    syncErrorMap: () => void,
    telemetry?: ITelemetryPort,
    formId?: string
  ): boolean {
    const fieldConfig = config.fields[field];
    if (!fieldConfig) return true;

    // Hidden fields bypass validation completely and clear existing errors
    if (!isFieldVisible(field)) {
      if (fieldErrors[field]) {
        delete fieldErrors[field];
        syncErrorMap();
      }
      return true;
    }

    const value = tsForm.state.values[field];
    const allValues = tsForm.state.values as Record<string, unknown>;

    const isValueEmpty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0);

    if (fieldConfig.required && isValueEmpty) {
      fieldErrors[field] = `${fieldConfig.label || String(field)} is required`;
    } else if (fieldConfig.validators) {
      let errorFound = false;
      for (const validator of fieldConfig.validators) {
        const result = validator(value, allValues);
        if (!result.isValid) {
          fieldErrors[field] = result.error;
          errorFound = true;
          break;
        }
      }
      if (!errorFound) {
        delete fieldErrors[field];
      }
    } else {
      delete fieldErrors[field];
    }

    syncErrorMap();
    const hasError = Boolean(fieldErrors[field]);

    if (hasError && telemetry) {
      const errorRule =
        fieldConfig?.rules?.[0]?.type ??
        (fieldConfig?.required && isValueEmpty ? 'required' : 'validation_failed');
      telemetry.dispatch({
        type: 'field_error',
        formId: formId ?? 'form_root',
        stepIndex: 0,
        fieldName: String(field),
        errorRule,
        errorMessage: fieldErrors[field],
        timestamp: Date.now(),
      });
    }

    return !hasError;
  }

  public validate(
    config: FormConfig<T>,
    fieldErrors: Partial<Record<keyof T, string>>,
    isFieldVisible: (f: keyof T) => boolean,
    validateField: (f: keyof T) => boolean,
    syncErrorMap: () => void
  ): boolean {
    let allValid = true;
    for (const field in config.fields) {
      if (isFieldVisible(field)) {
        if (!validateField(field)) {
          allValid = false;
        }
      } else {
        delete fieldErrors[field];
      }
    }
    syncErrorMap();
    return allValid;
  }

  public syncErrorMap(tsForm: FormApi<T, any>, fieldErrors: Partial<Record<keyof T, string>>): void {
    const store: any = (tsForm as any).baseStore ?? (tsForm as any).store;
    if (store && store.setState) {
      store.setState((prev: any) => ({
        ...prev,
        errorMap: { ...fieldErrors },
      }));
    }
  }
}
