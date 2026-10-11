import { describe, it, expect, vi } from 'vitest';
import { FormManager } from '../src/manager/FormManager.js';
import { applyRule, validateRules, ValidationEngine } from '../src/validation/ValidationEngine.js';
import { FormHydrator, registerCustomValidator, clearCustomValidators } from '../src/hydrator/FormHydrator.js';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import { AnalyticsEngine } from '../src/analytics/AnalyticsEngine.js';
import { exportToStaticReact } from '../src/codegen/ReactCodeGen.js';
import { validateFormSchema, safeValidateFormSchema } from '../src/schema/index.js';
import type { FormSchema, FieldDefinition, FormResponse } from '../src/schema/FormSchema.js';
import type { IFormManager, IValidationPort, IAnalyticsPort } from '../src/ports/index.js';

describe('@intuitui-labs/form-builder-engine (Multi-Level Test Suite)', () => {
  /* =========================================================================
   * LEVEL 1: PURE UNIT TESTS (Fast, Isolated, Deterministic)
   * ========================================================================= */
  describe('Level 1: Pure Unit Tests', () => {
    describe('ValidationEngine & Rules', () => {
      it('evaluates required, email, and length rules accurately', () => {
        expect(applyRule({ type: 'required' }, '').isValid).toBe(false);
        expect(applyRule({ type: 'required' }, 'valid text').isValid).toBe(true);

        expect(applyRule({ type: 'email' }, 'invalid-email').isValid).toBe(false);
        expect(applyRule({ type: 'email' }, 'user@example.com').isValid).toBe(true);

        expect(applyRule({ type: 'minLength', value: 5 }, 'abc').isValid).toBe(false);
        expect(applyRule({ type: 'minLength', value: 5 }, 'abcde').isValid).toBe(true);

        expect(applyRule({ type: 'maxLength', value: 4 }, 'abcde').isValid).toBe(false);
        expect(applyRule({ type: 'maxLength', value: 4 }, 'abcd').isValid).toBe(true);
      });

      it('evaluates numeric range and pattern rules', () => {
        expect(applyRule({ type: 'min', value: 10 }, 5).isValid).toBe(false);
        expect(applyRule({ type: 'min', value: 10 }, 15).isValid).toBe(true);

        expect(applyRule({ type: 'max', value: 10 }, 15).isValid).toBe(false);
        expect(applyRule({ type: 'max', value: 10 }, 8).isValid).toBe(true);

        expect(applyRule({ type: 'pattern', value: '^[A-Z]{3}$' }, 'abc').isValid).toBe(false);
        expect(applyRule({ type: 'pattern', value: '^[A-Z]{3}$' }, 'ABC').isValid).toBe(true);
      });

      it('validates combined rules using validateRules pipeline', () => {
        const rules = [
          { type: 'required' as const, message: 'Value required' },
          { type: 'minLength' as const, value: 3, message: 'Too short' },
        ];

        expect(validateRules(rules, '').isValid).toBe(false);
        expect(validateRules(rules, 'ab').isValid).toBe(false);
        expect(validateRules(rules, 'abc').isValid).toBe(true);
      });
    });

    describe('AnalyticsEngine Sanitization & Exports', () => {
      it('neutralizes spreadsheet formula injection (OWASP CSV Injection)', () => {
        // Values starting with =, +, -, @, tab, or cr should be prepended with '
        expect(AnalyticsEngine.sanitizeCSVValue('=1+1')).toBe("'=1+1");
        expect(AnalyticsEngine.sanitizeCSVValue('+cmd')).toBe("'+cmd");
        expect(AnalyticsEngine.sanitizeCSVValue('-10')).toBe("'-10");
        expect(AnalyticsEngine.sanitizeCSVValue('@SUM(A1:B1)')).toBe("'@SUM(A1:B1)");
        expect(AnalyticsEngine.sanitizeCSVValue('Safe text')).toBe('Safe text');
      });

      it('properly quotes CSV fields containing commas or quotes', () => {
        expect(AnalyticsEngine.sanitizeCSVValue('Hello, World')).toBe('"Hello, World"');
        expect(AnalyticsEngine.sanitizeCSVValue('Say "Hi"')).toBe('"Say ""Hi"""');
      });

      it('escapes XML entities in SpreadsheetML export', () => {
        expect(AnalyticsEngine.escapeXML('Ben & Jerry <ice cream>')).toBe('Ben &amp; Jerry &lt;ice cream&gt;');
        expect(AnalyticsEngine.escapeXML('"quoted" and \'single\'')).toBe('&quot;quoted&quot; and &apos;single&apos;');
      });

      it('aggregates response data across field types and generates sanitized CSV and XLSX', () => {
        const fields: FieldDefinition[] = [
          { id: 'rating', name: 'rating', type: 'select', options: [{ label: 'Good', value: 'good' }, { label: 'Bad', value: 'bad' }] },
          { id: 'notes', name: 'notes', type: 'text', label: 'Notes' },
        ];

        const responses: FormResponse[] = [
          { id: 'r1', formId: 'f', tenantId: 't', data: { rating: 'good', notes: '=SUM(1,2)' }, submittedAt: '2026-01-01T00:00:00.000Z' },
          { id: 'r2', formId: 'f', tenantId: 't', data: { rating: 'good', notes: 'Great & sleek' }, submittedAt: '2026-01-02T00:00:00.000Z' },
        ];

        const analytics = AnalyticsEngine.aggregate(fields, responses);
        expect(analytics).toHaveLength(2);
        expect(analytics[0].totalResponses).toBe(2);
        expect(analytics[0].data).toEqual({ good: 2, bad: 0 });

        const csv = AnalyticsEngine.toCSV(fields, responses);
        expect(csv).toContain("'=SUM(1,2)"); // Formula injection mitigated

        const xlsx = AnalyticsEngine.toXLSX(fields, responses);
        expect(xlsx).toContain('Great &amp; sleek'); // XML entity escaped
        expect(xlsx).toContain('<Workbook');
      });
    });

    describe('ReactCodeGen', () => {
      it('generates React Hook Form code containing zod schema definition', () => {
        const fields: FieldDefinition[] = [
          { id: 'email', name: 'email', type: 'email', label: 'Email', required: true },
        ];

        const code = exportToStaticReact('FeedbackForm', fields);
        expect(code).toContain('export default function FeedbackForm');
        expect(code).toContain('z.string().email("Invalid email address")');
        expect(code).toContain('useForm<FormValues>');
      });
    });
  });

  /* =========================================================================
   * LEVEL 2: HEXAGONAL PORTS & ADAPTERS CONTRACTS
   * ========================================================================= */
  describe('Level 2: Hexagonal Ports & Adapters Contracts', () => {
    it('FormManager satisfies IFormManager inbound port contract', () => {
      const manager: IFormManager<{ test: string }> = new FormManager<{ test: string }>({
        fields: { test: { type: 'text', defaultValue: 'initial' } },
        onSubmit: () => {},
      });

      expect(typeof manager.getState).toBe('function');
      expect(typeof manager.setFieldValue).toBe('function');
      expect(typeof manager.validateField).toBe('function');
      expect(typeof manager.validate).toBe('function');
      expect(typeof manager.submit).toBe('function');
      expect(typeof manager.reset).toBe('function');
      expect(typeof manager.subscribe).toBe('function');
    });

    it('ValidationEngine satisfies IValidationPort outbound port contract', () => {
      const port: IValidationPort = {
        applyRule,
        validateRules,
      };

      const result = port.applyRule({ type: 'required' }, 'value');
      expect(result.isValid).toBe(true);
    });

    it('AnalyticsEngine satisfies IAnalyticsPort outbound port contract', () => {
      const port: IAnalyticsPort = AnalyticsEngine;
      expect(typeof port.aggregate).toBe('function');
      expect(typeof port.toCSV).toBe('function');
      expect(typeof port.toXLSX).toBe('function');
    });

    it('PureSchemaAdapter and ZodSchemaAdapter satisfy ISchemaValidator outbound port contract', async () => {
      const { PureSchemaAdapter, ZodSchemaAdapter } = await import('../src/schema/index.js');
      const pure = new PureSchemaAdapter();
      const zod = new ZodSchemaAdapter();

      expect(typeof pure.validate).toBe('function');
      expect(typeof pure.safeValidate).toBe('function');
      expect(pure.name).toBe('pure');

      expect(typeof zod.validate).toBe('function');
      expect(typeof zod.safeValidate).toBe('function');
      expect(zod.name).toBe('zod');
    });
  });

  /* =========================================================================
   * LEVEL 3: INTEGRATION & SECURITY GATES (Double Gate, Error Recovery)
   * ========================================================================= */
  describe('Level 3: Integration & Security Gates', () => {
    describe('Double Gate: Zod Structural Schema Validation', () => {
      it('Gate 1: validates structurally valid FormSchema objects', () => {
        const rawSchema = {
          v: '1.0',
          id: 'schema-1',
          tenantId: 'tenant-alpha',
          title: 'Feedback Intake',
          pages: [
            {
              id: 'page-1',
              title: 'General',
              fields: [
                { id: 'f-1', name: 'email', type: 'email', label: 'Email', required: true, order: 0 },
              ],
            },
          ],
          settings: { isPublished: true },
          createdAt: '2026-10-10T00:00:00.000Z',
          updatedAt: '2026-10-10T00:00:00.000Z',
        };

        const validated = validateFormSchema(rawSchema);
        expect(validated.id).toBe('schema-1');
        expect(validated.pages[0].fields[0].name).toBe('email');
      });

      it('Gate 1: rejects malformed schemas (e.g. missing pages or illegal properties)', () => {
        const invalidSchema = {
          v: '1.0',
          id: 'schema-2',
          tenantId: 'tenant-alpha',
          title: 'Empty Form',
          pages: [], // Must have at least 1 page
          createdAt: '2026-10-10T00:00:00.000Z',
          updatedAt: '2026-10-10T00:00:00.000Z',
        };

        const parseResult = safeValidateFormSchema(invalidSchema);
        expect(parseResult.success).toBe(false);
      });
    });

    describe('Hydration & Prototype Pollution Defense', () => {
      it('prevents prototype pollution property injection during hydration', () => {
        const maliciousPayload = {
          fields: [
            { name: '__proto__', type: 'text', label: 'Evil' },
            { name: 'constructor', type: 'text', label: 'Evil' },
            { name: 'prototype', type: 'text', label: 'Evil' },
            { name: 'legitimate', type: 'text', label: 'Legit', defaultValue: 'ok' },
          ],
        };

        const manager = FormHydrator.hydrate(maliciousPayload, vi.fn());
        const state = manager.getState();

        expect(state.values).toHaveProperty('legitimate');
        expect((state.values as any).__proto__).toBe(Object.prototype);
        expect(Object.keys(manager.getConfig().fields)).toEqual(['legitimate']);
      });

      it('supports custom validator registration and execution in hydrated forms', () => {
        registerCustomValidator('evenNumber', (val) => ({
          isValid: Number(val) % 2 === 0,
          error: 'Must be even',
        }));

        const schema = {
          fields: [
            {
              name: 'score',
              type: 'number',
              rules: [{ type: 'custom' as const, name: 'evenNumber' }],
            },
          ],
        };

        const manager = FormHydrator.hydrate(schema, vi.fn());
        manager.setFieldValue('score', 3);
        expect(manager.validateField('score')).toBe(false);

        manager.setFieldValue('score', 4);
        expect(manager.validateField('score')).toBe(true);

        clearCustomValidators();
      });
    });

    describe('State Recovery & Clean Submission', () => {
      it('recovers from validation errors: correcting invalid input clears internal TanStack errorMap and executes onSubmit', async () => {
        let submittedPayload: any = null;
        const onSubmit = vi.fn().mockImplementation(async (values) => {
          submittedPayload = values;
        });

        const manager = new FormManager<{ email: string; name: string }>({
          fields: {
            email: { type: 'email', label: 'Email', defaultValue: '', required: true },
            name: { type: 'text', label: 'Name', defaultValue: '', required: true },
          },
          onSubmit,
        });

        // 1. Initial invalid submission fails
        expect(manager.validate()).toBe(false);
        expect(manager.getState().errors.email).toBe('Email is required');
        expect(manager.getState().errors.name).toBe('Name is required');

        await manager.submit();
        expect(onSubmit).not.toHaveBeenCalled();
        expect(manager.getState().submitSuccess).toBe(false);

        // 2. Correct invalid fields
        manager.setFieldValue('email', 'dev@example.org');
        manager.setFieldValue('name', 'Taylor');
        expect(manager.validate()).toBe(true);
        expect(manager.getState().errors).toEqual({});

        // 3. Submit succeeds cleanly
        await manager.submit();
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(submittedPayload).toEqual({ email: 'dev@example.org', name: 'Taylor' });
        expect(manager.getState().submitSuccess).toBe(true);
      });

      it('MultiStepFormManager gates navigation by page validity and allows final submission upon correction', async () => {
        let submittedPayload: any = null;
        const schema: FormSchema = {
          v: '1.0',
          id: 'wizard-1',
          tenantId: 'tenant-1',
          title: 'Wizard',
          createdAt: '2026-10-10T00:00:00.000Z',
          updatedAt: '2026-10-10T00:00:00.000Z',
          settings: {},
          pages: [
            {
              id: 'p1',
              title: 'Personal Info',
              fields: [{ id: 'name', name: 'name', type: 'text', label: 'Name', required: true, order: 0 }],
            },
            {
              id: 'p2',
              title: 'Contact Info',
              fields: [{ id: 'email', name: 'email', type: 'email', label: 'Email', required: true, order: 0 }],
            },
          ],
        };

        const multi = new MultiStepFormManager(schema, async (values) => {
          submittedPayload = values;
        });

        expect(multi.getTotalPages()).toBe(2);
        expect(multi.getCurrentPageIndex()).toBe(0);

        // Page 1 invalid: nextStep is blocked
        expect(multi.nextStep()).toBe(false);
        expect(multi.getFormManager().getState().errors.name).toBe('Name is required');

        // Correct Page 1
        multi.getFormManager().setFieldValue('name', 'Ada Lovelace');
        expect(multi.nextStep()).toBe(true);
        expect(multi.getCurrentPageIndex()).toBe(1);

        // Page 2 invalid: submit is blocked
        await multi.submit();
        expect(submittedPayload).toBeNull();

        // Correct Page 2
        multi.getFormManager().setFieldValue('email', 'ada@lovelace.org');
        expect(multi.getFormManager().validate()).toBe(true);

        await multi.submit();
        expect(submittedPayload).toEqual({ name: 'Ada Lovelace', email: 'ada@lovelace.org' });
      });
    });
  });

  /* =========================================================================
   * LEVEL 4: CROSS-SDK MATRIX & PACKAGING ARCHITECTURE GATES
   * ========================================================================= */
  describe('Level 4: Cross-SDK Matrix & Packaging Architecture Gates', () => {
    it('declares and packages all first-class subpath entry points in package.json', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));

      const expectedExports = [
        '.',
        './core',
        './ports',
        './schema',
        './validation',
        './hydration',
        './analytics',
        './codegen',
      ];

      for (const exp of expectedExports) {
        expect(pkg.exports).toHaveProperty(exp);
      }
    });

    it('maintains dedicated, immutable multi-version test fixtures for Expo SDK 57 and SDK 58', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');

      const fixtures = ['expo-57', 'expo-58'];
      for (const fix of fixtures) {
        const fixtureDir = path.resolve(__dirname, '../fixtures', fix);
        expect(fs.existsSync(fixtureDir)).toBe(true);

        const manifestPath = path.join(fixtureDir, 'package.json');
        expect(fs.existsSync(manifestPath)).toBe(true);

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        expect(manifest.name).toBe(`fixture-${fix}`);

        const smokeTestPath = path.join(fixtureDir, 'tests/engine.smoke.test.mjs');
        expect(fs.existsSync(smokeTestPath)).toBe(true);
      }
    });

    it('provides an automated zero-network matrix runner script', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const runnerPath = path.resolve(__dirname, '../scripts/run-matrix-test.mjs');

      expect(fs.existsSync(runnerPath)).toBe(true);
      const content = fs.readFileSync(runnerPath, 'utf8');
      expect(content).toContain('Enterprise Matrix Test Runner');
      expect(content).toContain('installTarballIntoFixture');
    });
  });
});

