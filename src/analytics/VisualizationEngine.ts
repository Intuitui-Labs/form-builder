import type { InteractiveVisualizationDescriptor, VisualizationMetric } from '../schema/FormSchema.js';
import { MathExpressionEvaluator } from '../core/MathExpressionEvaluator.js';

export interface ComputedGaugeRenderState {
  type: 'gauge';
  title: string;
  value: number;
  min: number;
  max: number;
  percentage: number; // 0 to 100
  angleDeg: number; // -90 (empty) to +90 (full) for semi-circle
  statusColor: 'success' | 'warning' | 'danger' | 'info';
  formattedText: string;
}

export interface ComputedBarItem {
  label: string;
  value: number;
  percentage: number;
  formattedText: string;
}

export interface ComputedBarRenderState {
  type: 'bar';
  title: string;
  items: ComputedBarItem[];
}

export interface ComputedComparisonRenderState {
  type: 'comparison';
  title: string;
  userValue: number;
  benchmarkValue: number;
  percentile: number; // 0 to 100
  deltaPercent: number; // e.g. +14% or -8%
  headline: string;
}

export interface ComputedProjectionPoint {
  x: number;
  y: number;
  label: string;
  value: number;
}

export interface ComputedProjectionRenderState {
  type: 'projection';
  title: string;
  points: ComputedProjectionPoint[];
  svgPathData: string;
  minVal: number;
  maxVal: number;
}

export type ComputedVisualizationState =
  | ComputedGaugeRenderState
  | ComputedBarRenderState
  | ComputedComparisonRenderState
  | ComputedProjectionRenderState;

/**
 * VisualizationEngine: Evaluates InteractiveVisualizationDescriptors against live form state
 * and produces ready-to-render SVG/Canvas layout states without requiring heavy client-side chart libraries.
 */
export class VisualizationEngine {
  /**
   * Computes the render state for an interactive visualization descriptor given current form values.
   */
  public static compute(
    descriptor: InteractiveVisualizationDescriptor,
    values: Record<string, unknown>,
  ): ComputedVisualizationState {
    const formula = descriptor.formula;
    const computedVal = formula
      ? MathExpressionEvaluator.evaluate(formula, values)
      : this.aggregateMetricValues(descriptor.metrics, values);

    switch (descriptor.visualizationType) {
      case 'gauge':
        return this.computeGauge(descriptor, computedVal);
      case 'bar':
        return this.computeBar(descriptor, values);
      case 'comparison':
        return this.computeComparison(descriptor, computedVal);
      case 'projection':
      case 'line':
      default:
        return this.computeProjection(descriptor, computedVal);
    }
  }

  private static aggregateMetricValues(metrics: VisualizationMetric[], values: Record<string, unknown>): number {
    if (!metrics || metrics.length === 0) return 0;
    const m = metrics[0];
    const key = typeof m.value === 'string' ? m.value : undefined;
    const raw = key && key in values ? values[key] : m.value;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const parsed = parseFloat(raw.replace(/[^0-9.-]/g, ''));
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  private static computeGauge(
    descriptor: InteractiveVisualizationDescriptor,
    value: number,
  ): ComputedGaugeRenderState {
    const min = 0;
    const max = 100;
    const clamped = Math.min(Math.max(value, min), max);
    const percentage = ((clamped - min) / (max - min)) * 100;
    // Semi-circle angle: -90deg to +90deg
    const angleDeg = -90 + (percentage / 100) * 180;

    let statusColor: ComputedGaugeRenderState['statusColor'] = 'info';
    if (percentage >= 80) statusColor = 'success';
    else if (percentage >= 50) statusColor = 'warning';
    else statusColor = 'danger';

    return {
      type: 'gauge',
      title: descriptor.title,
      value: clamped,
      min,
      max,
      percentage: Math.round(percentage),
      angleDeg: Math.round(angleDeg),
      statusColor,
      formattedText: `${Math.round(clamped)}%`,
    };
  }

  private static computeBar(
    descriptor: InteractiveVisualizationDescriptor,
    values: Record<string, unknown>,
  ): ComputedBarRenderState {
    const items: ComputedBarItem[] = (descriptor.metrics || []).map((m) => {
      const key = typeof m.value === 'string' ? m.value : undefined;
      const raw = key && key in values ? values[key] : m.value;
      const val = typeof raw === 'number' ? raw : parseFloat(String(raw || 0)) || 0;
      return {
        label: m.label,
        value: val,
        percentage: 0,
        formattedText: String(val),
      };
    });

    const max = Math.max(...items.map((i) => i.value), 1);
    for (const item of items) {
      item.percentage = Math.round((item.value / max) * 100);
    }

    return {
      type: 'bar',
      title: descriptor.title,
      items,
    };
  }

  private static computeComparison(
    descriptor: InteractiveVisualizationDescriptor,
    value: number,
  ): ComputedComparisonRenderState {
    const benchmark = 50; // standard median cohort benchmark
    const delta = Math.round(((value - benchmark) / benchmark) * 100);
    const percentile = Math.min(Math.max(Math.round(value), 1), 99);

    const headline =
      delta >= 0
        ? `${delta}% higher than cohort average (Top ${100 - percentile}%)`
        : `${Math.abs(delta)}% below cohort average`;

    return {
      type: 'comparison',
      title: descriptor.title,
      userValue: value,
      benchmarkValue: benchmark,
      percentile,
      deltaPercent: delta,
      headline,
    };
  }

  private static computeProjection(
    descriptor: InteractiveVisualizationDescriptor,
    baseValue: number,
  ): ComputedProjectionRenderState {
    const points: ComputedProjectionPoint[] = [];
    const stepCount = 5;
    const base = Math.max(baseValue, 10);

    for (let i = 0; i < stepCount; i++) {
      const year = i + 1;
      // Compounding 5% illustrative growth curve
      const val = Math.round(base * Math.pow(1.05, i));
      points.push({
        x: (i / (stepCount - 1)) * 100, // 0 to 100 svg coordinate space
        y: 0,
        label: `Year ${year}`,
        value: val,
      });
    }

    const minVal = Math.min(...points.map((p) => p.value));
    const maxVal = Math.max(...points.map((p) => p.value), 1);

    // Map y coordinates (in SVG, 0 is top, 100 is bottom)
    for (const p of points) {
      const normalized = (p.value - minVal) / (maxVal - minVal || 1);
      p.y = Math.round(100 - normalized * 100);
    }

    // Generate SVG path string: M x0,y0 L x1,y1 ...
    const svgPathData = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return {
      type: 'projection',
      title: descriptor.title,
      points,
      svgPathData,
      minVal,
      maxVal,
    };
  }
}
