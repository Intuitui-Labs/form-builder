import type { FormTelemetryEvent } from '../ports/ITelemetryPort.js';
import type { FieldFrictionMetrics } from './types.js';

export const FrictionAnalyzer = {
  /**
   * Calculates field friction index (error rate, dwell hesitation, struggle scoring) from telemetry events.
   */
  calculateFrictionIndex(events: FormTelemetryEvent[]): FieldFrictionMetrics[] {
    const fieldMap: Map<
      string,
      {
        focusCount: number;
        totalDwellMs: number;
        errorRules: Map<string, number>;
      }
    > = new Map();

    for (const e of events) {
      if (e.type === 'field_focused') {
        const curr = fieldMap.get(e.fieldName) ?? { focusCount: 0, totalDwellMs: 0, errorRules: new Map() };
        curr.focusCount++;
        fieldMap.set(e.fieldName, curr);
      } else if (e.type === 'field_blurred') {
        const curr = fieldMap.get(e.fieldName) ?? { focusCount: 0, totalDwellMs: 0, errorRules: new Map() };
        curr.totalDwellMs += e.dwellMs;
        fieldMap.set(e.fieldName, curr);
      } else if (e.type === 'field_error') {
        const curr = fieldMap.get(e.fieldName) ?? { focusCount: 0, totalDwellMs: 0, errorRules: new Map() };
        const ruleCount = curr.errorRules.get(e.errorRule) ?? 0;
        curr.errorRules.set(e.errorRule, ruleCount + 1);
        fieldMap.set(e.fieldName, curr);
      }
    }

    const metrics: FieldFrictionMetrics[] = [];

    for (const [fieldName, data] of fieldMap.entries()) {
      let totalErrors = 0;
      const topErrorRules: Array<{ rule: string; count: number }> = [];

      for (const [rule, count] of data.errorRules.entries()) {
        totalErrors += count;
        topErrorRules.push({ rule, count });
      }
      topErrorRules.sort((a, b) => b.count - a.count);

      const focusCount = Math.max(1, data.focusCount);
      const errorRatePercent = Math.round((totalErrors / focusCount) * 1000) / 10;

      // Friction score: composite heuristic based on error rate (60% weight) and avg hesitation dwell (40% weight)
      const avgDwellSec = (data.totalDwellMs / focusCount) / 1000;
      const dwellFriction = Math.min(40, avgDwellSec * 4);
      const errorFriction = Math.min(60, errorRatePercent * 0.6);
      const frictionScore = Math.min(100, Math.round(errorFriction + dwellFriction));

      metrics.push({
        fieldName,
        focusCount: data.focusCount,
        totalDwellMs: data.totalDwellMs,
        errorCount: totalErrors,
        errorRatePercent,
        topErrorRules,
        frictionScore,
      });
    }

    return metrics.sort((a, b) => b.frictionScore - a.frictionScore);
  },
};
