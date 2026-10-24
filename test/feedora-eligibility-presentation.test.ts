import { describe, expect, it } from 'vitest';
import { describeEligibilityReason, isParticipationLocked } from '../apps/feedora-showcase/src/domain/eligibilityPresentation';

describe('Feedora eligibility presentation', () => {
  it('uses a server reservation rather than stale local history for remote survey access', () => {
    expect(isParticipationLocked({
      source: 'remote',
      hasServerReservation: true,
      policyConfirmationRequired: false,
      localCanStart: false,
    })).toBe(false);
    expect(isParticipationLocked({
      source: 'remote',
      hasServerReservation: false,
      policyConfirmationRequired: false,
      localCanStart: true,
    })).toBe(true);
  });

  it('keeps local access evaluation for offline instruments and pauses policy changes for review', () => {
    expect(isParticipationLocked({
      source: 'local',
      hasServerReservation: false,
      policyConfirmationRequired: false,
      localCanStart: false,
    })).toBe(true);
    expect(isParticipationLocked({
      source: 'remote',
      hasServerReservation: true,
      policyConfirmationRequired: true,
      localCanStart: true,
    })).toBe(true);
  });

  it('names a prerequisite only when the server includes a scope-safe title', () => {
    expect(describeEligibilityReason({
      code: 'prerequisite_unmet',
      title: 'Consent form',
    })).toBe('Complete “Consent form” first.');
    expect(describeEligibilityReason({ code: 'prerequisite_unmet' }))
      .toBe('Complete the required survey first.');
  });

  it('uses server unlock times for cooldown and prerequisite waits', () => {
    const unlocksAt = '2026-10-24T10:30:00.000Z';
    const expected = new Date(unlocksAt).toLocaleString();
    expect(describeEligibilityReason({ code: 'cooldown_active', unlocksAt }))
      .toBe(`Available after ${expected}.`);
    expect(describeEligibilityReason({ code: 'time_locked', unlocksAt }))
      .toBe(`Available after ${expected}.`);
  });

  it('describes sequence prerequisites by their known survey titles', () => {
    const titles = new Map([['survey-1', 'Consent'], ['survey-2', 'Baseline']]);
    expect(describeEligibilityReason({
      code: 'sequence_locked',
      requiredSurveyIds: ['survey-1', 'survey-2'],
    }, titles)).toBe('Complete Consent and Baseline first.');
  });

  it('falls back safely for unknown codes and invalid server timestamps', () => {
    expect(describeEligibilityReason({ code: 'cooldown_active', unlocksAt: 'invalid' }))
      .toBe('This survey is temporarily unavailable after your previous attempt.');
    expect(describeEligibilityReason({ code: 'future_rule' }))
      .toBe('This survey is not available yet.');
  });
});
