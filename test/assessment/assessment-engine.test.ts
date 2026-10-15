import { describe, it, expect, vi } from 'vitest';
import { AssessmentEngine } from '../../src/assessment/engine.js';
import type { IHapticFeedbackPort } from '../../src/ports/IHapticFeedbackPort.js';
import type { QuestionRubric, AssessmentSchemaConfig } from '../../src/assessment/types.js';

describe('AssessmentEngine (Instant Feedback, Deferred Exam, & Proctoring)', () => {
  const rubrics: Record<string, QuestionRubric> = {
    q_math1: {
      kind: 'single-choice',
      points: 20,
      correctValue: '4',
      tags: ['math', 'arithmetic'],
      explanation: '2 + 2 = 4',
    },
    q_math2: {
      kind: 'numeric-range',
      points: 30,
      targetValue: 100,
      tolerance: 2,
      tags: ['math', 'algebra'],
    },
    q_bio: {
      kind: 'single-choice',
      points: 50,
      correctValue: 'mitochondria',
      tags: ['biology'],
      hint: { text: 'Powerhouse of the cell', penaltyPercent: 20 },
    },
  };

  const mockHaptic: IHapticFeedbackPort = {
    isSupported: true,
    trigger: vi.fn(),
  };

  it('runs instant feedback with micro-haptics and immediate score updates', () => {
    const config: AssessmentSchemaConfig = {
      timing: 'instant',
      passingPercent: 70,
    };

    const engine = new AssessmentEngine(rubrics, config, {
      hapticPort: mockHaptic,
      hapticOptions: { minIntervalMs: 0 },
    });

    // Answer q_math1 correctly
    const eval1 = engine.submitAnswer('q_math1', '4');
    expect(eval1?.isCorrect).toBe(true);
    expect(eval1?.score).toBe(20);
    expect(mockHaptic.trigger).toHaveBeenCalledWith('success');

    // Answer q_math2 incorrectly
    const eval2 = engine.submitAnswer('q_math2', 50);
    expect(eval2?.isCorrect).toBe(false);
    expect(eval2?.score).toBe(0);
    expect(mockHaptic.trigger).toHaveBeenCalledWith('error');

    // Check state
    const state = engine.getState();
    expect(state.totalScore).toBe(20);
    expect(state.maxPossibleScore).toBe(100);
    expect(state.scorePercent).toBe(20);
    expect(state.isPassing).toBe(false); // 20% < 70%

    // Category scores
    expect(state.categoryScores['math']?.score).toBe(20);
    expect(state.categoryScores['math']?.maxPoints).toBe(50);
    expect(state.categoryScores['math']?.percent).toBe(40);
    expect(state.categoryScores['biology']?.score).toBe(0);

    engine.dispose();
  });

  it('handles hint requests and logs proctoring event with penalty deduction', () => {
    const config: AssessmentSchemaConfig = { timing: 'instant' };
    const engine = new AssessmentEngine(rubrics, config);

    // Request hint for biology
    const hint = engine.requestHint('q_bio');
    expect(hint).toBe('Powerhouse of the cell');

    // Answer correctly with hint penalty applied (50 * 0.8 = 40)
    const evalBio = engine.submitAnswer('q_bio', 'mitochondria');
    expect(evalBio?.isCorrect).toBe(true);
    expect(evalBio?.score).toBe(40);
    expect(evalBio?.hintUsed).toBe(true);

    const proctoring = engine.getState().proctoringEvents;
    expect(proctoring.some((e) => e.type === 'hint-requested')).toBe(true);

    engine.dispose();
  });

  it('enforces max attempts budget per question', () => {
    const config: AssessmentSchemaConfig = {
      timing: 'instant',
      maxAttemptsPerQuestion: 2,
    };
    const engine = new AssessmentEngine(rubrics, config);

    // Attempt 1: wrong
    engine.submitAnswer('q_math1', '1');
    expect(engine.getState().evaluations['q_math1']?.attemptsUsed).toBe(1);

    // Attempt 2: wrong
    engine.submitAnswer('q_math1', '2');
    expect(engine.getState().evaluations['q_math1']?.attemptsUsed).toBe(2);

    // Attempt 3: correct, but exceeded budget! Should ignore update
    engine.submitAnswer('q_math1', '4');
    expect(engine.getState().evaluations['q_math1']?.attemptsUsed).toBe(2);
    expect(engine.getState().evaluations['q_math1']?.isCorrect).toBe(false);

    engine.dispose();
  });

  it('runs in deferred exam mode grading all answers in batch upon completion', () => {
    const config: AssessmentSchemaConfig = {
      timing: 'deferred',
      passingScore: 60,
    };
    const engine = new AssessmentEngine(rubrics, config, { hapticPort: mockHaptic });

    // In deferred mode, submitAnswer does NOT trigger instant haptics
    engine.submitAnswer('q_math1', '4');
    expect(mockHaptic.trigger).not.toHaveBeenCalled();

    // Grade all
    const allEvaluations = engine.gradeAll({
      q_math1: '4',
      q_math2: 101, // within ±2 tolerance
      q_bio: 'mitochondria',
    });

    expect(allEvaluations['q_math1']?.isCorrect).toBe(true);
    expect(allEvaluations['q_math2']?.isCorrect).toBe(true);
    expect(allEvaluations['q_bio']?.isCorrect).toBe(true);

    const state = engine.getState();
    expect(state.totalScore).toBe(100);
    expect(state.scorePercent).toBe(100);
    expect(state.isPassing).toBe(true);

    engine.dispose();
  });

  it('detects app blur and focus proctoring events during exam', () => {
    const config: AssessmentSchemaConfig = { timing: 'deferred' };
    const engine = new AssessmentEngine(rubrics, config);

    engine.handleAppStateChange('background');
    engine.handleAppStateChange('active');

    const events = engine.getState().proctoringEvents;
    expect(events.some((e) => e.type === 'app-blur')).toBe(true);
    expect(events.some((e) => e.type === 'app-focus')).toBe(true);

    engine.dispose();
  });
});
