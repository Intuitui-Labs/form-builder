import { describe, it, expect, vi } from 'vitest';
import {
  ConditionEvaluator,
  evaluateCondition,
  evaluatePredicate,
} from '../src/core/ConditionEvaluator.js';
import { FormManager } from '../src/manager/FormManager.js';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import { FormHydrator } from '../src/hydrator/FormHydrator.js';
import type { FormSchema } from '../src/schema/FormSchema.js';

describe('ConditionEvaluator (Zero-dependency core engine)', () => {
  it('evaluates null or undefined conditions as true (unrestricted)', () => {
    expect(ConditionEvaluator.evaluate(undefined, {})).toBe(true);
    expect(ConditionEvaluator.evaluate(null as any, {})).toBe(true);
  });

  describe('Comparison Operators', () => {
    it('evaluates equals and notEquals with string and number coercion', () => {
      expect(evaluatePredicate({ field: 'age', operator: 'equals', value: 25 }, { age: 25 })).toBe(true);
      expect(evaluatePredicate({ field: 'age', operator: 'equals', value: '25' }, { age: 25 })).toBe(true);
      expect(evaluatePredicate({ field: 'age', operator: 'equals', value: 25 }, { age: '25' })).toBe(true);
      expect(evaluatePredicate({ field: 'age', operator: 'notEquals', value: 30 }, { age: 25 })).toBe(true);

      // Booleans
      expect(evaluatePredicate({ field: 'agree', operator: 'equals', value: true }, { agree: 'true' })).toBe(true);
      expect(evaluatePredicate({ field: 'agree', operator: 'equals', value: 'false' }, { agree: false })).toBe(true);
    });

    it('evaluates contains for strings (case-insensitive) and arrays', () => {
      expect(evaluatePredicate({ field: 'role', operator: 'contains', value: 'admin' }, { role: 'Super Admin' })).toBe(true);
      expect(evaluatePredicate({ field: 'role', operator: 'contains', value: 'dev' }, { role: 'Designer' })).toBe(false);

      expect(evaluatePredicate({ field: 'tags', operator: 'contains', value: 'ts' }, { tags: ['js', 'ts', 'react'] })).toBe(true);
      expect(evaluatePredicate({ field: 'tags', operator: 'contains', value: 'python' }, { tags: ['js', 'ts'] })).toBe(false);
    });

    it('evaluates greaterThan and lessThan for numeric comparisons', () => {
      expect(evaluatePredicate({ field: 'score', operator: 'greaterThan', value: 50 }, { score: 75 })).toBe(true);
      expect(evaluatePredicate({ field: 'score', operator: 'greaterThan', value: 50 }, { score: '75' })).toBe(true);
      expect(evaluatePredicate({ field: 'score', operator: 'greaterThan', value: 50 }, { score: 30 })).toBe(false);

      expect(evaluatePredicate({ field: 'price', operator: 'lessThan', value: 100 }, { price: 49.99 })).toBe(true);
      expect(evaluatePredicate({ field: 'price', operator: 'lessThan', value: 100 }, { price: 150 })).toBe(false);
    });

    it('evaluates in and notIn for membership checks', () => {
      expect(evaluatePredicate({ field: 'plan', operator: 'in', value: ['pro', 'enterprise'] }, { plan: 'pro' })).toBe(true);
      expect(evaluatePredicate({ field: 'plan', operator: 'in', value: ['pro', 'enterprise'] }, { plan: 'free' })).toBe(false);

      expect(evaluatePredicate({ field: 'role', operator: 'notIn', value: ['guest', 'banned'] }, { role: 'member' })).toBe(true);
      expect(evaluatePredicate({ field: 'role', operator: 'notIn', value: ['guest', 'banned'] }, { role: 'guest' })).toBe(false);
    });

    it('evaluates isEmpty and isNotEmpty across primitives, strings, and collections', () => {
      expect(evaluatePredicate({ field: 'bio', operator: 'isEmpty' }, { bio: '' })).toBe(true);
      expect(evaluatePredicate({ field: 'bio', operator: 'isEmpty' }, { bio: '   ' })).toBe(true);
      expect(evaluatePredicate({ field: 'bio', operator: 'isEmpty' }, { bio: null })).toBe(true);
      expect(evaluatePredicate({ field: 'bio', operator: 'isEmpty' }, {})).toBe(true);
      expect(evaluatePredicate({ field: 'skills', operator: 'isEmpty' }, { skills: [] })).toBe(true);

      expect(evaluatePredicate({ field: 'bio', operator: 'isNotEmpty' }, { bio: 'Engineer' })).toBe(true);
      expect(evaluatePredicate({ field: 'skills', operator: 'isNotEmpty' }, { skills: ['Code'] })).toBe(true);
    });
  });

  describe('Compound Conditions', () => {
    it('evaluates AND logic requiring all predicates to match', () => {
      const condition = {
        logical: 'AND' as const,
        predicates: [
          { field: 'isEnterprise', operator: 'equals' as const, value: true },
          { field: 'employeeCount', operator: 'greaterThan' as const, value: 100 },
        ],
      };

      expect(ConditionEvaluator.evaluate(condition, { isEnterprise: true, employeeCount: 250 })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { isEnterprise: true, employeeCount: 50 })).toBe(false);
      expect(ConditionEvaluator.evaluate(condition, { isEnterprise: false, employeeCount: 250 })).toBe(false);
    });

    it('evaluates OR logic requiring at least one predicate to match', () => {
      const condition = {
        logical: 'OR' as const,
        predicates: [
          { field: 'role', operator: 'equals' as const, value: 'admin' },
          { field: 'role', operator: 'equals' as const, value: 'manager' },
        ],
      };

      expect(ConditionEvaluator.evaluate(condition, { role: 'manager' })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { role: 'admin' })).toBe(true);
      expect(ConditionEvaluator.evaluate(condition, { role: 'guest' })).toBe(false);
    });
  });
});

describe('FormManager Dynamic Field Visibility & Stale Value Pruning', () => {
  it('dynamically toggles isFieldVisible based on condition', () => {
    const form = new FormManager({
      fields: {
        hasCompany: { type: 'select', defaultValue: 'no' },
        companyName: {
          type: 'text',
          visibleIf: { field: 'hasCompany', operator: 'equals', value: 'yes' },
          required: true,
        },
      },
      onSubmit: vi.fn(),
    });

    expect(form.isFieldVisible('companyName')).toBe(false);

    form.setFieldValue('hasCompany', 'yes');
    expect(form.isFieldVisible('companyName')).toBe(true);

    form.setFieldValue('hasCompany', 'no');
    expect(form.isFieldVisible('companyName')).toBe(false);
  });

  it('bypasses validation for hidden fields so they never block form validation', () => {
    const form = new FormManager({
      fields: {
        isEmployed: { type: 'select', defaultValue: 'no' },
        employer: {
          type: 'text',
          required: true,
          visibleIf: { field: 'isEmployed', operator: 'equals', value: 'yes' },
        },
      },
      onSubmit: vi.fn(),
    });

    // Hidden required field employer is empty -> form should still be valid!
    expect(form.validate()).toBe(true);
    expect(form.getState().isValid).toBe(true);

    // Make employer visible without entering employer name -> form becomes invalid
    form.setFieldValue('isEmployed', 'yes');
    expect(form.validate()).toBe(false);
    expect(form.getState().errors.employer).toBeDefined();

    // Toggle back to hidden -> error is automatically cleared
    form.setFieldValue('isEmployed', 'no');
    expect(form.getState().errors.employer).toBeUndefined();
    expect(form.validate()).toBe(true);
  });

  it('preserves draft values in memory while hidden, but prunes them from onSubmit payload', async () => {
    const onSubmit = vi.fn();
    const form = new FormManager({
      fields: {
        hasReferral: { type: 'select', defaultValue: 'no' },
        referralCode: {
          type: 'text',
          visibleIf: { field: 'hasReferral', operator: 'equals', value: 'yes' },
          clearValueOnHide: true,
        },
      },
      onSubmit,
    });

    // 1. User enters referral code
    form.setFieldValue('hasReferral', 'yes');
    form.setFieldValue('referralCode', 'DISCOUNT2026');
    expect(form.getState().values.referralCode).toBe('DISCOUNT2026');

    // 2. User toggles back to 'no'
    form.setFieldValue('hasReferral', 'no');
    // Draft value is preserved in internal state
    expect(form.getState().values.referralCode).toBe('DISCOUNT2026');

    // 3. User submits form
    await form.submit();

    // 4. Submitted payload must NOT contain referralCode!
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submittedPayload = onSubmit.mock.calls[0][0];
    expect(submittedPayload.hasReferral).toBe('no');
    expect(submittedPayload.referralCode).toBeUndefined();
  });

  it('retains hidden field in submit payload if clearValueOnHide is explicitly false', async () => {
    const onSubmit = vi.fn();
    const form = new FormManager({
      fields: {
        showDetails: { type: 'select', defaultValue: 'no' },
        internalSecret: {
          type: 'text',
          defaultValue: 'PRESERVE_ME',
          visibleIf: { field: 'showDetails', operator: 'equals', value: 'yes' },
          clearValueOnHide: false,
        },
      },
      onSubmit,
    });

    await form.submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].internalSecret).toBe('PRESERVE_ME');
  });
});

describe('MultiStepFormManager Dynamic Branching & Navigation History', () => {
  const branchingSchema: FormSchema = {
    v: '1.0',
    id: 'branching-wizard',
    tenantId: 'tenant-enterprise',
    title: 'Customer Onboarding',
    pages: [
      {
        id: 'step-account-type',
        title: 'Account Type',
        fields: [
          {
            id: 'f-type',
            name: 'accountType',
            type: 'select',
            label: 'Account Type',
            required: true,
            order: 0,
          },
        ],
        jumpRules: [
          {
            condition: { field: 'accountType', operator: 'equals', value: 'enterprise' },
            targetPageId: 'step-enterprise-details',
          },
          {
            condition: { field: 'accountType', operator: 'equals', value: 'individual' },
            targetPageId: 'step-individual-details',
          },
        ],
      },
      {
        id: 'step-individual-details',
        title: 'Individual Details',
        fields: [
          {
            id: 'f-ssn',
            name: 'ssn',
            type: 'text',
            label: 'SSN',
            required: true,
            order: 0,
          },
        ],
        defaultNextPageId: 'step-summary',
      },
      {
        id: 'step-enterprise-details',
        title: 'Enterprise Details',
        fields: [
          {
            id: 'f-tax-id',
            name: 'taxId',
            type: 'text',
            label: 'Federal Tax ID',
            required: true,
            order: 0,
          },
        ],
        defaultNextPageId: 'step-summary',
      },
      {
        id: 'step-summary',
        title: 'Summary',
        fields: [
          {
            id: 'f-confirm',
            name: 'confirmed',
            type: 'text',
            label: 'Confirm',
            required: false,
            order: 0,
          },
        ],
      },
    ],
    settings: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('jumps directly to target page based on matching jumpRules', () => {
    const manager = new MultiStepFormManager(branchingSchema, vi.fn());

    expect(manager.getCurrentPageIndex()).toBe(0);
    expect(manager.isBranchingStep(0)).toBe(true);

    // Answer enterprise
    manager.getFormManager().setFieldValue('accountType', 'enterprise');
    expect(manager.getNextPageIndex()).toBe(2); // Page index 2 is step-enterprise-details

    const advanced = manager.nextStep();
    expect(advanced).toBe(true);
    expect(manager.getCurrentPageIndex()).toBe(2);
    expect(manager.getCurrentPage().id).toBe('step-enterprise-details');
  });

  it('rewinds backwards accurately through jump history on prevStep()', () => {
    const manager = new MultiStepFormManager(branchingSchema, vi.fn());

    manager.getFormManager().setFieldValue('accountType', 'enterprise');
    manager.nextStep();
    expect(manager.getCurrentPageIndex()).toBe(2);

    // Call prevStep() -> must return directly to Page 0!
    const rewound = manager.prevStep();
    expect(rewound).toBe(true);
    expect(manager.getCurrentPageIndex()).toBe(0);
    expect(manager.getCurrentPage().id).toBe('step-account-type');
  });

  it('detects branch diversion and informs UI via willDivertBranch() and hasDownstreamBranchData()', () => {
    const manager = new MultiStepFormManager(branchingSchema, vi.fn());

    // 1. User picks enterprise and proceeds to Step 2
    manager.getFormManager().setFieldValue('accountType', 'enterprise');
    manager.nextStep();
    expect(manager.getCurrentPageIndex()).toBe(2);

    // 2. User fills out downstream enterprise data
    manager.getFormManager().setFieldValue('taxId', 'US-123456');

    // 3. User goes back to Step 0
    manager.prevStep();
    expect(manager.getCurrentPageIndex()).toBe(0);

    // At this moment, target has not changed yet
    expect(manager.willDivertBranch(0)).toBe(false);
    expect(manager.hasDownstreamBranchData(0)).toBe(true);

    // 4. User changes selection to individual
    manager.getFormManager().setFieldValue('accountType', 'individual');

    // willDivertBranch() is now true!
    expect(manager.willDivertBranch(0)).toBe(true);
    expect(manager.hasDownstreamBranchData(0)).toBe(true);

    // UI affordance state flags reflect the diversion
    const affordance = manager.getAffordanceState();
    expect(affordance.navigation.isBranchingStep).toBe(true);
    expect(affordance.navigation.willDivertBranch).toBe(true);
    expect(affordance.navigation.hasDownstreamBranchData).toBe(true);

    // 5. User proceeds down the new individual branch
    manager.nextStep();
    expect(manager.getCurrentPageIndex()).toBe(1);
    expect(manager.getCurrentPage().id).toBe('step-individual-details');

    // Downstream enterprise field on obsolete branch was cleanly pruned
    expect(manager.getFormManager().getState().values.taxId).toBe('');
    expect(manager.getCompletedStepIndices()).not.toContain(2);
  });
});

describe('FormHydrator Integration with Branching and Visibility', () => {
  it('hydrates JSON schema with visibleIf and jumpRules preserving types', () => {
    const jsonPayload = {
      fields: [
        {
          name: 'country',
          type: 'select',
          defaultValue: 'CA',
        },
        {
          name: 'province',
          type: 'text',
          visibleIf: { field: 'country', operator: 'equals', value: 'CA' },
        },
      ],
    };

    const form = FormHydrator.hydrate(jsonPayload, vi.fn());
    expect(form.isFieldVisible('province')).toBe(true);

    form.setFieldValue('country', 'US');
    expect(form.isFieldVisible('province')).toBe(false);
  });
});
