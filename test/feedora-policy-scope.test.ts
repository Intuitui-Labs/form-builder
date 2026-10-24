import { describe, expect, it } from 'vitest';
import { policyPrerequisiteChoices } from '../apps/feedora-showcase/src/domain/surveyPolicyChoices';
import type { StudioSurvey } from '../apps/feedora-showcase/src/domain/ports/ICreatorStudioPort';

const survey = (overrides: Partial<StudioSurvey>): StudioSurvey => ({
  id: 1,
  uuid: 'survey-1',
  accessCode: 'ABC123',
  title: 'Survey',
  description: '',
  isHmsam: false,
  isActive: true,
  isDraft: false,
  questionsCount: 1,
  responsesCount: 0,
  createdAt: '2026-10-23T00:00:00Z',
  scopeId: 'org-1',
  scopeKind: 'organization',
  ...overrides,
});

describe('policy prerequisite choices', () => {
  it('offers only published surveys in the selected organization scope', () => {
    const sameScope = survey({ uuid: 'same-scope' });
    const wrongOrganization = survey({ uuid: 'other-org', scopeId: 'org-2' });
    const platform = survey({ uuid: 'platform', scopeId: 'platform', scopeKind: 'platform' });
    const draft = survey({ uuid: 'draft', isDraft: true });
    const inactive = survey({ uuid: 'inactive', isActive: false });

    expect(policyPrerequisiteChoices(
      [sameScope, wrongOrganization, platform, draft, inactive],
      { id: 'org-1', kind: 'organization' },
    )).toEqual([sameScope]);
  });

  it('excludes the target survey from its own prerequisite choices', () => {
    const target = survey({ uuid: 'target' });
    const other = survey({ uuid: 'other' });

    expect(policyPrerequisiteChoices(
      [target, other],
      { id: 'org-1', kind: 'organization' },
      'target',
    )).toEqual([other]);
  });
});
