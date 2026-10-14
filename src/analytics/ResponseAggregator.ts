import type { FieldDefinition, FormResponse } from '../schema/FormSchema.js';
import type { FieldAnalytics } from './types.js';

export const ResponseAggregator = {
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
        fields: ResponseAggregator.aggregate(fields, cohortResponses),
      };
    }

    return result;
  },
};
