import type { IProgressStrategyPort, StepProgressContext, ProgressCalculationResult } from '../ports/IProgressStrategyPort.js';
import type { IRewardEnginePort, RewardEvaluationContext, RewardPayload } from '../ports/IRewardEnginePort.js';

/**
 * Kernel-safe progress default: completed steps / total projected steps.
 *
 * This object lives here — not in the adapter package — so the kernel's default
 * path does not import the adapter barrel. It is created once at module load and
 * shared across every form that passes no progressStrategy.
 *
 * Rule: this file MUST NOT import from adapters/index or any affordance adapter.
 */
const stepIndexProgress: IProgressStrategyPort = {
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
  },
};

/**
 * Kernel-safe reward default: always returns null (no reward).
 *
 * This object lives here — not in the adapter package — so the kernel's default
 * path does not import the NullRewardAdapter file (which forces the adapter
 * module to evaluate at startup). It is created once and shared.
 *
 * Rule: this file MUST NOT import from adapters/index or any affordance adapter.
 */
const silentReward: IRewardEnginePort = {
  evaluateMilestone(_context: RewardEvaluationContext): RewardPayload | null {
    return null;
  },
};

export { stepIndexProgress, silentReward };
