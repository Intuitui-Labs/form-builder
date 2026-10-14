import { describe, it, expect, vi } from 'vitest';
import { MultiStepFormManager } from '../../src/manager/MultiStepFormManager.js';
import type { FormSchema } from '../../src/schema/FormSchema.js';
import { XStateLifecycleAdapter } from '../../src/adapters/xstate/XStateLifecycleAdapter.js';
import { MemoryStorageAdapter } from '../../src/adapters/storage/MemoryStorageAdapter.js';

describe('MultiStepFormManager & FormLifecycleMachine Integration', () => {
  const testSchema: FormSchema = {
    id: 'checkout-flow',
    title: 'Checkout Flow',
    version: '1.0.0',
    pages: [
      {
        id: 'step-1',
        title: 'Account Info',
        fields: [
          {
            id: 'f1',
            name: 'email',
            type: 'email',
            label: 'Email',
            required: true,
          },
        ],
      },
      {
        id: 'step-2',
        title: 'Shipping Info',
        fields: [
          {
            id: 'f2',
            name: 'address',
            type: 'text',
            label: 'Address',
            required: true,
          },
        ],
      },
    ],
  };

  it('initializes default FormLifecycleMachine and tracks idle phase', () => {
    const manager = new MultiStepFormManager(testSchema, () => {});
    expect(manager.getLifecyclePhase()).toBe('idle');

    const port = manager.getLifecyclePort();
    expect(port).toBeDefined();
    expect(port.getContext().activeStepIndex).toBe(0);
  });

  it('tracks step advancement in lifecycle audit trail', () => {
    const manager = new MultiStepFormManager(testSchema, () => {});

    manager.getFormManager().setFieldValue('email', 'alice@example.com');
    const advanced = manager.nextStep();
    expect(advanced).toBe(true);
    expect(manager.getCurrentPageIndex()).toBe(1);

    const auditTrail = manager.getLifecycleAuditTrail();
    const nextEvents = auditTrail.filter((e) => e.type === 'STEP_NEXT');
    expect(nextEvents.length).toBe(1);
    expect((nextEvents[0] as any).nextIndex).toBe(1);

    // Prev step
    manager.prevStep();
    expect(manager.getCurrentPageIndex()).toBe(0);
    const prevEvents = manager.getLifecycleAuditTrail().filter((e) => e.type === 'STEP_PREV');
    expect(prevEvents.length).toBe(1);
  });

  it('records draft save and restore in lifecycle machine', async () => {
    const storage = new MemoryStorageAdapter();
    const manager = new MultiStepFormManager(testSchema, () => {}, { storage });

    manager.getFormManager().setFieldValue('email', 'bob@example.com');
    const snapshot = manager.saveDraft();
    expect(snapshot).toBeDefined();

    const auditTrail = manager.getLifecycleAuditTrail();
    const draftEvents = auditTrail.filter((e) => e.type === 'DRAFT_SAVED');
    expect(draftEvents.length).toBe(1);

    // New manager restoring draft
    const manager2 = new MultiStepFormManager(testSchema, () => {}, { storage });
    await manager2.restoreDraft(snapshot);

    const audit2 = manager2.getLifecycleAuditTrail();
    const hydrateEvents = audit2.filter((e) => e.type === 'HYDRATE_SUCCESS');
    expect(hydrateEvents.length).toBe(1);
    expect(manager2.getFormManager().getState().values.email).toBe('bob@example.com');
  });

  it('manages submission lifecycle through submitting to submitted phases', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const manager = new MultiStepFormManager(testSchema, onSubmit);

    // Step 1
    manager.getFormManager().setFieldValue('email', 'charlie@example.com');
    manager.nextStep();

    // Step 2
    manager.getFormManager().setFieldValue('address', '123 Test St');

    await manager.submit();
    expect(onSubmit).toHaveBeenCalled();
    expect(manager.getLifecyclePhase()).toBe('submitted');

    const auditTrail = manager.getLifecycleAuditTrail();
    expect(auditTrail.some((e) => e.type === 'SUBMIT_START')).toBe(true);
    expect(auditTrail.some((e) => e.type === 'SUBMIT_SUCCESS')).toBe(true);
  });

  it('plugs seamlessly into XStateLifecycleAdapter when enterprise consumer requests it', () => {
    const xstateAdapter = new XStateLifecycleAdapter();
    const manager = new MultiStepFormManager(testSchema, () => {}, {
      lifecyclePort: xstateAdapter,
    });

    expect(manager.getLifecyclePort()).toBe(xstateAdapter);
    expect(manager.getLifecyclePhase()).toBe('idle');

    manager.getFormManager().setFieldValue('email', 'dana@example.com');
    manager.nextStep();
    expect(manager.getCurrentPageIndex()).toBe(1);

    expect(xstateAdapter.getAuditTrail().some((e) => e.type === 'STEP_NEXT')).toBe(true);
  });

  it('guarantees persistence affordance is projected directly from lifecycle context without shadow state', async () => {
    const storage = new MemoryStorageAdapter();
    const manager = new MultiStepFormManager(testSchema, () => {}, { storage });

    const port = manager.getLifecyclePort();
    expect(manager.isHydrated()).toBe(true);
    expect(manager.getAffordanceState().persistence.isHydrated).toBe(true);

    // Save draft
    manager.getFormManager().setFieldValue('email', 'eva@example.com');
    const snapshot = manager.saveDraft();

    // Verify lastSavedAt is directly projected from context
    expect(port.getContext().lastSavedAt).toBe(snapshot.savedAt);
    expect(manager.getAffordanceState().persistence.lastSavedAt).toBe(snapshot.savedAt);

    // Clear draft
    await manager.clearDraft();
    expect(port.getContext().lastSavedAt).toBeUndefined();
    expect(manager.getAffordanceState().persistence.lastSavedAt).toBeUndefined();
    expect(manager.getAffordanceState().persistence.hasSavedDraft).toBe(false);

    // Online toggle
    port.send({ type: 'ONLINE_CHANGE', isOnline: false });
    expect(port.getContext().isOnline).toBe(false);
    expect(manager.getAffordanceState().persistence.isOnline).toBe(false);

    // Outbox count change
    port.send({ type: 'OUTBOX_COUNT_CHANGE', count: 3 });
    expect(port.getContext().pendingOutboxCount).toBe(3);
    expect(manager.getAffordanceState().persistence.pendingOutboxCount).toBe(3);
  });
});
