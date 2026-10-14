import type { FieldDefinition, FormResponse } from '../schema/FormSchema.js';
import type { FormTelemetryEvent } from '../ports/ITelemetryPort.js';

export interface FieldAnalytics {
  fieldId: string;
  label: string;
  type: string;
  totalResponses: number;
  data: unknown; // Frequency counts, averages, or raw list
}

export interface FunnelStepStats {
  stepIndex: number;
  stepId: string;
  views: number;
  completions: number;
  dropOffCount: number;
  dropOffRatePercent: number;
  medianDurationMs: number;
}

export interface FunnelAnalysis {
  variantId: string;
  totalStarts: number;
  totalSubmissions: number;
  overallConversionRatePercent: number;
  steps: FunnelStepStats[];
}

export interface FieldFrictionMetrics {
  fieldName: string;
  focusCount: number;
  totalDwellMs: number;
  errorCount: number;
  errorRatePercent: number;
  topErrorRules: Array<{ rule: string; count: number }>;
  frictionScore: number;
}

export interface MetricGauge {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  target?: number;
  unit?: string;
  status: 'optimal' | 'warning' | 'critical';
}

export interface DistributionChart {
  fieldId: string;
  label: string;
  type: 'bar' | 'pie';
  data: Record<string, number>;
}

export interface VisualizationReport {
  title: string;
  totalSubmissions: number;
  gauges: MetricGauge[];
  distributions: DistributionChart[];
  summaryInsights: string[];
}

export const AnalyticsEngine = {
  /**
   * Aggregates raw responses into structured analytical data
   */
  aggregate(fields: FieldDefinition[], responses: FormResponse[]): FieldAnalytics[] {
    return fields.map((field) => {
      const fieldLabel = field.label ?? field.name ?? field.id;
      const values = responses
        .map((r) => r.data[field.name])
        .filter((v) => v !== undefined && v !== null);

      let aggregatedData: unknown = null;

      if (field.type === 'select') {
        const initialCounts: Record<string, number> = {};
        field.options?.forEach((opt) => {
          initialCounts[opt.value] = 0;
        });

        aggregatedData = values.reduce<Record<string, number>>((acc, val) => {
          const key = String(val);
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, initialCounts);
      } else if (field.type === 'number') {
        const numericValues = values.map(Number).filter((v) => !Number.isNaN(v));
        const sum = numericValues.reduce((a, b) => a + b, 0);
        aggregatedData = {
          average: numericValues.length > 0 ? sum / numericValues.length : 0,
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          count: numericValues.length,
        };
      } else {
        // For text/email etc, just return the last 10 unique entries
        aggregatedData = Array.from(new Set(values)).slice(-10);
      }

      return {
        fieldId: field.id,
        label: fieldLabel,
        type: field.type,
        totalResponses: values.length,
        data: aggregatedData,
      };
    });
  },

  /**
   * Sanitizes values against CSV Formula Injection (OWASP mitigation)
   */
  sanitizeCSVValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    let str = String(value);

    // Prepend single-quote to prevent spreadsheet formula execution if starting with trigger characters
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }

    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  },

  /**
   * Escapes XML special characters for SpreadsheetML
   */
  escapeXML(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  },

  /**
   * Converts form responses to a CSV string
   */
  toCSV(fields: FieldDefinition[], responses: FormResponse[]): string {
    if (responses.length === 0) return '';

    const headers = ['Submitted At', ...fields.map((f) => f.label ?? f.name ?? f.id)];
    const sanitizedHeaders = headers.map((h) => this.sanitizeCSVValue(h));

    const rows = responses.map((r) => {
      const row = [
        this.sanitizeCSVValue(new Date(r.submittedAt).toLocaleString()),
        ...fields.map((f) => this.sanitizeCSVValue(r.data[f.name])),
      ];
      return row.join(',');
    });

    return [sanitizedHeaders.join(','), ...rows].join('\n');
  },

  /**
   * Converts form responses to an Excel-compatible XML (SpreadsheetML) string
   */
  toXLSX(fields: FieldDefinition[], responses: FormResponse[]): string {
    const headers = ['Submitted At', ...fields.map((f) => f.label ?? f.name ?? f.id)];
    const rows = responses.map((r) => {
      return [new Date(r.submittedAt).toLocaleString(), ...fields.map((f) => r.data[f.name] ?? '')];
    });

    const xmlHeader = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="Form Responses">
  <Table>`;

    const xmlFooter = `  </Table>
 </Worksheet>
 </Workbook>`;

    const headerRow = `   <Row ss:StyleID="Header">
${headers.map((h) => `    <Cell><Data ss:Type="String">${this.escapeXML(h)}</Data></Cell>`).join('\n')}
   </Row>`;

    const dataRows = rows
      .map((row) => {
        return `   <Row>
${row
  .map((val) => {
    const isNum = typeof val === 'number';
    return `    <Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${isNum ? val : this.escapeXML(val)}</Data></Cell>`;
  })
  .join('\n')}
   </Row>`;
      })
      .join('\n');

    return `${xmlHeader}\n${headerRow}\n${dataRows}\n${xmlFooter}`;
  },

  /**
   * Aggregates field metrics segmented by experiment variant (A/B cohort analysis).
   */
  aggregateByVariant(
    fields: FieldDefinition[],
    responses: FormResponse[],
    options?: { experimentKey?: string },
  ): Record<string, { totalResponses: number; fields: FieldAnalytics[] }> {
    const cohorts: Record<string, FormResponse[]> = {};

    for (const r of responses) {
      const meta = r.metadata as Record<string, any> | undefined;
      let variant = 'unassigned';

      if (meta?.variantId) {
        if (!options?.experimentKey || meta?.experimentKey === options.experimentKey) {
          variant = String(meta.variantId);
        }
      } else if (meta?.experimentLineage?.variantId) {
        if (!options?.experimentKey || meta?.experimentLineage?.experimentKey === options.experimentKey) {
          variant = String(meta.experimentLineage.variantId);
        }
      }

      if (!cohorts[variant]) cohorts[variant] = [];
      cohorts[variant].push(r);
    }

    const result: Record<string, { totalResponses: number; fields: FieldAnalytics[] }> = {};

    for (const [variant, cohortResponses] of Object.entries(cohorts)) {
      result[variant] = {
        totalResponses: cohortResponses.length,
        fields: this.aggregate(fields, cohortResponses),
      };
    }

    return result;
  },

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

  /**
   * Generates structured interactive visualization models (gauges, distributions, and insights)
   * from form schema definitions and collected responses.
   */
  generateVisualizationReport(
    fields: FieldDefinition[],
    responses: FormResponse[],
    title = 'Form Performance & Response Visualizations'
  ): VisualizationReport {
    const gauges: MetricGauge[] = [];
    const distributions: DistributionChart[] = [];
    const summaryInsights: string[] = [];

    const totalSubmissions = responses.length;

    for (const field of fields) {
      const fieldLabel = field.label ?? field.name ?? field.id;
      const values = responses
        .map((r) => r.data[field.name])
        .filter((v) => v !== undefined && v !== null);

      if (field.type === 'number' || field.type === 'slider') {
        const numbers = values.map(Number).filter((n) => !Number.isNaN(n));
        if (numbers.length > 0) {
          const sum = numbers.reduce((a, b) => a + b, 0);
          const avg = Math.round((sum / numbers.length) * 100) / 100;
          const min = field.min ?? Math.min(...numbers);
          const max = field.max ?? Math.max(...numbers);
          const target = typeof field.config?.target === 'number' ? field.config.target : undefined;

          let status: 'optimal' | 'warning' | 'critical' = 'optimal';
          if (target !== undefined) {
            const delta = Math.abs(avg - target) / (target || 1);
            if (delta > 0.25) status = 'critical';
            else if (delta > 0.1) status = 'warning';
          }

          gauges.push({
            id: field.id,
            label: fieldLabel,
            value: avg,
            min,
            max: Math.max(max, avg),
            target,
            unit: typeof field.config?.unit === 'string' ? field.config.unit : undefined,
            status,
          });

          summaryInsights.push(
            `Average ${fieldLabel}: ${avg}${typeof field.config?.unit === 'string' ? ' ' + field.config.unit : ''} (range: ${Math.min(...numbers)} - ${Math.max(...numbers)})`
          );
        }
      } else if (field.type === 'select' || field.type === 'likert') {
        const counts: Record<string, number> = {};
        if (field.options) {
          for (const opt of field.options) {
            counts[opt.label ?? opt.value] = 0;
          }
        }

        for (const v of values) {
          const key = String(v);
          const matchedOpt = field.options?.find((o) => o.value === key);
          const label = matchedOpt?.label ?? key;
          counts[label] = (counts[label] || 0) + 1;
        }

        distributions.push({
          fieldId: field.id,
          label: fieldLabel,
          type: field.type === 'likert' ? 'bar' : 'pie',
          data: counts,
        });

        // Top choice insight
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0 && totalSubmissions > 0) {
          const topPercent = Math.round((sorted[0][1] / totalSubmissions) * 100);
          summaryInsights.push(`Most common ${fieldLabel}: "${sorted[0][0]}" (${topPercent}% of responses)`);
        }
      }
    }

    if (totalSubmissions === 0) {
      summaryInsights.push('No submissions recorded yet.');
    }

    return {
      title,
      totalSubmissions,
      gauges,
      distributions,
      summaryInsights,
    };
  },
};


