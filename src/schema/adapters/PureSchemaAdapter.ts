import type { FormSchema, FormPage, FormField, FieldType, ValidatorRule } from '../FormSchema.js';
import type { ISchemaValidator, SchemaValidationResult, SchemaIssue } from '../../ports/index.js';

const VALID_FIELD_TYPES = new Set<FieldType>([
  'text',
  'email',
  'password',
  'select',
  'textarea',
  'number',
  'heading',
  'divider',
  'slider',
  'likert',
]);

const FORBIDDEN_PROPERTY_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Zero-dependency pure TypeScript schema validator.
 * Provides high-speed validation, prototype pollution defense, and deep structural
 * validation with 0 kB third-party runtime dependencies.
 */
export class PureSchemaAdapter implements ISchemaValidator<FormSchema> {
  public readonly name = 'pure';

  public safeValidate(input: unknown): SchemaValidationResult<FormSchema> {
    const issues: SchemaIssue[] = [];

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {
        success: false,
        error: {
          message: 'Schema must be a valid JSON object',
          issues: [{ path: [], message: 'Expected object, received ' + typeof input }],
        },
      };
    }

    const obj = input as Record<string, unknown>;

    // 1. Version check
    if (obj.v !== '1.0') {
      issues.push({ path: ['v'], message: 'Version must be "1.0"' });
    }

    // 2. Identification
    if (typeof obj.id !== 'string' || obj.id.trim() === '') {
      issues.push({ path: ['id'], message: 'Schema id is required' });
    }
    if (typeof obj.tenantId !== 'string' || obj.tenantId.trim() === '') {
      issues.push({ path: ['tenantId'], message: 'tenantId is required' });
    }
    if (typeof obj.title !== 'string') {
      issues.push({ path: ['title'], message: 'title must be a string' });
    }

    // 3. Timestamps
    if (typeof obj.createdAt !== 'string') {
      issues.push({ path: ['createdAt'], message: 'createdAt must be an ISO string' });
    }
    if (typeof obj.updatedAt !== 'string') {
      issues.push({ path: ['updatedAt'], message: 'updatedAt must be an ISO string' });
    }

    // 4. Pages
    if (!Array.isArray(obj.pages) || obj.pages.length === 0) {
      issues.push({ path: ['pages'], message: 'Form must contain at least one page' });
    } else {
      for (let pIdx = 0; pIdx < obj.pages.length; pIdx++) {
        const page = obj.pages[pIdx];
        if (!page || typeof page !== 'object') {
          issues.push({ path: ['pages', pIdx], message: 'Page must be an object' });
          continue;
        }

        if (typeof page.id !== 'string' || page.id.trim() === '') {
          issues.push({ path: ['pages', pIdx, 'id'], message: 'Page id is required' });
        }

        if (!Array.isArray(page.fields)) {
          issues.push({ path: ['pages', pIdx, 'fields'], message: 'Page fields must be an array' });
        } else {
          for (let fIdx = 0; fIdx < page.fields.length; fIdx++) {
            const field = page.fields[fIdx];
            if (!field || typeof field !== 'object') {
              issues.push({ path: ['pages', pIdx, 'fields', fIdx], message: 'Field must be an object' });
              continue;
            }

            if (typeof field.id !== 'string') {
              issues.push({ path: ['pages', pIdx, 'fields', fIdx, 'id'], message: 'Field id is required' });
            }

            if (typeof field.name !== 'string' || field.name.trim() === '') {
              issues.push({ path: ['pages', pIdx, 'fields', fIdx, 'name'], message: 'Field name is required' });
            } else if (FORBIDDEN_PROPERTY_NAMES.has(field.name)) {
              issues.push({
                path: ['pages', pIdx, 'fields', fIdx, 'name'],
                message: 'Illegal property name',
              });
            }

            if (!VALID_FIELD_TYPES.has(field.type as FieldType)) {
              issues.push({
                path: ['pages', pIdx, 'fields', fIdx, 'type'],
                message: `Invalid field type: ${field.type}`,
              });
            }
          }
        }
      }
    }

    if (issues.length > 0) {
      return {
        success: false,
        error: {
          message: issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          issues,
        },
      };
    }

    // Construct normalized schema with defaults
    const normalizedPages: FormPage[] = (obj.pages as any[]).map((page) => ({
      id: String(page.id),
      title: page.title ? String(page.title) : undefined,
      fields: (page.fields as any[]).map((f) => ({
        id: String(f.id),
        name: String(f.name),
        type: f.type as FieldType,
        label: f.label ? String(f.label) : '',
        required: Boolean(f.required),
        placeholder: f.placeholder ? String(f.placeholder) : undefined,
        defaultValue: f.defaultValue,
        options: Array.isArray(f.options) ? f.options : undefined,
        min: typeof f.min === 'number' ? f.min : undefined,
        max: typeof f.max === 'number' ? f.max : undefined,
        scaleType: f.scaleType,
        order: typeof f.order === 'number' ? f.order : 0,
        conditions: f.conditions,
        visibleIf: f.visibleIf,
        clearValueOnHide: f.clearValueOnHide,
        rules: f.rules,
      })),
      conditions: page.conditions,
      jumpRules: page.jumpRules,
      defaultNextPageId: page.defaultNextPageId,
    }));

    const result: FormSchema = {
      v: '1.0',
      id: String(obj.id),
      tenantId: String(obj.tenantId),
      title: String(obj.title),
      description: obj.description ? String(obj.description) : undefined,
      pages: normalizedPages,
      settings: (obj.settings && typeof obj.settings === 'object' ? obj.settings : {}) as any,
      createdAt: String(obj.createdAt),
      updatedAt: String(obj.updatedAt),
    };

    return {
      success: true,
      data: result,
    };
  }

  public validate(input: unknown): FormSchema {
    const res = this.safeValidate(input);
    if (!res.success || !res.data) {
      throw new Error(res.error?.message || 'FormSchema validation failed');
    }
    return res.data;
  }
}
