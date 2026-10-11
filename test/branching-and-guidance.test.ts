import { describe, it, expect, vi } from 'vitest';
import { evaluateCondition, evaluatePredicate } from '../src/core/ConditionEvaluator.js';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import type { FormSchema } from '../src/schema/FormSchema.js';

describe('Conditional Branching & Proactive UX Guidance', () => {
  describe('1. ConditionEvaluator Unit Tests', () => {
    it('evaluates equals and notEquals operators correctly', () => {
      expect(evaluatePredicate({ field: 'role', operator: 'equals', value: 'admin' }, { role: 'admin' })).toBe(true);
      expect(evaluatePredicate({ field: 'role', operator: 'equals', value: 'admin' }, { role: 'user' })).toBe(false);
      expect(evaluatePredicate({ field: 'role', operator: 'notEquals', value: 'admin' }, { role: 'user' })).toBe(true);
    });

    it('evaluates numerical greaterThan and lessThan with coercion', () => {
      expect(evaluatePredicate({ field: 'age', operator: 'greaterThan', value: 18 }, { age: 21 })).toBe(true);
      expect(evaluatePredicate({ field: 'age', operator: 'greaterThan', value: 18 }, { age: '21' })).toBe(true);
      expect(evaluatePredicate({ field: 'age', operator: 'greaterThan', value: 18 }, { age: 16 })).toBe(false);
      expect(evaluatePredicate({ field: 'score', operator: 'lessThan', value: 50 }, { score: 35 })).toBe(true);
    });

    it('evaluates contains, in, and notIn for strings and arrays', () => {
      // String contains (case-insensitive)
      expect(evaluatePredicate({ field: 'email', operator: 'contains', value: '@acme.com' }, { email: 'Jane@Acme.com' })).toBe(true);
      expect(evaluatePredicate({ field: 'email', operator: 'contains', value: '@acme.com' }, { email: 'jane@other.com' })).toBe(false);

      // Array contains
      expect(evaluatePredicate({ field: 'tags', operator: 'contains', value: 'devops' }, { tags: ['devops', 'backend'] })).toBe(true);

      // In / NotIn
      expect(evaluatePredicate({ field: 'tier', operator: 'in', value: ['pro', 'enterprise'] }, { tier: 'enterprise' })).toBe(true);
      expect(evaluatePredicate({ field: 'tier', operator: 'notIn', value: ['free'] }, { tier: 'enterprise' })).toBe(true);
    });

    it('evaluates isEmpty and isNotEmpty correctly', () => {
      expect(evaluatePredicate({ field: 'note', operator: 'isEmpty' }, { note: '' })).toBe(true);
      expect(evaluatePredicate({ field: 'note', operator: 'isEmpty' }, { note: null })).toBe(true);
      expect(evaluatePredicate({ field: 'note', operator: 'isEmpty' }, { note: undefined })).toBe(true);
      expect(evaluatePredicate({ field: 'items', operator: 'isEmpty' }, { items: [] })).toBe(true);
      expect(evaluatePredicate({ field: 'note', operator: 'isNotEmpty' }, { note: 'hello' })).toBe(true);
    });

    it('evaluates compound AND / OR expressions recursively', () => {
      const condition = {
        logical: 'AND' as const,
        predicates: [
          { field: 'companySize', operator: 'greaterThan' as const, value: 50 },
          {
            logical: 'OR' as const,
            predicates: [
              { field: 'industry', operator: 'equals' as const, value: 'fintech' },
              { field: 'industry', operator: 'equals' as const, value: 'health' },
            ],
          },
        ],
      };

      expect(evaluateCondition(condition, { companySize: 100, industry: 'fintech' })).toBe(true);
      expect(evaluateCondition(condition, { companySize: 100, industry: 'gaming' })).toBe(false);
      expect(evaluateCondition(condition, { companySize: 20, industry: 'fintech' })).toBe(false);
    });
  });

  describe('2. Dynamic Field Visibility & Stale Value Pruning', () => {
    const schemaWithBranching: FormSchema = {
      v: '1.0',
      id: 'branch-form',
      tenantId: 'test',
      title: 'Branching Form',
      pages: [
        {
          id: 'p1',
          title: 'Account Type',
          fields: [
            {
              id: 'f1',
              name: 'accountType',
              type: 'select',
              label: 'Account Type',
              required: true,
              order: 1,
            },
            {
              id: 'f2',
              name: 'taxId',
              type: 'text',
              label: 'Corporate Tax ID',
              required: true,
              order: 2,
              visibleIf: {
                field: 'accountType',
                operator: 'equals',
                value: 'business',
              },
              clearValueOnHide: true,
            },
          ],
        },
        {
          id: 'p2',
          title: 'Confirmation',
          fields: [
            {
              id: 'f3',
              name: 'agree',
              type: 'text',
              label: 'Agreement',
              required: true,
              order: 1,
            },
          ],
        },
      ],
      settings: {},
      createdAt: '2026-10-11',
      updatedAt: '2026-10-11',
    };

    it('hides conditional field when visibleIf evaluates to false', () => {
      const manager = new MultiStepFormManager(schemaWithBranching, () => {});
      const initialFields = manager.getVisibleFields();
      expect(initialFields.map((f) => f.name)).toEqual(['accountType']);

      // Set accountType to business
      manager.getFormManager().setFieldValue('accountType', 'business');
      const updatedFields = manager.getVisibleFields();
      expect(updatedFields.map((f) => f.name)).toEqual(['accountType', 'taxId']);
    });

    it('does not fail validation for required fields that are currently hidden', () => {
      const manager = new MultiStepFormManager(schemaWithBranching, () => {});
      manager.getFormManager().setFieldValue('accountType', 'individual');

      // taxId is required in schema, but hidden because accountType is individual
      expect(manager.validateCurrentStep()).toBe(true);
      expect(manager.nextStep()).toBe(true);
      expect(manager.getCurrentPageIndex()).toBe(1);
    });

    it('prunes stale values when a field dynamically becomes hidden', () => {
      const manager = new MultiStepFormManager(schemaWithBranching, () => {});
      const form = manager.getFormManager();

      form.setFieldValue('accountType', 'business');
      form.setFieldValue('taxId', 'TAX-12345');
      expect((form.getState().values as any).taxId).toBe('TAX-12345');

      // User switches back to individual
      form.setFieldValue('accountType', 'individual');
      manager.pruneHiddenFieldValues();

      expect((form.getState().values as any).taxId).toBeUndefined();
    });
  });

  describe('3. Dynamic Page Jumps & History Stack', () => {
    const branchingWizardSchema: FormSchema = {
      v: '1.0',
      id: 'jump-form',
      tenantId: 'test',
      title: 'Jump Wizard',
      pages: [
        {
          id: 'step-role',
          title: 'Select Role',
          jumpRules: [
            {
              condition: { field: 'role', operator: 'equals', value: 'developer' },
              targetPageId: 'step-tech-stack', // Jumps past step-business directly to tech stack
            },
          ],
          defaultNextPageId: 'step-business',
          fields: [
            { id: 'f-role', name: 'role', type: 'select', label: 'Role', required: true, order: 1 },
          ],
        },
        {
          id: 'step-business',
          title: 'Business Info',
          fields: [
            { id: 'f-biz', name: 'company', type: 'text', label: 'Company', required: true, order: 1 },
          ],
        },
        {
          id: 'step-tech-stack',
          title: 'Developer Stack',
          fields: [
            { id: 'f-lang', name: 'language', type: 'text', label: 'Primary Language', required: true, order: 1 },
          ],
        },
      ],
      settings: {},
      createdAt: '2026-10-11',
      updatedAt: '2026-10-11',
    };

    it('jumps dynamically to target page when jump rule matches', () => {
      const manager = new MultiStepFormManager(branchingWizardSchema, () => {});
      manager.getFormManager().setFieldValue('role', 'developer');

      expect(manager.getCurrentPageIndex()).toBe(0);
      expect(manager.nextStep()).toBe(true);

      // Should jump directly to index 2 (step-tech-stack), skipping index 1 (step-business)
      expect(manager.getCurrentPageIndex()).toBe(2);
      expect(manager.getCurrentPage().id).toBe('step-tech-stack');
    });

    it('retraces the exact branch path backward on prevStep()', () => {
      const manager = new MultiStepFormManager(branchingWizardSchema, () => {});
      manager.getFormManager().setFieldValue('role', 'developer');
      manager.nextStep(); // Goes to step-tech-stack (index 2)

      expect(manager.getCurrentPageIndex()).toBe(2);

      // Calling prevStep() should retrace back to index 0, not index 1!
      expect(manager.prevStep()).toBe(true);
      expect(manager.getCurrentPageIndex()).toBe(0);
      expect(manager.getCurrentPage().id).toBe('step-role');
    });
  });

  describe('4. Proactive Guidance & Focus Orchestration', () => {
    const guidanceSchema: FormSchema = {
      v: '1.0',
      id: 'guidance-form',
      tenantId: 'test',
      title: 'Guidance Form',
      pages: [
        {
          id: 'contact-page',
          title: 'Contact Details',
          fields: [
            {
              id: 'hdr-1',
              name: 'sectionHeader',
              type: 'heading',
              label: 'Personal Information',
              required: false,
              order: 0,
            },
            {
              id: 'f-name',
              name: 'fullName',
              type: 'text',
              label: 'Full Legal Name',
              helperText: 'As it appears on your passport or national ID',
              formatExample: 'e.g. Jane Doe',
              required: true,
              order: 1,
            },
            {
              id: 'f-email',
              name: 'email',
              type: 'email',
              label: 'Work Email',
              helperText: 'We will send your verification token here',
              formatExample: 'e.g. jane@acme.corp',
              autoFocus: true,
              required: true,
              order: 2,
            },
          ],
        },
      ],
      settings: {},
      createdAt: '2026-10-11',
      updatedAt: '2026-10-11',
    };

    it('generates a StepFocusPlan with traversal order and return key types', () => {
      const manager = new MultiStepFormManager(guidanceSchema, () => {});
      const plan = manager.getStepFocusPlan();

      // Should skip heading and honor explicit autoFocus
      expect(plan.initialFocusFieldId).toBe('f-email');
      expect(plan.traversalOrder).toEqual(['fullName', 'email']);
      expect(plan.returnKeyTypes).toEqual({
        fullName: 'next',
        email: 'done',
      });
    });

    it('provides human-centric guidance metadata without premature error shaming', () => {
      const manager = new MultiStepFormManager(guidanceSchema, () => {});
      const guidance = manager.getFieldGuidance('fullName');

      expect(guidance).toBeDefined();
      expect(guidance?.helperText).toBe('As it appears on your passport or national ID');
      expect(guidance?.formatExample).toBe('e.g. Jane Doe');
      // Untouched field should NOT show errors even if invalid
      expect(guidance?.hasBeenTouched).toBe(false);
      expect(guidance?.showError).toBe(false);
    });

    it('infers mobile keyboard ergonomics and WCAG 1.3.5 input purpose attributes', () => {
      const manager = new MultiStepFormManager(guidanceSchema, () => {});

      // Email field should automatically infer email keyboard and disable autocorrect
      const emailGuidance = manager.getFieldGuidance('email');
      expect(emailGuidance?.keyboardType).toBe('email-address');
      expect(emailGuidance?.autoCapitalize).toBe('none');
      expect(emailGuidance?.autoCorrect).toBe(false);
      expect(emailGuidance?.autoComplete).toBe('email');
      expect(emailGuidance?.textContentType).toBe('emailAddress');
      expect(emailGuidance?.accessibilityLabel).toBe('Work Email');
      expect(emailGuidance?.accessibilityHint).toBe('We will send your verification token here');

      // FullName field should infer word capitalization
      const nameGuidance = manager.getFieldGuidance('fullName');
      expect(nameGuidance?.autoCapitalize).toBe('words');
      expect(nameGuidance?.autoComplete).toBe('name');
      expect(nameGuidance?.textContentType).toBe('name');
    });
  });
});
