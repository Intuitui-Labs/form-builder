import { describe, it, expect, vi } from 'vitest';
import { MultiStepFormManager } from '../../src/manager/MultiStepFormManager.js';
import type { FormSchema } from '../../src/schema/FormSchema.js';
import { MemoryStorageAdapter } from '../../src/adapters/storage/MemoryStorageAdapter.js';
import type { INetworkStatusPort, ITransportPort, SubmissionEnvelope, SubmissionReceipt } from '../../src/ports/index.js';

describe('Hostile Chaos, Network Flapping & Adversarial Draft Resilience', () => {
  const testSchema: FormSchema = {
    id: 'chaos-checkout',
    title: 'Chaos Checkout',
    version: '1.0.0',
    pages: [
      {
        id: 'step-1',
        title: 'Step 1: Identity',
        fields: [
          { id: 'f1', name: 'email', type: 'email', label: 'Email', required: true },
        ],
        jumpRules: [
          {
            condition: { field: 'email', operator: 'contains', value: 'vip' },
            targetPageId: 'step-3',
          },
        ],
      },
      {
        id: 'step-2',
        title: 'Step 2: Standard Plan',
        fields: [
          { id: 'f2', name: 'standardCoupon', type: 'text', label: 'Coupon', required: false },
        ],
      },
      {
        id: 'step-3',
        title: 'Step 3: Confirmation',
        fields: [
          { id: 'f3', name: 'accepted', type: 'checkbox', label: 'Accept Terms', required: true },
        ],
      },
    ],
  };

  it('survives rapid network flapping during parallel outbox enqueue and flush cycles', async () => {
    let onlineState = false;
    const listeners = new Set<(online: boolean) => void>();
    const networkStatus: INetworkStatusPort = {
      isOnline: async () => onlineState,
      subscribe: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };

    const deliveredEnvelopes: SubmissionEnvelope[] = [];
    const transport: ITransportPort = {
      submit: async (envelope) => {
        if (!onlineState) {
          throw new Error('Socket drop: offline during transit');
        }
        deliveredEnvelopes.push(envelope);
        return {
          receiptId: `rcpt_${envelope.id}`,
          status: 'synced',
          timestamp: new Date().toISOString(),
        } as SubmissionReceipt;
      },
    };

    const storage = new MemoryStorageAdapter();
    const manager = new MultiStepFormManager(testSchema, vi.fn(), {
      resilience: {
        storage,
        transport,
        networkStatus,
        enableOutbox: true,
        autoSaveDraft: false,
      },
    });

    // 1. Fill step 1, advance to step 2, advance to step 3, and accept
    manager.setFieldValue('email' as any, 'regular@example.com');
    expect(manager.nextStep()).toBe(true);
    expect(manager.nextStep()).toBe(true);
    expect(manager.getCurrentPageIndex()).toBe(2);
    manager.setFieldValue('accepted' as any, true);

    // 2. Perform submission while offline -> guaranteed outbox enqueue
    onlineState = false;
    listeners.forEach((l) => l(false));

    await manager.submit();
    expect(manager.getLifecyclePhase()).toBe('outbox_queued');

    const outbox = manager.getOutboxQueue();
    expect(outbox).toBeDefined();
    const initialPending = await outbox!.getPendingCount();
    expect(initialPending).toBe(1);

    // 3. Flap network state rapidly while multiple concurrent flush attempts occur
    const flushAttempts: Promise<number>[] = [];
    for (let i = 0; i < 10; i++) {
      onlineState = i > 5; // Flap offline then restore online
      listeners.forEach((l) => l(onlineState));
      flushAttempts.push(manager.flushOutbox().catch(() => 0));
    }

    await Promise.allSettled(flushAttempts);

    // Ensure online is fully restored and perform final guaranteed sync
    onlineState = true;
    listeners.forEach((l) => l(true));
    await new Promise((r) => setTimeout(r, 20));
    await manager.flushOutbox();

    const pendingRemaining = await outbox!.getPendingCount();
    expect(pendingRemaining).toBe(0);
    expect(deliveredEnvelopes.length).toBe(1);
    expect(deliveredEnvelopes[0].formId).toBe(testSchema.id);
  });

  it('safely rejects poisoned or out-of-bounds draft snapshots without crashing state kernel', async () => {
    const storage = new MemoryStorageAdapter();
    const manager = new MultiStepFormManager(testSchema, vi.fn(), {
      resilience: { storage },
    });

    // Poisoned draft 1: Out-of-bounds active step index (index 999 on 3-page schema)
    const poisonedDraftOutOfBounds = {
      schemaId: testSchema.id,
      schemaVersion: '1.0.0',
      activeStepIndex: 999,
      stepHistory: [0, 999],
      completedStepIndices: [0],
      values: { email: 'hacker@chaos.org' },
      savedAt: new Date().toISOString(),
    };

    // Apply snapshot
    const restored1 = await manager.restoreDraft(poisonedDraftOutOfBounds as any);
    expect(restored1).toBe(true);

    // Engine must not crash and must clamp or resolve active step to a legal page
    const currentPageIndex = manager.getCurrentPageIndex();
    expect(currentPageIndex).toBeLessThan(testSchema.pages.length);
    expect(currentPageIndex).toBeGreaterThanOrEqual(0);

    // Poisoned draft 2: Mismatched schema ID (forged foreign schema draft injection)
    const forgedSchemaDraft = {
      schemaId: 'completely-different-alien-form-id',
      schemaVersion: '1.0.0',
      activeStepIndex: 1,
      values: { evilField: 'malicious-data' },
      savedAt: new Date().toISOString(),
    };

    const restored2 = await manager.restoreDraft(forgedSchemaDraft as any);
    // Must strictly reject foreign draft injection
    expect(restored2).toBe(false);
  });

  it('maintains strict causal audit trail integrity during rapid sequential jump-branch switching', () => {
    const manager = new MultiStepFormManager(testSchema, vi.fn());

    // Step 1 -> regular flow -> Step 2
    manager.setFieldValue('email' as any, 'regular@test.com');
    expect(manager.nextStep()).toBe(true);
    expect(manager.getCurrentPageIndex()).toBe(1);

    // Rewind back to Step 1
    expect(manager.prevStep()).toBe(true);
    expect(manager.getCurrentPageIndex()).toBe(0);

    // Trigger VIP branch jump to Step 3
    manager.setFieldValue('email' as any, 'vip@test.com');
    expect(manager.nextStep()).toBe(true);
    expect(manager.getCurrentPageIndex()).toBe(2);

    // Verify audit trail recorded strict sequence of STEP_NEXT -> STEP_PREV -> STEP_NEXT
    const auditTrail = manager.getLifecycleAuditTrail();
    const transitionTypes = auditTrail
      .filter((e) => e.type === 'STEP_NEXT' || e.type === 'STEP_PREV')
      .map((e) => e.type);

    expect(transitionTypes).toEqual(['STEP_NEXT', 'STEP_PREV', 'STEP_NEXT']);

    // Completed step indices must contain step 0 and not have zombie duplicates
    const port = manager.getLifecyclePort();
    expect(port.getContext().completedStepIndices.has(0)).toBe(true);
  });
});
