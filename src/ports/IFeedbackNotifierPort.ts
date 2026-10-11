import type { RewardPayload } from './IRewardEnginePort.js';

/**
 * Outbound Port: Notifier for delivering rewards & feedback to the presentation layer
 */
export interface IFeedbackNotifierPort {
  notifyRewardUnlocked(reward: RewardPayload): void;
}
