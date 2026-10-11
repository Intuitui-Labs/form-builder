import type {
  IRewardEnginePort,
  RewardEvaluationContext,
  RewardPayload,
} from '../../ports/IRewardEnginePort.js';

/**
 * Null reward engine adapter for silent feedback mode or control groups
 * in academic research trials.
 */
export class NullRewardAdapter implements IRewardEnginePort {
  evaluateMilestone(_context: RewardEvaluationContext): RewardPayload | null {
    return null;
  }
}
