import type {
  BatteryNode,
  SurveyBatterySchema,
  FormSubmissionHistoryItem,
  BatteryAccessEvaluation,
} from '../schema/FormBattery.js';
import type { FormAccessPolicy, FormKind } from '../schema/FormSchema.js';

export interface BatteryEvaluationOptions {
  currentTimeMs?: number;
}

export class BatteryEngine {
  /**
   * Resolves default access policy for a specific FormKind if not explicitly specified.
   */
  static getDefaultAccessPolicy(kind: FormKind = 'form'): FormAccessPolicy {
    switch (kind) {
      case 'survey':
        return {
          allowRedo: false,
          maxAttempts: 1,
          rewardStrategy: 'first_attempt_only',
        };
      case 'quiz':
        return {
          allowRedo: true,
          rewardStrategy: 'score_delta',
        };
      case 'exam':
      case 'assessment':
        return {
          allowRedo: false,
          maxAttempts: 1,
          rewardStrategy: 'blocked',
        };
      case 'intake':
      case 'form':
        return {
          allowRedo: true,
          rewardStrategy: 'unrestricted',
        };
      case 'poll':
      case 'feedback':
      default:
        return {
          allowRedo: false,
          maxAttempts: 1,
          rewardStrategy: 'first_attempt_only',
        };
    }
  }

  /**
   * Evaluates whether a user can access and start a specific battery node given their submission history.
   */
  static evaluateNodeAccess(
    node: BatteryNode,
    history: FormSubmissionHistoryItem[],
    options: BatteryEvaluationOptions = {},
  ): BatteryAccessEvaluation {
    const now = options.currentTimeMs ?? Date.now();
    const relevantSubmissions = history.filter((h) => h.formId === node.schemaId);
    
    // A submission is fully completed if completedAt is present or isCompleted is explicitly true
    const completedSubmissions = relevantSubmissions.filter((h) => h.isCompleted !== false && (h.completedAt !== undefined || h.isCompleted === true));
    const partialSubmissions = relevantSubmissions.filter((h) => h.isCompleted === false || (!h.completedAt && h.lastStepIndex !== undefined));
    
    const attemptsUsed = completedSubmissions.length;
    const isCompleted = attemptsUsed > 0;
    const latestPartial = partialSubmissions[0];
    const hasPartialProgress = !isCompleted && latestPartial !== undefined;
    const resumeStepIndex = latestPartial?.lastStepIndex;

    const accessPolicy = node.accessPolicy ?? this.getDefaultAccessPolicy(node.kind);

    // 1. Check Max Attempts
    if (accessPolicy.maxAttempts !== undefined && attemptsUsed >= accessPolicy.maxAttempts) {
      return {
        canStart: false,
        isCompleted,
        attemptsUsed,
        isLocked: true,
        reason: 'max_attempts_reached',
        hasPartialProgress,
        resumeStepIndex,
      };
    }

    // 2. Check allowRedo when already completed
    if (isCompleted && !accessPolicy.allowRedo) {
      return {
        canStart: false,
        isCompleted,
        attemptsUsed,
        isLocked: true,
        reason: 'max_attempts_reached',
        hasPartialProgress: false,
      };
    }

    if (accessPolicy.cooldownMinutes && attemptsUsed > 0) {
      const latestCompletion = completedSubmissions
        .map((submission) => submission.completedAt)
        .filter((completedAt): completedAt is string => Boolean(completedAt))
        .map((completedAt) => new Date(completedAt).getTime())
        .filter(Number.isFinite)
        .sort((a, b) => b - a)[0];
      if (latestCompletion !== undefined) {
        const unlocksAtMs = latestCompletion + accessPolicy.cooldownMinutes * 60_000;
        if (now < unlocksAtMs) {
          return {
            canStart: false,
            isCompleted,
            attemptsUsed,
            isLocked: true,
            reason: 'cooldown_active',
            hasPartialProgress,
            unlocksAt: new Date(unlocksAtMs).toISOString(),
          };
        }
      }
    }

    // 3. Check Prerequisites
    if (node.prerequisites) {
      const { completedFormIds, minScorePercent, unlockDelayMs } = node.prerequisites;

      if (completedFormIds && completedFormIds.length > 0) {
        const completedSet = new Set(
          history
            .filter((h) => h.isCompleted !== false && (h.completedAt !== undefined || h.isCompleted === true))
            .map((h) => h.formId),
        );
        const missing = completedFormIds.filter((id) => !completedSet.has(id));

        if (missing.length > 0) {
          return {
            canStart: false,
            isCompleted,
            attemptsUsed,
            isLocked: true,
            reason: 'prerequisite_unmet',
            missingFormIds: missing,
            hasPartialProgress,
            resumeStepIndex,
          };
        }

        // Check minimum score threshold across prerequisites if configured
        if (minScorePercent !== undefined) {
          const prereqSubs = history.filter((h) => completedFormIds.includes(h.formId));
          const hasUnmetScore = prereqSubs.some((h) => (h.scorePercent ?? 0) < minScorePercent);
          if (hasUnmetScore) {
            return {
              canStart: false,
              isCompleted,
              attemptsUsed,
              isLocked: true,
              reason: 'score_threshold_unmet',
            };
          }
        }

        // Check time lock delay after prerequisite completion
        if (unlockDelayMs && unlockDelayMs > 0) {
          const prereqSubs = history
            .filter((h) => completedFormIds.includes(h.formId) && h.completedAt)
            .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());

          if (prereqSubs.length > 0 && prereqSubs[0]?.completedAt) {
            const lastPrereqTime = new Date(prereqSubs[0].completedAt).getTime();
            const unlocksAtMs = lastPrereqTime + unlockDelayMs;
            if (now < unlocksAtMs) {
              return {
                canStart: false,
                isCompleted,
                attemptsUsed,
                isLocked: true,
                reason: 'time_locked',
                unlocksAt: new Date(unlocksAtMs).toISOString(),
              };
            }
          }
        }
      }
    }

    return {
      canStart: true,
      isCompleted,
      attemptsUsed,
      isLocked: false,
      hasPartialProgress,
      resumeStepIndex,
    };
  }

  /**
   * Calculates sanitized reward points for a submission based on attempt count and policy,
   * strictly mitigating gamified XP farming on repeats while honoring delta learning rewards.
   */
  static calculateSanitizedReward(
    policy: FormAccessPolicy,
    attemptNumber: number,
    earnedPoints: number,
    previousMaxPoints: number = 0,
  ): { pointsAwarded: number; reason: string } {
    if (attemptNumber <= 1) {
      return {
        pointsAwarded: earnedPoints,
        reason: 'first_attempt_full_points',
      };
    }

    switch (policy.rewardStrategy) {
      case 'blocked':
        return {
          pointsAwarded: 0,
          reason: 'attempts_blocked',
        };

      case 'first_attempt_only':
        return {
          pointsAwarded: 0,
          reason: 'redo_points_suppressed',
        };

      case 'score_delta': {
        const delta = Math.max(0, earnedPoints - previousMaxPoints);
        return {
          pointsAwarded: delta,
          reason: delta > 0 ? 'score_delta_mastery_awarded' : 'no_score_improvement',
        };
      }

      case 'unrestricted':
        return {
          pointsAwarded: earnedPoints,
          reason: 'unrestricted_practice_awarded',
        };

      default:
        return {
          pointsAwarded: 0,
          reason: 'default_policy_suppressed',
        };
    }
  }

  /**
   * Identifies the immediate next unlocked node in a battery sequence.
   */
  static findNextEligibleNode(
    battery: SurveyBatterySchema,
    history: FormSubmissionHistoryItem[],
    options: BatteryEvaluationOptions = {},
  ): BatteryNode | null {
    const sortedNodes = [...battery.nodes].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

    for (const node of sortedNodes) {
      const evalResult = this.evaluateNodeAccess(node, history, options);
      if (!evalResult.isCompleted && evalResult.canStart) {
        return node;
      }
    }

    return null;
  }
}
