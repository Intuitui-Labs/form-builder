export type {
  FieldAnalytics,
  FunnelStepStats,
  FunnelAnalysis,
  FieldFrictionMetrics,
  MetricGauge,
  DistributionChart,
  VisualizationReport,
} from './types.js';
export { AnalyticsEngine } from './AnalyticsEngine.js';
export { ResponseAggregator } from './ResponseAggregator.js';
export { SpreadsheetExporter } from './SpreadsheetExporter.js';
export { FunnelAnalyzer } from './FunnelAnalyzer.js';
export { FrictionAnalyzer } from './FrictionAnalyzer.js';
export { VisualizationReportGenerator } from './VisualizationReportGenerator.js';
export {
  VisualizationEngine,
  type ComputedVisualizationState,
  type ComputedGaugeRenderState,
  type ComputedBarRenderState,
  type ComputedBarItem,
  type ComputedComparisonRenderState,
  type ComputedProjectionRenderState,
  type ComputedProjectionPoint,
} from './VisualizationEngine.js';
