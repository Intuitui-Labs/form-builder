import type { FormField } from '../schema/FormSchema.js';

export interface ExtractedEntity {
  field: string;
  value: unknown;
  confidence: number; // 0.0 - 1.0
  sourceSnippet?: string;
  origin?: string;
}

export interface ExtractionOptions {
  text: string;
  targetFields?: Array<FormField | string>;
  minConfidence?: number;
  signal?: AbortSignal;
  countryCodeHint?: string;
  context?: Record<string, unknown>;
}

/**
 * Outbound Port: Contract for natural language and document entity extraction.
 * Unpacks unstructured strings (emails, receipts, bios, pasted signatures) into typed form fields.
 * Zero external dependencies.
 */
export interface IEntityExtractorPort {
  readonly providerId: string;
  extractEntities(options: ExtractionOptions): Promise<ExtractedEntity[]>;
}
