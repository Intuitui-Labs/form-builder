import type { FormTelemetryEvent } from '../ports/ITelemetryPort.js';
import type { FunnelAnalysis, FunnelStepStats } from './types.js';

export const FunnelAnalyzer = {
  /**
   * Calculates drop-off funnel waterfall metrics segmented by A/B variant from telemetry events.
   */
  calculateFunnel(
    events: FormTelemetryEvent[],
    options?: { experimentKey?: string },
  ): Record<string, FunnelAnalysis> {
    const cohorts: Record<string, FormTelemetryEvent[]> = {};
    const sortedEvents = [...events].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

    let currentSessionVariant = 'unassigned';

    for (const event of sortedEvents) {
      if (event.type === 'form_mounted' && event.experimentLineage) {
        if (!options?.experimentKey || event.experimentLineage.experimentKey === options.experimentKey) {
          currentSessionVariant = event.experimentLineage.variantId;
        }
      } else if (
        (event.type === 'form_submitted' || event.type === 'form_abandoned') &&
        event.experimentLineage
      ) {
        if (!options?.experimentKey || event.experimentLineage.experimentKey === options.experimentKey) {
          currentSessionVariant = event.experimentLineage.variantId;
        }
      }

      if (!cohorts[currentSessionVariant]) cohorts[currentSessionVariant] = [];
      cohorts[currentSessionVariant].push(event);
    }

    const result: Record<string, FunnelAnalysis> = {};

    for (const [variantId, cohortEvents] of Object.entries(cohorts)) {
      const stepViews: Map<number, { id: string; count: number }> = new Map();
      const stepCompletions: Map<number, { count: number; durations: number[] }> = new Map();
      let starts = 0;
      let submissions = 0;

      for (const e of cohortEvents) {
        if (e.type === 'form_mounted') {
          starts++;
        } else if (e.type === 'step_viewed') {
          const curr = stepViews.get(e.stepIndex) ?? { id: e.stepId, count: 0 };
          curr.count++;
          stepViews.set(e.stepIndex, curr);
        } else if (e.type === 'step_completed') {
          const curr = stepCompletions.get(e.stepIndex) ?? { count: 0, durations: [] };
          curr.count++;
          curr.durations.push(e.durationMs);
          stepCompletions.set(e.stepIndex, curr);
        } else if (e.type === 'form_submitted' && e.success) {
          submissions++;
        }
      }

      if (starts === 0 && stepViews.size > 0) {
        starts = stepViews.get(0)?.count ?? 1;
      }

      const stepIndices = Array.from(stepViews.keys()).sort((a, b) => a - b);
      const stepStats: FunnelStepStats[] = [];

      for (const idx of stepIndices) {
        const viewData = stepViews.get(idx)!;
        const completionData = stepCompletions.get(idx) ?? { count: 0, durations: [] };
        const views = viewData.count;
        const completions = completionData.count;
        const dropOffCount = Math.max(0, views - completions);
        const dropOffRatePercent = views > 0 ? Math.round(((views - completions) / views) * 1000) / 10 : 0;

        const durations = completionData.durations.sort((a, b) => a - b);
        let medianDurationMs = 0;
        if (durations.length > 0) {
          const mid = Math.floor(durations.length / 2);
          medianDurationMs = durations.length % 2 !== 0 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2;
        }

        stepStats.push({
          stepIndex: idx,
          stepId: viewData.id,
          views,
          completions,
          dropOffCount,
          dropOffRatePercent,
          medianDurationMs,
        });
      }

      const overallConversionRatePercent =
        starts > 0 ? Math.round((submissions / starts) * 1000) / 10 : 0;

      result[variantId] = {
        variantId,
        totalStarts: starts,
        totalSubmissions: submissions,
        overallConversionRatePercent,
        steps: stepStats,
      };
    }

    return result;
  },
};
