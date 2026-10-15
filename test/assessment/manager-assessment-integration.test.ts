import { describe, it, expect, vi } from 'vitest';
import { MultiStepFormManager } from '../../src/manager/MultiStepFormManager.js';
import { createAssessmentEngineForSchema } from '../../src/assessment/index.js';
import type { FormSchema } from '../../src/schema/FormSchema.js';
import type { IHapticFeedbackPort } from '../../src/ports/IHapticFeedbackPort.js';

describe('MultiStepFormManager Assessment Integration', () => {
  const mockHaptic: IHapticFeedbackPort = {
    isSupported: true,
    trigger: vi.fn(),
  };

  const instantQuizSchema: FormSchema = {
    id: 'instant-quiz',
    title: 'Telegram-Style Instant Quiz',
    assessment: {
      timing: 'instant',
      stepTimerSeconds: 15,
      passingPercent: 50,
    },
    pages: [
      {
        id: 'p1',
        title: 'Question 1',
        fields: [
          {
            id: 'f_q1',
            name: 'capital',
            type: 'text',
            label: 'Capital of Japan?',
            required: true,
            order: 0,
            rubric: {
              kind: 'single-choice',
              points: 50,
              correctValue: 'tokyo',
              explanation: 'Tokyo is the capital of Japan since 1869.',
              hint: { text: 'Starts with T', penaltyPercent: 10 },
            },
          },
        ],
      },
      {
        id: 'p2',
        title: 'Question 2',
        fields: [
          {
            id: 'f_q2',
            name: 'boolean_q',
            type: 'select',
            label: 'Is Earth flat?',
            required: true,
            order: 0,
            rubric: {
              kind: 'boolean',
              points: 50,
              correctValue: false,
            },
          },
        ],
      },
    ],
  };

  it('connects AssessmentEngine via the experience.assessmentEngine seam', () => {
    const assessmentEngine = createAssessmentEngineForSchema(instantQuizSchema, {
      hapticPort: mockHaptic,
      hapticOptions: { minIntervalMs: 0 },
    });
    const manager = new MultiStepFormManager(
      instantQuizSchema,
      async () => {},
      { experience: { hapticFeedback: mockHaptic, hapticOptions: { minIntervalMs: 0 }, assessmentEngine } }
    );

    expect(manager.isAssessment()).toBe(true);
    const engine = manager.getAssessmentEngine();
    expect(engine).toBeDefined();

    // 1. Request hint
    const hint = manager.requestAssessmentHint('capital');
    expect(hint).toBe('Starts with T');

    // 2. Set field value (correct with hint penalty: 50 * 0.9 = 45)
    manager.setFieldValue('capital', 'tokyo');

    const state = manager.getAssessmentState();
    expect(state).toBeDefined();
    expect(state?.evaluations['capital']?.isCorrect).toBe(true);
    expect(state?.evaluations['capital']?.score).toBe(45);
    expect(mockHaptic.trigger).toHaveBeenCalledWith('success');

    // 3. Navigate to next step
    manager.nextStep();
    expect(manager.getCurrentPageIndex()).toBe(1);

    // 4. Answer question 2 (wrong answer)
    manager.setFieldValue('boolean_q', true);
    const stateAfterQ2 = manager.getAssessmentState();
    expect(stateAfterQ2?.evaluations['boolean_q']?.isCorrect).toBe(false);
    expect(mockHaptic.trigger).toHaveBeenCalledWith('error');

    manager.dispose();
  });

  it('grades all answers upon submit in deferred exam mode', async () => {
    const deferredExamSchema: FormSchema = {
      id: 'deferred-exam',
      title: 'Moodle Certification Exam',
      assessment: {
        timing: 'deferred',
        passingScore: 80,
      },
      pages: [
        {
          id: 'step1',
          fields: [
            {
              id: 'q1',
              name: 'q1',
              type: 'text',
              label: 'Question 1',
              required: true,
              order: 0,
              rubric: {
                kind: 'single-choice',
                points: 50,
                correctValue: 'A',
              },
            },
            {
              id: 'q2',
              name: 'q2',
              type: 'text',
              label: 'Question 2',
              required: true,
              order: 1,
              rubric: {
                kind: 'single-choice',
                points: 50,
                correctValue: 'B',
              },
            },
          ],
        },
      ],
    };

    let submittedData: unknown = null;
    const assessmentEngine = createAssessmentEngineForSchema(deferredExamSchema);
    const manager = new MultiStepFormManager(
      deferredExamSchema,
      async (values) => {
        submittedData = values;
      },
      { experience: { assessmentEngine } }
    );

    manager.setFieldValue('q1', 'A');
    manager.setFieldValue('q2', 'B');

    // Before submit, evaluations are empty in deferred mode
    expect(Object.keys(manager.getAssessmentState()?.evaluations ?? {}).length).toBe(0);

    // Trigger submission
    await manager.submit();

    // After submit, all fields are evaluated
    const finalState = manager.getAssessmentState();
    expect(finalState?.evaluations['q1']?.isCorrect).toBe(true);
    expect(finalState?.evaluations['q2']?.isCorrect).toBe(true);
    expect(finalState?.totalScore).toBe(100);
    expect(finalState?.isPassing).toBe(true);
    expect(submittedData).toEqual({ q1: 'A', q2: 'B' });

    manager.dispose();
  });
});
