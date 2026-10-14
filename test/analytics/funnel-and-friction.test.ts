import { describe, it, expect } from 'vitest';
import { AnalyticsEngine, type FormTelemetryEvent } from '../../src/index.js';

describe('AnalyticsEngine: Funnel & Friction Intelligence', () => {
  describe('calculateFunnel()', () => {
    it('accurately calculates drop-off waterfall, completions, and conversion rates across A/B variants', () => {
      const mockEvents: FormTelemetryEvent[] = [
        // Variant Control: 2 users start, 1 drops at step 1, 1 completes
        { type: 'form_mounted', formId: 'f1', schemaVersion: '1.0', experimentLineage: { experimentKey: 'checkout_v2', variantId: 'control' }, timestamp: 100 },
        { type: 'step_viewed', formId: 'f1', stepIndex: 0, stepId: 'step_account', timestamp: 101 },
        { type: 'step_completed', formId: 'f1', stepIndex: 0, stepId: 'step_account', durationMs: 2000, timestamp: 103 },
        { type: 'step_viewed', formId: 'f1', stepIndex: 1, stepId: 'step_payment', timestamp: 104 },
        { type: 'step_completed', formId: 'f1', stepIndex: 1, stepId: 'step_payment', durationMs: 4000, timestamp: 108 },
        { type: 'form_submitted', formId: 'f1', totalDurationMs: 6000, success: true, errorCount: 0, experimentLineage: { experimentKey: 'checkout_v2', variantId: 'control' }, timestamp: 109 },

        // User 2 in Control: abandons at step 1
        { type: 'form_mounted', formId: 'f1', schemaVersion: '1.0', experimentLineage: { experimentKey: 'checkout_v2', variantId: 'control' }, timestamp: 200 },
        { type: 'step_viewed', formId: 'f1', stepIndex: 0, stepId: 'step_account', timestamp: 201 },
        { type: 'step_completed', formId: 'f1', stepIndex: 0, stepId: 'step_account', durationMs: 1500, timestamp: 203 },
        { type: 'step_viewed', formId: 'f1', stepIndex: 1, stepId: 'step_payment', timestamp: 204 },
        // (no step_completed or form_submitted)

        // Variant Accelerated (Variant B): 1 user starts and completes
        { type: 'form_mounted', formId: 'f1', schemaVersion: '1.0', experimentLineage: { experimentKey: 'checkout_v2', variantId: 'accelerated' }, timestamp: 300 },
        { type: 'step_viewed', formId: 'f1', stepIndex: 0, stepId: 'step_express', timestamp: 301 },
        { type: 'step_completed', formId: 'f1', stepIndex: 0, stepId: 'step_express', durationMs: 1200, timestamp: 302 },
        { type: 'form_submitted', formId: 'f1', totalDurationMs: 1200, success: true, errorCount: 0, experimentLineage: { experimentKey: 'checkout_v2', variantId: 'accelerated' }, timestamp: 303 },
      ];

      const funnels = AnalyticsEngine.calculateFunnel(mockEvents);

      expect(funnels).toBeDefined();
      expect(Object.keys(funnels)).toContain('control');
      expect(Object.keys(funnels)).toContain('accelerated');

      const controlFunnel = funnels['control'];
      expect(controlFunnel.totalStarts).toBe(2);
      expect(controlFunnel.totalSubmissions).toBe(1);
      expect(controlFunnel.overallConversionRatePercent).toBe(50); // 1 / 2 = 50%
      expect(controlFunnel.steps).toHaveLength(2);

      // Step 0: 2 views, 2 completions (0% drop-off)
      expect(controlFunnel.steps[0].views).toBe(2);
      expect(controlFunnel.steps[0].completions).toBe(2);
      expect(controlFunnel.steps[0].dropOffRatePercent).toBe(0);
      expect(controlFunnel.steps[0].medianDurationMs).toBe(1750); // (1500 + 2000) / 2

      // Step 1: 2 views, 1 completion (50% drop-off)
      expect(controlFunnel.steps[1].views).toBe(2);
      expect(controlFunnel.steps[1].completions).toBe(1);
      expect(controlFunnel.steps[1].dropOffRatePercent).toBe(50);

      const acceleratedFunnel = funnels['accelerated'];
      expect(acceleratedFunnel.totalStarts).toBe(1);
      expect(acceleratedFunnel.totalSubmissions).toBe(1);
      expect(acceleratedFunnel.overallConversionRatePercent).toBe(100);
    });
  });

  describe('calculateFrictionIndex()', () => {
    it('identifies struggling fields and ranks them by composite friction score', () => {
      const mockEvents: FormTelemetryEvent[] = [
        // 'ssn' field: high errors, high dwell
        { type: 'field_focused', formId: 'f1', stepIndex: 0, fieldName: 'ssn', timestamp: 10 },
        { type: 'field_error', formId: 'f1', stepIndex: 0, fieldName: 'ssn', errorRule: 'regex', timestamp: 15 },
        { type: 'field_error', formId: 'f1', stepIndex: 0, fieldName: 'ssn', errorRule: 'regex', timestamp: 18 },
        { type: 'field_blurred', formId: 'f1', stepIndex: 0, fieldName: 'ssn', dwellMs: 12000, hasValue: true, timestamp: 22 },

        // 'name' field: 1 focus, 0 errors, normal dwell
        { type: 'field_focused', formId: 'f1', stepIndex: 0, fieldName: 'fullName', timestamp: 30 },
        { type: 'field_blurred', formId: 'f1', stepIndex: 0, fieldName: 'fullName', dwellMs: 2000, hasValue: true, timestamp: 32 },
      ];

      const frictionReport = AnalyticsEngine.calculateFrictionIndex(mockEvents);

      expect(frictionReport).toHaveLength(2);
      // Top friction field should be 'ssn'
      expect(frictionReport[0].fieldName).toBe('ssn');
      expect(frictionReport[0].errorCount).toBe(2);
      expect(frictionReport[0].errorRatePercent).toBe(200); // 2 errors / 1 focus = 200%
      expect(frictionReport[0].topErrorRules[0]).toEqual({ rule: 'regex', count: 2 });
      expect(frictionReport[0].frictionScore).toBeGreaterThan(frictionReport[1].frictionScore);

      // Low friction field
      expect(frictionReport[1].fieldName).toBe('fullName');
      expect(frictionReport[1].errorCount).toBe(0);
      expect(frictionReport[1].errorRatePercent).toBe(0);
    });
  });
});
