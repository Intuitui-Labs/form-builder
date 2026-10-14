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
