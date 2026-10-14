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
    const validFieldNames = validFields.length > 0 ? new Set(validFields.map((f) => f.name)) : null;
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
          if (validFieldNames && !validFieldNames.has(key)) continue;

          const confidence =
            typeof item.confidence === 'number' && item.confidence >= 0 && item.confidence <= 1
              ? item.confidence
              : 0.85;

          results.push({
            field: key,
            value: item.value,
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
        if (validFieldNames && !validFieldNames.has(key)) continue;

        if (payload && typeof payload === 'object' && 'value' in payload) {
          const item = payload as { value: unknown; confidence?: unknown; snippet?: unknown };
          const confidence =
            typeof item.confidence === 'number' && item.confidence >= 0 && item.confidence <= 1
              ? item.confidence
              : 0.85;

          results.push({
            field: key,
            value: item.value,
            confidence,
            sourceSnippet: typeof item.snippet === 'string' ? item.snippet : undefined,
            origin: this.providerId,
          });
        } else if (payload !== undefined && payload !== null) {
          // Direct value assignment format fallback: { "email": "test@test.com" }
          results.push({
            field: key,
            value: payload,
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
}
