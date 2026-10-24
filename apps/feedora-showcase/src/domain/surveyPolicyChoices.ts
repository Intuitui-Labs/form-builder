import type { StudioSurvey } from './ports/ICreatorStudioPort';

export interface SurveyParticipationScope {
  readonly id: string;
  readonly kind: 'organization' | 'platform';
}

/** Only offer active, published prerequisites from the target survey's scope. */
export function policyPrerequisiteChoices(
  surveys: readonly StudioSurvey[],
  target: SurveyParticipationScope,
  currentSurveyUuid?: string,
): StudioSurvey[] {
  return surveys.filter((survey) =>
    survey.isActive
    && !survey.isDraft
    && survey.uuid !== currentSurveyUuid
    && survey.scopeId === target.id
    && survey.scopeKind === target.kind,
  );
}
