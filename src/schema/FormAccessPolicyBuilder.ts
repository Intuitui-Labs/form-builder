import type { FormAccessPolicy, RedoRewardStrategy } from './FormSchema.js';

export interface CreatorAttemptPolicyInput {
  allowRedo?: boolean;
  maxAttempts?: number | string;
  cooldownMinutes?: number | string;
  rewardStrategy?: RedoRewardStrategy | string;
}

export const REDO_REWARD_STRATEGY_CHOICES: ReadonlyArray<{
  value: RedoRewardStrategy;
  label: string;
  description: string;
}> = [
  {
    value: 'first_attempt_only',
    label: 'No repeat rewards',
    description: 'Respondents may repeat the form, but only their first response earns completion rewards.',
  },
  {
    value: 'score_delta',
    label: 'Reward improvement',
    description: 'Repeat responses earn rewards only when they improve on the previous best score.',
  },
  {
    value: 'unrestricted',
    label: 'Reward every attempt',
    description: 'Every accepted submission earns its full reward value.',
  },
  {
    value: 'blocked',
    label: 'Blocked on repeat',
    description: 'Repeat attempts are completely prohibited.',
  },
];

/**
 * Validates, normalizes, and summarizes form attempt and repeat reward policies.
 */
export class FormAccessPolicyBuilder {
  /**
   * Validates and normalizes human/UI policy inputs into a strictly compliant FormAccessPolicy.
   */
  static buildPolicy(input: CreatorAttemptPolicyInput): FormAccessPolicy {
    const rawMax = typeof input.maxAttempts === 'string' ? input.maxAttempts.trim() : input.maxAttempts;
    let maxAttempts: number | undefined;
    if (rawMax !== undefined && rawMax !== '' && rawMax !== null) {
      const parsed = Number(rawMax);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
        throw new Error('Maximum attempts must be a whole number between 1 and 1000.');
      }
      maxAttempts = parsed;
    }

    const rawCooldown = typeof input.cooldownMinutes === 'string' ? input.cooldownMinutes.trim() : input.cooldownMinutes;
    let cooldownMinutes: number | undefined;
    if (rawCooldown !== undefined && rawCooldown !== '' && rawCooldown !== null) {
      const parsed = Number(rawCooldown);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 525600) {
        throw new Error('Cooldown must be between 0 and 525600 minutes.');
      }
      if (parsed > 0) cooldownMinutes = parsed;
    }

    const rewardStrategy: RedoRewardStrategy =
      (input.rewardStrategy as RedoRewardStrategy) ?? 'first_attempt_only';

    const allowRedo = maxAttempts === undefined ? Boolean(input.allowRedo) : maxAttempts > 1;

    return {
      allowRedo,
      rewardStrategy,
      ...(maxAttempts !== undefined ? { maxAttempts } : allowRedo ? {} : { maxAttempts: 1 }),
      ...(cooldownMinutes !== undefined ? { cooldownMinutes } : {}),
    };
  }

  /**
   * Generates a readable human summary of active policy rules for pre-flight confirmation.
   */
  static formatPolicySummary(policy: FormAccessPolicy): string[] {
    const lines: string[] = [];
    if (policy.maxAttempts === 1) {
      lines.push('One completed attempt is allowed.');
    } else if (policy.maxAttempts && policy.maxAttempts > 1) {
      lines.push(`Maximum attempts: ${policy.maxAttempts}.`);
    } else if (policy.allowRedo) {
      lines.push('Unlimited attempts are allowed.');
    } else {
      lines.push('One completed attempt is allowed.');
    }

    if (policy.cooldownMinutes && policy.cooldownMinutes > 0) {
      lines.push(`Wait ${policy.cooldownMinutes} minutes between attempts.`);
    }

    const strategyChoice = REDO_REWARD_STRATEGY_CHOICES.find((c) => c.value === policy.rewardStrategy);
    if (strategyChoice) {
      lines.push(`Repeat reward rule: ${strategyChoice.label} (${strategyChoice.description}).`);
    }

    return lines;
  }
}
