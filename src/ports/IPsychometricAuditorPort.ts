export type PsychometricAnomalyFlag =
  | 'SPEEDER'
  | 'STRAIGHT_LINING'
  | 'LOW_VARIANCE'
  | 'INSUFFICIENT_EFFORT'
  | 'PATTERN_ALTERNATING';

export type AuditRecommendation = 'ACCEPT' | 'FLAG_FOR_REVIEW' | 'REJECT';

export interface QuestionMetadata {
  id: string;
  name: string;
  type: string;
  construct?: string;
  minRating?: number;
  maxRating?: number;
}

export interface PsychometricAuditMetrics {
  totalQuestions: number;
  analyzedLikertItems: number;
  averageDwellMs: number;
  totalDurationMs: number;
  subSpeedThresholdDwellCount: number;
  longStringMaxConsecutive: number;
  longStringRatio: number;
  sampleVariance: number;
}

export interface PsychometricAuditResult {
  isValid: boolean;
  recommendation: AuditRecommendation;
  flags: PsychometricAnomalyFlag[];
  confidenceScore: number; // 0.00 to 1.00
  metrics: PsychometricAuditMetrics;
  constructScores?: Record<string, number>;
  penaltyScoreDeduction?: number;
  reason?: string;
}

export interface CronbachAlphaResult {
  alpha: number;
  interpretation: string;
  itemCount: number;
  sampleCount: number;
  itemVariances: number[];
  totalVariance: number;
}

export interface IPsychometricAuditorPort {
  /**
   * Audits an individual user submission against psychometric fraud, speeder patterns, and straight-lining.
   */
  auditSubmission(params: {
    answers: Record<string, unknown>;
    dwellTimesMs?: Record<string, number>;
    totalDurationMs?: number;
    questions: QuestionMetadata[];
  }): PsychometricAuditResult;

  /**
   * Calculates Cronbach's alpha across a cohort matrix of numerical responses.
   * Matrix: rows = respondents, columns = items.
   */
  calculateCronbachAlpha(matrix: number[][]): CronbachAlphaResult;
}
