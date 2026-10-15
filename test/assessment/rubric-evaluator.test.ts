import { describe, it, expect } from 'vitest';
import {
  RubricEvaluator,
  fnv1a32,
  sha256,
  hashSaltedAnswer,
} from '../../src/assessment/evaluator.js';
import type {
  SingleChoiceRubric,
  MultipleChoiceRubric,
  NumericRangeRubric,
  TextMatchRubric,
  BooleanRubric,
} from '../../src/assessment/types.js';

describe('RubricEvaluator & Cryptographic Salted Verification', () => {
  describe('Single-Choice Rubric', () => {
    it('evaluates plaintext correct value correctly', () => {
      const rubric: SingleChoiceRubric = {
        kind: 'single-choice',
        points: 10,
        correctValue: 'paris',
        explanation: 'Paris is the capital of France.',
      };

      const correctResult = RubricEvaluator.evaluate('q1', rubric, 'paris');
      expect(correctResult.isCorrect).toBe(true);
      expect(correctResult.score).toBe(10);
      expect(correctResult.explanation).toBe('Paris is the capital of France.');

      const wrongResult = RubricEvaluator.evaluate('q1', rubric, 'london');
      expect(wrongResult.isCorrect).toBe(false);
      expect(wrongResult.score).toBe(0);
    });

    it('evaluates salted SHA-256 hashed answer preventing client-side inspection', () => {
      const salt = 'enterprise_secret_salt_49281';
      const expectedAnswer = 'Option_B';
      const computedHash = hashSaltedAnswer(expectedAnswer, salt, 'sha256');

      const rubric: SingleChoiceRubric = {
        kind: 'single-choice',
        points: 25,
        correctValue: {
          hash: computedHash,
          salt,
          algorithm: 'sha256',
        },
      };

      const correctResult = RubricEvaluator.evaluate('q_stealth', rubric, 'Option_B');
      expect(correctResult.isCorrect).toBe(true);
      expect(correctResult.score).toBe(25);

      const wrongResult = RubricEvaluator.evaluate('q_stealth', rubric, 'Option_A');
      expect(wrongResult.isCorrect).toBe(false);
      expect(wrongResult.score).toBe(0);
    });

    it('evaluates salted FNV-1a 32-bit hash correctly', () => {
      const salt = 'fnv_salt_123';
      const hash = hashSaltedAnswer('c', salt, 'fnv1a32');

      const rubric: SingleChoiceRubric = {
        kind: 'single-choice',
        points: 5,
        correctValue: { hash, salt, algorithm: 'fnv1a32' },
      };

      expect(RubricEvaluator.evaluate('q_fnv', rubric, 'c').isCorrect).toBe(true);
      expect(RubricEvaluator.evaluate('q_fnv', rubric, 'a').isCorrect).toBe(false);
    });
  });

  describe('Multiple-Choice Rubric & Partial Credit Strategies', () => {
    const baseRubric: MultipleChoiceRubric = {
      kind: 'multiple-choice',
      points: 20,
      correctValues: ['apple', 'banana'],
      partialCreditStrategy: 'all-or-nothing',
      totalOptionsCount: 4,
    };

    it('handles all-or-nothing strategy strictly', () => {
      // Exact match
      const exact = RubricEvaluator.evaluate('q_mc', baseRubric, ['apple', 'banana']);
      expect(exact.isCorrect).toBe(true);
      expect(exact.score).toBe(20);

      // Incomplete
      const incomplete = RubricEvaluator.evaluate('q_mc', baseRubric, ['apple']);
      expect(incomplete.isCorrect).toBe(false);
      expect(incomplete.score).toBe(0);

      // Over-selected (contains wrong choice)
      const overSelected = RubricEvaluator.evaluate('q_mc', baseRubric, ['apple', 'banana', 'orange']);
      expect(overSelected.isCorrect).toBe(false);
      expect(overSelected.score).toBe(0);
    });

    it('handles jaccard similarity partial credit (|Intersection| / |Union|)', () => {
      const jaccardRubric: MultipleChoiceRubric = {
        ...baseRubric,
        partialCreditStrategy: 'jaccard',
      };

      // 1 out of 2 correct picked, no wrong picks: intersection=1, union=2 => 0.5
      const partial = RubricEvaluator.evaluate('q_mc', jaccardRubric, ['apple']);
      expect(partial.isCorrect).toBe(false);
      expect(partial.partialCreditRatio).toBe(0.5);
      expect(partial.score).toBe(10); // 20 * 0.5

      // 2 correct picked + 1 wrong picked: intersection=2, union=3 => 2/3 = 0.67
      const withMistake = RubricEvaluator.evaluate('q_mc', jaccardRubric, ['apple', 'banana', 'orange']);
      expect(withMistake.partialCreditRatio).toBe(0.67);
      expect(withMistake.score).toBe(13.4);
    });

    it('handles proportional-with-penalty preventing cheating via select-all', () => {
      const propRubric: MultipleChoiceRubric = {
        ...baseRubric,
        partialCreditStrategy: 'proportional-with-penalty',
        totalOptionsCount: 4, // 2 correct, 2 incorrect options
      };

      // Picking all 4 options: correctFraction = 2/2 = 1.0; penaltyFraction = 2/2 = 1.0; net = 0
      const selectAll = RubricEvaluator.evaluate('q_mc', propRubric, ['apple', 'banana', 'orange', 'grape']);
      expect(selectAll.partialCreditRatio).toBe(0);
      expect(selectAll.score).toBe(0);

      // Picking 1 correct and 0 incorrect: 1/2 - 0 = 0.5 => 10 points
      const oneCorrect = RubricEvaluator.evaluate('q_mc', propRubric, ['apple']);
      expect(oneCorrect.partialCreditRatio).toBe(0.5);
      expect(oneCorrect.score).toBe(10);
    });
  });

  describe('Numeric-Range Rubric & Tolerances', () => {
    const rubric: NumericRangeRubric = {
      kind: 'numeric-range',
      points: 15,
      targetValue: 3.1415,
      tolerance: 0.01,
      inclusive: true,
    };

    it('accepts numbers within tolerance margins', () => {
      expect(RubricEvaluator.evaluate('q_pi', rubric, 3.14).isCorrect).toBe(true);
      expect(RubricEvaluator.evaluate('q_pi', rubric, 3.15).isCorrect).toBe(true);
      expect(RubricEvaluator.evaluate('q_pi', rubric, '3.14').isCorrect).toBe(true);
    });

    it('rejects numbers outside tolerance margins', () => {
      expect(RubricEvaluator.evaluate('q_pi', rubric, 3.12).isCorrect).toBe(false);
      expect(RubricEvaluator.evaluate('q_pi', rubric, 3.16).isCorrect).toBe(false);
      expect(RubricEvaluator.evaluate('q_pi', rubric, 'invalid').isCorrect).toBe(false);
    });
  });

  describe('Text-Match Rubric with Normalization', () => {
    const rubric: TextMatchRubric = {
      kind: 'text-match',
      points: 10,
      acceptableAnswers: ['Alexander Graham Bell', 'A. G. Bell', 'Bell'],
      caseSensitive: false,
      trimWhitespace: true,
      ignorePunctuation: true,
    };

    it('matches case-insensitively and ignores punctuation/whitespace', () => {
      expect(RubricEvaluator.evaluate('q_text', rubric, '  alexander graham bell  ').isCorrect).toBe(true);
      expect(RubricEvaluator.evaluate('q_text', rubric, 'A. G. BELL!').isCorrect).toBe(true);
      expect(RubricEvaluator.evaluate('q_text', rubric, 'bell').isCorrect).toBe(true);
    });

    it('supports regex pattern fallback', () => {
      const regexRubric: TextMatchRubric = {
        kind: 'text-match',
        points: 10,
        acceptableAnswers: [],
        regexPattern: '^#[0-9a-fA-F]{6}$', // hex color code
      };

      expect(RubricEvaluator.evaluate('q_hex', regexRubric, '#FF5733').isCorrect).toBe(true);
      expect(RubricEvaluator.evaluate('q_hex', regexRubric, '#ZZZZZZ').isCorrect).toBe(false);
    });
  });

  describe('Penalties, Hints & Retries', () => {
    const rubric: SingleChoiceRubric = {
      kind: 'single-choice',
      points: 100,
      correctValue: 'alpha',
      negativePoints: 20,
      penaltyPerRetryPercent: 25, // 25% deducted per retry after attempt 1
      hint: {
        text: 'Starts with the first Greek letter',
        penaltyPercent: 20, // 20% deducted if hint was viewed
      },
    };

    it('awards full points on 1st attempt without hint', () => {
      const res = RubricEvaluator.evaluate('q1', rubric, 'alpha', { attemptsUsed: 1, hintUsed: false });
      expect(res.score).toBe(100);
      expect(res.negativePenalty).toBe(0);
    });

    it('applies retry penalty on second attempt (100 * (1 - 0.25) = 75)', () => {
      const res = RubricEvaluator.evaluate('q1', rubric, 'alpha', { attemptsUsed: 2, hintUsed: false });
      expect(res.score).toBe(75);
    });

    it('applies compounded hint penalty (100 * 0.75 * 0.80 = 60)', () => {
      const res = RubricEvaluator.evaluate('q1', rubric, 'alpha', { attemptsUsed: 2, hintUsed: true });
      expect(res.score).toBe(60);
    });

    it('applies negative marking on wrong answer', () => {
      const res = RubricEvaluator.evaluate('q1', rubric, 'beta', { attemptsUsed: 1 });
      expect(res.isCorrect).toBe(false);
      expect(res.score).toBe(-20);
      expect(res.negativePenalty).toBe(20);
    });
  });
});
