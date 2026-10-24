export type RepeatRewardStrategy = 'first_attempt_only' | 'score_delta' | 'unrestricted' | 'blocked';

const repeatRewardStrategies = new Set<RepeatRewardStrategy>([
  'first_attempt_only',
  'score_delta',
  'unrestricted',
  'blocked',
]);

export function isRepeatRewardStrategy(value: unknown): value is RepeatRewardStrategy {
  return typeof value === 'string' && repeatRewardStrategies.has(value as RepeatRewardStrategy);
}

export interface CreatorAttemptPolicyInput {
  allowRedo: boolean;
  maxAttempts: string;
  cooldownMinutes: string;
  repeatReward: RepeatRewardStrategy;
}

/** Preserve a creator's repeat reward rule while resolving the legacy redo/limit controls. */
export function buildCreatorAttemptPolicy(input: CreatorAttemptPolicyInput): {
  allowRedo: boolean;
  rewardStrategy: RepeatRewardStrategy;
  maxAttempts?: number;
  cooldownMinutes?: number;
} {
  const rawMaximum = input.maxAttempts.trim();
  const parsedMaximum = rawMaximum ? Number(rawMaximum) : undefined;
  if (parsedMaximum !== undefined && (
    !Number.isInteger(parsedMaximum) || parsedMaximum < 1 || parsedMaximum > 1000
  )) {
    throw new Error('Maximum attempts must be a whole number between 1 and 1000.');
  }
  const maximum = parsedMaximum;

  const rawCooldown = input.cooldownMinutes.trim();
  const parsedCooldown = rawCooldown ? Number(rawCooldown) : undefined;
  if (parsedCooldown !== undefined && (
    !Number.isFinite(parsedCooldown) || parsedCooldown < 0 || parsedCooldown > 525600
  )) {
    throw new Error('Cooldown must be between 0 and 525600 minutes.');
  }
  if (!isRepeatRewardStrategy(input.repeatReward)) {
    throw new Error('Choose a supported repeat reward strategy.');
  }
  const allowRedo = maximum === undefined ? input.allowRedo : maximum > 1;

  return {
    allowRedo,
    rewardStrategy: input.repeatReward,
    ...(maximum !== undefined ? { maxAttempts: maximum } : allowRedo ? {} : { maxAttempts: 1 }),
    ...(parsedCooldown !== undefined && parsedCooldown > 0 ? { cooldownMinutes: parsedCooldown } : {}),
  };
}

export const repeatRewardChoices: ReadonlyArray<{
  value: Exclude<RepeatRewardStrategy, 'blocked'>;
  label: string;
  description: string;
}> = [
  {
    value: 'first_attempt_only',
    label: 'No repeat rewards',
    description: 'People may repeat the survey, but only their first response earns points.',
  },
  {
    value: 'score_delta',
    label: 'Reward improvement',
    description: 'Repeat responses earn points only when they improve on the person’s previous best.',
  },
  {
    value: 'unrestricted',
    label: 'Reward every attempt',
    description: 'Every accepted response earns its full point value.',
  },
];
