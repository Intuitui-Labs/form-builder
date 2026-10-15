import { describe, it, expect } from 'vitest';
import { ScoreConditionEvaluator, type ScoreCondition } from '../../src/assessment/branching.js';
import type { AssessmentState } from '../../src/assessment/types.js';
import { MultiStepFormManager } from '../../src/manager/MultiStepFormManager.js';
import { createAssessmentEngineForSchema } from '../../src/assessment/engine.js';
import type { FormSchema } from '../../src/schema/FormSchema.js';

describe('Score-Driven Adaptive Branching', () => {
  const dummyState: AssessmentState = {
    evaluations: {
      q1: {
        fieldId: 'q1',
        isCorrect: true,
        score: 10,
        maxPoints: 10,
        negativePenalty: 0,
        partialCreditRatio: 1,
        attemptsUsed: 1,
        hintUsed: false,
        answeredAt: new Date().toISOString(),
        userAnswer: 'A',
      },
      q2: {
        fieldId: 'q2',
        isCorrect: false,
        score: 0,
        maxPoints: 10,
        negativePenalty: 0,
        partialCreditRatio: 0,
        attemptsUsed: 2,
        hintUsed: true,
        answeredAt: new Date().toISOString(),
        userAnswer: 'C',
      },
    },
    totalScore: 10,
    maxPossibleScore: 20,
    scorePercent: 50,
    isPassing: false,
    categoryScores: {
      algebra: { tag: 'algebra', score: 10, maxPoints: 10, percent: 100, questionsCount: 1, correctCount: 1 },
      calculus: { tag: 'calculus', score: 0, maxPoints: 10, percent: 0, questionsCount: 1, correctCount: 0 },
    },
    isGlobalExpired: false,
    isStepExpired: false,
    proctoringEvents: [],
  };

  it('evaluates total score percent conditions', () => {
    const conditionPass: ScoreCondition = {
      type: 'score-total-percent',
      operator: 'greaterThanOrEqual',
      value: 50,
    };
    expect(ScoreConditionEvaluator.evaluate(conditionPass, dummyState)).toBe(true);

    const conditionFail: ScoreCondition = {
      type: 'score-total-percent',
      operator: 'greaterThan',
      value: 60,
    };
    expect(ScoreConditionEvaluator.evaluate(conditionFail, dummyState)).toBe(false);
  });

  it('evaluates category-specific mastery conditions', () => {
    const algebraMastery: ScoreCondition = {
      type: 'score-category-percent',
      tag: 'algebra',
      operator: 'equals',
      value: 100,
    };
    expect(ScoreConditionEvaluator.evaluate(algebraMastery, dummyState)).toBe(true);

    const calculusFailing: ScoreCondition = {
      type: 'score-category-percent',
      tag: 'calculus',
      operator: 'lessThan',
      value: 50,
    };
    expect(ScoreConditionEvaluator.evaluate(calculusFailing, dummyState)).toBe(true);
  });

  it('routes multi-step form manager adaptively based on score conditions', () => {
    const adaptiveSchema: FormSchema = {
      id: 'adaptive-quiz',
      title: 'Adaptive Math Quiz',
      assessment: {
        timing: 'instant',
      },
      pages: [
        {
          id: 'step_diagnostic',
          title: 'Diagnostic Test',
          fields: [
            {
              id: 'q_diag',
              name: 'diagnostic',
              type: 'text',
              label: 'Solve for x: 2x = 10',
              required: true,
              order: 0,
              rubric: {
                kind: 'numeric-range',
                points: 10,
                targetValue: 5,
                tolerance: 0,
                tags: ['algebra'],
              },
            },
          ],
          jumpRules: [
            {
              // If failing algebra (score < 50%), route to remedial step
              scoreCondition: {
                type: 'score-category-percent',
                tag: 'algebra',
                operator: 'lessThan',
                value: 50,
              },
              targetPageId: 'step_remedial',
            },
            {
              // If passing algebra (score >= 50%), route to advanced step
              scoreCondition: {
                type: 'score-category-percent',
                tag: 'algebra',
                operator: 'greaterThanOrEqual',
                value: 50,
              },
              targetPageId: 'step_advanced',
            },
          ],
        },
        {
          id: 'step_remedial',
          title: 'Remedial Review',
          fields: [
            {
              id: 'f_rem',
              name: 'review_ack',
              type: 'text',
              label: 'Review Notes',
              required: false,
              order: 0,
            },
          ],
        },
        {
          id: 'step_advanced',
          title: 'Advanced Calculus',
          fields: [
            {
              id: 'f_adv',
              name: 'adv_answer',
              type: 'text',
              label: 'Advanced Problem',
              required: false,
              order: 0,
            },
          ],
        },
      ],
    };

    const assessmentEngine = createAssessmentEngineForSchema(adaptiveSchema)!;
    const manager = new MultiStepFormManager(adaptiveSchema, async () => {}, {
      experience: { assessmentEngine },
    });

    // 1. Answer wrong (answer 99 instead of 5)
    manager.setFieldValue('diagnostic', 99);
    expect(manager.getNextPageIndex()).toBe(1); // Routes to step_remedial (index 1)

    // 2. Change answer to correct (answer 5)
    manager.setFieldValue('diagnostic', 5);
    expect(manager.getNextPageIndex()).toBe(2); // Routes to step_advanced (index 2)

    manager.dispose();
  });
});
