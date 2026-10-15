import type { FormField } from '../../schema/FormSchema.js';
import type { IEntityExtractorPort, ExtractionOptions, ExtractedEntity } from '../../ports/IEntityExtractorPort.js';

export type LLMExtractorCaller = (prompt: string, signal?: AbortSignal) => Promise<string>;

export interface CallbackLLMExtractorOptions {
  caller: LLMExtractorCaller;
  timeoutMs?: number;
  modelName?: string;
}

/**
 * CallbackLLMExtractorAdapter: Connects any LLM (Gemini, Claude, OpenAI, Ollama)
 * to extract structured form fields from arbitrary natural language text.
 * Implements strict JSON sanitization, prototype pollution defense, and field whitelist guards.
 */
export class CallbackLLMExtractorAdapter implements IEntityExtractorPort {
  readonly providerId: string;
  private caller: LLMExtractorCaller;
  private timeoutMs: number;

  constructor(options: CallbackLLMExtractorOptions | LLMExtractorCaller) {
    if (typeof options === 'function') {
      this.caller = options;
      this.timeoutMs = 5000;
      this.providerId = 'llm-extractor';
    } else {
      this.caller = options.caller;
      this.timeoutMs = options.timeoutMs ?? 5000;
      this.providerId = options.modelName ? `llm-extractor-${options.modelName}` : 'llm-extractor';
    }
  }

  public async extract(text: string, options?: Partial<ExtractionOptions>): Promise<ExtractedEntity[]> {
    return this.extractEntities({
      text,
      targetFields: options?.targetFields,
      ...options,
    });
  }

  public async extractEntities(options: ExtractionOptions): Promise<ExtractedEntity[]> {
    if (options.signal?.aborted) return [];

    const text = (options.text || '').trim();
    if (!text) return [];

    const rawFields = options.targetFields ?? [];
    const fields: FormField[] = rawFields.map((f) =>
      typeof f === 'string'
        ? { id: f, name: f, label: f, type: 'text' as const, required: false, order: 0 }
        : f,
    );
    const fieldDescriptions = fields.map((f) => ({
      name: f.name,
      label: f.label || f.name,
      type: f.type,
      semanticIntent: f.semanticIntent,
      helperText: f.helperText || '',
    }));

    const prompt = `You are a high-precision form data extraction engine.
Analyze the following user text and extract values for the specified form fields.

FORM FIELDS TARGET:
${JSON.stringify(fieldDescriptions, null, 2)}

USER TEXT INPUT:
"""
${text}
"""

INSTRUCTIONS:
1. Return ONLY a valid JSON object or JSON array mapping field names to an object with "value" and "confidence" (0.0 to 1.0).
2. ONLY include fields that are mentioned in the text.
3. NEVER make up or extrapolate information not directly stated.
4. Output format:
{
  "field_name": { "value": "extracted value", "confidence": 0.95, "snippet": "raw text matched" }
}
`;

    // Timeout & Abort Controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (options.signal) {
      options.signal.addEventListener('abort', onExternalAbort);
    }

    try {
      const rawResponse = await this.caller(prompt, controller.signal);
      return this.parseAndValidateResponse(rawResponse, fields);
    } catch {
      // Return empty results on timeout or remote exception; never crash caller
      return [];
    } finally {
      clearTimeout(timeoutId);
      if (options.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  private parseAndValidateResponse(raw: string, validFields: FormField[]): ExtractedEntity[] {
    const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);

    let cleaned = raw.trim();
    // Strip markdown code fences if present
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (!parsed || typeof parsed !== 'object') {
        return [];
      }

      const results: ExtractedEntity[] = [];

      // Support array format: [ { field: '...', value: '...', confidence: 0.9 } ]
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue;
          const key = String(item.fieldKey || item.field || item.name || '');
          if (!key || dangerousKeys.has(key)) continue;

          const targetField = this.resolveTargetField(key, validFields);
          if (validFields.length > 0 && !targetField) continue;

          const fieldName = targetField ? targetField.name : key;
          const coercedValue = targetField ? this.coerceValue(item.value, targetField.type) : item.value;

          const confidence =
            typeof item.confidence === 'number' && item.confidence >= 0 && item.confidence <= 1
              ? item.confidence
              : 0.85;

          results.push({
            field: fieldName,
            value: coercedValue,
            confidence,
            sourceSnippet: typeof item.rawSpan === 'string' ? item.rawSpan : (typeof item.snippet === 'string' ? item.snippet : undefined),
            origin: this.providerId,
          });
        }
        return results;
      }

      // Support object format: { "email": { "value": ... } } or { "email": "test@test.com" }
      for (const [key, payload] of Object.entries(parsed)) {
        if (dangerousKeys.has(key)) continue;

        const targetField = this.resolveTargetField(key, validFields);
        if (validFields.length > 0 && !targetField) continue;

        const fieldName = targetField ? targetField.name : key;

        if (payload && typeof payload === 'object' && 'value' in payload) {
          const item = payload as { value: unknown; confidence?: unknown; snippet?: unknown };
          const coercedValue = targetField ? this.coerceValue(item.value, targetField.type) : item.value;
          const confidence =
            typeof item.confidence === 'number' && item.confidence >= 0 && item.confidence <= 1
              ? item.confidence
              : 0.85;

          results.push({
            field: fieldName,
            value: coercedValue,
            confidence,
            sourceSnippet: typeof item.snippet === 'string' ? item.snippet : undefined,
            origin: this.providerId,
          });
        } else if (payload !== undefined && payload !== null) {
          const coercedValue = targetField ? this.coerceValue(payload, targetField.type) : payload;
          results.push({
            field: fieldName,
            value: coercedValue,
            confidence: 0.8,
            origin: this.providerId,
          });
        }
      }

      return results;
    } catch {
      return [];
    }
  }

  private resolveTargetField(extractedKey: string, validFields: FormField[]): FormField | undefined {
    if (validFields.length === 0) return undefined;

    // 1. Exact match
    const exact = validFields.find((f) => f.name === extractedKey || f.id === extractedKey);
    if (exact) return exact;

    // 2. Normalized alphanumeric match (ignore underscores, dashes, spaces, case)
    const normalizedKey = extractedKey.toLowerCase().replace(/[-_\s]/g, '');
    const normalizedMatch = validFields.find((f) => f.name.toLowerCase().replace(/[-_\s]/g, '') === normalizedKey);
    if (normalizedMatch) return normalizedMatch;

    // 3. Semantic Intent match
    for (const field of validFields) {
      if (field.semanticIntent) {
        const intentNorm = field.semanticIntent.toLowerCase().replace(/[-_\s]/g, '');
        if (intentNorm.includes(normalizedKey) || normalizedKey.includes(intentNorm)) {
          return field;
        }
      }
    }

    // 4. Common aliases heuristic map
    const aliasMap: Record<string, string[]> = {
      email: ['contact-email', 'email_address', 'mail'],
      phone: ['contact-phone', 'mobile', 'cell', 'telephone', 'tel', 'phone_number'],
      name: ['name-full', 'full_name', 'customer_name', 'applicant_name'],
      firstname: ['name-given', 'first_name', 'given_name'],
      lastname: ['name-family', 'last_name', 'surname'],
      address: ['address-line1', 'street', 'street_address'],
      city: ['address-city', 'town'],
      state: ['address-state', 'province', 'region'],
      zip: ['address-postal-code', 'postal', 'postal_code', 'zip_code'],
      country: ['address-country', 'nation'],
      ssn: ['identity-tax-id', 'tax_id', 'tin', 'ein'],
      income: ['annual_income', 'gross_income', 'salary', 'annual_revenue'],
    };

    for (const [aliasRoot, aliases] of Object.entries(aliasMap)) {
      if (normalizedKey.includes(aliasRoot) || aliases.some((a) => normalizedKey.includes(a.replace(/[-_]/g, '')))) {
        const match = validFields.find((f) => {
          const fNorm = f.name.toLowerCase().replace(/[-_]/g, '');
          const intentNorm = f.semanticIntent ? f.semanticIntent.toLowerCase().replace(/[-_]/g, '') : '';
          return fNorm.includes(aliasRoot) || intentNorm.includes(aliasRoot) || aliases.some((a) => fNorm.includes(a.replace(/[-_]/g, '')) || intentNorm.includes(a.replace(/[-_]/g, '')));
        });
        if (match) return match;
      }
    }

    return undefined;
  }

  private coerceValue(value: unknown, fieldType: string): unknown {
    if (value === undefined || value === null) return value;

    if (fieldType === 'number' || fieldType === 'slider') {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const cleaned = value.replace(/[$€£¥,%\s]/g, '').trim();
        const num = Number(cleaned);
        return isNaN(num) ? value : num;
      }
    }

    if (fieldType === 'checkbox' || fieldType === 'switch') {
      if (typeof value === 'boolean') return value;
      const str = String(value).toLowerCase().trim();
      if (str === 'true' || str === 'yes' || str === '1') return true;
      if (str === 'false' || str === 'no' || str === '0') return false;
    }

    return value;
  }
}
