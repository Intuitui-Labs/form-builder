import type { FormSchema, ValidatorRule } from '../schema/FormSchema.js';
import { PaymentCardHelper } from '../core/PaymentCardHelper.js';
import { PasswordEntropyEstimator } from '../core/PasswordEntropyEstimator.js';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function applyRule(
  rule: ValidatorRule,
  value: unknown,
  fieldName?: string,
  allValues?: Record<string, unknown>,
): ValidationResult {
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
    case 'matchesField': {
      if (value === undefined || value === null || value === '') return { isValid: true };
      const targetVal = allValues?.[rule.targetField];
      return value === targetVal
        ? { isValid: true }
        : { isValid: false, error: rule.message || `${fieldName || 'Field'} does not match ${rule.targetField}` };
    }
    case 'greaterThanField': {
      if (value === undefined || value === null || value === '') return { isValid: true };
      const targetVal = allValues?.[rule.targetField];
      if (targetVal === undefined || targetVal === null || targetVal === '') return { isValid: true };

      const numA = Number(value);
      const numB = Number(targetVal);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
        const passes = rule.allowEqual ? numA >= numB : numA > numB;
        return passes
          ? { isValid: true }
          : { isValid: false, error: rule.message || `${fieldName || 'Field'} must be greater than ${rule.targetField}` };
      }

      const dateA = Date.parse(String(value));
      const dateB = Date.parse(String(targetVal));
      if (!Number.isNaN(dateA) && !Number.isNaN(dateB)) {
        const passes = rule.allowEqual ? dateA >= dateB : dateA > dateB;
        return passes
          ? { isValid: true }
          : { isValid: false, error: rule.message || `${fieldName || 'Field'} must be after ${rule.targetField}` };
      }

      return { isValid: true };
    }
    case 'lessThanField': {
      if (value === undefined || value === null || value === '') return { isValid: true };
      const targetVal = allValues?.[rule.targetField];
      if (targetVal === undefined || targetVal === null || targetVal === '') return { isValid: true };

      const numA = Number(value);
      const numB = Number(targetVal);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
        const passes = rule.allowEqual ? numA <= numB : numA < numB;
        return passes
          ? { isValid: true }
          : { isValid: false, error: rule.message || `${fieldName || 'Field'} must be less than ${rule.targetField}` };
      }

      const dateA = Date.parse(String(value));
      const dateB = Date.parse(String(targetVal));
      if (!Number.isNaN(dateA) && !Number.isNaN(dateB)) {
        const passes = rule.allowEqual ? dateA <= dateB : dateA < dateB;
        return passes
          ? { isValid: true }
          : { isValid: false, error: rule.message || `${fieldName || 'Field'} must be before ${rule.targetField}` };
      }

      return { isValid: true };
    }
    case 'requiredIfField': {
      const targetVal = allValues?.[rule.targetField];
      let conditionMet = false;

      if (rule.operator === 'present') {
        conditionMet = targetVal !== undefined && targetVal !== null && targetVal !== '';
      } else if (rule.operator === 'equals') {
        conditionMet = targetVal === rule.value;
      } else if (rule.operator === 'notEquals') {
        conditionMet = targetVal !== rule.value;
      } else if (rule.operator === 'contains') {
        if (Array.isArray(targetVal)) {
          conditionMet = targetVal.includes(rule.value);
        } else {
          conditionMet = String(targetVal || '').includes(String(rule.value));
        }
      }

      if (conditionMet) {
        const isEmpty =
          value === undefined ||
          value === null ||
          (typeof value === 'string' && value.trim() === '');
        if (isEmpty) {
          return { isValid: false, error: rule.message || `${fieldName || 'Field'} is required` };
        }
      }
      return { isValid: true };
    }
    case 'luhn': {
      if (value === undefined || value === null || value === '') return { isValid: true };
      const passes = PaymentCardHelper.validateLuhn(value);
      return passes
        ? { isValid: true }
        : { isValid: false, error: rule.message || 'Invalid payment card number' };
    }
    case 'cardExpiry': {
      if (value === undefined || value === null || value === '') return { isValid: true };
      const res = PaymentCardHelper.validateCardExpiry(value);
      if (!res.isValid) {
        return { isValid: false, error: rule.message || res.error || 'Card has expired' };
      }
      return { isValid: true };
    }
    case 'passwordStrength': {
      if (value === undefined || value === null || value === '') return { isValid: true };
      const res = PasswordEntropyEstimator.estimate(value);
      const min = rule.minScore ?? 2;
      if (res.score < min) {
        return {
          isValid: false,
          error: rule.message || `Password is too weak. ${res.feedback[0] || ''}`.trim(),
        };
      }
      return { isValid: true };
    }
    case 'custom':
      return { isValid: true };
  }
}

export function validateRules(
  rules: ValidatorRule[],
  value: unknown,
  fieldName?: string,
  allValues?: Record<string, unknown>,
): ValidationResult {
  for (const rule of rules) {
    const result = applyRule(rule, value, fieldName, allValues);
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

