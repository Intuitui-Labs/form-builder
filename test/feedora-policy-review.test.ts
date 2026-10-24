import { describe, expect, it } from 'vitest';
import { policyReviewSummary } from '../apps/feedora-showcase/src/domain/policyReviewSummary';
import type { RemoteSurveyMeta } from '../apps/feedora-showcase/src/domain/ports/transportTypes';

describe('policy review summary', () => {
  it('summarizes current gates before an accepted response is rebound', () => {
    const meta = {
      survey: { id: 1, uuid: 'survey-1', title: 'Follow-up', description: '', is_hmsam: false },
      questions: [],
      features: {
        accessPolicy: {
          requiresAccount: true,
          organizationMembershipRequired: true,
          maxAttempts: 3,
          cooldownMinutes: 30,
        },
        accessCodeRequired: true,
        prerequisiteSurveyTitles: ['Consent', 'Baseline'],
        sequence: { groupId: 'study-wave', order: 2, enforce: true },
      },
    } as unknown as RemoteSurveyMeta;

    expect(policyReviewSummary(meta)).toEqual([
      'Sign in is required.',
      'Organization membership is required.',
      'An access code is required.',
      'Maximum attempts: 3.',
      'Wait 30 minutes between attempts.',
      'Complete first: Consent, Baseline.',
      'This is step 2 in study-wave.',
    ]);
  });

  it('explains the default one-attempt rule when policy fields are absent', () => {
    const meta = {
      survey: { id: 1, uuid: 'survey-1', title: 'Survey', description: '', is_hmsam: false },
      questions: [],
      features: {},
    } as unknown as RemoteSurveyMeta;

    expect(policyReviewSummary(meta)).toEqual([
      'Guest participation is allowed.',
      'Organization membership is optional.',
      'No access code is required.',
      'One completed attempt is allowed.',
    ]);
  });
});
