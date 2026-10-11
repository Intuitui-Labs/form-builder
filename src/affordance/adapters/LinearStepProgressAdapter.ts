import type {
  IProgressStrategyPort,
  StepProgressContext,
  ProgressCalculationResult,
} from '../../ports/IProgressStrategyPort.js';

/**
 * Standard linear progress calculator based on completed steps vs total steps.
 */
export class LinearStepProgressAdapter implements IProgressStrategyPort {
  calculateProgress(context: StepProgressContext): ProgressCalculationResult {
    const total = Math.max(1, context.totalProjectedSteps);
    const completed = context.completedStepIds.length;
    const percentage = Math.min(100, Math.round((completed / total) * 100));

    return {
      percentage,
      estimatedTimeRemainingText: percentage >= 100 ? 'Complete' : undefined,
      effortCompleted: completed,
      effortTotal: total,
    };
  }
}
