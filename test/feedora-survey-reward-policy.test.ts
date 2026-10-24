import { describe, expect, it } from 'vitest';
import {
  buildCreatorAttemptPolicy,
  isRepeatRewardStrategy,
  repeatRewardChoices,
} from '../apps/feedora-showcase/src/domain/surveyRewardPolicy';

describe('creator repeat reward policy', () => {
  it.each([
    ['first_attempt_only', 'first_attempt_only'],
    ['score_delta', 'score_delta'],
    ['unrestricted', 'unrestricted'],
    ['blocked', 'blocked'],
  ] as const)('preserves %s when resolving attempt limits', (repeatReward, expected) => {
    expect(buildCreatorAttemptPolicy({
      allowRedo: true,
      maxAttempts: '',
      cooldownMinutes: '5',
      repeatReward,
    })).toEqual({
      allowRedo: true,
      rewardStrategy: expected,
      cooldownMinutes: 5,
    });
  });

  it('makes an explicit one-attempt cap authoritative without rewriting reward strategy', () => {
    expect(buildCreatorAttemptPolicy({
      allowRedo: true,
      maxAttempts: '1',
      cooldownMinutes: '',
      repeatReward: 'unrestricted',
    })).toEqual({
      allowRedo: false,
      rewardStrategy: 'unrestricted',
      maxAttempts: 1,
    });
  });

  it.each(['abc', '1.5', '0', '1001'])('rejects invalid maximum-attempt input %s instead of widening access', (maxAttempts) => {
    expect(() => buildCreatorAttemptPolicy({
      allowRedo: true,
      maxAttempts,
      cooldownMinutes: '',
      repeatReward: 'score_delta',
    })).toThrow('Maximum attempts must be a whole number between 1 and 1000.');
  });

  it.each(['NaN', 'Infinity', '-1', '525601'])('rejects invalid cooldown input %s before save', (cooldownMinutes) => {
    expect(() => buildCreatorAttemptPolicy({
      allowRedo: true,
      maxAttempts: '',
      cooldownMinutes,
      repeatReward: 'score_delta',
    })).toThrow('Cooldown must be between 0 and 525600 minutes.');
  });

  it('offers only behaviorally distinct repeat reward choices and validates restored values', () => {
    expect(repeatRewardChoices.map(({ value }) => value)).toEqual([
      'first_attempt_only',
      'score_delta',
      'unrestricted',
    ]);
    expect(isRepeatRewardStrategy('blocked')).toBe(true);
    expect(isRepeatRewardStrategy('invented')).toBe(false);
  });
});
