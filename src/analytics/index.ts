export type {
  FieldAnalytics,
  FunnelStepStats,
  FunnelAnalysis,
  FieldFrictionMetrics,
  MetricGauge,
  DistributionChart,
  VisualizationReport,
} from './AnalyticsEngine.js';
export { AnalyticsEngine } from './AnalyticsEngine.js';
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
