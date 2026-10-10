import type { FormResponse, FormSchema, FieldDefinition, ValidatorRule } from '../schema/FormSchema.js';
import type { ValidationResult } from '../validation/ValidationEngine.js';
import type { FormState } from '../manager/FormManager.js';

export type {
  AggregatedStats,
  FormAnalytics,
  FormStorage,
  FormSync,
  QRCodePort,
} from '../adapters/interfaces.js';

/**
 * Inbound Port: Form Driver contract for headless presentation adapters
 */
export interface IFormManager<T extends Record<string, unknown> = Record<string, unknown>> {
  getState(): FormState<T>;
  setFieldValue<K extends keyof T>(field: K, value: T[K]): void;
  validateField(field: keyof T): boolean;
  validate(): boolean;
  submit(): Promise<void>;
  reset(): void;
  subscribe(callback: (state: FormState<T>) => void): () => void;
}

/**
 * Outbound Port: Contract for swappable validation evaluation engines
 */
export interface IValidationPort {
  applyRule(rule: ValidatorRule, value: unknown, fieldName?: string): ValidationResult;
  validateRules(rules: ValidatorRule[], value: unknown, fieldName?: string): ValidationResult;
}

/**
 * Outbound Port: Contract for analytics & report generation
 */
export interface IAnalyticsPort {
  aggregate(fields: FieldDefinition[], responses: FormResponse[]): unknown[];
  toCSV(fields: FieldDefinition[], responses: FormResponse[]): string;
  toXLSX(fields: FieldDefinition[], responses: FormResponse[]): string;
}
