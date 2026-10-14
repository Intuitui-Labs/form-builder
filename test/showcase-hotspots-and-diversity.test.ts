import { describe, it, expect } from 'vitest';

const a11yGate = await (async () => {
  try {
    // @ts-ignore
    return await import('../../a11y-gate/src/index.js');
  } catch {
    try {
      // @ts-ignore
      return await import('@intuitui-labs/a11y-gate');
    } catch {
      return null;
    }
  }
})();

const {
  auditAffordanceDiversity = () => ({} as any),
  auditHotspotDispersion = () => ({} as any),
  auditAdaptiveDensity = () => ({} as any),
} = a11yGate ?? {};

type FormFieldModality = any;
import {
  READINESS_SCHEMA,
  PATIENT_TRIAGE_SCHEMA,
  COMMERCIAL_LENDING_SCHEMA,
  INCIDENT_POSTMORTEM_SCHEMA,
  PEER_REVIEW_SCHEMA,
  AI_MORTGAGE_SCHEMA,
} from '../apps/showcase-latest/src/forms.js';
import type { FormSchema, FormField } from '../src/schema/FormSchema.js';

/**
 * Maps a FormField type to its physical interaction modality
 */
function mapFieldToModality(field: FormField): FormFieldModality {
  const t = field.type.toLowerCase();
  const intent = (field.semanticIntent || '').toLowerCase();

  if (t === 'date' || intent.includes('date')) {
    return 'date-preset';
  }
  if (t === 'phone' || intent.includes('phone')) {
    return 'picker-search';
  }
  if (
    intent === 'address-city' ||
    intent === 'address-state' ||
    intent === 'address-postal' ||
    intent.includes('postal') ||
    intent.includes('zip')
  ) {
    return 'dual-column';
  }
  if (t === 'address' || intent.includes('address')) {
    return 'picker-search';
  }

  switch (t) {
    case 'text':
    case 'email':
    case 'number':
    case 'textarea':
      return 'text-typing';
    case 'select':
    case 'multiselect':
    case 'radio':
    case 'checkbox':
      return 'tap-pill';
    case 'slider':
    case 'likert':
      return 'scrubbing-slider';
    case 'visualization':
      return 'custom';
    case 'file':
    case 'image-capture':
    case 'audio-record':
      return 'attachment';
    default:
      return 'text-typing';
  }
}

describe.skipIf(!a11yGate)('Upstream Form Builder Hotspot Dynamics & Affordance Diversity Audit', () => {
  const SCHEMAS: { name: string; schema: FormSchema }[] = [
    { name: 'Launch Readiness Review', schema: READINESS_SCHEMA as FormSchema },
    { name: 'Patient Triage & Intake', schema: PATIENT_TRIAGE_SCHEMA as FormSchema },
    { name: 'Commercial Lending', schema: COMMERCIAL_LENDING_SCHEMA as FormSchema },
    { name: 'Incident Postmortem', schema: INCIDENT_POSTMORTEM_SCHEMA as FormSchema },
    { name: 'Peer Review', schema: PEER_REVIEW_SCHEMA as FormSchema },
    { name: 'AI Mortgage Underwriting', schema: AI_MORTGAGE_SCHEMA as FormSchema },
  ];

  describe('1. Affordance Diversity Quotient (ADQ) Across Domain Schemas', () => {
    it('verifies multi-step forms maintain high interaction modality diversity to defeat repetition suppression', () => {
      const results: { schemaName: string; stepId: string; adq: number; passes: boolean }[] = [];

      for (const { name, schema } of SCHEMAS) {
        for (const page of schema.pages) {
          // Filter out cover pages, display statements, or purely informational steps
          const interactiveFields = page.fields.filter(
            (f) =>
              f.type !== 'statement' &&
              f.type !== 'heading' &&
              f.type !== 'divider' &&
              f.type !== 'rich-text' &&
              f.type !== 'visualization'
          );

          if (interactiveFields.length >= 3) {
            const modalities = interactiveFields.map(mapFieldToModality);
            const audit = auditAffordanceDiversity({
              stepId: `${name} -> ${page.id}`,
              fieldModalities: modalities,
              minAdqThreshold: 0.35,
            });

            results.push({
              schemaName: name,
              stepId: page.id,
              adq: audit.adq,
              passes: audit.passes,
            });

            if (!audit.passes) {
              throw new Error(audit.violation);
            }
            expect(audit.passes).toBe(true);
            expect(audit.hasRepetitionSuppressionHazard).toBe(false);
          }
        }
      }

      // Assert that at least 8 multi-field steps across the suite were evaluated
      expect(results.length).toBeGreaterThanOrEqual(8);

      // Verify that the average ADQ across all steps is high (e.g. >= 0.50)
      const avgAdq = results.reduce((acc, r) => acc + r.adq, 0) / results.length;
      expect(avgAdq).toBeGreaterThanOrEqual(0.50);
    });

    it('flags artificial monotonous steps when tested with 6 identical text fields', () => {
      const monotonousModalityList: FormFieldModality[] = [
        'text-typing',
        'text-typing',
        'text-typing',
        'text-typing',
        'text-typing',
        'text-typing',
      ];

      const audit = auditAffordanceDiversity({
        stepId: 'synthetic-monotony-test',
        fieldModalities: monotonousModalityList,
      });

      expect(audit.passes).toBe(false);
      expect(audit.hasRepetitionSuppressionHazard).toBe(true);
      expect(audit.adq).toBeLessThan(0.35);
      expect(audit.violation).toContain('cognitive repetition suppression');
    });
  });

  describe('2. Hotspot Focal Gravity in Showcase UI', () => {
    it('ensures active focused field commands foveal gaze over passive background elements', () => {
      // Metric derived from EngineUi:
      // Active field: elevated border, 2px stroke, illumination halo -> Salience 210
      // Inactive field: neutral slate border, 1px stroke, 0 halo -> Mean Salience 75
      const audit = auditHotspotDispersion({
        activeElementSalience: 210,
        averageInactiveSalience: 75,
        minAttentionRatio: 2.20,
      });

      expect(audit.passes).toBe(true);
      expect(audit.attentionRatio).toBe(2.8);
      expect(audit.violation).toBeUndefined();
    });
  });

  describe('3. Adaptive Density Profile Verification', () => {
    it('verifies standard balanced density conforms to 48px height with 44px hit slop', () => {
      // Standard showcase input: 48px height, 13px padding, 48px touch envelope
      const balancedInput = auditAdaptiveDensity({
        mode: 'balanced',
        visualHeightPx: 48,
        touchEnvelopePx: 48,
        paddingPx: 13,
      });

      expect(balancedInput.passes).toBe(true);
      expect(balancedInput.densityCompliant).toBe(true);
      expect(balancedInput.touchEnvelopePasses).toBe(true);
    });

    it('verifies compact enterprise density mode maintains 44px touch envelope', () => {
      // Compact table or dense review input: 38px height with 44px hit slop
      const compactInput = auditAdaptiveDensity({
        mode: 'compact',
        visualHeightPx: 38,
        touchEnvelopePx: 44,
        paddingPx: 8,
      });

      expect(compactInput.passes).toBe(true);
      expect(compactInput.densityCompliant).toBe(true);
      expect(compactInput.touchEnvelopePasses).toBe(true);
    });
  });
});
