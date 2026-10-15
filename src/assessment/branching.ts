import type { AssessmentState } from './types.js';

export type ScoreComparisonOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual';

export type ScoreCondition =
  | {
      type: 'score-total-percent';
      operator: ScoreComparisonOperator;
      value: number; // 0..100
    }
  | {
      type: 'score-total-points';
      operator: ScoreComparisonOperator;
      value: number;
    }
  | {
      type: 'score-category-percent';
      tag: string;
      operator: ScoreComparisonOperator;
      value: number; // 0..100
    }
  | {
      type: 'score-question-correct';
      fieldId: string;
      isCorrect: boolean;
    }
  | {
      type: 'score-question-attempts';
      fieldId: string;
      operator: ScoreComparisonOperator;
      value: number;
    }
  | {
      type: 'score-and';
      conditions: ScoreCondition[];
    }
  | {
      type: 'score-or';
      conditions: ScoreCondition[];
    };

export function compareNumeric(
  actual: number,
  operator: ScoreComparisonOperator,
  target: number
): boolean {
  switch (operator) {
    case 'equals':
      return Math.abs(actual - target) < 1e-6;
    case 'notEquals':
      return Math.abs(actual - target) >= 1e-6;
    case 'greaterThan':
      return actual > target;
    case 'greaterThanOrEqual':
      return actual >= target - 1e-6;
    case 'lessThan':
      return actual < target;
    case 'lessThanOrEqual':
      return actual <= target + 1e-6;
  }
}

export function evaluateScoreCondition(
  condition: ScoreCondition,
  state: AssessmentState
): boolean {
  switch (condition.type) {
    case 'score-total-percent':
      return compareNumeric(state.scorePercent, condition.operator, condition.value);

    case 'score-total-points':
      return compareNumeric(state.totalScore, condition.operator, condition.value);

    case 'score-category-percent': {
      const summary = state.categoryScores[condition.tag];
      const percent = summary ? summary.percent : 0;
      return compareNumeric(percent, condition.operator, condition.value);
    }

    case 'score-question-correct': {
      const evaluation = state.evaluations[condition.fieldId];
      if (!evaluation) return false;
      return evaluation.isCorrect === condition.isCorrect;
    }

    case 'score-question-attempts': {
      const evaluation = state.evaluations[condition.fieldId];
      const attempts = evaluation ? evaluation.attemptsUsed : 0;
      return compareNumeric(attempts, condition.operator, condition.value);
    }

    case 'score-and':
      return condition.conditions.every((cond) => evaluateScoreCondition(cond, state));

    case 'score-or':
      return condition.conditions.some((cond) => evaluateScoreCondition(cond, state));
  }
}

export const ScoreConditionEvaluator = {
  evaluate: evaluateScoreCondition,
  compareNumeric,
};

