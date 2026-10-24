import { describe, it, expect } from 'vitest';
import {
  BatteryEngine,
  type FormSchema,
  type FormSubmissionHistoryItem,
  FieldWeightedProgressAdapter,
  SchemaPaginator,
  FormAccessPolicyBuilder,
  REDO_REWARD_STRATEGY_CHOICES,
  type FormField,
} from '../src/index.js';

describe('Generalization Suite: Direct Form Access, Progress, Pagination & Policy', () => {
  describe('BatteryEngine.evaluateFormAccess & describeAccessEvaluation', () => {
    const testSchema: FormSchema = {
      id: 'satisfaction_survey',
      title: 'Customer Satisfaction Survey',
      kind: 'survey',
      accessPolicy: {
        allowRedo: false,
        maxAttempts: 1,
        rewardStrategy: 'first_attempt_only',
        cooldownMinutes: 60,
      },
      pages: [],
    };

    it('allows starting a form with no prior history', () => {
      const evaluation = BatteryEngine.evaluateFormAccess(testSchema, []);
      expect(evaluation.canStart).toBe(true);
      expect(evaluation.isCompleted).toBe(false);
      expect(BatteryEngine.describeAccessEvaluation(evaluation)).toBe('Available to start.');
    });

    it('locks form when max attempts are reached and describes it accurately', () => {
      const history: FormSubmissionHistoryItem[] = [
        { formId: 'satisfaction_survey', isCompleted: true, completedAt: new Date().toISOString() },
      ];
      const evaluation = BatteryEngine.evaluateFormAccess(testSchema, history);
      expect(evaluation.canStart).toBe(false);
      expect(evaluation.isLocked).toBe(true);
      expect(evaluation.reason).toBe('max_attempts_reached');
      expect(BatteryEngine.describeAccessEvaluation(evaluation)).toBe(
        'You have completed the single allowed attempt for this form.',
      );
    });

    it('locks form when prerequisite is unmet and describes missing titles', () => {
      const prereqSchema = {
        ...testSchema,
        accessPolicy: { allowRedo: true, rewardStrategy: 'unrestricted' as const },
        prerequisites: {
          completedFormIds: ['onboarding_101', 'safety_briefing'],
        },
      };
      const evaluation = BatteryEngine.evaluateFormAccess(prereqSchema, []);
      expect(evaluation.canStart).toBe(false);
      expect(evaluation.reason).toBe('prerequisite_unmet');

      const description = BatteryEngine.describeAccessEvaluation(evaluation, {
        formTitles: {
          onboarding_101: 'Introductory Onboarding',
          safety_briefing: 'Lab Safety Protocol',
        },
      });
      expect(description).toBe('Complete "Introductory Onboarding" and "Lab Safety Protocol" first.');
    });

    it('formats active cooldown waiting period with unlock time', () => {
      const completionTime = new Date('2026-10-24T05:00:00Z').toISOString();
      const history: FormSubmissionHistoryItem[] = [
        { formId: 'satisfaction_survey', isCompleted: true, completedAt: completionTime },
      ];
      const repeatableWithCooldown = {
        ...testSchema,
        accessPolicy: {
          allowRedo: true,
          maxAttempts: 5,
          rewardStrategy: 'unrestricted' as const,
          cooldownMinutes: 120, // 2 hours
        },
      };
      // Evaluate at 06:00:00Z (1 hour after completion -> cooldown still active)
      const evaluation = BatteryEngine.evaluateFormAccess(repeatableWithCooldown, history, {
        currentTimeMs: new Date('2026-10-24T06:00:00Z').getTime(),
      });
      expect(evaluation.canStart).toBe(false);
      expect(evaluation.reason).toBe('cooldown_active');
      expect(BatteryEngine.describeAccessEvaluation(evaluation)).toMatch(/Temporarily locked\. Available after/);
    });
  });

  describe('FieldWeightedProgressAdapter', () => {
    const adapter = new FieldWeightedProgressAdapter({ averageSecondsPerField: 10 });

    it('calculates incremental progress within active page as fields are answered', () => {
      const pages = [
        {
          id: 'step1',
          title: 'Step 1',
          fields: [
            { id: 'f1', name: 'q1', type: 'text' as const, label: 'Q1' },
            { id: 'f2', name: 'q2', type: 'text' as const, label: 'Q2' },
          ],
        },
        {
          id: 'step2',
          title: 'Step 2',
          fields: [
            { id: 'f3', name: 'q3', type: 'text' as const, label: 'Q3' },
          ],
        },
      ];

      // Step 1 active, 0 fields answered -> 0%
      const p0 = adapter.calculateProgress({
        currentStepIndex: 0,
        currentStepId: 'step1',
        completedStepIds: [],
        totalProjectedSteps: 2,
        pages,
        fieldValues: {},
      });
      expect(p0.percentage).toBe(0);
      expect(p0.effortCompleted).toBe(0);
      expect(p0.effortTotal).toBe(3);
      expect(p0.estimatedTimeRemainingText).toBe('~30s remaining');

      // Step 1 active, 1 out of 2 fields answered on step 1 -> (0 completed + 0.5 fraction) / 2 = 25%
      const p1 = adapter.calculateProgress({
        currentStepIndex: 0,
        currentStepId: 'step1',
        completedStepIds: [],
        totalProjectedSteps: 2,
        pages,
        fieldValues: { q1: 'answer1' },
      });
      expect(p1.percentage).toBe(25);
      expect(p1.effortCompleted).toBe(1);
      expect(p1.estimatedTimeRemainingText).toBe('~20s remaining');

      // Step 2 active (step 1 fully completed), 1 field answered on step 2 -> 100%
      const p2 = adapter.calculateProgress({
        currentStepIndex: 1,
        currentStepId: 'step2',
        completedStepIds: ['step1'],
        totalProjectedSteps: 2,
        pages,
        fieldValues: { q1: 'answer1', q2: 'answer2', q3: 'answer3' },
      });
      expect(p2.percentage).toBe(100);
      expect(p2.effortCompleted).toBe(3);
      expect(p2.estimatedTimeRemainingText).toBe('Complete');
    });
  });

  describe('SchemaPaginator', () => {
    const createFields = (count: number, group?: string): FormField[] =>
      Array.from({ length: count }, (_, i) => ({
        id: `f_${i}`,
        name: `field_${i}`,
        type: 'text' as const,
        label: `Field ${i + 1}`,
        group,
      }));

    it('paginates flat fields into balanced chunks with cover page', () => {
      const fields = createFields(12);
      const pages = SchemaPaginator.paginateFields(fields, {
        maxFieldsPerPage: 5,
        coverPage: {
          title: 'Welcome to the Survey',
          description: 'Takes 3 minutes',
          badge: 'SURVEY · 12 ITEMS',
        },
      });

      expect(pages).toHaveLength(4); // 1 cover + 3 question chunks (5, 5, 2)
      expect(pages[0].role).toBe('cover');
      expect(pages[0].badge).toBe('SURVEY · 12 ITEMS');
      expect(pages[1].fields).toHaveLength(5);
      expect(pages[2].fields).toHaveLength(5);
      expect(pages[3].fields).toHaveLength(2);
    });

    it('partitions fields semantically by section and chunks oversized sections', () => {
      const sectionA = createFields(8, 'Demographics');
      const sectionB = createFields(3, 'Feedback');
      const allFields = [...sectionA, ...sectionB];

      const pages = SchemaPaginator.paginateFields(allFields, {
        maxFieldsPerPage: 5,
        groupBy: (f) => f.group,
      });

      // Section A has 8 fields -> 2 chunks (5, 3)
      // Section B has 3 fields -> 1 chunk (3)
      // Total pages: 3
      expect(pages).toHaveLength(3);
      expect(pages[0].title).toBe('Demographics (1/2)');
      expect(pages[0].badge).toBe('SECTION 1');
      expect(pages[1].title).toBe('Demographics (2/2)');
      expect(pages[2].title).toBe('Feedback');
      expect(pages[2].badge).toBe('SECTION 2');
    });
  });

  describe('FormAccessPolicyBuilder', () => {
    it('validates and normalizes valid policy inputs', () => {
      const policy = FormAccessPolicyBuilder.buildPolicy({
        allowRedo: true,
        maxAttempts: '3',
        cooldownMinutes: '45',
        rewardStrategy: 'score_delta',
      });

      expect(policy).toEqual({
        allowRedo: true,
        maxAttempts: 3,
        cooldownMinutes: 45,
        rewardStrategy: 'score_delta',
      });
    });

    it('throws on invalid maxAttempts or cooldown', () => {
      expect(() =>
        FormAccessPolicyBuilder.buildPolicy({ maxAttempts: '0' })
      ).toThrow(/whole number between 1 and 1000/);

      expect(() =>
        FormAccessPolicyBuilder.buildPolicy({ cooldownMinutes: '-10' })
      ).toThrow(/between 0 and 525600/);
    });

    it('derives allowRedo correctly from maxAttempts', () => {
      const single = FormAccessPolicyBuilder.buildPolicy({ maxAttempts: '1' });
      expect(single.allowRedo).toBe(false);
      expect(single.maxAttempts).toBe(1);

      const multiple = FormAccessPolicyBuilder.buildPolicy({ maxAttempts: '5' });
      expect(multiple.allowRedo).toBe(true);
      expect(multiple.maxAttempts).toBe(5);
    });

    it('generates readable human policy summaries', () => {
      const summary = FormAccessPolicyBuilder.formatPolicySummary({
        allowRedo: true,
        maxAttempts: 3,
        cooldownMinutes: 30,
        rewardStrategy: 'score_delta',
      });

      expect(summary).toContain('Maximum attempts: 3.');
      expect(summary).toContain('Wait 30 minutes between attempts.');
      expect(summary.some((line) => line.includes('Reward improvement'))).toBe(true);
    });

    it('exports standard REDO_REWARD_STRATEGY_CHOICES catalog', () => {
      expect(REDO_REWARD_STRATEGY_CHOICES).toHaveLength(4);
      expect(REDO_REWARD_STRATEGY_CHOICES.map((c) => c.value)).toEqual([
        'first_attempt_only',
        'score_delta',
        'unrestricted',
        'blocked',
      ]);
    });
  });
});
