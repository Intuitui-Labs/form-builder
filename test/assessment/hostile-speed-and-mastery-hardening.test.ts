import { describe, it, expect } from 'vitest';
import { AssessmentEngine, Mulberry32PRNG } from '../../src/assessment/engine.js';
import type { QuestionRubric, AssessmentSchemaConfig } from '../../src/assessment/types.js';

describe('Telegram Speed Cadence & Moodle Academic Assessment Hardening', () => {
  describe('Mulberry32 PRNG Deterministic Shuffling', () => {
    const questions = ['q1_anatomy', 'q2_biochem', 'q3_pathology', 'q4_pharmacology', 'q5_genetics'];

    it('guarantees deterministic, reproducible permutations from the same seed', () => {
      const prngA = new Mulberry32PRNG(42);
      const prngB = new Mulberry32PRNG(42);

      const shuffledA = prngA.shuffle(questions);
      const shuffledB = prngB.shuffle(questions);

      expect(shuffledA).toEqual(shuffledB);
      // Ensure original array was not mutated
      expect(questions[0]).toBe('q1_anatomy');
    });

    it('produces distinct permutations across different seeds', () => {
      const prngA = new Mulberry32PRNG(42);
      const prngB = new Mulberry32PRNG(9999);

      const shuffledA = prngA.shuffle(questions);
      const shuffledB = prngB.shuffle(questions);

      expect(shuffledA).not.toEqual(shuffledB);
    });

    it('caches shuffled order per page and per question in AssessmentEngine', () => {
      const config: AssessmentSchemaConfig = {
        timing: 'instant',
        shuffleQuestions: true,
        shuffleOptions: true,
        seed: 12345,
      };

      const engine = new AssessmentEngine({}, config);
      const pageQuestions = ['q_one', 'q_two', 'q_three', 'q_four'];
      const firstCall = engine.getShuffledQuestionNames('page-1', pageQuestions);
      const secondCall = engine.getShuffledQuestionNames('page-1', pageQuestions);

      expect(firstCall).toEqual(secondCall);

      const options = ['opt_a', 'opt_b', 'opt_c', 'opt_d'];
      const shuffledOpts1 = engine.getShuffledOptionValues('q_one', options);
      const shuffledOpts2 = engine.getShuffledOptionValues('q_one', options);

      expect(shuffledOpts1).toEqual(shuffledOpts2);
      expect(shuffledOpts1).toHaveLength(options.length);
    });
  });

  describe('Telegram Speed Bonus Countdown Decay', () => {
    const speedRubrics: Record<string, QuestionRubric> = {
      q_speed: {
        kind: 'single-choice',
        correctValue: 'paris',
        points: 10,
      },
    };

    const speedConfig: AssessmentSchemaConfig = {
      timing: 'instant',
      speedBonusWindowSeconds: 10,
      speedBonusMaxPercent: 50, // up to +50% bonus
    };

    it('awards maximum bonus for instantaneous answer (latency = 0 ms)', () => {
      const engine = new AssessmentEngine(speedRubrics, speedConfig);
      const evaluation = engine.submitAnswer('q_speed', 'paris', { latencyMs: 0 });

      expect(evaluation.isCorrect).toBe(true);
      // Base score 10 + 50% max speed bonus = 15
      expect(evaluation.speedBonus).toBe(5);
      expect(evaluation.score).toBe(15);
    });

    it('linearly decays bonus at midpoint of countdown window (latency = 5000 ms)', () => {
      const engine = new AssessmentEngine(speedRubrics, speedConfig);
      const evaluation = engine.submitAnswer('q_speed', 'paris', { latencyMs: 5000 });

      expect(evaluation.isCorrect).toBe(true);
      // Midpoint: (10000 - 5000) / 10000 = 0.5 ratio -> 10 * 0.5 * 0.5 = 2.5
      expect(evaluation.speedBonus).toBe(2.5);
      expect(evaluation.score).toBe(12.5);
    });

    it('awards 0 speed bonus if answered after countdown window has expired', () => {
      const engine = new AssessmentEngine(speedRubrics, speedConfig);
      const evaluation = engine.submitAnswer('q_speed', 'paris', { latencyMs: 11000 });

      expect(evaluation.isCorrect).toBe(true);
      expect(evaluation.speedBonus).toBeUndefined();
      expect(evaluation.score).toBe(10);
    });
  });

  describe('Telegram Streak Multiplier and Reset Mechanics', () => {
    const rubrics: Record<string, QuestionRubric> = {
      q1: { kind: 'single-choice', correctValue: 'A', points: 10 },
      q2: { kind: 'single-choice', correctValue: 'B', points: 10 },
      q3: { kind: 'single-choice', correctValue: 'C', points: 10 },
      q4: { kind: 'single-choice', correctValue: 'D', points: 10 },
      q5: { kind: 'single-choice', correctValue: 'E', points: 10 },
      q6: { kind: 'single-choice', correctValue: 'F', points: 10 },
    };

    it('escalates multiplier on streaks of 3 (1.2x) and 5 (1.5x) and resets on error', () => {
      const engine = new AssessmentEngine(rubrics, {
        timing: 'instant',
        streakBonusEnabled: true,
      });

      // Question 1 correct -> streak 1 (1.0x)
      const e1 = engine.submitAnswer('q1', 'A');
      expect(e1.score).toBe(10);
      expect(engine.getCurrentStreak()).toBe(1);
      expect(engine.getStreakMultiplier()).toBe(1.0);

      // Question 2 correct -> streak 2 (1.0x)
      const e2 = engine.submitAnswer('q2', 'B');
      expect(e2.score).toBe(10);
      expect(engine.getCurrentStreak()).toBe(2);
      expect(engine.getStreakMultiplier()).toBe(1.0);

      // Question 3 correct -> streak 3 (1.2x multiplier applies!)
      const e3 = engine.submitAnswer('q3', 'C');
      expect(engine.getCurrentStreak()).toBe(3);
      expect(engine.getStreakMultiplier()).toBe(1.2);
      expect(e3.score).toBe(12); // 10 * 1.2 = 12

      // Question 4 correct -> streak 4 (1.2x)
      const e4 = engine.submitAnswer('q4', 'D');
      expect(engine.getCurrentStreak()).toBe(4);
      expect(engine.getStreakMultiplier()).toBe(1.2);
      expect(e4.score).toBe(12);

      // Question 5 correct -> streak 5 (1.5x multiplier applies!)
      const e5 = engine.submitAnswer('q5', 'E');
      expect(engine.getCurrentStreak()).toBe(5);
      expect(engine.getStreakMultiplier()).toBe(1.5);
      expect(e5.score).toBe(15); // 10 * 1.5 = 15

      // Question 6 INCORRECT -> streak resets to 0, multiplier resets to 1.0
      const e6 = engine.submitAnswer('q6', 'WRONG_ANSWER');
      expect(e6.isCorrect).toBe(false);
      expect(engine.getCurrentStreak()).toBe(0);
      expect(engine.getStreakMultiplier()).toBe(1.0);
      expect(engine.getMaxStreak()).toBe(5); // Preserves peak performance
    });
  });

  describe('Moodle Academic Negative Penalty Clamping & Tag Mastery Vectors', () => {
    it('clamps negative total score to 0 by default (floorScoreToZero: true)', () => {
      const penaltyRubrics: Record<string, QuestionRubric> = {
        q_penalty: {
          kind: 'single-choice',
          correctValue: 'Correct',
          points: 10,
          negativePoints: 25, // -25 penalty for wrong answer
        },
      };

      const engine = new AssessmentEngine(penaltyRubrics, {
        timing: 'instant',
        floorScoreToZero: true,
      });

      engine.submitAnswer('q_penalty', 'Wrong');
      const state = engine.getState();

      // Individual evaluation has negative score
      expect(state.evaluations.q_penalty.score).toBe(-25);
      // Aggregate totalScore is clamped to 0
      expect(state.totalScore).toBe(0);
      expect(state.scorePercent).toBe(0);
    });

    it('allows negative total score when floorScoreToZero is explicitly set to false', () => {
      const penaltyRubrics: Record<string, QuestionRubric> = {
        q_penalty: {
          kind: 'single-choice',
          correctValue: 'Correct',
          points: 10,
          negativePoints: 25,
        },
      };

      const engine = new AssessmentEngine(penaltyRubrics, {
        timing: 'instant',
        floorScoreToZero: false,
      });

      engine.submitAnswer('q_penalty', 'Wrong');
      const state = engine.getState();

      expect(state.totalScore).toBe(-25);
    });

    it('computes multidimensional tag mastery vector theta in [0, 100]', () => {
      const curriculumRubrics: Record<string, QuestionRubric> = {
        calc_limits: {
          kind: 'text-match',
          acceptableAnswers: ['4'],
          points: 10,
          tags: ['math', 'calculus'],
        },
        calc_integrals: {
          kind: 'text-match',
          acceptableAnswers: ['x^2'],
          points: 10,
          tags: ['math', 'calculus'],
        },
        alg_quadratic: {
          kind: 'text-match',
          acceptableAnswers: ['2'],
          points: 10,
          tags: ['math', 'algebra'],
        },
        bio_mitosis: {
          kind: 'text-match',
          acceptableAnswers: ['prophase'],
          points: 10,
          tags: ['biology', 'cytology'],
        },
      };

      const engine = new AssessmentEngine(curriculumRubrics, {
        timing: 'instant',
      });

      // Submit calculus answers: 100% correct
      engine.submitAnswer('calc_limits', '4');
      engine.submitAnswer('calc_integrals', 'x^2');

      // Submit algebra answer: wrong (0%)
      engine.submitAnswer('alg_quadratic', 'wrong_val');

      // Submit biology answer: correct (100%)
      engine.submitAnswer('bio_mitosis', 'prophase');

      const state = engine.getState();

      // Calculus: 20 / 20 = 100%
      expect(state.tagMastery.calculus).toBe(100);
      // Algebra: 0 / 10 = 0%
      expect(state.tagMastery.algebra).toBe(0);
      // Math: (20 + 0) / 30 = 66.67%
      expect(state.tagMastery.math).toBe(66.67);
      // Biology: 10 / 10 = 100%
      expect(state.tagMastery.biology).toBe(100);
      expect(state.tagMastery.cytology).toBe(100);

      // Direct getter matches
      expect(engine.getTagMastery('calculus')).toBe(100);
      expect(engine.getTagMastery('algebra')).toBe(0);
    });
  });
});
