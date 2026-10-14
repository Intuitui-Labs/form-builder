import { describe, it, expect } from 'vitest';
import { AnalyticsEngine, type FormTelemetryEvent } from '../../src/index.js';

describe('AnalyticsEngine - Out-of-Order Telemetry Event Chronology', () => {
  it('correctly orders out-of-sequence network telemetry packets before computing funnel metrics', () => {
    // Events arrive reversed: step_viewed for step 1 arrives before step 0 due to network packet re-ordering!
    const outOfOrderEvents: FormTelemetryEvent[] = [
      {
        type: 'step_completed',
        formId: 'onboarding',
        stepIndex: 1,
        stepId: 'step_profile',
        durationMs: 3000,
        experimentLineage: { experimentKey: 'exp_flow', variantId: 'variant_b' },
        timestamp: 1040,
      },
      {
        type: 'step_viewed',
        formId: 'onboarding',
        stepIndex: 1,
        stepId: 'step_profile',
        experimentLineage: { experimentKey: 'exp_flow', variantId: 'variant_b' },
        timestamp: 1020,
      },
      {
        type: 'step_completed',
        formId: 'onboarding',
        stepIndex: 0,
        stepId: 'step_intro',
        durationMs: 1500,
        experimentLineage: { experimentKey: 'exp_flow', variantId: 'variant_b' },
        timestamp: 1015,
      },
      {
        type: 'step_viewed',
        formId: 'onboarding',
        stepIndex: 0,
        stepId: 'step_intro',
        experimentLineage: { experimentKey: 'exp_flow', variantId: 'variant_b' },
        timestamp: 1000,
      },
      {
        type: 'form_mounted',
        formId: 'onboarding',
        schemaVersion: '1.0',
        experimentLineage: { experimentKey: 'exp_flow', variantId: 'variant_b' },
        timestamp: 990,
      },
      {
        type: 'form_submitted',
        formId: 'onboarding',
        totalDurationMs: 4500,
        success: true,
        errorCount: 0,
        experimentLineage: { experimentKey: 'exp_flow', variantId: 'variant_b' },
        timestamp: 1050,
      },
    ];

    const funnel = AnalyticsEngine.calculateFunnel(outOfOrderEvents);
    expect(funnel['variant_b']).toBeDefined();

    const analysis = funnel['variant_b'];
    expect(analysis.totalStarts).toBe(1);
    expect(analysis.totalSubmissions).toBe(1);
    expect(analysis.overallConversionRatePercent).toBe(100);

    expect(analysis.steps).toHaveLength(2);
    expect(analysis.steps[0].stepIndex).toBe(0);
    expect(analysis.steps[0].views).toBe(1);
    expect(analysis.steps[0].completions).toBe(1);
    expect(analysis.steps[0].dropOffRatePercent).toBe(0);

    expect(analysis.steps[1].stepIndex).toBe(1);
    expect(analysis.steps[1].views).toBe(1);
    expect(analysis.steps[1].completions).toBe(1);
    expect(analysis.steps[1].dropOffRatePercent).toBe(0);
  });
});
