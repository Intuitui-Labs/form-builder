import type { FormSchema, ValidatorRule } from '@intuitui-labs/form-builder-engine/schema/FormSchema';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function applyRule(rule: ValidatorRule, value: unknown, fieldName?: string): ValidationResult {
  switch (rule.type) {
    case 'required': {
      const invalid =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '');
      return invalid
        ? { isValid: false, error: rule.message || `${fieldName || 'Field'} is required` }
        : { isValid: true };
    }
    case 'email': {
      if (value === undefined || value === null || value === '') return { isValid: true };
      const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return regex.test(String(value))
        ? { isValid: true }
        : { isValid: false, error: rule.message || 'Invalid email format' };
    }
    case 'minLength': {
      if (typeof value !== 'string') return { isValid: true };
      return value.length >= rule.value
        ? { isValid: true }
        : { isValid: false, error: rule.message || `Must be at least ${rule.value} characters` };
    }
    case 'maxLength': {
      if (typeof value !== 'string') return { isValid: true };
      return value.length <= rule.value
        ? { isValid: true }
        : { isValid: false, error: rule.message || `Must be at most ${rule.value} characters` };
    }
    case 'min': {
      const num = Number(value);
      return !Number.isNaN(num) && num >= rule.value
        ? { isValid: true }
        : { isValid: false, error: rule.message || `Must be at least ${rule.value}` };
    }
    case 'max': {
      const num = Number(value);
      return !Number.isNaN(num) && num <= rule.value
        ? { isValid: true }
        : { isValid: false, error: rule.message || `Must be at most ${rule.value}` };
    }
    case 'pattern': {
      if (typeof value !== 'string') return { isValid: true };
      try {
        return new RegExp(rule.value).test(value)
          ? { isValid: true }
          : { isValid: false, error: rule.message || 'Invalid format' };
      } catch {
        return { isValid: true };
      }
    }
    case 'custom':
      return { isValid: true };
  }
}

export function validateRules(rules: ValidatorRule[], value: unknown, fieldName?: string): ValidationResult {
  for (const rule of rules) {
    const result = applyRule(rule, value, fieldName);
    if (!result.isValid) return result;
  }
  return { isValid: true };
}

export const ValidationEngine = {
  email(email: string): ValidationResult {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || email.trim().length === 0) {
      return { isValid: false, error: 'Email is required' };
    }
    if (!regex.test(email)) {
      return { isValid: false, error: 'Invalid email format' };
    }
    return { isValid: true };
  },

  nonEmpty(value: string, fieldName: string = 'Field'): ValidationResult {
    if (!value || value.trim().length === 0) {
      return { isValid: false, error: `${fieldName} is required` };
    }
    return { isValid: true };
  },

  number(value: unknown): ValidationResult {
    const num = Number(value);
    if (value === undefined || value === null || value === '' || Number.isNaN(num)) {
      return { isValid: false, error: 'Must be a number' };
    }
    return { isValid: true };
  },

  validateField(
    value: unknown,
    required: boolean,
    validatorName?: 'email' | 'nonEmpty' | 'number',
    label: string = 'Field',
  ): ValidationResult {
    // 1. Check required
    if (
      required &&
      (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))
    ) {
      return { isValid: false, error: `${label} is required` };
    }

    if (value === undefined || value === null || value === '') {
      return { isValid: true };
    }

    // 2. Map & run validator
    if (validatorName) {
      if (validatorName === 'email') {
        return this.email(String(value));
      }
      if (validatorName === 'nonEmpty') {
        return this.nonEmpty(String(value), label);
      }
      if (validatorName === 'number') {
        return this.number(value);
      }
    }

    return { isValid: true };
  },

  validateForm(
    payload: Record<string, unknown>,
    schema: FormSchema
  ): { isValid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    for (const page of schema.pages) {
      for (const field of page.fields) {
        // Skip purely visual layout elements
        if (field.type === 'heading' || field.type === 'divider') {
          continue;
        }

        const value = payload[field.name];
        
        // Auto-select helper validator based on field type
        let validatorName: 'email' | 'nonEmpty' | 'number' | undefined = undefined;
        if (field.type === 'email') {
          validatorName = 'email';
        } else if (field.type === 'number') {
          validatorName = 'number';
        } else if (field.required) {
          validatorName = 'nonEmpty';
        }

        const result = this.validateField(
          value,
          field.required,
          validatorName,
          field.label || field.name
        );

        if (!result.isValid && result.error) {
          errors[field.name] = result.error;
        }
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  },
};

