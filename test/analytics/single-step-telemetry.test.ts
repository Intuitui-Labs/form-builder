import { describe, it, expect, vi } from 'vitest';
import { MemoryTelemetryAdapter } from '../../src/adapters/index.js';
import {
  FormManager,
  FormHydrator,
  ExperimentFormHydrator,
  type FormSchema,
} from '../../src/index.js';


describe('FormManager & FormHydrator Telemetry Parity', () => {
  it('dispatches form_mounted, field_focused, and auto-calculates dwellMs on blurField', async () => {
    const telemetry = new MemoryTelemetryAdapter();

    const manager = new FormManager<{ email: string; age: number }>({
      formId: 'single_page_signup',
      telemetry,
      fields: {
        email: {
          type: 'email',
          label: 'Work Email',
          required: true,
          rules: [{ type: 'required' }, { type: 'email' }],
        },
        age: {
          type: 'number',
          label: 'Age',
          required: false,
        },
      },
      onSubmit: vi.fn(),
    });

    const mounted = telemetry.getEventsByType('form_mounted');
    expect(mounted).toHaveLength(1);
    expect(mounted[0].formId).toBe('single_page_signup');

    // Simulate focus
    manager.focusField('email');
    const focused = telemetry.getEventsByType('field_focused');
    expect(focused).toHaveLength(1);
    expect(focused[0].fieldName).toBe('email');

    // Type value and blur
    manager.setFieldValue('email', 'dev@intuitui.org');
    manager.blurField('email');

    const blurred = telemetry.getEventsByType('field_blurred');
    expect(blurred).toHaveLength(1);
    expect(blurred[0].fieldName).toBe('email');
    expect(blurred[0].hasValue).toBe(true);
    expect(blurred[0].valueLength).toBe('dev@intuitui.org'.length);
    expect(blurred[0].dwellMs).toBeGreaterThanOrEqual(0);
  });

  it('records field_error when validation fails in single-step manager', () => {
    const telemetry = new MemoryTelemetryAdapter();
    const manager = new FormManager<{ email: string }>({
      formId: 'validation_test',
      telemetry,
      fields: {
        email: {
          type: 'email',
          required: true,
          rules: [{ type: 'required' }],
        },
      },
      onSubmit: vi.fn(),
    });

    const isValid = manager.validateField('email');
    expect(isValid).toBe(false);

    const errors = telemetry.getEventsByType('field_error');
    expect(errors).toHaveLength(1);
    expect(errors[0].fieldName).toBe('email');
    expect(errors[0].errorRule).toBe('required');
  });

  it('records form_submitted and flushes telemetry upon submission in single-step manager', async () => {
    const telemetry = new MemoryTelemetryAdapter();
    const flushSpy = vi.spyOn(telemetry, 'flush');
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    const manager = new FormManager<{ username: string }>({
      formId: 'submit_test',
      telemetry,
      fields: {
        username: {
          type: 'text',
          required: true,
          defaultValue: 'tester',
        },
      },
      onSubmit,
    });

    await manager.submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(flushSpy).toHaveBeenCalled();

    const submitted = telemetry.getEventsByType('form_submitted');
    expect(submitted).toHaveLength(1);
    expect(submitted[0].success).toBe(true);
    expect(submitted[0].errorCount).toBe(0);
  });

  it('records form_abandoned when dirty form is reset', () => {
    const telemetry = new MemoryTelemetryAdapter();
    const manager = new FormManager<{ username: string }>({
      formId: 'abandon_test',
      telemetry,
      fields: {
        username: {
          type: 'text',
          defaultValue: '',
        },
      },
      onSubmit: vi.fn(),
    });

    manager.setFieldValue('username', 'started_typing');
    manager.reset();

    const abandoned = telemetry.getEventsByType('form_abandoned');
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0].formId).toBe('abandon_test');
  });

  it('wires telemetry cleanly through single-step ExperimentFormHydrator', () => {
    const telemetry = new MemoryTelemetryAdapter();
    const testSchema: FormSchema = {
      id: 'single_step_experiment',
      version: '1.0.0',
      tenantId: 'default',
      pages: [
        {
          id: 'page_main',
          fields: [
            { id: 'f1', name: 'couponCode', type: 'text', label: 'Promo Code', required: false, order: 0 },
          ],
        },
      ],
    };

    const hydrated = ExperimentFormHydrator.hydrate({
      experimentKey: 'promo_banner_v1',
      baseSchema: testSchema,
      isMultiStep: false,
      experimentPort: {
        name: 'mock',
        getVariant: () => 'variant_free_gift',
      },
      context: { userId: 'usr_789' },
      onSubmit: vi.fn(),
      telemetry,
    });

    expect(hydrated.variantId).toBe('variant_free_gift');
    const mounted = telemetry.getEventsByType('form_mounted');
    expect(mounted).toHaveLength(1);
    expect(mounted[0].experimentLineage?.experimentKey).toBe('promo_banner_v1');
    expect(mounted[0].experimentLineage?.variantId).toBe('variant_free_gift');
  });
});
