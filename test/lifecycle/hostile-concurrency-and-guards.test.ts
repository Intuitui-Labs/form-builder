import { describe, it, expect, vi } from 'vitest';
import { MultiStepFormManager } from '../../src/manager/MultiStepFormManager.js';
import type { FormSchema } from '../../src/schema/FormSchema.js';

describe('Hostile Concurrency & Guard Protection (FLM SSOT)', () => {
  const branchSchema: FormSchema = {
    id: 'insurance-quote',
    title: 'Insurance Quote',
    version: '1.0.0',
    pages: [
      {
        id: 'step-plan',
        title: 'Plan Selection',
        fields: [
          {
            id: 'plan_field',
            name: 'planType',
            type: 'select',
            label: 'Plan Type',
            required: true,
            options: [
              { label: 'Individual', value: 'individual' },
              { label: 'Family', value: 'family' },
            ],
          },
        ],
        jumpRules: [
          {
            condition: {
              field: 'planType',
              operator: 'equals',
              value: 'family',
            },
            targetPageId: 'step-family',
          },
          {
            condition: {
              field: 'planType',
              operator: 'equals',
              value: 'individual',
            },
            targetPageId: 'step-individual',
          },
        ],
      },
      {
        id: 'step-family',
        title: 'Family Details',
        fields: [
          {
            id: 'dependents_field',
            name: 'dependents',
            type: 'number',
            label: 'Dependents',
            required: true,
          },
        ],
        defaultNextPageId: 'step-review',
      },
      {
        id: 'step-individual',
        title: 'Individual Details',
        fields: [
          {
            id: 'smoker_field',
            name: 'isSmoker',
            type: 'select',
            label: 'Smoker',
            required: true,
            options: [
              { label: 'No', value: 'no' },
              { label: 'Yes', value: 'yes' },
            ],
          },
        ],
        defaultNextPageId: 'step-review',
      },
      {
        id: 'step-review',
        title: 'Final Review',
        fields: [
          {
            id: 'confirm_field',
            name: 'confirmed',
            type: 'select',
            label: 'Confirm',
            required: true,
            options: [{ label: 'I agree', value: 'yes' }],
          },
        ],
      },
    ],
  };

  it('Hostile Test 1: Blocks rapid double-submissions and executes onSubmit exactly once', async () => {
    let resolveSubmit!: () => void;
    const submitPromise = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });

    const onSubmit = vi.fn().mockImplementation(() => submitPromise);
    const manager = new MultiStepFormManager(branchSchema, onSubmit);

    // Navigate to step 3 (Review)
    manager.getFormManager().setFieldValue('planType', 'individual');
    manager.nextStep();
    manager.getFormManager().setFieldValue('isSmoker', 'no');
    manager.nextStep();
    manager.getFormManager().setFieldValue('confirmed', 'yes');

    // Fire first submit (async, hangs on submitPromise)
    const sub1 = manager.submit();
    expect(manager.getLifecyclePhase()).toBe('submitting');

    // Attempt rapid fire second and third submits while first is in-flight
    const sub2 = manager.submit();
    const sub3 = manager.submit();

    // Resolve in-flight submit
    resolveSubmit();
    await Promise.all([sub1, sub2, sub3]);

    // Guard MUST ensure onSubmit was executed exactly once
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(manager.getLifecyclePhase()).toBe('submitted');
  });

  it('Hostile Test 2: In-flight submission mutex blocks navigation attempts', async () => {
    let resolveSubmit!: () => void;
    const submitPromise = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });

    const onSubmit = vi.fn().mockImplementation(() => submitPromise);
    const manager = new MultiStepFormManager(branchSchema, onSubmit);

    // Navigate to review
    manager.getFormManager().setFieldValue('planType', 'individual');
    manager.nextStep();
    manager.getFormManager().setFieldValue('isSmoker', 'no');
    manager.nextStep();
    manager.getFormManager().setFieldValue('confirmed', 'yes');

    // Start submit
    manager.submit();
    expect(manager.getLifecyclePhase()).toBe('submitting');

    // Attempt nextStep, prevStep, or goToStep while submitting: all must be rejected by machine guard
    expect(manager.nextStep()).toBe(false);
    expect(manager.prevStep()).toBe(false);
    expect(manager.goToStep(0)).toBe(false);

    // Active page index MUST NOT have moved
    expect(manager.getCurrentPageIndex()).toBe(3);

    resolveSubmit();
    await new Promise((r) => setTimeout(r, 10));
    expect(manager.getLifecyclePhase()).toBe('submitted');
  });

  it('Hostile Test 3: SSOT Coherence - manager getters are direct zero-cost projections of FLM', () => {
    const manager = new MultiStepFormManager(branchSchema, () => {});

    expect(manager.getCurrentPageIndex()).toBe(0);
    expect(manager.getCompletedStepIndices()).toEqual([]);
    expect(manager.getStepHistory()).toEqual([0]);

    // Advance to step 1
    manager.getFormManager().setFieldValue('planType', 'family');
    manager.nextStep();

    expect(manager.getCurrentPageIndex()).toBe(1);
    expect(manager.getCompletedStepIndices()).toEqual([0]);
    expect(manager.getStepHistory()).toEqual([0, 1]);

    // Advance to review
    manager.getFormManager().setFieldValue('dependents', 3);
    manager.nextStep();

    expect(manager.getCurrentPageIndex()).toBe(3);
    expect(manager.getCompletedStepIndices()).toEqual([0, 1]);
    expect(manager.getStepHistory()).toEqual([0, 1, 3]);

    // Back to family step
    manager.prevStep();
    expect(manager.getCurrentPageIndex()).toBe(1);
    expect(manager.getStepHistory()).toEqual([0, 1]);
  });

  it('Hostile Test 4: Branch diversion atomically prunes downstream steps in FLM SSOT', () => {
    const manager = new MultiStepFormManager(branchSchema, () => {});

    // Choice 1: Family
    manager.getFormManager().setFieldValue('planType', 'family');
    manager.nextStep();
    expect(manager.getCurrentPageIndex()).toBe(1); // step-family

    manager.getFormManager().setFieldValue('dependents', 2);
    manager.nextStep();
    expect(manager.getCurrentPageIndex()).toBe(3); // step-review
    expect(manager.getCompletedStepIndices()).toEqual([0, 1]);

    // Retrace back to step 0
    manager.prevStep(); // to 1
    manager.prevStep(); // to 0
    expect(manager.getCurrentPageIndex()).toBe(0);

    // Divert choice to 'individual'
    manager.getFormManager().setFieldValue('planType', 'individual');
    expect(manager.willDivertBranch(0)).toBe(true);

    // Advance down new branch
    manager.nextStep();
    expect(manager.getCurrentPageIndex()).toBe(2); // step-individual

    // Dependent field data MUST be cleared
    expect(manager.getFormManager().getState().values.dependents).toBe('');
  });

  it('Hostile Test 5: In-flight submission rejects FIELD_CHANGE and prevents mutex breach', async () => {
    let resolveSubmit!: () => void;
    const submitPromise = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });

    const onSubmit = vi.fn().mockImplementation(() => submitPromise);
    const manager = new MultiStepFormManager(branchSchema, onSubmit);

    // Navigate to step 3 (Review)
    manager.getFormManager().setFieldValue('planType', 'individual');
    manager.nextStep();
    manager.getFormManager().setFieldValue('isSmoker', 'no');
    manager.nextStep();
    manager.getFormManager().setFieldValue('confirmed', 'yes');

    // Test focus tracking before submit
    manager.focusField('confirmed');
    expect(manager.getActiveFocusedField()).toBe('confirmed');
    expect(manager.getLifecyclePort().getContext().activeFocusedField).toBe('confirmed');

    manager.blurField('confirmed');
    expect(manager.getActiveFocusedField()).toBeUndefined();
    expect(manager.getLifecyclePort().getContext().activeFocusedField).toBeUndefined();

    // Fire first submit (async, hangs on submitPromise)
    const sub1 = manager.submit();
    expect(manager.getLifecyclePhase()).toBe('submitting');
    expect(manager.getLifecyclePort().can('FIELD_CHANGE')).toBe(false);

    // Adversarial: user types or programmatic field change fires while submission in flight
    const fieldChangeResult = manager.getLifecyclePort().send({
      type: 'FIELD_CHANGE',
      field: 'confirmed',
      value: 'no',
    });

    // Guard MUST reject the field change
    expect(fieldChangeResult.accepted).toBe(false);
    // Phase MUST NOT be reset to 'idle'
    expect(manager.getLifecyclePhase()).toBe('submitting');
    expect(manager.getLifecyclePort().getContext().phase).toBe('submitting');

    // Attempt second submit while still in flight -> must be rejected
    const sub2 = manager.submit();

    // Resolve in-flight submit
    resolveSubmit();
    await Promise.all([sub1, sub2]);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(manager.getLifecyclePhase()).toBe('submitted');
  });
});
