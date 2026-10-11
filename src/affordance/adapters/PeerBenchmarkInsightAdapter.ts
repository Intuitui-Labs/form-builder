import type {
  IRewardEnginePort,
  RewardEvaluationContext,
  RewardPayload,
} from '../../ports/IRewardEnginePort.js';

export interface MilestoneBenchmarkRule {
  stepId: string;
  condition?: (
    stepData: Record<string, unknown>,
    allValues: Record<string, unknown>
  ) => boolean;
  reward: RewardPayload;
}

/**
 * Reciprocal value exchange adapter providing instant peer benchmarks and
 * diagnostic insights when cognitive milestones are completed.
 */
export class PeerBenchmarkInsightAdapter implements IRewardEnginePort {
  private rules: MilestoneBenchmarkRule[];

  constructor(rules: MilestoneBenchmarkRule[] = []) {
    this.rules = rules;
  }

  evaluateMilestone(ctx: RewardEvaluationContext): RewardPayload | null {
    const matchedRule = this.rules.find(
      (r) =>
        r.stepId === ctx.completedStepId &&
        (!r.condition || r.condition(ctx.stepData, ctx.allValues))
    );

    return matchedRule ? matchedRule.reward : null;
  }
}
