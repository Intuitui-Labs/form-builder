import type { FormResponse, FormSchema, FieldDefinition, ValidatorRule } from '../schema/FormSchema.js';
import type { ValidationResult } from '../validation/ValidationEngine.js';

export type FormState<T extends Record<string, unknown> = Record<string, unknown>> = {
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

export interface FormStorage {
  save(form: FormSchema): Promise<void>;
  load(id: string): Promise<FormSchema>;
  list(tenantId: string): Promise<FormSchema[]>;
  delete(id: string): Promise<void>;
}

export interface AggregatedStats {
  fieldId: string;
  label: string;
  type: string;
  totalResponses: number;
  data: unknown;
}

export interface FormAnalytics {
  record(formId: string, response: FormResponse): Promise<void>;
  aggregate(formId: string): Promise<AggregatedStats[]>;
  export(formId: string): Promise<string>;
}

export interface FormSync {
  push(form: FormSchema): Promise<void>;
  pull(since: Date): Promise<FormSchema[]>;
  resolveConflict(local: FormSchema, remote: FormSchema): FormSchema;
}

export interface QRCodePort {
  buildPublicFormUrl(slug: string): string;
  buildQRCodeUrl(publicUrl: string): string;
}

/**
 * Inbound Port: Form Driver contract for headless presentation adapters
 */
export interface IFormManager<T extends Record<string, unknown> = Record<string, unknown>> {
  getState(): FormState<T>;
  setFieldValue<K extends keyof T>(field: K, value: T[K], options?: { skipNormalization?: boolean; origin?: string }): void;
  batchSetFieldValues(updates: Partial<T>, options?: BatchSetOptions<T>): BatchEnrichmentResult<T>;
  revertEnrichedFields(fields?: Array<keyof T>): Array<keyof T>;
  getFieldOrigin<K extends keyof T>(field: K): FieldOriginInfo | undefined;
  validateField(field: keyof T): boolean;
  validate(): boolean;
  submit(options?: { skipValidation?: boolean }): Promise<void>;
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

/**
 * Standard Schema v1 Specification (compatible with Zod, Valibot, ArkType)
 */
export interface StandardSchemaV1Issue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
}

export interface StandardSchemaV1Result<Output = unknown> {
  readonly value?: Output;
  readonly issues?: ReadonlyArray<StandardSchemaV1Issue>;
}

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>;
  };
}

/**
 * Structural issue reported during schema validation
 */
export interface SchemaIssue {
  path: (string | number)[];
  message: string;
}

/**
 * Result returned by an ISchemaValidator
 */
export interface SchemaValidationResult<T = FormSchema> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    issues: SchemaIssue[];
  };
}

/**
 * Outbound Port: Contract for swappable schema structural validators
 */
export interface ISchemaValidator<T = FormSchema> {
  readonly name: string;
  validate(input: unknown): T;
  safeValidate(input: unknown): SchemaValidationResult<T>;
}

export type {
  IProgressStrategyPort,
  StepProgressContext,
  ProgressCalculationResult,
} from './IProgressStrategyPort.js';

export type {
  IRewardEnginePort,
  RewardPayload,
  RewardType,
  RewardEvaluationContext,
} from './IRewardEnginePort.js';

export type {
  IFeedbackNotifierPort,
} from './IFeedbackNotifierPort.js';

export type {
  IDraftStoragePort,
} from './IDraftStoragePort.js';

export type {
  IStoragePort,
  IResilientStoragePort,
} from './IStoragePort.js';

export type {
  INetworkStatusPort,
} from './INetworkStatusPort.js';

export type {
  ITransportPort,
  IResilientTransportPort,
  SubmissionEnvelope,
  SubmissionReceipt,
} from './ITransportPort.js';

export type {
  IExperimentPort,
  ExperimentContext,
  FlagResolutionDetails,
  ResolutionReason,
} from './IExperimentPort.js';

export type {
  ITelemetryPort,
  FormTelemetryEvent,
  BaseTelemetryEvent,
} from './ITelemetryPort.js';

export type {
  AttachmentPointer,
  AttachmentUploadStatus,
  AttachmentUploadState,
  IAttachmentStoragePort,
  IAttachmentUploadPort,
} from './IAttachmentPort.js';

export type {
  ISanitizerPort,
} from './ISanitizerPort.js';

export type {
  IFormLifecyclePort,
} from './IFormLifecyclePort.js';

export type {
  AddressCandidate,
  AddressSearchOptions,
  ReverseGeocodeOptions,
  PostalCodeLookupOptions,
  IAddressAutofillPort,
  ContactPickerAddress,
  PickedContact,
  IContactPickerPort,
} from './IAddressAutofillPort.js';

export type {
  ExtractedEntity,
  ExtractionOptions,
  IEntityExtractorPort,
} from './IEntityExtractorPort.js';

export type {
  HapticFeedbackPattern,
  IHapticFeedbackPort,
} from './IHapticFeedbackPort.js';


