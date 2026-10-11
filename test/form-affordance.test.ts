import { describe, it, expect } from 'vitest';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import type { FormSchema } from '../src/schema/FormSchema.js';
import {
  resolveAffordanceConfig,
  AFFORDANCE_PRESET_DEFAULTS,
  LinearStepProgressAdapter,
  WeightedFieldProgressAdapter,
  PeerBenchmarkInsightAdapter,
  NullRewardAdapter,
} from '../src/affordance/index.js';

describe('Form Affordance, Meaningful Progress & Rewardification Architecture', () => {
  const threePageSchema: FormSchema = {
    v: '1.0',
    id: 'onboarding-affordance',
    tenantId: 'enterprise-tenant',
    title: 'Customer Discovery Intake',
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
    settings: {},
    pages: [
      {
        id: 'company-info',
        title: 'Company Profile',
        fields: [
          {
            id: 'companyName',
            name: 'companyName',
            type: 'text',
            label: 'Company Name',
            required: true,
            order: 0,
          },
        ],
      },
      {
        id: 'team-size',
        title: 'Team Dynamics',
        fields: [
          {
            id: 'devCount',
            name: 'devCount',
            type: 'number',
            label: 'Developer Count',
            required: true,
            order: 0,
          },
        ],
      },
      {
        id: 'review-submit',
        title: 'Confirmation',
        fields: [
          {
            id: 'agreement',
            name: 'agreement',
            type: 'text',
            label: 'Signee Name',
            required: true,
            order: 0,
          },
        ],
      },
    ],
  };

  describe('1. Preset Resolution', () => {
    it('resolves enterprise-compliance preset defaults', () => {
      const config = resolveAffordanceConfig({ preset: 'enterprise-compliance' });
      expect(config.navigation).toBe('visited-only');
      expect(config.progress).toBe('section-breadcrumbs');
      expect(config.feedback).toBe('inline-validation');
      expect(config.allowSaveAndResumeLater).toBe(true);
      expect(config.showPreSubmissionSummary).toBe(true);
    });

    it('resolves frictionless-onboarding preset defaults', () => {
      const config = resolveAffordanceConfig({ preset: 'frictionless-onboarding' });
      expect(config.navigation).toBe('strict-linear');
      expect(config.progress).toBe('weighted-velocity');
      expect(config.feedback).toBe('reciprocal-insights');
      expect(config.allowSaveAndResumeLater).toBe(false);
      expect(config.showPreSubmissionSummary).toBe(false);
    });

    it('resolves academic-survey preset defaults', () => {
      const config = resolveAffordanceConfig({ preset: 'academic-survey' });
      expect(config.navigation).toBe('strict-linear');
      expect(config.progress).toBe('numbered-steps');
      expect(config.feedback).toBe('silent');
      expect(config.allowSaveAndResumeLater).toBe(true);
      expect(config.showPreSubmissionSummary).toBe(false);
    });

    it('permits explicit overrides on top of presets', () => {
      const config = resolveAffordanceConfig({
        preset: 'enterprise-compliance',
        navigation: 'random-access-open',
        allowSaveAndResumeLater: false,
      });
      expect(config.navigation).toBe('random-access-open');
      expect(config.progress).toBe('section-breadcrumbs');
      expect(config.allowSaveAndResumeLater).toBe(false);
    });
  });

  describe('2. Navigation Policy Enforcement', () => {
    describe('strict-linear navigation', () => {
      it('prevents random jumping and enforces sequential progression', () => {
        const multi = new MultiStepFormManager(
          threePageSchema,
          () => {},
          {
            affordanceConfig: { preset: 'academic-survey', navigation: 'strict-linear' },
          }
        );

        expect(multi.getCurrentPageIndex()).toBe(0);

        // Cannot jump directly to step 2
        expect(multi.canNavigateToStep(2)).toBe(false);
        expect(multi.goToStep(2)).toBe(false);

        // Cannot advance if step 0 is invalid
        expect(multi.nextStep()).toBe(false);

        // Fill step 0
        multi.getFormManager().setFieldValue('companyName', 'Acme Corp');
        expect(multi.nextStep()).toBe(true);
        expect(multi.getCurrentPageIndex()).toBe(1);

        // Can step backward to visited step 0
        expect(multi.canNavigateToStep(0)).toBe(true);
        expect(multi.goToStep(0)).toBe(true);
        expect(multi.getCurrentPageIndex()).toBe(0);

        // Can return forward to step 1
        expect(multi.goToStep(1)).toBe(true);
        expect(multi.getCurrentPageIndex()).toBe(1);
      });
    });

    describe('visited-only navigation', () => {
      it('allows random-access only across previously completed steps', () => {
        const multi = new MultiStepFormManager(
          threePageSchema,
          () => {},
          {
            affordanceConfig: { preset: 'enterprise-compliance' }, // default visited-only
          }
        );

        // Fill and pass step 0
        multi.getFormManager().setFieldValue('companyName', 'Stark Industries');
        expect(multi.nextStep()).toBe(true);
        expect(multi.getCurrentPageIndex()).toBe(1);

        // Step 2 is unvisited and locked because step 1 is not valid yet
        expect(multi.canNavigateToStep(2)).toBe(false);
        expect(multi.goToStep(2)).toBe(false);

        // Can jump back to visited step 0 freely
        expect(multi.canNavigateToStep(0)).toBe(true);
        expect(multi.goToStep(0)).toBe(true);
        expect(multi.getCurrentPageIndex()).toBe(0);
      });
    });

    describe('random-access-open navigation', () => {
      it('allows free navigation across any step regardless of completion', () => {
        const multi = new MultiStepFormManager(
          threePageSchema,
          () => {},
          {
            affordanceConfig: { navigation: 'random-access-open' },
          }
        );

        expect(multi.canNavigateToStep(2)).toBe(true);
        expect(multi.goToStep(2)).toBe(true);
        expect(multi.getCurrentPageIndex()).toBe(2);

        expect(multi.canNavigateToStep(0)).toBe(true);
        expect(multi.goToStep(0)).toBe(true);
        expect(multi.getCurrentPageIndex()).toBe(0);
      });
    });
  });

  describe('3. Progress Calculation Adapters', () => {
    it('LinearStepProgressAdapter calculates step completion ratio', () => {
      const adapter = new LinearStepProgressAdapter();
      const res = adapter.calculateProgress({
        formId: 'test',
        currentStepIndex: 1,
        currentStepId: 'p2',
        completedStepIds: ['p1'],
        completedStepIndices: [0],
        totalProjectedSteps: 3,
        fieldValues: {},
      });

      expect(res.percentage).toBe(33);
      expect(res.effortCompleted).toBe(1);
      expect(res.effortTotal).toBe(3);
    });

    it('WeightedFieldProgressAdapter computes effort weights and time estimates', () => {
      const adapter = new WeightedFieldProgressAdapter({
        customStepWeights: { 0: 2, 1: 8, 2: 2 }, // Total: 12 effort points
        avgSecondsPerEffortPoint: 10,
        endowedProgressPercent: 10,
      });

      // Step 0 completed (2 / 12 = 17% + 10% endowed = 27%)
      const res = adapter.calculateProgress({
        formId: 'test',
        currentStepIndex: 1,
        currentStepId: 'p2',
        completedStepIds: ['p1'],
        completedStepIndices: [0],
        totalProjectedSteps: 3,
        fieldValues: {},
      });

      expect(res.effortCompleted).toBe(2);
      expect(res.effortTotal).toBe(12);
      expect(res.percentage).toBe(25);
      // 10 remaining points * 10s = 100s -> ~2 mins remaining
      expect(res.estimatedTimeRemainingText).toBe('~2 mins remaining');
    });
  });

  describe('4. Milestone Rewards & Reciprocal Value Exchange', () => {
    it('PeerBenchmarkInsightAdapter triggers reciprocal insight on milestone step completion', () => {
      const benchmarkAdapter = new PeerBenchmarkInsightAdapter([
        {
          stepId: 'team-size',
          reward: {
            id: 'benchmark-dev-team',
            type: 'peer_benchmark',
            title: 'Team Velocity Benchmark',
            description: 'Engineering organizations with your team size average 8.4 story points/sprint.',
            data: { percentile: 72 },
          },
        },
      ]);

      const multi = new MultiStepFormManager(
        threePageSchema,
        () => {},
        {
          rewardEngine: benchmarkAdapter,
          affordanceConfig: { feedback: 'reciprocal-insights' },
        }
      );

      // Complete step 0
      multi.getFormManager().setFieldValue('companyName', 'Wayne Enterprises');
      multi.nextStep();
      expect(multi.getActiveReward()).toBeNull();

      // Complete step 1 (trigger milestone)
      multi.getFormManager().setFieldValue('devCount', 45);
      multi.nextStep();

      const reward = multi.getActiveReward();
      expect(reward).not.toBeNull();
      expect(reward?.title).toBe('Team Velocity Benchmark');
      expect(reward?.data.percentile).toBe(72);

      // Affordance state mirrors active reward
      const affordance = multi.getAffordanceState();
      expect(affordance.activeReward?.id).toBe('benchmark-dev-team');

      // Clear reward
      multi.clearActiveReward();
      expect(multi.getActiveReward()).toBeNull();
    });
  });

  describe('5. Breadcrumb & Affordance State Projections', () => {
    it('emits structured breadcrumbs with accurate spatial statuses', () => {
      const multi = new MultiStepFormManager(
        threePageSchema,
        () => {},
        {
          affordanceConfig: { preset: 'enterprise-compliance' },
        }
      );

      let affordance = multi.getAffordanceState();
      expect(affordance.breadcrumbs).toHaveLength(3);

      // Initially: step 0 is 'current', step 1 & 2 are locked/unvisited
      expect(affordance.breadcrumbs[0].status).toBe('current');
      expect(affordance.breadcrumbs[0].canNavigateTo).toBe(true);

      expect(affordance.breadcrumbs[1].status).toBe('locked');
      expect(affordance.breadcrumbs[1].canNavigateTo).toBe(false);

      expect(affordance.breadcrumbs[2].status).toBe('locked');
      expect(affordance.breadcrumbs[2].canNavigateTo).toBe(false);

      // Complete step 0 and advance
      multi.getFormManager().setFieldValue('companyName', 'Omni Corp');
      multi.nextStep();

      affordance = multi.getAffordanceState();
      expect(affordance.breadcrumbs[0].status).toBe('completed');
      expect(affordance.breadcrumbs[0].canNavigateTo).toBe(true);

      expect(affordance.breadcrumbs[1].status).toBe('current');
      expect(affordance.breadcrumbs[1].canNavigateTo).toBe(true);

      expect(affordance.breadcrumbs[2].status).toBe('locked');
      expect(affordance.breadcrumbs[2].canNavigateTo).toBe(false);
    });
  });
});
