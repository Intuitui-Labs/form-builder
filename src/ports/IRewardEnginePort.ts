import type { FormPage } from '../schema/FormSchema.js';
import type { ProgressCalculationResult } from './IProgressStrategyPort.js';

export interface RewardEvaluationContext {
  formId?: string;
  completedStepId: string;
  completedStepIndex: number;
  completedPage?: FormPage;
  stepIndex: number;
  totalSteps: number;
  stepData: Record<string, unknown>;
  allValues: Record<string, unknown>;
  progress: ProgressCalculationResult;
}

export type RewardType = 'peer_benchmark' | 'instant_diagnostic' | 'asset_unlock' | 'voucher' | string;

export interface RewardPayload {
  id: string;
  type: RewardType;
  title: string;
  description: string;
  data: Record<string, unknown>;
}

/**
 * Outbound Port: Evaluator for progressive value exchange & milestone rewards
 */
export interface IRewardEnginePort {
  evaluateMilestone(context: RewardEvaluationContext): Promise<RewardPayload | null> | RewardPayload | null;
}
