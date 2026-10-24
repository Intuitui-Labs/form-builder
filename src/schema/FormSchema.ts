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
  | 'likert'
  | 'rich-text'
  | 'statement'
  | 'file'
  | 'image-capture'
  | 'audio-record'
  | 'visualization';

export type MediaType = 'image' | 'gif' | 'video' | 'audio' | 'embed' | 'lottie';

export interface MediaDescriptor {
  type: MediaType;
  url: string;
  alt: string;
  caption?: string;
  posterUrl?: string;
  aspectRatio?: '16:9' | '4:3' | '1:1' | '21:9' | string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  transcriptionUrl?: string;
  lazyLoad?: boolean;
}

export type VisualizationType = 'gauge' | 'bar' | 'line' | 'comparison' | 'projection';

export interface VisualizationMetric {
  label: string;
  value: number | string;
  target?: number;
  unit?: string;
}

export interface InteractiveVisualizationDescriptor {
  visualizationType: VisualizationType;
  title: string;
  description?: string;
  metrics: VisualizationMetric[];
  computedFrom?: string[];
  formula?: string;
  dataFallback: { label: string; value: string | number }[];
}

export interface FormFieldOption {
  label: string;
  value: string;
  description?: string;
  imageSrc?: string;
  gifSrc?: string;
  badge?: string;
}

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
  | { type: 'passwordStrength'; minScore?: number; message?: string }
  | { type: 'fileSize'; maxBytes: number; message?: string }
  | { type: 'fileType'; allowedMimeTypes: string[]; message?: string }
  | { type: 'maxFiles'; max: number; message?: string };

import type { Condition, PageJumpRule } from './FormBranching.js';
import type { QuestionRubric, AssessmentSchemaConfig } from '../assessment/types.js';

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
  | 'name-middle'
  | 'name-family'
  | 'name-prefix'
  | 'name-suffix'
  | 'contact-email'
  | 'contact-phone'
  | 'organization-name'
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
  content?: string;
  options?: FormFieldOption[];
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
  media?: MediaDescriptor;
  visualization?: InteractiveVisualizationDescriptor;
  computed?: {
    expression?: string;
    fn?: (values: Record<string, unknown>) => unknown;
    dependsOn?: string[];
  };
  clarification?: ClarificationDescriptor;
  rubric?: QuestionRubric;
}

export type PageRole = 'cover' | 'standard' | 'summary' | 'terminal';

export interface ClarificationDescriptor {
  title?: string;
  body: string;
  media?: MediaDescriptor;
  defaultExpanded?: boolean;
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
  content?: string;
  options?: FormFieldOption[];
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
  media?: MediaDescriptor;
  visualization?: InteractiveVisualizationDescriptor;
  clarification?: ClarificationDescriptor;
  rubric?: QuestionRubric;
  semanticIntent?: SemanticIntent;
  sensitive?: boolean;
  privacyRationale?: string;
}

export interface FormPage {
  id: string;
  title?: string;
  description?: string;
  role?: PageRole;
  badge?: string;
  estimatedTime?: string;
  fields: FormField[];
  conditions?: unknown[];
  jumpRules?: PageJumpRule[];
  defaultNextPageId?: string;
  media?: MediaDescriptor;
}

import type { FormAffordanceConfig } from './FormAffordance.js';

export interface FormSettings {
  isPublished?: boolean;
  category?: string;
  slug?: string;
  coverImage?: string;
  logoUrl?: string;
  themeColor?: string;
  confirmationMessage?: string;
  collectEmail?: boolean;
  showProgressBar?: boolean;
  affordanceConfig?: FormAffordanceConfig;
  [key: string]: unknown;
}

import type { FormGovernanceConfig } from '../governance/types.js';

export type FormKind =
  | 'survey'
  | 'quiz'
  | 'exam'
  | 'assessment'
  | 'poll'
  | 'intake'
  | 'feedback'
  | 'form';

export type RedoRewardStrategy =
  | 'first_attempt_only'
  | 'score_delta'
  | 'unrestricted'
  | 'blocked';

import type { BatteryPrerequisiteRule } from './FormBattery.js';

export interface FormAccessPolicy {
  allowRedo: boolean;
  maxAttempts?: number;
  rewardStrategy: RedoRewardStrategy;
  cooldownMinutes?: number;
  version?: string;
}

export interface FormSchema {
  v?: '1.0' | string;
  version?: string;
  id: string;
  kind?: FormKind;
  accessPolicy?: FormAccessPolicy;
  prerequisites?: BatteryPrerequisiteRule;
  tenantId?: string;
  title: string;
  description?: string;
  coverImage?: string;
  pages: FormPage[];
  settings?: FormSettings;
  governance?: FormGovernanceConfig;
  affordanceConfig?: FormAffordanceConfig;
  assessment?: AssessmentSchemaConfig;
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
  metadata?: Record<string, unknown>;
}
