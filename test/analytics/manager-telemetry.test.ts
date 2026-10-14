import { describe, it, expect, vi } from 'vitest';
import {
  MultiStepFormManager,
  MemoryTelemetryAdapter,
  type FormSchema,
} from '../../src/index.js';

describe('MultiStepFormManager Telemetry Lifecycle Integration', () => {
  const testSchema: FormSchema = {
    id: 'checkout_flow',
    version: '2.1.0',
    tenantId: 'tenant_ecommerce',
    pages: [
      {
        id: 'step_profile',
        title: 'Profile Information',
        fields: [
          {
            id: 'email',
            name: 'email',
            type: 'email',
            label: 'Email Address',
            required: true,
            order: 0,
            rules: [{ type: 'required' }, { type: 'email' }],
          },
        ],
      },
      {
        id: 'step_confirm',
        title: 'Confirmation',
        fields: [
          {
            id: 'termsAccepted',
            name: 'termsAccepted',
            type: 'boolean',
            label: 'I accept terms',
            required: true,
            order: 0,
            rules: [{ type: 'required' }],
          },
        ],
      },
    ],
  };

  it('automatically dispatches form_mounted and step_viewed upon manager creation', () => {
    const telemetry = new MemoryTelemetryAdapter();

    new MultiStepFormManager(testSchema, vi.fn(), {
      experience: { telemetry },
    });

    const events = telemetry.getEvents();
    expect(events.length).toBeGreaterThanOrEqual(2);

    expect(events[0]).toMatchObject({
      type: 'form_mounted',
      formId: 'checkout_flow',
      schemaVersion: '2.1.0',
      totalSteps: 2,
    });

    expect(events[1]).toMatchObject({
      type: 'step_viewed',
      formId: 'checkout_flow',
      stepIndex: 0,
      stepId: 'step_profile',
      stepTitle: 'Profile Information',
    });
  });

  it('records field_error when validation fails during step progression', async () => {
    const telemetry = new MemoryTelemetryAdapter();
    const manager = new MultiStepFormManager(testSchema, vi.fn(), {
      experience: { telemetry },
    });

    // Attempt to proceed without filling required email
    const canAdvance = await manager.nextStep();
    expect(canAdvance).toBe(false);

    const errorEvents = telemetry.getEvents().filter((e) => e.type === 'field_error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]).toMatchObject({
      type: 'field_error',
      formId: 'checkout_flow',
      stepIndex: 0,
      fieldName: 'email',
      errorRule: 'required',
    });
  });

  it('records step_completed and new step_viewed when successfully moving to next step', async () => {
    const telemetry = new MemoryTelemetryAdapter();
    const manager = new MultiStepFormManager(testSchema, vi.fn(), {
      experience: { telemetry },
    });

    manager.setFieldValue('email' as any, 'valid@example.com');
    const advanced = await manager.nextStep();
    expect(advanced).toBe(true);

    const events = telemetry.getEvents();
    const stepCompleted = events.find((e) => e.type === 'step_completed');
    const secondStepViewed = events.find(
      (e) => e.type === 'step_viewed' && (e as any).stepIndex === 1,
    );

    expect(stepCompleted).toBeDefined();
    expect(stepCompleted).toMatchObject({
      type: 'step_completed',
      formId: 'checkout_flow',
      stepIndex: 0,
      stepId: 'step_profile',
    });

    expect(secondStepViewed).toBeDefined();
    expect(secondStepViewed).toMatchObject({
      type: 'step_viewed',
      formId: 'checkout_flow',
      stepIndex: 1,
      stepId: 'step_confirm',
    });
  });

  it('records form_submitted and flushes telemetry upon successful submission', async () => {
    const telemetry = new MemoryTelemetryAdapter();
    const flushSpy = vi.spyOn(telemetry, 'flush');
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    const manager = new MultiStepFormManager(testSchema, onSubmit, {
      experience: { telemetry },
    });

    manager.setFieldValue('email' as any, 'valid@example.com');
    await manager.nextStep();

    manager.setFieldValue('termsAccepted' as any, true);
    await manager.submit();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(flushSpy).toHaveBeenCalled();

    const submittedEvent = telemetry.getEvents().find((e) => e.type === 'form_submitted');
    expect(submittedEvent).toBeDefined();
    expect(submittedEvent).toMatchObject({
      type: 'form_submitted',
      formId: 'checkout_flow',
      success: true,
      errorCount: 0,
    });
  });

  it('preserves Zero-PII compliance: field focus, blur, and errors never leak sensitive values', () => {
    const telemetry = new MemoryTelemetryAdapter();
    const manager = new MultiStepFormManager(testSchema, vi.fn(), {
      experience: { telemetry },
    });

    const secret = 'super_secret_pii@financial.bank';
    manager.focusField('email' as any);
    manager.setFieldValue('email' as any, secret);
    manager.recordFieldBlur('email', 1500, true, secret.length);

    const events = telemetry.getEvents();
    const focusEvt = events.find((e) => e.type === 'field_focused');
    const blurEvt = events.find((e) => e.type === 'field_blurred');

    expect(focusEvt).toBeDefined();
    expect((focusEvt as any).value).toBeUndefined();

    expect(blurEvt).toBeDefined();
    expect((blurEvt as any).value).toBeUndefined();
    expect((blurEvt as any).hasValue).toBe(true);
    expect((blurEvt as any).valueLength).toBe(secret.length);
  });
});
