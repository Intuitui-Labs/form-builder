import { describe, it, expect, vi } from 'vitest';
import {
  MultiStepFormManager,
  type FormSchema,
} from '../../src/index.js';
import {
  evaluateStepAffordance,
  type FormGovernanceConfig,
} from '../../src/governance/index.js';

describe('Hostile Operationalization: Declarative Governance & Step Isolation', () => {
  it('Hostile Vector 1: Cross-Step State Bleed & Lockout Elimination (The Telegram Bug)', () => {
    // Schema with 2 quiz steps where options share identical values ('opt_a')
    const quizSchema: FormSchema = {
      v: '1.0',
      id: 'quiz-isolation-form',
      title: 'Quiz with Step Isolation',
      governance: {
        navigation: { allowBack: false },
        interaction: { lockOnSelection: true },
        isolation: { resetEphemeralLocksOnMount: true },
      },
      pages: [
        {
          id: 'step_q1',
          title: 'Question 1',
          fields: [
            {
              id: 'q1_field',
              name: 'question_1',
              type: 'select',
              label: 'Question 1 Label',
              required: true,
              options: [
                { label: 'Option A (Wrong)', value: 'opt_a' },
                { label: 'Option B (Right)', value: 'opt_b' },
              ],
            },
          ],
        },
        {
          id: 'step_q2',
          title: 'Question 2',
          fields: [
            {
              id: 'q2_field',
              name: 'question_2',
              type: 'select',
              label: 'Question 2 Label',
              required: true,
              options: [
                { label: 'Option A (Shared Value)', value: 'opt_a' },
                { label: 'Option C', value: 'opt_c' },
              ],
            },
          ],
        },
      ],
    };

    const manager = new MultiStepFormManager(quizSchema, vi.fn());

    // --- STEP 1 INTERACTION ---
    expect(manager.getCurrentPageIndex()).toBe(0);
    const step1Affordance = manager.getStepAffordance();
    expect(step1Affordance.canGoBack).toBe(false); // Navigation policy enforced!
    expect(step1Affordance.canSelectAnswer).toBe(true);
    expect(step1Affordance.isStepLocked).toBe(false);

    // User selects wrong answer 'opt_a' on Q1
    manager.setFieldValue('question_1', 'opt_a');

    // Due to lockOnSelection: true, Q1 is now locked
    const step1LockedAffordance = manager.getStepAffordance();
    expect(step1LockedAffordance.isStepLocked).toBe(true);
    expect(step1LockedAffordance.canSelectAnswer).toBe(false);

    // Attempting to change answer on Q1 while locked must be rejected
    const tampered = manager.setFieldValue('question_1', 'opt_b');
    expect(tampered).toBe(false); // Tamper rejected!
    expect(manager.getFormManager().getState().values.question_1).toBe('opt_a');

    // --- STEP TRANSITION ---
    const advanced = manager.nextStep();
    expect(advanced).toBe(true);
    expect(manager.getCurrentPageIndex()).toBe(1);

    // --- STEP 2 ISOLATION ASSERTION ---
    // Invariant: Q2 MUST NOT inherit Q1's lock state or answer!
    const step2Affordance = manager.getStepAffordance();
    expect(step2Affordance.isStepLocked).toBe(false); // Must be unlocked!
    expect(step2Affordance.canSelectAnswer).toBe(true); // Must be clickable!
    expect(manager.getFormManager().getState().values.question_2).not.toBe('opt_a'); // Zero bleed!
    expect(manager.getFormManager().getState().values.question_2).toBe('');

    // User can freely click an answer in Q2
    const answeredQ2 = manager.setFieldValue('question_2', 'opt_a');
    expect(answeredQ2).toBe(true);
    expect(manager.getFormManager().getState().values.question_2).toBe('opt_a');
  });

  it('Hostile Vector 2: Strict Back-Navigation Prohibition & Tamper Resistance', () => {
    const strictExamSchema: FormSchema = {
      v: '1.0',
      id: 'strict-exam-form',
      title: 'High-Stakes Certification',
      governance: {
        navigation: { allowBack: false },
      },
      pages: [
        {
          id: 'step-1',
          title: 'Section 1',
          fields: [{ id: 'f1', name: 'f1', type: 'text', label: 'Field 1', required: true }],
        },
        {
          id: 'step-2',
          title: 'Section 2',
          fields: [{ id: 'f2', name: 'f2', type: 'text', label: 'Field 2', required: true }],
        },
      ],
    };

    const manager = new MultiStepFormManager(strictExamSchema, vi.fn());
    manager.setFieldValue('f1', 'Passed');
    manager.nextStep();
    expect(manager.getCurrentPageIndex()).toBe(1);

    // Hostile Action: Client attempts to call prevStep() via script or back button
    const backResult = manager.prevStep();
    // Kernel MUST reject backward transition when allowBack: false
    expect(backResult).toBe(false);
    expect(manager.getCurrentPageIndex()).toBe(1);
    expect(manager.getStepAffordance().canGoBack).toBe(false);
  });

  it('Hostile Vector 3: Declarative Affordance Derivation (Zero Hardcoding)', () => {
    const configurableGovernance: FormGovernanceConfig = {
      navigation: {
        allowBack: true,
        requireStepValidToAdvance: true,
      },
      interaction: {
        lockOnSelection: false,
        allowRetry: true,
      },
      feedback: {
        timing: 'instant',
        revealExplanation: true,
      },
      isolation: {
        resetEphemeralLocksOnMount: true,
      },
    };

    // 1. Initial Empty State
    const initialAffordance = evaluateStepAffordance({
      governance: configurableGovernance,
      stepIndex: 0,
      totalSteps: 3,
      isStepValid: false,
      isStepAnswered: false,
      isSubmitting: false,
    });

    expect(initialAffordance.canGoBack).toBe(false); // First step has nowhere back
    expect(initialAffordance.canAdvance).toBe(false); // Invalid step blocks advance
    expect(initialAffordance.canSelectAnswer).toBe(true);

    // 2. Validated State on Step 2
    const midStepAffordance = evaluateStepAffordance({
      governance: configurableGovernance,
      stepIndex: 1,
      totalSteps: 3,
      isStepValid: true,
      isStepAnswered: true,
      isSubmitting: false,
    });

    expect(midStepAffordance.canGoBack).toBe(true); // allowBack: true
    expect(midStepAffordance.canAdvance).toBe(true); // isStepValid: true
    expect(midStepAffordance.canSelectAnswer).toBe(true); // allowRetry: true
  });
});
