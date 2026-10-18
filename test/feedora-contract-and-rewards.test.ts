import { describe, it, expect, vi } from 'vitest';
import { FeedoraRewardAdapter } from '../apps/feedora-showcase/src/adapters/FeedoraRewardAdapter.js';
import { FeedoraHttpTransportAdapter } from '../apps/feedora-showcase/src/adapters/FeedoraHttpTransportAdapter.js';
import { OfflineOutboxQueue } from '../src/persistence/OfflineOutboxQueue.js';
import type { SurveyFeatures } from '../apps/feedora-showcase/src/domain/types.js';

describe('Feedora Contract, Variable Rewards, and Offline Outbox Conformance', () => {
  const baseFeatures: SurveyFeatures = {
    mascot: { enabled: true, name: 'whiskers', position: 'bottom-right' },
    progress: { enabled: true, style: 'solid', color: '#10b981', label: 'percent' },
    points: {
      enabled: true,
      values: { likert: 10, open: 20, rating: 10, mcq: 10, checkbox: 10, dropdown: 10, short: 10, date: 5, file: 15 },
    },
    badges: { enabled: true },
    voucher: { enabled: false, code: '', discount: '' },
    collection: { email: false, sapecopy: false, emailcopy: false, limit: false, accept: true } as any,
    dashboard: { enabled: true, alpha: true, hmsam: true, responses: true, leaderboard: true, byquestion: true, individual: true },
  };

  describe('Variable Rewards & Reinforcement Engine', () => {
    it('evaluates fixed points when variable rewards is not enabled', () => {
      const adapter = new FeedoraRewardAdapter(baseFeatures);
      const reward = adapter.evaluateMilestone({
        completedStepId: 'step_1',
        completedStepIndex: 0,
        completedPage: {
          id: 'page_1',
          title: 'Joy items',
          fields: [
            { name: 'JOY1', type: 'likert' } as any,
            { name: 'JOY2', type: 'likert' } as any,
          ],
        },
        allValues: { JOY1: 5, JOY2: 4 },
        progress: { percentage: 50, currentStep: 1, totalSteps: 2 },
      } as any);

      expect(reward).not.toBeNull();
      expect(reward?.data.points).toBe(20);
      expect(reward?.title).toBe('+20 voice points');
    });

    it('evaluates surprise boost bonus when variable rewards is enabled', () => {
      const variableFeatures: SurveyFeatures = {
        ...baseFeatures,
        rewards: {
          enabled: true,
          mode: 'variable',
          probability: 1.0, // Force trigger for determinism
          minMultiplier: 1.5,
          maxMultiplier: 1.5,
        },
      };

      const adapter = new FeedoraRewardAdapter(variableFeatures);
      const reward = adapter.evaluateMilestone({
        completedStepId: 'step_1',
        completedStepIndex: 0,
        completedPage: {
          id: 'page_1',
          title: 'Joy items',
          fields: [{ name: 'JOY1', type: 'likert' } as any],
        },
        allValues: { JOY1: 5 },
        progress: { percentage: 100, currentStep: 1, totalSteps: 1 },
      } as any);

      expect(reward).not.toBeNull();
      // Base 10 + 1.5x multiplier -> 5 bonus -> 15 points
      expect(reward?.data.points).toBe(15);
      expect(reward?.data.bonus).toBe(5);
      expect(reward?.title).toContain('Voice Boost (1.5x Lucky Insight!)');
    });
  });

  describe('OfflineOutboxQueue Resilient Queueing', () => {
    it('enqueues failed survey submissions and replays upon flush', async () => {
      const mockSubmit = vi.fn().mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, status: 200, responseId: 42 });

      const outbox = new OfflineOutboxQueue({
        storageKey: 'test_feedora_outbox',
        transport: {
          submit: async (envelope) => {
            const res = await mockSubmit(envelope);
            return {
              receiptId: String(res.responseId),
              status: 'synced',
              timestamp: new Date().toISOString(),
            };
          },
        },
      });

      // Enqueue submission
      await outbox.enqueue({
        id: 'test_sub_1',
        formId: 'feedora_survey_uuid',
        values: { JOY1: 5, JOY2: 5 },
        submittedAt: new Date().toISOString(),
        retryCount: 0,
        experimentMetadata: {
          experimentKey: 'hmsam-gamification-study',
          variantId: 'gamified',
        },
      });

      expect(await outbox.getPendingCount()).toBe(1);

      // Trigger flush
      await outbox.flush();

      // Called once on initial enqueue attempt, then retried on flush
      expect(mockSubmit).toHaveBeenCalledTimes(2);
      expect(await outbox.getPendingCount()).toBe(0);
    });
  });

  describe('Transport Adapter Analysis Contract', () => {
    it('fetches server analysis and deserializes Welch t-test & Hedges g metrics', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          survey: { id: 1, uuid: 'survey-uuid-123', title: 'HMSAM Study', isHmsam: true },
          totalResponses: 10,
          overallAdoption: 85.4,
          overallAlpha: { value: 0.88, interpretation: 'Good reliability' },
          constructScores: { joy: { score: 90.0, label: 'Joy' } },
          constructReliabilities: { joy: { alpha: 0.82, label: 'Joy' } },
          experimentalComparison: {
            arms: {
              gamified: { count: 5, overallScore: 88.0 },
              control: { count: 5, overallScore: 72.0 },
            },
            constructDifferences: { joy: 16.0 },
            statisticalComparison: {
              joy: {
                tStatistic: 2.84,
                degreesOfFreedom: 7.6,
                pValue: 0.023,
                hedgesG: 0.82,
                effectSize: 'large',
                isSignificant: true,
                significanceMarker: '*',
              },
            },
          },
        }),
      });

      const adapter = new FeedoraHttpTransportAdapter('http://127.0.0.1:8000', mockFetch as any);
      const analysis = await adapter.fetchSurveyAnalysis('survey-uuid-123');

      expect(analysis.ok).toBe(true);
      expect(analysis.totalResponses).toBe(10);
      expect(analysis.experimentalComparison.statisticalComparison?.joy?.isSignificant).toBe(true);
      expect(analysis.experimentalComparison.statisticalComparison?.joy?.hedgesG).toBe(0.82);
      expect(analysis.experimentalComparison.statisticalComparison?.joy?.effectSize).toBe('large');
    });
  });
});
