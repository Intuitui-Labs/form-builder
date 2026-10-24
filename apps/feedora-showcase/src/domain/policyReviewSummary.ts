import type { RemoteSurveyMeta } from './ports/transportTypes';

/** Readable snapshot shown before a saved response is rebound to changed rules. */
export function policyReviewSummary(meta: RemoteSurveyMeta): string[] {
  const features = meta.features ?? {};
  const access = (features.accessPolicy && typeof features.accessPolicy === 'object'
    ? features.accessPolicy
    : {}) as Record<string, unknown>;
  const maxAttempts = access.maxAttempts;
  const cooldownMinutes = Number(access.cooldownMinutes ?? 0);
  const lines = [
    access.requiresAccount ? 'Sign in is required.' : 'Guest participation is allowed.',
    access.organizationMembershipRequired ? 'Organization membership is required.' : 'Organization membership is optional.',
    features.accessCodeRequired ? 'An access code is required.' : 'No access code is required.',
    maxAttempts === null
      ? 'There is no fixed attempt limit.'
      : Number.isFinite(Number(maxAttempts))
        ? `Maximum attempts: ${Number(maxAttempts)}.`
        : 'One completed attempt is allowed.',
  ];

  if (Number.isFinite(cooldownMinutes) && cooldownMinutes > 0) {
    lines.push(`Wait ${cooldownMinutes} minutes between attempts.`);
  }

  const prerequisites = Array.isArray(features.prerequisiteSurveyTitles)
    ? features.prerequisiteSurveyTitles.map(String).filter(Boolean)
    : [];
  if (prerequisites.length) lines.push(`Complete first: ${prerequisites.join(', ')}.`);

  const sequence = features.sequence && typeof features.sequence === 'object'
    ? features.sequence as Record<string, unknown>
    : {};
  if (sequence.enforce && sequence.groupId) {
    lines.push(`This is step ${Number(sequence.order) || 1} in ${String(sequence.groupId)}.`);
  }
  return lines;
}
