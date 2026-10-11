import type { FormPage } from '../schema/FormSchema.js';

export interface StepProgressContext {
  formId?: string;
  currentStepIndex: number;
  currentStepId: string;
  completedStepIds: string[];
  completedStepIndices?: number[];
  pages?: FormPage[];
  totalProjectedSteps: number;
  fieldValues: Record<string, unknown>;
  elapsedTimeMs?: number;
}

export interface ProgressCalculationResult {
  /** Normalized progress percentage (0 - 100), guaranteed non-decreasing */
  percentage: number;
  /** Human-readable velocity indicator (e.g. "~2 mins remaining") */
  estimatedTimeRemainingText?: string;
  /** Total cognitive effort points completed vs remaining */
  effortCompleted: number;
  effortTotal: number;
}

/**
 * Outbound Port: Strategy for calculating form progress metrics
 */
export interface IProgressStrategyPort {
  calculateProgress(context: StepProgressContext): ProgressCalculationResult;
}
