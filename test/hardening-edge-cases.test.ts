import { describe, it, expect, vi } from 'vitest';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import type { FormSchema } from '../src/schema/FormSchema.js';
import type { IRewardEnginePort, RewardEvaluationContext, RewardPayload } from '../src/ports/index.js';

describe('Hardened Edge-Cases: Reactivity, Idempotency, Branching Horizon & Ergonomics', () => {
  describe('1. Reactivity Bridge: Real-Time Store Sync', () => {
    const reactiveSchema: FormSchema = {
      v: '1.0',
      id: 'reactive-test',
      tenantId: 'test',
      title: 'Reactive Form',
      pages: [
        {
          id: 'step-1',
          fields: [
            { id: 'f-type', name: 'entityType', type: 'select', label: 'Entity', required: true, order: 1 },
            {
              id: 'f-tax',
              name: 'taxId',
              type: 'text',
              label: 'Tax ID',
              required: true,
              order: 2,
              visibleIf: { field: 'entityType', operator: 'equals', value: 'corporation' },
            },
          ],
        },
      ],
      settings: {},
      createdAt: '2026-10-11',
      updatedAt: '2026-10-11',
    };

    it('immediately notifies subscribers of MultiStepFormManager on field input changes', () => {
      const manager = new MultiStepFormManager(reactiveSchema, () => {});
      const subscriber = vi.fn();

      // Subscribe to MultiStepFormManager (simulating a React hook or UI component)
      manager.subscribe(subscriber);
      subscriber.mockClear();

      // Initial state: taxId is invisible
      expect(manager.getVisibleFields().map((f) => f.name)).toEqual(['entityType']);

      // User changes entityType via FormManager directly
      manager.getFormManager().setFieldValue('entityType', 'corporation');

      // The subscription MUST have fired immediately without waiting for nextStep()!
      expect(subscriber).toHaveBeenCalled();
      expect(manager.getVisibleFields().map((f) => f.name)).toEqual(['entityType', 'taxId']);
    });
  });

  describe('2. Reward Idempotency: Anti-Farming Protection', () => {
    const rewardSchema: FormSchema = {
      v: '1.0',
      id: 'reward-test',
      tenantId: 'test',
      title: 'Reward Form',
      pages: [
        {
          id: 'step-1',
          fields: [{ id: 'f1', name: 'f1', type: 'text', label: 'Field 1', required: false, order: 1 }],
        },
        {
          id: 'step-2',
          fields: [{ id: 'f2', name: 'f2', type: 'text', label: 'Field 2', required: false, order: 1 }],
        },
      ],
      settings: {},
      createdAt: '2026-10-11',
      updatedAt: '2026-10-11',
    };

    it('guarantees milestone rewards trigger only once per session despite Back/Next toggling', () => {
      const evaluateMock = vi.fn().mockReturnValue({
        id: 'promo-100',
        type: 'voucher',
        title: 'Discount Code',
        description: '10% off',
        data: { code: 'SAVE10' },
      });

      const rewardEngine: IRewardEnginePort = {
        evaluateMilestone: evaluateMock,
      };

      const manager = new MultiStepFormManager(rewardSchema, () => {}, {
        rewardEngine,
      });

      // 1. Advance Step 0 -> Step 1 (triggers reward)
      expect(manager.nextStep()).toBe(true);
      expect(evaluateMock).toHaveBeenCalledTimes(1);

      // 2. User goes Back
      expect(manager.prevStep()).toBe(true);
      expect(manager.getCurrentPageIndex()).toBe(0);

      // 3. User goes Next again -> MUST NOT trigger reward again!
      expect(manager.nextStep()).toBe(true);
      expect(manager.getCurrentPageIndex()).toBe(1);
      expect(evaluateMock).toHaveBeenCalledTimes(1); // Still 1, not 2!
    });
  });

  describe('3. Branch-Aware Dynamic Progress Horizon', () => {
    // 10 physical pages, but Page 0 jumps straight to Page 8 and Page 9
    const largeBranchingSchema: FormSchema = {
      v: '1.0',
      id: 'branch-horizon',
      tenantId: 'test',
      title: 'Long Branching Form',
      pages: [
        {
          id: 'page-0',
          title: 'Start',
          jumpRules: [
            {
              condition: { field: 'plan', operator: 'equals', value: 'enterprise' },
              targetPageId: 'page-8',
            },
          ],
          fields: [{ id: 'f0', name: 'plan', type: 'text', label: 'Plan', required: false, order: 1 }],
        },
        { id: 'page-1', title: 'P1', fields: [] },
        { id: 'page-2', title: 'P2', fields: [] },
        { id: 'page-3', title: 'P3', fields: [] },
        { id: 'page-4', title: 'P4', fields: [] },
        { id: 'page-5', title: 'P5', fields: [] },
        { id: 'page-6', title: 'P6', fields: [] },
        { id: 'page-7', title: 'P7', fields: [] },
        {
          id: 'page-8',
          title: 'Enterprise Review',
          fields: [{ id: 'f8', name: 'notes', type: 'text', label: 'Notes', required: false, order: 1 }],
        },
        {
          id: 'page-9',
          title: 'Final Submission',
          fields: [{ id: 'f9', name: 'sign', type: 'text', label: 'Signature', required: false, order: 1 }],
        },
      ],
      settings: {},
      createdAt: '2026-10-11',
      updatedAt: '2026-10-11',
    };

    it('projects completion against the active branch path rather than raw physical page count', () => {
      const manager = new MultiStepFormManager(largeBranchingSchema, () => {});
      manager.getFormManager().setFieldValue('plan', 'enterprise');

      // Projected path should be [0, 8, 9] (total 3 steps, not 10!)
      const projected = manager.getProjectedPath();
      expect(projected).toEqual([0, 8, 9]);

      // Move Step 0 -> Step 8
      manager.nextStep();
      expect(manager.getCurrentPageIndex()).toBe(8);

      // On Step 8, 1 of 3 steps completed = 33% (NOT 10%!)
      let progress = manager.getProgress();
      expect(progress.percentage).toBe(33);

      // Move Step 8 -> Step 9 (Final page)
      manager.nextStep();
      expect(manager.getCurrentPageIndex()).toBe(9);
      expect(manager.isLastStep()).toBe(true);

      // On Step 9, 2 of 3 steps completed = 67% (NOT 20%!)
      progress = manager.getProgress();
      expect(progress.percentage).toBe(67);
    });

    it('marks bypassed pages as skipped in breadcrumbs to avoid dead zombie dots', () => {
      const manager = new MultiStepFormManager(largeBranchingSchema, () => {});
      manager.getFormManager().setFieldValue('plan', 'enterprise');
      manager.nextStep(); // Lands on page 8

      const state = manager.getAffordanceState();
      const breadcrumbs = state.breadcrumbs;

      // Page 0 was completed
      expect(breadcrumbs[0]?.status).toBe('completed');
      // Pages 1 through 7 were bypassed and MUST be flagged as skipped
      for (let i = 1; i <= 7; i++) {
        expect(breadcrumbs[i]?.status).toBe('skipped');
        expect(breadcrumbs[i]?.isSkipped).toBe(true);
        expect(breadcrumbs[i]?.canNavigateTo).toBe(false);
      }
      // Page 8 is current
      expect(breadcrumbs[8]?.status).toBe('current');
    });
  });

  describe('4. Mobile Textarea Return Key Ergonomics', () => {
    const mixedFieldsSchema: FormSchema = {
      v: '1.0',
      id: 'ergonomics',
      tenantId: 'test',
      title: 'Ergonomics Form',
      pages: [
        {
          id: 'step-feedback',
          fields: [
            { id: 'f-title', name: 'subject', type: 'text', label: 'Subject', required: true, order: 1 },
            { id: 'f-body', name: 'body', type: 'textarea', label: 'Feedback Body', required: true, order: 2 },
            { id: 'f-email', name: 'email', type: 'email', label: 'Contact', required: true, order: 3 },
          ],
        },
      ],
      settings: {},
      createdAt: '2026-10-11',
      updatedAt: '2026-10-11',
    };

    it('assigns returnKeyType: default to textareas to preserve multiline editing', () => {
      const manager = new MultiStepFormManager(mixedFieldsSchema, () => {});
      const plan = manager.getStepFocusPlan();

      expect(plan.returnKeyTypes.subject).toBe('next');
      // Must be default for textarea, NOT next or done!
      expect(plan.returnKeyTypes.body).toBe('default');
      expect(plan.returnKeyTypes.email).toBe('done');
    });
  });

  describe('5. Cycle Breaker in Jump Rules', () => {
    const cyclicSchema: FormSchema = {
      v: '1.0',
      id: 'cycle-form',
      tenantId: 'test',
      title: 'Cyclic Form',
      pages: [
        {
          id: 'page-a',
          jumpRules: [{ condition: { field: 'toggle', operator: 'equals', value: true }, targetPageId: 'page-b' }],
          fields: [{ id: 'fa', name: 'toggle', type: 'text', label: 'Toggle', required: false, order: 1 }],
        },
        {
          id: 'page-b',
          jumpRules: [{ condition: { field: 'toggle', operator: 'equals', value: true }, targetPageId: 'page-a' }],
          fields: [{ id: 'fb', name: 'toggle', type: 'text', label: 'Toggle', required: false, order: 1 }],
        },
      ],
      settings: {},
      createdAt: '2026-10-11',
      updatedAt: '2026-10-11',
    };

    it('detects cycles and terminates forward projection safely without an infinite loop', () => {
      const manager = new MultiStepFormManager(cyclicSchema, () => {});
      manager.getFormManager().setFieldValue('toggle', true);

      // getProjectedPath should detect the cycle and break gracefully
      const path = manager.getProjectedPath();
      expect(path).toEqual([0, 1]);
    });
  });
});
