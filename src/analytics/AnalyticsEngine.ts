import type { FieldDefinition, FormResponse } from '../schema/FormSchema.js';
import type { FormTelemetryEvent } from '../ports/ITelemetryPort.js';
import { ResponseAggregator } from './ResponseAggregator.js';
import { SpreadsheetExporter } from './SpreadsheetExporter.js';
import { FunnelAnalyzer } from './FunnelAnalyzer.js';
import { FrictionAnalyzer } from './FrictionAnalyzer.js';
import { VisualizationReportGenerator } from './VisualizationReportGenerator.js';
import type {
  FieldAnalytics,
  FunnelStepStats,
  FunnelAnalysis,
  FieldFrictionMetrics,
  MetricGauge,
  DistributionChart,
  VisualizationReport,
} from './types.js';

export type {
  FieldAnalytics,
  FunnelStepStats,
  FunnelAnalysis,
  FieldFrictionMetrics,
  MetricGauge,
  DistributionChart,
  VisualizationReport,
};

/**
 * AnalyticsEngine
 *
 * Unified root facade for form analytics, OWASP-compliant spreadsheet exports,
 * conversion funnel drops, field friction heuristics, and visualization reporting.
 * Delegates cleanly to decoupled modular engines.
 */
export const AnalyticsEngine = {
  /**
   * Aggregates raw responses into structured analytical data
   */
  aggregate(fields: FieldDefinition[], responses: FormResponse[]): FieldAnalytics[] {
    return ResponseAggregator.aggregate(fields, responses);
  },

  /**
   * Aggregates field metrics segmented by experiment variant (A/B cohort analysis).
   */
  aggregateByVariant(
    fields: FieldDefinition[],
    responses: FormResponse[],
    options?: { experimentKey?: string },
  ): Record<string, { totalResponses: number; fields: FieldAnalytics[] }> {
    return ResponseAggregator.aggregateByVariant(fields, responses, options);
  },

  /**
   * Sanitizes values against CSV Formula Injection (OWASP mitigation)
   */
  sanitizeCSVValue(value: unknown): string {
    return SpreadsheetExporter.sanitizeCSVValue(value);
  },

  /**
   * Escapes XML special characters for SpreadsheetML
   */
  escapeXML(value: unknown): string {
    return SpreadsheetExporter.escapeXML(value);
  },

  /**
   * Converts form responses to a CSV string
   */
  toCSV(fields: FieldDefinition[], responses: FormResponse[]): string {
    return SpreadsheetExporter.toCSV(fields, responses);
  },

  /**
   * Converts form responses to an Excel-compatible XML (SpreadsheetML) string
   */
  toXLSX(fields: FieldDefinition[], responses: FormResponse[]): string {
    return SpreadsheetExporter.toXLSX(fields, responses);
  },

  /**
   * Calculates drop-off funnel waterfall metrics segmented by A/B variant from telemetry events.
   */
  calculateFunnel(
    events: FormTelemetryEvent[],
    options?: { experimentKey?: string },
  ): Record<string, FunnelAnalysis> {
    return FunnelAnalyzer.calculateFunnel(events, options);
  },

  /**
   * Calculates field friction index (error rate, dwell hesitation, struggle scoring) from telemetry events.
   */
  calculateFrictionIndex(events: FormTelemetryEvent[]): FieldFrictionMetrics[] {
    return FrictionAnalyzer.calculateFrictionIndex(events);
  },

  /**
   * Generates structured interactive visualization models (gauges, distributions, and insights)
   * from form schema definitions and collected responses.
   */
  generateVisualizationReport(
    fields: FieldDefinition[],
    responses: FormResponse[],
    title = 'Form Performance & Response Visualizations',
  ): VisualizationReport {
    return VisualizationReportGenerator.generateVisualizationReport(fields, responses, title);
  },
};
