export interface EligibilityReasonForDisplay {
  code: string;
  title?: unknown;
  unlocksAt?: unknown;
  maximum?: unknown;
  requiredSurveyIds?: unknown;
}

/** Remote participation is admitted by a server reservation; local forms use the engine policy. */
export function isParticipationLocked(input: {
  source: 'remote' | 'local';
  hasServerReservation: boolean;
  policyConfirmationRequired: boolean;
  localCanStart: boolean;
}): boolean {
  if (input.policyConfirmationRequired) return true;
  return input.source === 'remote' ? !input.hasServerReservation : !input.localCanStart;
}

function displayUnlockTime(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp).toLocaleString();
}

function sequenceTitles(reason: EligibilityReasonForDisplay, knownTitles: ReadonlyMap<string, string>): string[] {
  if (!Array.isArray(reason.requiredSurveyIds)) return [];
  return reason.requiredSurveyIds
    .filter((id): id is string => typeof id === 'string')
    .map((id) => knownTitles.get(id)?.trim())
    .filter((title): title is string => Boolean(title));
}

export function describeEligibilityReason(
  reason: EligibilityReasonForDisplay,
  knownSurveyTitles: ReadonlyMap<string, string> = new Map(),
): string {
  switch (reason.code) {
    case 'unsupported_policy':
      return 'This survey has a rule the service cannot safely evaluate yet.';
    case 'account_required':
      return 'Sign in to start this survey.';
    case 'access_code_required':
      return 'Enter the survey access code to continue.';
    case 'organization_membership_required':
      return 'Join this organization before starting the survey.';
    case 'attempt_limit_reached': {
      const maximum = typeof reason.maximum === 'number' && Number.isInteger(reason.maximum) && reason.maximum > 0
        ? reason.maximum
        : undefined;
      return maximum
        ? `This survey allows ${maximum} ${maximum === 1 ? 'attempt' : 'attempts'}, and you have used them.`
        : 'You have reached the attempt limit for this survey.';
    }
    case 'cooldown_active':
    case 'time_locked': {
      const unlockTime = displayUnlockTime(reason.unlocksAt);
      return unlockTime
        ? `Available after ${unlockTime}.`
        : reason.code === 'cooldown_active'
          ? 'This survey is temporarily unavailable after your previous attempt.'
          : 'This survey unlocks after the waiting period.';
    }
    case 'prerequisite_unmet':
      return typeof reason.title === 'string' && reason.title.trim()
        ? `Complete “${reason.title.trim()}” first.`
        : 'Complete the required survey first.';
    case 'sequence_locked': {
      const titles = sequenceTitles(reason, knownSurveyTitles);
      if (titles.length === 1) return `Complete ${titles[0]} first.`;
      if (titles.length === 2) return `Complete ${titles[0]} and ${titles[1]} first.`;
      if (titles.length > 2) return `Complete ${titles.slice(0, 2).join(', ')} and ${titles.length - 2} more first.`;
      return 'Complete the earlier survey in this sequence first.';
    }
    case 'survey_unavailable':
      return 'This survey is not available right now.';
    default:
      return 'This survey is not available yet.';
  }
}
