import type {
  IRewardEnginePort,
  RewardEvaluationContext,
  RewardPayload,
} from '@intuitui-labs/form-builder-engine';
import { pointsForAnswer } from '../domain/points';
import type { SurveyFeatures } from '../domain/types';

/**
 * Outbound adapter -> engine's IRewardEnginePort.
 *
 * Encodes her real points rules (surveys/views.py):
 *   - points only when `features.points.enabled`
 *   - per-question-type values, customisable via `features.points.values`
 *   - a short/open answer longer than 20 chars earns the `open` value
 *   - no completion bonus — every answered question earns its type's points
 *
 * The engine evaluates this once per completed step and surfaces the payload
 * via IFeedbackNotifierPort + MultiStepFormManager.getActiveReward().
 */
export class FeedoraRewardAdapter implements IRewardEnginePort {
  readonly name = 'FeedoraRewardAdapter';

  constructor(private readonly features: SurveyFeatures) {}

  evaluateMilestone(context: RewardEvaluationContext): RewardPayload | null {
    const page = context.completedPage;
    if (!page || !this.features.points.enabled) return null;

    let points = 0;
    const breakdown: Record<string, number> = {};

    for (const field of page.fields) {
      const value = context.allValues[field.name];
      if (value === undefined || value === null || value === '') continue;

      const fieldPoints = pointsForAnswer(this.features, field.type, value);
      if (fieldPoints > 0) {
        points += fieldPoints;
        breakdown[field.name] = fieldPoints;
      }
    }

    if (points <= 0) return null;

    let title = `+${points} voice points`;
    let bonus = 0;
    if (this.features.rewards?.enabled && this.features.rewards?.mode === 'variable') {
      const prob = this.features.rewards.probability ?? 0.4;
      if (Math.random() < prob) {
        const mult = Number(this.features.rewards.minMultiplier ?? 1.5);
        bonus = Math.max(1, Math.round(points * (mult - 1)));
        points += bonus;
        title = `🎲 +${points} Voice Boost (${mult}x Lucky Insight!)`;
      }
    }

    return {
      id: `reward:${context.formId ?? 'form'}:${context.completedStepId}`,
      type: 'points',
      title,
      description: bonus > 0
        ? `Surprise insight bonus! ${points} points earned for “${page.title ?? context.completedStepId}”.`
        : `${points} points earned for “${page.title ?? context.completedStepId}”.`,
      data: {
        points,
        bonus,
        breakdown,
        stepId: context.completedStepId,
        stepIndex: context.completedStepIndex,
        progressPercent: context.progress.percentage,
      },
    };
  }
}
