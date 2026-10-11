import type {
  IProgressStrategyPort,
  StepProgressContext,
  ProgressCalculationResult,
} from '../../ports/IProgressStrategyPort.js';

export interface WeightedProgressOptions {
  stepWeights?: Record<string | number, number>;
  customStepWeights?: Record<string | number, number>;
  avgSecondsPerEffortPoint?: number;
  endowedProgressPercent?: number;
  endowedProgressBonus?: number;
}

/**
 * Effort-weighted velocity progress adapter based on cognitive load per step
 * and behavioral velocity indicators.
 */
export class WeightedFieldProgressAdapter implements IProgressStrategyPort {
  private weights: Record<string | number, number>;
  private avgSecondsPerEffortPoint: number;
  private endowedPercent: number;

  constructor(options: WeightedProgressOptions = {}) {
    this.weights = options.customStepWeights ?? options.stepWeights ?? {};
    this.avgSecondsPerEffortPoint = options.avgSecondsPerEffortPoint ?? 8;
    this.endowedPercent = options.endowedProgressPercent ?? options.endowedProgressBonus ?? 0;
  }

  calculateProgress(ctx: StepProgressContext): ProgressCalculationResult {
    let completedPoints = 0;
    let totalPoints = 0;

    const hasConfiguredWeights = Object.keys(this.weights).length > 0;

    if (hasConfiguredWeights) {
      for (const [key, weight] of Object.entries(this.weights)) {
        totalPoints += weight;
        const numKey = Number(key);
        const isCompleted =
          ctx.completedStepIds?.includes(key) ||
          (!isNaN(numKey) && ctx.completedStepIndices?.includes(numKey));

        if (isCompleted) {
          completedPoints += weight;
        }
      }
    } else {
      totalPoints = Math.max(1, ctx.totalProjectedSteps);
      completedPoints = ctx.completedStepIndices?.length ?? ctx.completedStepIds?.length ?? 0;
    }

    const rawRatio = totalPoints > 0 ? completedPoints / totalPoints : 0;
    let percentage: number;

    if (completedPoints >= totalPoints) {
      percentage = 100;
    } else {
      percentage = Math.round(this.endowedPercent + rawRatio * (100 - this.endowedPercent));
      percentage = Math.min(99, Math.max(this.endowedPercent, percentage));
    }

    const remainingPoints = Math.max(0, totalPoints - completedPoints);
    const remainingSeconds = remainingPoints * this.avgSecondsPerEffortPoint;
    let timeText: string | undefined;

    if (percentage >= 100) {
      timeText = 'Complete';
    } else {
      const mins = Math.max(1, Math.ceil(remainingSeconds / 60));
      timeText = `~${mins} min${mins > 1 ? 's' : ''} remaining`;
    }

    return {
      percentage,
      estimatedTimeRemainingText: timeText,
      effortCompleted: completedPoints,
      effortTotal: totalPoints,
    };
  }
}
