import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PureSchemaAdapter,
  ZodSchemaAdapter,
  StandardSchemaAdapter,
  getSchemaValidator,
  setSchemaValidator,
  resetSchemaValidator,
  validateFormSchema,
  safeValidateFormSchema,
  type FormSchema,
  type StandardSchemaV1,
} from '../src/schema/index.js';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import { FormHydrator } from '../src/hydrator/FormHydrator.js';

describe('Hexagonal Schema Validation Adapters', () => {
  const validSchemaPayload: FormSchema = {
    v: '1.0',
    id: 'test-form',
    tenantId: 'tenant-100',
    title: 'Customer Feedback',
    pages: [
      {
        id: 'p1',
        title: 'Step 1',
        fields: [
          {
            id: 'f1',
            name: 'rating',
            type: 'number',
            label: 'Rating',
            required: true,
            order: 0,
            rules: [{ type: 'min', value: 1 }],
          },
        ],
      },
    ],
    settings: { isPublished: true },
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
  };

  afterEach(() => {
    resetSchemaValidator();
  });

  describe('PureSchemaAdapter (Zero-Dependency Engine)', () => {
    const adapter = new PureSchemaAdapter();

    it('validates a conformant FormSchema successfully', () => {
      const result = adapter.safeValidate(validSchemaPayload);
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('test-form');
      expect(result.data?.pages[0].fields[0].name).toBe('rating');
    });

    it('rejects unsupported schema versions', () => {
      const invalid = { ...validSchemaPayload, v: '2.0' };
      const result = adapter.safeValidate(invalid);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some((i) => i.path.includes('v'))).toBe(true);
    });

    it('rejects empty pages array', () => {
      const invalid = { ...validSchemaPayload, pages: [] };
      const result = adapter.safeValidate(invalid);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('at least one page');
    });

    it('blocks prototype pollution attempts in field names', () => {
      const malicious = {
        ...validSchemaPayload,
        pages: [
          {
            id: 'p1',
            fields: [
              { id: 'bad-1', name: '__proto__', type: 'text' },
              { id: 'bad-2', name: 'constructor', type: 'text' },
            ],
          },
        ],
      };
      const result = adapter.safeValidate(malicious);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some((i) => i.message.includes('Illegal property name'))).toBe(true);
    });

    it('validate() returns schema or throws informative Error', () => {
      expect(adapter.validate(validSchemaPayload).id).toBe('test-form');
      expect(() => adapter.validate({ v: 'invalid' })).toThrow();
    });
  });

  describe('ZodSchemaAdapter', () => {
    const adapter = new ZodSchemaAdapter();

    it('validates standard FormSchema and produces structured error on failure', () => {
      const ok = adapter.safeValidate(validSchemaPayload);
      expect(ok.success).toBe(true);

      const bad = adapter.safeValidate({ v: '1.0' });
      expect(bad.success).toBe(false);
      expect(bad.error?.issues.length).toBeGreaterThan(0);
    });
  });

  describe('StandardSchemaAdapter (StandardSchemaV1 / Valibot / ArkType compliance)', () => {
    it('integrates with mock StandardSchemaV1 implementation', () => {
      const mockStandardSchema: StandardSchemaV1<unknown, FormSchema> = {
        '~standard': {
          version: 1,
          vendor: 'valibot-mock',
          validate: (val: unknown) => {
            if (val && typeof val === 'object' && (val as any).v === '1.0') {
              return { value: val as FormSchema };
            }
            return {
              issues: [{ message: 'Expected valid schema', path: ['v'] }],
            };
          },
        },
      };

      const adapter = new StandardSchemaAdapter(mockStandardSchema);
      expect(adapter.name).toBe('standard-schema:valibot-mock');

      const pass = adapter.safeValidate(validSchemaPayload);
      expect(pass.success).toBe(true);
      expect(pass.data?.id).toBe('test-form');

      const fail = adapter.safeValidate({ v: '0.9' });
      expect(fail.success).toBe(false);
      expect(fail.error?.issues[0].message).toBe('Expected valid schema');
    });
  });

  describe('SchemaValidatorRegistry & Dynamic Swapping', () => {
    it('swaps active validator at runtime', () => {
      expect(getSchemaValidator().name).toBe('pure');

      const zodAdapter = new ZodSchemaAdapter();
      setSchemaValidator(zodAdapter);
      expect(getSchemaValidator().name).toBe('zod');

      // validateFormSchema uses the newly active adapter
      const validated = validateFormSchema(validSchemaPayload);
      expect(validated.id).toBe('test-form');

      resetSchemaValidator();
      expect(getSchemaValidator().name).toBe('pure');
    });
  });

  describe('Manager & Hydrator Injection', () => {
    it('MultiStepFormManager validates schema on mount when configured with schemaValidator', () => {
      const pureAdapter = new PureSchemaAdapter();
      const manager = new MultiStepFormManager(validSchemaPayload, () => {}, {
        security: {
          schemaValidator: pureAdapter,
          validateSchemaOnMount: true,
        },
      });

      expect(manager.getTotalPages()).toBe(1);

      // Throws if invalid schema is passed with validateSchemaOnMount
      const invalid = { ...validSchemaPayload, pages: [] };
      expect(() => {
        new MultiStepFormManager(invalid as any, () => {}, {
          security: {
            schemaValidator: pureAdapter,
            validateSchemaOnMount: true,
          },
        });
      }).toThrow();
    });

    it('FormHydrator supports strict validation with injected adapter', () => {
      const pureAdapter = new PureSchemaAdapter();
      expect(() => {
        FormHydrator.hydrate(
          { v: 'invalid' } as any,
          () => {},
          { schemaValidator: pureAdapter, strict: true }
        );
      }).toThrow();
    });
  });
});
