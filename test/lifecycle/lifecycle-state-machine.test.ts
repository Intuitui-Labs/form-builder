import { describe, it, expect, vi } from 'vitest';
import { FormLifecycleMachine } from '../../src/core/state/FormLifecycleMachine.js';
import type { FormLifecycleEvent, FormLifecycleContext } from '../../src/core/state/FormLifecycleTypes.js';

describe('FormLifecycleMachine - Formal Finite State Machine Kernel', () => {
  it('initializes in unhydrated phase and transitions to idle on HYDRATE_SUCCESS', () => {
    const machine = new FormLifecycleMachine<{ name: string }>({
      initialValues: { name: 'Initial' },
    });

    expect(machine.getPhase()).toBe('unhydrated');
    expect(machine.getContext().values.name).toBe('Initial');

    // Attempting navigation while unhydrated must be rejected by guard
    expect(machine.can('STEP_NEXT')).toBe(false);
    expect(machine.can('SUBMIT_START')).toBe(false);

    const hydrateResult = machine.send({
      type: 'HYDRATE_SUCCESS',
      draft: {
        schemaId: 'test-form',
        version: '1.0.0',
        activePageIndex: 0,
        completedPageIndices: [],
        stepHistory: [0],
        branchLineage: {},
        branchTargetHistory: {},
        values: { name: 'Restored Draft' },
        updatedAt: new Date().toISOString(),
      },
    });

    expect(hydrateResult.accepted).toBe(true);
    expect(machine.getPhase()).toBe('idle');
    expect(machine.getContext().values.name).toBe('Restored Draft');
  });

  it('autoHydrate option starts directly in idle phase', () => {
    const machine = new FormLifecycleMachine({ autoHydrate: true });
    expect(machine.getPhase()).toBe('idle');
    expect(machine.can('STEP_NEXT')).toBe(true);
  });

  it('tracks field focus, change, and blur events with dwell time', () => {
    const machine = new FormLifecycleMachine<{ email: string }>({ autoHydrate: true });

    machine.send({ type: 'FIELD_FOCUS', field: 'email' });
    expect(machine.getContext().activeFocusedField).toBe('email');

    machine.send({ type: 'FIELD_CHANGE', field: 'email', value: 'alice@example.com' });
    expect(machine.getContext().values.email).toBe('alice@example.com');
    expect(machine.getPhase()).toBe('idle');

    machine.send({ type: 'FIELD_BLUR', field: 'email', dwellMs: 1450 });
    expect(machine.getContext().touched.email).toBe(true);
    expect(machine.getContext().activeFocusedField).toBeUndefined();
  });

  it('advances steps cleanly and tracks history and completion', () => {
    const machine = new FormLifecycleMachine({ autoHydrate: true, initialStepIndex: 0 });

    const stepResult = machine.send({ type: 'STEP_NEXT' });
    expect(stepResult.accepted).toBe(true);
    expect(machine.getContext().activeStepIndex).toBe(1);
    expect(machine.getContext().stepHistory).toEqual([0, 1]);
    expect(machine.getContext().completedStepIndices.has(0)).toBe(true);

    // Prev step pops back
    const prevResult = machine.send({ type: 'STEP_PREV' });
    expect(prevResult.accepted).toBe(true);
    expect(machine.getContext().activeStepIndex).toBe(0);
  });

  it('guards against double-submit race conditions', () => {
    const machine = new FormLifecycleMachine({ autoHydrate: true });

    const firstSubmit = machine.send({ type: 'SUBMIT_START' });
    expect(firstSubmit.accepted).toBe(true);
    expect(machine.getPhase()).toBe('submitting');

    // Repeated submit and field mutations while in submitting phase MUST be rejected
    expect(machine.can('SUBMIT_START')).toBe(false);
    expect(machine.can('STEP_NEXT')).toBe(false);
    expect(machine.can('FIELD_CHANGE')).toBe(false);

    const changeAttempt = machine.send({ type: 'FIELD_CHANGE', field: 'any' as any, value: 'hack' });
    expect(changeAttempt.accepted).toBe(false);
    expect(machine.getPhase()).toBe('submitting');

    const secondSubmit = machine.send({ type: 'SUBMIT_START' });
    expect(secondSubmit.accepted).toBe(false);
    expect(secondSubmit.reason).toContain('rejected in phase');

    // Successfully complete submission
    const finish = machine.send({ type: 'SUBMIT_SUCCESS', receiptId: 'rcpt_992' });
    expect(finish.accepted).toBe(true);
    expect(machine.getPhase()).toBe('submitted');
  });

  it('handles offline submission and outbox lifecycle transition', () => {
    const machine = new FormLifecycleMachine({ autoHydrate: true, isOnline: false });

    machine.send({ type: 'SUBMIT_START' });
    const offlineTransition = machine.send({ type: 'SUBMIT_OFFLINE', outboxId: 'box_offline_123' });
    expect(offlineTransition.accepted).toBe(true);
    expect(machine.getPhase()).toBe('outbox_queued');
    expect(machine.getContext().pendingOutboxCount).toBe(1);

    // Sync starts
    machine.send({ type: 'OUTBOX_SYNC_START' });
    expect(machine.getPhase()).toBe('outbox_syncing');

    // Sync finishes
    machine.send({ type: 'OUTBOX_SYNC_SUCCESS' });
    expect(machine.getPhase()).toBe('submitted');
    expect(machine.getContext().pendingOutboxCount).toBe(0);
  });

  it('records chronological audit trail and dispatches listener notifications', () => {
    const machine = new FormLifecycleMachine<{ plan: string }>({ autoHydrate: true });
    const listener = vi.fn();
    const unsubscribe = machine.subscribe(listener);

    machine.send({ type: 'FIELD_CHANGE', field: 'plan', value: 'enterprise' });
    machine.send({ type: 'STEP_NEXT' });

    expect(listener).toHaveBeenCalledTimes(2);
    const trail = machine.getAuditTrail();
    expect(trail.length).toBe(2);
    expect(trail[0].type).toBe('FIELD_CHANGE');
    expect(trail[1].type).toBe('STEP_NEXT');

    unsubscribe();
    machine.send({ type: 'STEP_PREV' });
    expect(listener).toHaveBeenCalledTimes(2); // No new calls after unsubscribe
  });
});
