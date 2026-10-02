import { describe, it, expect, vi } from 'vitest';
import { FormManager } from '../src/manager/FormManager.js';
import { applyRule, validateRules, ValidationEngine } from '../src/validation/ValidationEngine.js';
import { FormHydrator, registerCustomValidator, clearCustomValidators } from '../src/hydrator/FormHydrator.js';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import { AnalyticsEngine } from '../src/analytics/AnalyticsEngine.js';
import { exportToStaticReact } from '../src/codegen/ReactCodeGen.js';
import type { FormSchema, FieldDefinition, FormResponse } from '../src/schema/FormSchema.js';

describe('@intuitui-labs/form-builder-engine (G0 Contract & Unit Tests)', () => {
  describe('FormManager', () => {
    it('initializes default values and manages state transitions', () => {
      const onSubmit = vi.fn();
      const manager = new FormManager<{ name: string; age: number }>({
        fields: {
          name: { type: 'text', label: 'Full Name', defaultValue: 'Ada', required: true },
          age: { type: 'number', label: 'Age', defaultValue: 28, required: false },
        },
        onSubmit,
      });

      const state = manager.getState();
      expect(state.values.name).toBe('Ada');
      expect(state.values.age).toBe(28);
      expect(state.isValid).toBe(true);

      manager.setFieldValue('name', 'Grace');
      expect(manager.getState().values.name).toBe('Grace');
      expect(manager.getState().isDirty).toBe(true);
    });

    it('enforces required field validation on field change', () => {
      const manager = new FormManager<{ email: string }>({
        fields: {
          email: { type: 'email', label: 'Email', defaultValue: 'test@example.com', required: true },
        },
        onSubmit: () => {},
      });

      expect(manager.validateField('email')).toBe(true);
      manager.setFieldValue('email', '');
      expect(manager.validateField('email')).toBe(false);
      expect(manager.getState().errors.email).toBe('Email is required');
      expect(manager.getState().isValid).toBe(false);
    });

    it('triggers onSubmit and updates submitSuccess', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const manager = new FormManager<{ feedback: string }>({
        fields: {
          feedback: { type: 'text', label: 'Feedback', defaultValue: 'Great tool' },
        },
        onSubmit,
      });

      await manager.submit();
      expect(onSubmit).toHaveBeenCalledWith({ feedback: 'Great tool' });
      expect(manager.getState().submitSuccess).toBe(true);
    });
  });

  describe('ValidationEngine & applyRule', () => {
    it('evaluates required, email, and length rules accurately', () => {
      expect(applyRule({ type: 'required' }, '').isValid).toBe(false);
      expect(applyRule({ type: 'required' }, 'Hello').isValid).toBe(true);

      expect(applyRule({ type: 'email' }, 'invalid-email').isValid).toBe(false);
      expect(applyRule({ type: 'email' }, 'user@intuitui.org').isValid).toBe(true);

      expect(applyRule({ type: 'minLength', value: 5 }, 'abc').isValid).toBe(false);
      expect(applyRule({ type: 'minLength', value: 5 }, 'abcdef').isValid).toBe(true);

      expect(applyRule({ type: 'min', value: 10 }, 5).isValid).toBe(false);
      expect(applyRule({ type: 'min', value: 10 }, 15).isValid).toBe(true);
    });

    it('executes multiple rules sequentially via validateRules', () => {
      const rules = [
        { type: 'required' as const, message: 'Value missing' },
        { type: 'minLength' as const, value: 3, message: 'Too short' },
      ];

      const emptyRes = validateRules(rules, '');
      expect(emptyRes.isValid).toBe(false);
      expect(emptyRes.error).toBe('Value missing');

      const shortRes = validateRules(rules, 'ab');
      expect(shortRes.isValid).toBe(false);
      expect(shortRes.error).toBe('Too short');

      const validRes = validateRules(rules, 'abcd');
      expect(validRes.isValid).toBe(true);
    });
  });

  describe('FormHydrator', () => {
    it('hydrates a declarative schema into an executable FormManager', () => {
      const schema = {
        fields: [
          {
            id: 'f1',
            name: 'username',
            type: 'text',
            label: 'Username',
            required: true,
            rules: [{ type: 'minLength', value: 4, message: 'Min 4 chars' }],
          },
        ],
      };

      const manager = FormHydrator.hydrate(schema, vi.fn());
      expect(manager.getConfig().fields.username.label).toBe('Username');
      expect(manager.validateField('username')).toBe(false);

      manager.setFieldValue('username', 'user1');
      expect(manager.validateField('username')).toBe(true);
    });

    it('supports custom validator registration and execution', () => {
      registerCustomValidator('evenNumber', (val) => ({
        isValid: Number(val) % 2 === 0,
        error: 'Must be even',
      }));

      const schema = {
        fields: [
          {
            id: 'f2',
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

  describe('MultiStepFormManager', () => {
    it('manages multi-page form progress and navigation boundaries', () => {
      const schema: FormSchema = {
        id: 'survey-1',
        title: 'Multi-Step Survey',
        pages: [
          {
            id: 'p1',
            title: 'Personal Info',
            fields: [{ id: 'name', name: 'name', type: 'text', label: 'Name', required: true }],
          },
          {
            id: 'p2',
            title: 'Preferences',
            fields: [{ id: 'role', name: 'role', type: 'select', label: 'Role' }],
          },
        ],
      };

      const multi = new MultiStepFormManager(schema, vi.fn());
      expect(multi.getTotalPages()).toBe(2);
      expect(multi.getCurrentPageIndex()).toBe(0);
      expect(multi.isFirstStep()).toBe(true);
      expect(multi.isLastStep()).toBe(false);

      // Cannot advance if required fields on current page are invalid
      expect(multi.nextStep()).toBe(false);

      // Fill required field
      multi.getFormManager().setFieldValue('name', 'Hypatia');
      expect(multi.nextStep()).toBe(true);

      expect(multi.getCurrentPageIndex()).toBe(1);
      expect(multi.isFirstStep()).toBe(false);
      expect(multi.isLastStep()).toBe(true);

      expect(multi.prevStep()).toBe(true);
      expect(multi.getCurrentPageIndex()).toBe(0);
    });
  });

  describe('AnalyticsEngine', () => {
    it('aggregates response data across field types', () => {
      const fields: FieldDefinition[] = [
        {
          id: 'rating',
          name: 'rating',
          type: 'select',
          options: [{ label: 'Good', value: 'good' }, { label: 'Bad', value: 'bad' }],
        },
      ];

      const responses: FormResponse[] = [
        { id: 'r1', formId: 'f', data: { rating: 'good' }, submittedAt: '2026-01-01' },
        { id: 'r2', formId: 'f', data: { rating: 'good' }, submittedAt: '2026-01-02' },
        { id: 'r3', formId: 'f', data: { rating: 'bad' }, submittedAt: '2026-01-03' },
      ];

      const analytics = AnalyticsEngine.aggregate(fields, responses);
      expect(analytics).toHaveLength(1);
      expect(analytics[0].totalResponses).toBe(3);
      expect(analytics[0].data).toEqual({ good: 2, bad: 1 });
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

