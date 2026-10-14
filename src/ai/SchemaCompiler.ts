import type { FormSchema } from '../schema/FormSchema.js';
import { safeValidateFormSchema } from '../schema/FormSchemaValidation.js';
import { lintFormSchema, type SchemaLintIssue } from '../schema/SchemaLint.js';
import { generateFormBuilderSystemPrompt, type SystemPromptOptions } from './prompts.js';

export type LlmCompletionCaller = (
  systemPrompt: string,
  userPrompt: string
) => Promise<string>;

export interface CompileSchemaResult {
  success: boolean;
  schema?: FormSchema;
  rawResponse: string;
  parseError?: string;
  validationErrors?: string[];
  lintIssues?: SchemaLintIssue[];
}

/**
 * Defensive JSON extraction and sanitizer.
 * Cleans markdown code fences, leading conversational text, and common trailing commas.
 */
export function sanitizeAndParseJson<T = unknown>(raw: string): { success: boolean; data?: T; error?: string } {
  if (!raw || typeof raw !== 'string') {
    return { success: false, error: 'Empty or non-string response received' };
  }

  let cleaned = raw.trim();

  // 1. Strip markdown code fences if present: ```json ... ``` or ``` ... ```
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = codeBlockRegex.exec(cleaned);
  if (match && match[1]) {
    cleaned = match[1].trim();
  }

  // 2. If there is conversational prelude, find first '{' and last '}'
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  // 3. Remove trailing commas before closing braces/brackets (common LLM hallucination)
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  try {
    const data = JSON.parse(cleaned) as T;
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: `JSON parse error: ${(err as Error).message}`,
    };
  }
}

function sanitizeText(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim();
}

/**
 * Normalizes common LLM hallucinations (dropdown/choice/boolean), heals missing wrappers,
 * strips malicious script tags, and deduplicates field names.
 */
export function normalizeAndHealSchema(raw: any): FormSchema {
  if (!raw || typeof raw !== 'object') {
    return {
      v: '1.0',
      id: 'form-' + Date.now(),
      title: 'Untitled Form',
      pages: [],
    } as any;
  }

  const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);

  let rawPages = raw.pages;
  if (!Array.isArray(rawPages) && raw.fields) {
    const fieldsList = Array.isArray(raw.fields)
      ? raw.fields
      : typeof raw.fields === 'object' && raw.fields !== null
        ? Object.entries(raw.fields)
            .filter(([k]) => !dangerousKeys.has(k))
            .map(([name, f]: [string, any]) => ({ name, ...(typeof f === 'object' ? f : {}) }))
        : [];
    rawPages = [
      {
        id: 'step-1',
        title: raw.title || 'Step 1',
        fields: fieldsList,
      },
    ];
  } else if (!Array.isArray(rawPages)) {
    rawPages = [];
  }

  const seenNames = new Set<string>();

  const healedPages = rawPages.map((page: any, pageIdx: number) => {
    let rawFields = Array.isArray(page.fields)
      ? page.fields
      : typeof page.fields === 'object' && page.fields !== null
        ? Object.entries(page.fields)
            .filter(([k]) => !dangerousKeys.has(k))
            .map(([name, f]: [string, any]) => ({ name, ...(typeof f === 'object' ? f : {}) }))
        : [];

    const healedFields = rawFields
      .filter((f: any) => f && typeof f === 'object')
      .map((field: any, fieldIdx: number) => {
      const rawType = String(field.type || 'text').toLowerCase();
      let healedType: any = rawType;
      let options = field.options;

      if (rawType === 'dropdown' || rawType === 'choice' || rawType === 'radio') {
        healedType = 'select';
      } else if (
        rawType === 'bool' ||
        rawType === 'boolean' ||
        rawType === 'switch' ||
        rawType === 'checkbox'
      ) {
        healedType = 'select';
        if (!options || !Array.isArray(options) || options.length === 0) {
          options = [
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ];
        }
      } else if (rawType === 'integer' || rawType === 'number_input' || rawType === 'float') {
        healedType = 'number';
      } else if (rawType === 'multiline' || rawType === 'paragraph') {
        healedType = 'textarea';
      } else if (rawType === 'email_address') {
        healedType = 'email';
      }

      if (healedType === 'select' && (!Array.isArray(options) || options.length === 0)) {
        options = [
          { label: 'Option 1', value: 'option_1' },
          { label: 'Option 2', value: 'option_2' },
        ];
      }

      let fieldName = field.name || `field_${pageIdx}_${fieldIdx}`;
      if (dangerousKeys.has(fieldName)) {
        fieldName = `field_${fieldName}`;
      }
      if (seenNames.has(fieldName)) {
        fieldName = `${fieldName}_p${pageIdx + 1}`;
      }
      seenNames.add(fieldName);

      return {
        ...field,
        id: field.id || `f-${pageIdx + 1}-${fieldIdx + 1}`,
        name: fieldName,
        type: healedType,
        label: sanitizeText(field.label ?? fieldName),
        helperText: field.helperText ? sanitizeText(field.helperText) : undefined,
        options,
        order: typeof field.order === 'number' ? field.order : fieldIdx + 1,
      };
    });

    return {
      ...page,
      id: page.id || `step-${pageIdx + 1}`,
      title: sanitizeText(page.title || `Step ${pageIdx + 1}`),
      fields: healedFields,
      jumpRules: Array.isArray(page.jumpRules) ? page.jumpRules : undefined,
      defaultNextPageId: page.defaultNextPageId,
    };
  });

  // Post-process Jump Rules: prune self-loops and jumps to non-existent target pages
  const allPageIds = new Set(healedPages.map((p: any) => p.id));
  for (const page of healedPages) {
    if (page.jumpRules) {
      page.jumpRules = page.jumpRules.filter((rule: any) => {
        return (
          rule &&
          rule.targetPageId &&
          rule.targetPageId !== page.id &&
          allPageIds.has(rule.targetPageId)
        );
      });
      if (page.jumpRules.length === 0) {
        delete page.jumpRules;
      }
    }
    if (page.defaultNextPageId && (!allPageIds.has(page.defaultNextPageId) || page.defaultNextPageId === page.id)) {
      delete page.defaultNextPageId;
    }
  }

  return {
    v: raw.v ?? '1.0',
    id: raw.id || `form-${Date.now()}`,
    tenantId: raw.tenantId ?? 'default',
    title: sanitizeText(raw.title || 'Untitled Form'),
    description: raw.description ? sanitizeText(raw.description) : undefined,
    pages: healedPages,
    settings: raw.settings ?? {},
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Compiles a natural language form prompt into a verified, sanitized, and heuristic-linted FormSchema.
 * Uses dependency injection for the LLM caller, guaranteeing zero client-side credential leakage.
 */
export async function compilePromptToSchema(
  prompt: string,
  caller: LlmCompletionCaller,
  options?: SystemPromptOptions
): Promise<CompileSchemaResult> {
  const systemPrompt = generateFormBuilderSystemPrompt(options);
  let rawResponse = '';

  try {
    rawResponse = await caller(systemPrompt, prompt);
  } catch (callerErr) {
    return {
      success: false,
      rawResponse: '',
      parseError: `LLM caller invocation failed: ${(callerErr as Error).message}`,
    };
  }

  const parseResult = sanitizeAndParseJson<FormSchema>(rawResponse);
  if (!parseResult.success || !parseResult.data) {
    return {
      success: false,
      rawResponse,
      parseError: parseResult.error,
    };
  }

  const candidateSchema = normalizeAndHealSchema(parseResult.data);

  // 1. Schema Contract Validation (Zod / Standard Schema)
  const validationResult = safeValidateFormSchema(candidateSchema);
  if (!validationResult.success) {
    return {
      success: false,
      rawResponse,
      schema: candidateSchema,
      validationErrors: validationResult.error?.issues.map((i) => i.message) ?? [],
    };
  }

  // 2. Hostile Critic Heuristic & Soundness Linting (Cycles, ReDoS, Orphans, Privacy)
  const lintResult = lintFormSchema(candidateSchema);
  if (!lintResult.valid) {
    return {
      success: false,
      rawResponse,
      schema: candidateSchema,
      lintIssues: lintResult.issues,
    };
  }

  return {
    success: true,
    schema: candidateSchema,
    rawResponse,
    lintIssues: lintResult.issues, // May contain non-fatal warnings
  };
}
