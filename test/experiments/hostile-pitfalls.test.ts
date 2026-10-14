import { describe, it, expect, vi } from 'vitest';
import {
  ExperimentFormHydrator,
  MemoryExperimentAdapter,
  AnalyticsEngine,
  type FormSchema,
  type FormDraftSnapshot,
  type FormResponse,
} from '../../src/index.js';

const controlSchema: FormSchema = {
  id: 'intake-form',
  title: 'Control 1-Page Form',
  pages: [
    {
      id: 'p1',
      title: 'General Info',
      fields: [
        { id: 'f_name', name: 'name', type: 'text', label: 'Full Name', required: true, order: 0 },
        { id: 'f_email', name: 'email', type: 'email', label: 'Email', required: true, order: 1 },
      ],
    },
  ],
};

const wizardSchema: FormSchema = {
  id: 'intake-form',
  title: 'Wizard 2-Page Form',
  pages: [
    {
      id: 'step1',
      title: 'Identity',
      fields: [
        { id: 'f_name', name: 'name', type: 'text', label: 'Full Name', required: true, order: 0 },
      ],
    },
    {
      id: 'step2',
      title: 'Contact',
      fields: [
        { id: 'f_email', name: 'email', type: 'email', label: 'Email', required: true, order: 0 },
      ],
    },
  ],
};

describe('Hostile Critical Pitfall Defenses', () => {
  it('Trap 1 (FOIC & Synchronous Guarantee): Schema variant selects synchronously with zero delay', () => {
    const adapter = new MemoryExperimentAdapter({
      variants: { 'onboarding-experiment': 'wizard' },
    });

    const startTime = performance.now();
    const result = ExperimentFormHydrator.selectSchema({
      experimentKey: 'onboarding-experiment',
      variants: {
        control: controlSchema,
        wizard: wizardSchema,
      },
      experimentPort: adapter,
      context: { userId: 'u1' },
    });
    const elapsed = performance.now() - startTime;

    expect(elapsed).toBeLessThan(10); // Instant, 0ms synchronous resolution
    expect(result.variantId).toBe('wizard');
    expect(result.schema.pages).toHaveLength(2);
    expect(result.schema.settings?.experimentLineage).toEqual({
      experimentKey: 'onboarding-experiment',
      variantId: 'wizard',
    });
  });

  it('Trap 2 (Mid-Session Sticky Lock): Context changes mid-form do not swap variant or wipe inputs', () => {
    const adapter = new MemoryExperimentAdapter({
      variants: { 'intake-layout': 'control' },
    });

    // Hydrate form instance for anonymous user
    const context = { sessionId: 'anon-session-1' };
    const onSubmit = vi.fn();

    const hydrated = ExperimentFormHydrator.hydrate({
      experimentKey: 'intake-layout',
      variants: {
        control: controlSchema,
        wizard: wizardSchema,
      },
      experimentPort: adapter,
      context,
      onSubmit,
    });

    expect(hydrated.variantId).toBe('control');

    // User types into fields
    hydrated.manager.setFieldValue('name' as any, 'Alex Doe');
    hydrated.manager.setFieldValue('email' as any, 'alex@example.com');
    expect(hydrated.manager.getState().values).toEqual({
      name: 'Alex Doe',
      email: 'alex@example.com',
    });

    // Mid-session, external experiment config flips to 'wizard'
    adapter.setVariant('intake-layout', 'wizard');

    // Crucial check: Active instance remains locked to 'control', state is preserved
    expect(hydrated.variantId).toBe('control');
    expect(hydrated.manager.getState().values).toEqual({
      name: 'Alex Doe',
      email: 'alex@example.com',
    });
  });

  it('Trap 3 (Decoupled Exposure): Parsing/hydrating does NOT fire exposure until explicitly triggered', () => {
    const exposureTracker = vi.fn();
    const adapter = new MemoryExperimentAdapter({
      variants: { 'pricing-experiment': 'annual-discount' },
      onExposure: exposureTracker,
    });

    const hydrated = ExperimentFormHydrator.hydrate({
      experimentKey: 'pricing-experiment',
      variants: {
        control: controlSchema,
        'annual-discount': wizardSchema,
      },
      experimentPort: adapter,
      context: { userId: 'lead_99' },
      onSubmit: () => {},
      autoTrackExposure: false, // Default best practice
    });

    // Hydration occurred, but user hasn't seen the component yet:
    expect(exposureTracker).not.toHaveBeenCalled();
    expect(hydrated.hasTrackedExposure()).toBe(false);

    // Component mounts in viewport: trigger exposure explicitly
    hydrated.trackExposure();
    expect(exposureTracker).toHaveBeenCalledTimes(1);
    expect(hydrated.hasTrackedExposure()).toBe(true);

    // Subsequent calls are idempotent
    hydrated.trackExposure();
    expect(exposureTracker).toHaveBeenCalledTimes(1);
  });

  it('Trap 4 (Cross-Variant Draft Poisoning): Detects variant mismatch to prevent corrupted restorations', () => {
    const draftVariantA: FormDraftSnapshot = {
      schemaId: 'intake-form',
      schemaVersion: '1.0',
      savedAt: new Date().toISOString(),
      currentPageIndex: 0,
      completedStepIndices: [0],
      stepHistory: [0],
      branchLineage: [],
      branchTargetHistory: [],
      values: { name: 'Jordan' },
      isSubmitted: false,
      experimentLineage: {
        experimentKey: 'onboarding-split',
        variantId: 'variant-a',
      },
    };

    // Validating against matching variant
    const checkMatching = ExperimentFormHydrator.validateDraftCompatibility(
      draftVariantA,
      'variant-a',
      'onboarding-split',
    );
    expect(checkMatching.isCompatible).toBe(true);

    // Validating against divergent variant
    const checkDivergent = ExperimentFormHydrator.validateDraftCompatibility(
      draftVariantA,
      'variant-b',
      'onboarding-split',
    );
    expect(checkDivergent.isCompatible).toBe(false);
    expect(checkDivergent.reason).toBe('VARIANT_MISMATCH');
    expect(checkDivergent.draftVariantId).toBe('variant-a');
  });

  it('Trap 5 (Patch-Based Schema Overrides): Dynamically patches fields without duplicating entire schemas', () => {
    const adapter = new MemoryExperimentAdapter({
      variants: { 'urgency-banner': 'red-banner' },
    });

    const result = ExperimentFormHydrator.patchSchema({
      experimentKey: 'urgency-banner',
      baseSchema: controlSchema,
      patches: {
        control: (base) => base,
        'red-banner': (base) => ({
          ...base,
          title: '🚨 Limited Time Registration',
          pages: [
            {
              ...base.pages[0],
              fields: [
                {
                  id: 'f_urgency',
                  name: 'urgency_acknowledged',
                  type: 'text',
                  label: 'Do you acknowledge this offer expires today?',
                  required: true,
                  order: 0,
                },
                ...base.pages[0].fields,
              ],
            },
          ],
        }),
      },
      experimentPort: adapter,
      context: { userId: 'cust_77' },
    });

    expect(result.variantId).toBe('red-banner');
    expect(result.schema.title).toBe('🚨 Limited Time Registration');
    expect(result.schema.pages[0].fields).toHaveLength(3);
    expect(result.schema.pages[0].fields[0].name).toBe('urgency_acknowledged');
  });

  it('Trap 6 (Analytics Cohort Breakdown): Segment metrics by variant cleanly', () => {
    const fields = [
      { id: 'f_email', name: 'email', type: 'email' as const, label: 'Email' },
    ];

    const responses: FormResponse[] = [
      {
        id: 'r1',
        formId: 'intake',
        tenantId: 'acme',
        data: { email: 'a@example.com' },
        submittedAt: '2026-10-10T10:00:00Z',
        metadata: { experimentKey: 'copy-test', variantId: 'friendly' },
      },
      {
        id: 'r2',
        formId: 'intake',
        tenantId: 'acme',
        data: { email: 'b@example.com' },
        submittedAt: '2026-10-10T10:01:00Z',
        metadata: { experimentKey: 'copy-test', variantId: 'friendly' },
      },
      {
        id: 'r3',
        formId: 'intake',
        tenantId: 'acme',
        data: { email: 'c@example.com' },
        submittedAt: '2026-10-10T10:02:00Z',
        metadata: { experimentKey: 'copy-test', variantId: 'formal' },
      },
    ];

    const cohortStats = AnalyticsEngine.aggregateByVariant(fields, responses, {
      experimentKey: 'copy-test',
    });

    expect(Object.keys(cohortStats)).toContain('friendly');
    expect(Object.keys(cohortStats)).toContain('formal');

    expect(cohortStats['friendly'].totalResponses).toBe(2);
    expect(cohortStats['formal'].totalResponses).toBe(1);
    expect(cohortStats['friendly'].fields[0].totalResponses).toBe(2);
    expect(cohortStats['formal'].fields[0].totalResponses).toBe(1);
  });
});
