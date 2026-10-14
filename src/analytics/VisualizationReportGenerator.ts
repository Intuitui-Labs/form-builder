import type { FieldDefinition, FormResponse } from '../schema/FormSchema.js';
import type { DistributionChart, MetricGauge, VisualizationReport } from './types.js';

export const VisualizationReportGenerator = {
  /**
   * Generates structured interactive visualization models (gauges, distributions, and insights)
   * from form schema definitions and collected responses.
   */
  generateVisualizationReport(
    fields: FieldDefinition[],
    responses: FormResponse[],
    title = 'Form Performance & Response Visualizations',
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
            `Average ${fieldLabel}: ${avg}${typeof field.config?.unit === 'string' ? ' ' + field.config.unit : ''} (range: ${Math.min(...numbers)} - ${Math.max(...numbers)})`,
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
