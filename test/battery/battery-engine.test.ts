import { describe, it, expect } from 'vitest';
import { BatteryEngine } from '../../src/battery/BatteryEngine.js';
import type { SurveyBatterySchema, BatteryNode, FormSubmissionHistoryItem } from '../../src/schema/FormBattery.js';
import type { FormAccessPolicy } from '../../src/schema/FormSchema.js';

describe('BatteryEngine: Multi-Form Progression, Archetypes & Redo Governance', () => {
  const sampleBattery: SurveyBatterySchema = {
    id: 'hedonic-research-battery-v1',
    title: 'Hedonic Motivation & Adaptive Learning Battery',
    initialFormId: 'demographic-intake',
    nodes: [
      {
        id: 'node-1',
        schemaId: 'demographic-intake',
        title: 'Participant Demographic Intake',
        kind: 'intake',
        sequenceOrder: 1,
        stage: 'intake',
        accessPolicy: {
          allowRedo: false,
          maxAttempts: 1,
          rewardStrategy: 'first_attempt_only',
        },
      },
      {
        id: 'node-2',
        schemaId: 'hmsam-baseline',
        title: 'HMSAM 38-Item Baseline Survey',
        kind: 'survey',
        sequenceOrder: 2,
        stage: 'baseline',
        prerequisites: {
          completedFormIds: ['demographic-intake'],
        },
        accessPolicy: {
          allowRedo: false,
          maxAttempts: 1,
          rewardStrategy: 'first_attempt_only',
        },
        nextFormId: 'comprehension-quiz',
      },
      {
        id: 'node-3',
        schemaId: 'comprehension-quiz',
        title: 'Adaptive Mastery Quiz',
        kind: 'quiz',
        sequenceOrder: 3,
        stage: 'quiz',
        prerequisites: {
          completedFormIds: ['hmsam-baseline'],
        },
        accessPolicy: {
          allowRedo: true,
          rewardStrategy: 'score_delta',
        },
        nextFormId: 'longitudinal-post',
      },
      {
        id: 'node-4',
        schemaId: 'longitudinal-post',
        title: 'Post-Intervention Longitudinal Check-in',
        kind: 'survey',
        sequenceOrder: 4,
        stage: 'longitudinal',
        prerequisites: {
          completedFormIds: ['comprehension-quiz'],
          minScorePercent: 80,
          unlockDelayMs: 3600000, // 1 hour time lock
        },
        accessPolicy: {
          allowRedo: false,
          rewardStrategy: 'blocked',
        },
      },
    ],
  };

  it('resolves archetype-specific default access policies when omitted', () => {
    const surveyPolicy = BatteryEngine.getDefaultAccessPolicy('survey');
    expect(surveyPolicy.allowRedo).toBe(false);
    expect(surveyPolicy.rewardStrategy).toBe('first_attempt_only');

    const quizPolicy = BatteryEngine.getDefaultAccessPolicy('quiz');
    expect(quizPolicy.allowRedo).toBe(true);
    expect(quizPolicy.rewardStrategy).toBe('score_delta');

    const examPolicy = BatteryEngine.getDefaultAccessPolicy('exam');
    expect(examPolicy.allowRedo).toBe(false);
    expect(examPolicy.rewardStrategy).toBe('blocked');
  });

  it('permits initial node access when no prerequisites are required', () => {
    const history: FormSubmissionHistoryItem[] = [];
    const evaluation = BatteryEngine.evaluateNodeAccess(sampleBattery.nodes[0], history);

    expect(evaluation.canStart).toBe(true);
    expect(evaluation.isLocked).toBe(false);
    expect(evaluation.isCompleted).toBe(false);
  });

  it('locks downstream nodes until prerequisite forms are satisfied', () => {
    const history: FormSubmissionHistoryItem[] = [];
    const baselineNode = sampleBattery.nodes[1];
    const evaluation = BatteryEngine.evaluateNodeAccess(baselineNode, history);

    expect(evaluation.canStart).toBe(false);
    expect(evaluation.isLocked).toBe(true);
    expect(evaluation.reason).toBe('prerequisite_unmet');
    expect(evaluation.missingFormIds).toEqual(['demographic-intake']);
  });

  it('unlocks downstream node once prerequisite form is completed', () => {
    const history: FormSubmissionHistoryItem[] = [
      {
        formId: 'demographic-intake',
        completedAt: new Date(Date.now() - 100000).toISOString(),
        attemptNumber: 1,
        pointsEarned: 50,
      },
    ];
    const baselineNode = sampleBattery.nodes[1];
    const evaluation = BatteryEngine.evaluateNodeAccess(baselineNode, history);

    expect(evaluation.canStart).toBe(true);
    expect(evaluation.isLocked).toBe(false);
    expect(evaluation.isCompleted).toBe(false);
  });

  it('enforces single-attempt policy on completed surveys with allowRedo: false', () => {
    const history: FormSubmissionHistoryItem[] = [
      {
        formId: 'hmsam-baseline',
        completedAt: new Date().toISOString(),
        attemptNumber: 1,
        pointsEarned: 100,
      },
    ];
    const baselineNode = sampleBattery.nodes[1];
    const evaluation = BatteryEngine.evaluateNodeAccess(baselineNode, history);

    expect(evaluation.canStart).toBe(false);
    expect(evaluation.isCompleted).toBe(true);
    expect(evaluation.isLocked).toBe(true);
    expect(evaluation.reason).toBe('max_attempts_reached');
  });

  it('allows retakes on quizzes (allowRedo: true) and evaluates score delta rewards', () => {
    const history: FormSubmissionHistoryItem[] = [
      {
        formId: 'hmsam-baseline',
        completedAt: new Date().toISOString(),
        attemptNumber: 1,
      },
      {
        formId: 'comprehension-quiz',
        completedAt: new Date().toISOString(),
        attemptNumber: 1,
        scorePercent: 70,
        pointsEarned: 70,
      },
    ];
    const quizNode = sampleBattery.nodes[2];
    const evaluation = BatteryEngine.evaluateNodeAccess(quizNode, history);

    expect(evaluation.canStart).toBe(true);
    expect(evaluation.isCompleted).toBe(true);
    expect(evaluation.isLocked).toBe(false);

    // First attempt gets full points
    const firstReward = BatteryEngine.calculateSanitizedReward(quizNode.accessPolicy!, 1, 70, 0);
    expect(firstReward.pointsAwarded).toBe(70);

    // Second attempt with no improvement (65 pts) gets 0 delta
    const retryLower = BatteryEngine.calculateSanitizedReward(quizNode.accessPolicy!, 2, 65, 70);
    expect(retryLower.pointsAwarded).toBe(0);
    expect(retryLower.reason).toBe('no_score_improvement');

    // Third attempt with improved mastery (90 pts) gets 20 delta points
    const retryHigher = BatteryEngine.calculateSanitizedReward(quizNode.accessPolicy!, 3, 90, 70);
    expect(retryHigher.pointsAwarded).toBe(20);
    expect(retryHigher.reason).toBe('score_delta_mastery_awarded');
  });

  it('enforces time locks and prerequisite minimum score thresholds', () => {
    const now = Date.now();
    const history: FormSubmissionHistoryItem[] = [
      {
        formId: 'comprehension-quiz',
        completedAt: new Date(now - 60000).toISOString(), // 1 minute ago (requires 1 hour delay)
        attemptNumber: 1,
        scorePercent: 60, // Failed min 80% requirement
      },
    ];

    const longitudinalNode = sampleBattery.nodes[3];
    const scoreEval = BatteryEngine.evaluateNodeAccess(longitudinalNode, history, { currentTimeMs: now });
    expect(scoreEval.canStart).toBe(false);
    expect(scoreEval.reason).toBe('score_threshold_unmet');

    // Update with passing score, but still within 1hr time lock window
    const passingHistory: FormSubmissionHistoryItem[] = [
      {
        formId: 'comprehension-quiz',
        completedAt: new Date(now - 60000).toISOString(),
        attemptNumber: 1,
        scorePercent: 95,
      },
    ];
    const timeLockEval = BatteryEngine.evaluateNodeAccess(longitudinalNode, passingHistory, { currentTimeMs: now });
    expect(timeLockEval.canStart).toBe(false);
    expect(timeLockEval.reason).toBe('time_locked');
    expect(timeLockEval.unlocksAt).toBeDefined();

    // After 1 hour passes, node unlocks cleanly
    const postDelayEval = BatteryEngine.evaluateNodeAccess(longitudinalNode, passingHistory, { currentTimeMs: now + 4000000 });
    expect(postDelayEval.canStart).toBe(true);
    expect(postDelayEval.isLocked).toBe(false);
  });

  it('finds the immediate next eligible node in the battery sequence', () => {
    const history: FormSubmissionHistoryItem[] = [
      {
        formId: 'demographic-intake',
        completedAt: new Date().toISOString(),
        attemptNumber: 1,
      },
    ];

    const nextNode = BatteryEngine.findNextEligibleNode(sampleBattery, history);
    expect(nextNode).not.toBeNull();
    expect(nextNode?.schemaId).toBe('hmsam-baseline');
  });
});
