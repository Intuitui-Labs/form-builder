export type FieldType =
  | 'text'
  | 'email'
  | 'password'
  | 'select'
  | 'textarea'
  | 'number'
  | 'heading'
  | 'divider'
  | 'slider'
  | 'likert';

export type ValidatorRule =
  | { type: 'required'; message?: string }
  | { type: 'email'; message?: string }
  | { type: 'minLength'; value: number; message?: string }
  | { type: 'maxLength'; value: number; message?: string }
  | { type: 'min'; value: number; message?: string }
  | { type: 'max'; value: number; message?: string }
  | { type: 'pattern'; value: string; message?: string }
  | { type: 'custom'; name: string }
  | { type: 'matchesField'; targetField: string; message?: string }
  | { type: 'greaterThanField'; targetField: string; message?: string; allowEqual?: boolean }
  | { type: 'lessThanField'; targetField: string; message?: string; allowEqual?: boolean }
  | { type: 'requiredIfField'; targetField: string; operator: 'equals' | 'notEquals' | 'contains' | 'present'; value?: unknown; message?: string }
  | { type: 'luhn'; message?: string }
  | { type: 'cardExpiry'; message?: string }
  | { type: 'passwordStrength'; minScore?: number; message?: string };

import type { Condition, PageJumpRule } from './FormBranching.js';

export type SemanticIntent =
  // Authentication & Passkeys
  | 'username'
  | 'current-password'
  | 'new-password'
  | 'one-time-code'
  | 'webauthn-passkey'
  // Payment & Billing
  | 'payment-card-number'
  | 'payment-card-expiry'
  | 'payment-card-cvc'
  | 'payment-card-holder'
  // Physical Address & Location
  | 'address-line1'
  | 'address-line2'
  | 'address-city'
  | 'address-state'
  | 'address-postal-code'
  | 'address-country'
  // Personal & Identity
  | 'name-full'
  | 'name-given'
  | 'name-family'
  | 'contact-email'
  | 'contact-phone'
  | 'birth-date'
  | 'identity-tax-id';

export interface FormField {
  id: string;
  name: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  scaleType?: 'emoji' | 'numeric';
  order: number;
  config?: Record<string, unknown>;
  conditions?: unknown[];
  visibleIf?: Condition;
  clearValueOnHide?: boolean;
  helperText?: string;
  formatExample?: string;
  formatMask?: string;
  autoFocus?: boolean;
  rules?: ValidatorRule[];
  autoComplete?: string;
  textContentType?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'decimal-pad' | 'url';
  inputMode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  semanticIntent?: SemanticIntent;
  sensitive?: boolean;
  privacyRationale?: string;
  autoAdvanceOnComplete?: boolean;
  dependsOn?: string[];
  normalizer?: NormalizerType | ((value: unknown) => unknown);
  normalizeOn?: 'blur' | 'change';
  computed?: {
    expression?: string;
    fn?: (values: Record<string, unknown>) => unknown;
    dependsOn?: string[];
  };
}

export type NormalizerType =
  | 'trim'
  | 'lowercase'
  | 'uppercase'
  | 'digits-only'
  | 'phone-e164'
  | 'card-number';

export interface FieldDefinition {
  id: string;
  name: string;
  type: FieldType;
  label?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: unknown;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  scaleType?: 'emoji' | 'numeric';
  config?: Record<string, unknown>;
  conditions?: unknown[];
  visibleIf?: Condition;
  clearValueOnHide?: boolean;
  helperText?: string;
  formatExample?: string;
  formatMask?: string;
  autoFocus?: boolean;
  rules?: ValidatorRule[];
}

export interface FormPage {
  id: string;
  title?: string;
  fields: FormField[];
  conditions?: unknown[];
  jumpRules?: PageJumpRule[];
  defaultNextPageId?: string;
}

import type { FormAffordanceConfig } from './FormAffordance.js';

export interface FormSettings {
  isPublished?: boolean;
  category?: string;
  slug?: string;
  affordanceConfig?: FormAffordanceConfig;
  [key: string]: unknown;
}

export interface FormSchema {
  v?: '1.0' | string;
  version?: string;
  id: string;
  tenantId?: string;
  title: string;
  description?: string;
  pages: FormPage[];
  settings?: FormSettings;
  affordanceConfig?: FormAffordanceConfig;
  createdAt?: string;
  updatedAt?: string;
}

export interface FormResponse {
  id: string;
  formId: string;
  responderId?: string;
  tenantId: string;
  data: Record<string, unknown>;
  submittedAt: string;
}
