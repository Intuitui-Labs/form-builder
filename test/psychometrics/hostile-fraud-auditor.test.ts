import { describe, it, expect } from 'vitest';
import { DefaultPsychometricAuditor } from '../../src/psychometrics/DefaultPsychometricAuditor.js';
import type { QuestionMetadata } from '../../src/ports/IPsychometricAuditorPort.js';

describe('Hostile Psychometric Fraud & Speeder Auditor', () => {
  const auditor = new DefaultPsychometricAuditor();

  const mockQuestions: QuestionMetadata[] = [
    { id: 'q1', name: 'peou_1', type: 'likert', construct: 'peou' },
    { id: 'q2', name: 'peou_2', type: 'likert', construct: 'peou' },
    { id: 'q3', name: 'peou_3', type: 'likert', construct: 'peou' },
    { id: 'q4', name: 'pu_1', type: 'likert', construct: 'pu' },
    { id: 'q5', name: 'pu_2', type: 'likert', construct: 'pu' },
    { id: 'q6', name: 'joy_1', type: 'likert', construct: 'joy' },
    { id: 'q7', name: 'joy_2', type: 'likert', construct: 'joy' },
    { id: 'q8', name: 'cur_1', type: 'likert', construct: 'curiosity' },
    { id: 'q9', name: 'cur_2', type: 'likert', construct: 'curiosity' },
    { id: 'q10', name: 'biu_1', type: 'likert', construct: 'biu' },
  ];

  describe('Hostile Vector 1: Matrix Singularity & Uniform Zero Variance', () => {
    it('handles identical uniform responses without division-by-zero or NaN in Cronbach alpha', () => {
      // 5 respondents all answer 3 for every question
      const uniformMatrix = [
        [3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
      ];

      const res = auditor.calculateCronbachAlpha(uniformMatrix);
      expect(res.alpha).toBe(0.0);
      expect(res.totalVariance).toBe(0.0);
      expect(Number.isNaN(res.alpha)).toBe(false);
      expect(res.interpretation).toContain('No variance in responses');
    });

    it('rejects matrix with fewer than 2 items or 2 respondents safely', () => {
      const singleItem = [[4], [5]];
      const singleResp = [[4, 5, 3]];

      expect(auditor.calculateCronbachAlpha(singleItem).alpha).toBe(0.0);
      expect(auditor.calculateCronbachAlpha(singleResp).alpha).toBe(0.0);
    });

    it('computes accurate Cronbach alpha and matches Gihini benchmark on valid diverse cohort', () => {
      // Consistent positive scale correlation
      const validMatrix = [
        [4, 4, 5, 4, 5, 4, 5, 4, 5, 5],
        [3, 3, 4, 3, 4, 3, 3, 4, 3, 4],
        [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
        [2, 2, 3, 2, 3, 2, 2, 3, 2, 3],
        [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
        [1, 2, 2, 1, 2, 1, 1, 2, 1, 2],
      ];

      const res = auditor.calculateCronbachAlpha(validMatrix);
      expect(res.alpha).toBeGreaterThanOrEqual(0.85);
      expect(res.alpha).toBeLessThanOrEqual(1.0);
      expect(res.interpretation).toMatch(/Good|Excellent/);
    });
  });

  describe('Hostile Vector 2: Straight-Lining Response Detection', () => {
    it('flags submission when >= 80% Likert items are identical (lazy straight-lining)', () => {
      const straightLinedAnswers = {
        peou_1: 4,
        peou_2: 4,
        peou_3: 4,
        pu_1: 4,
        pu_2: 4,
        joy_1: 4,
        joy_2: 4,
        cur_1: 4,
        cur_2: 4,
        biu_1: 3, // only 1 different out of 10 (90% identical)
      };

      const audit = auditor.auditSubmission({
        answers: straightLinedAnswers,
        dwellTimesMs: {
          peou_1: 2000,
          peou_2: 2100,
          peou_3: 1900,
          pu_1: 2500,
          pu_2: 2400,
          joy_1: 2200,
          joy_2: 2100,
          cur_1: 2300,
          cur_2: 2000,
          biu_1: 2000,
        },
        totalDurationMs: 21500,
        questions: mockQuestions,
      });

      expect(audit.isValid).toBe(false);
      expect(audit.flags).toContain('STRAIGHT_LINING');
      expect(audit.metrics.longStringRatio).toBe(0.9);
      expect(audit.recommendation).toBe('FLAG_FOR_REVIEW');
    });

    it('passes submission when user answers with natural variance across constructs', () => {
      const variedAnswers = {
        peou_1: 4,
        peou_2: 5,
        peou_3: 3,
        pu_1: 4,
        pu_2: 2,
        joy_1: 5,
        joy_2: 4,
        cur_1: 3,
        cur_2: 4,
        biu_1: 5,
      };

      const audit = auditor.auditSubmission({
        answers: variedAnswers,
        dwellTimesMs: {
          peou_1: 2000,
          peou_2: 1800,
          peou_3: 2100,
          pu_1: 2500,
          pu_2: 2200,
          joy_1: 1900,
          joy_2: 2000,
          cur_1: 2400,
          cur_2: 2100,
          biu_1: 2200,
        },
        totalDurationMs: 21200,
        questions: mockQuestions,
      });

      expect(audit.isValid).toBe(true);
      expect(audit.flags).not.toContain('STRAIGHT_LINING');
      expect(audit.recommendation).toBe('ACCEPT');
      expect(audit.confidenceScore).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('Hostile Vector 3: Speeder Detection & Anti-Timing Spoofing', () => {
    it('flags submission when average dwell time is sub-350ms per question', () => {
      const rapidAnswers = {
        peou_1: 3,
        peou_2: 4,
        peou_3: 2,
        pu_1: 5,
        pu_2: 3,
        joy_1: 4,
        joy_2: 2,
        cur_1: 3,
        cur_2: 5,
        biu_1: 4,
      };

      const audit = auditor.auditSubmission({
        answers: rapidAnswers,
        dwellTimesMs: {
          peou_1: 150,
          peou_2: 120,
          peou_3: 200,
          pu_1: 180,
          pu_2: 140,
          joy_1: 110,
          joy_2: 190,
          cur_1: 130,
          cur_2: 160,
          biu_1: 150,
        },
        totalDurationMs: 1530,
        questions: mockQuestions,
      });

      expect(audit.isValid).toBe(false);
      expect(audit.flags).toContain('SPEEDER');
      expect(audit.metrics.averageDwellMs).toBeLessThan(350);
      expect(audit.recommendation).toBe('REJECT');
    });

    it('catches speeder spoofing: user idles for 10s on intro then rushes answers in < 150ms each', () => {
      const spoofedAnswers = {
        peou_1: 3,
        peou_2: 4,
        peou_3: 2,
        pu_1: 5,
        pu_2: 3,
        joy_1: 4,
        joy_2: 2,
        cur_1: 3,
        cur_2: 5,
        biu_1: 4,
      };

      // 9 items clicked in 100ms, but total duration spoofed by 15-second idle
      const audit = auditor.auditSubmission({
        answers: spoofedAnswers,
        dwellTimesMs: {
          peou_1: 14000, // 14s idle on first item
          peou_2: 80,
          peou_3: 90,
          pu_1: 100,
          pu_2: 80,
          joy_1: 70,
          joy_2: 110,
          cur_1: 90,
          cur_2: 80,
          biu_1: 100,
        },
        totalDurationMs: 14800,
        questions: mockQuestions,
      });

      expect(audit.isValid).toBe(false);
      expect(audit.flags).toContain('SPEEDER');
      expect(audit.metrics.subSpeedThresholdDwellCount).toBeGreaterThanOrEqual(7);
      expect(audit.recommendation).toMatch(/REJECT|FLAG_FOR_REVIEW/);
    });

    it('rejects bot submission exhibiting BOTH straight-lining and sub-200ms speeder execution', () => {
      const botAnswers = {
        peou_1: 5,
        peou_2: 5,
        peou_3: 5,
        pu_1: 5,
        pu_2: 5,
        joy_1: 5,
        joy_2: 5,
        cur_1: 5,
        cur_2: 5,
        biu_1: 5,
      };

      const audit = auditor.auditSubmission({
        answers: botAnswers,
        dwellTimesMs: {
          peou_1: 50,
          peou_2: 40,
          peou_3: 45,
          pu_1: 60,
          pu_2: 30,
          joy_1: 50,
          joy_2: 45,
          cur_1: 35,
          cur_2: 40,
          biu_1: 55,
        },
        totalDurationMs: 450,
        questions: mockQuestions,
      });

      expect(audit.isValid).toBe(false);
      expect(audit.flags).toContain('STRAIGHT_LINING');
      expect(audit.flags).toContain('SPEEDER');
      expect(audit.recommendation).toBe('REJECT');
      expect(audit.confidenceScore).toBeLessThan(0.1);
    });
  });
});
