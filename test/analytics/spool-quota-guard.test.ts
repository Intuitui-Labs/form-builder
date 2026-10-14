import { describe, it, expect, vi } from 'vitest';
import { BatchingTelemetryAdapter } from '../../src/adapters/telemetry/BatchingTelemetryAdapter.js';
import { MemoryStorageAdapter } from '../../src/adapters/storage/MemoryStorageAdapter.js';
import { MultiStepFormManager } from '../../src/manager/MultiStepFormManager.js';
import type { FormSchema } from '../../src/schema/FormSchema.js';
import type { FormTelemetryEvent } from '../../src/ports/ITelemetryPort.js';

describe('Telemetry Spool Quota Guard & Session Continuity', () => {
  it('strictly caps disk spool buffer to maxSpoolSize via FIFO eviction preventing quota overflow', async () => {
    const storage = new MemoryStorageAdapter();
    const onFlush = vi.fn().mockRejectedValue(new Error('Backend offline'));

    const adapter = new BatchingTelemetryAdapter({
      batchSize: 500, // Do not auto-flush by size
      flushIntervalMs: 0, // Manual flush only
      storage,
      storageKey: 'telemetry_bounded_spool',
      maxSpoolSize: 30, // Cap disk spool to 30 events
      onFlush,
    });

    // Dispatch 100 events
    for (let i = 0; i < 100; i++) {
      adapter.dispatch({
        type: 'field_focused',
        formId: 'quota_form',
        stepIndex: 0,
        fieldName: `f_${i}`,
        timestamp: 1000 + i,
      });
    }

    // Verify disk storage has exactly 30 items (oldest 70 evicted)
    const rawDisk = await storage.getItem('telemetry_bounded_spool');
    expect(rawDisk).not.toBeNull();
    const diskItems: FormTelemetryEvent[] = JSON.parse(rawDisk!);
    expect(diskItems.length).toBe(30);

    // Oldest surviving item is item 70
    expect((diskItems[0] as any).fieldName).toBe('f_70');
    // Newest is item 99
    expect((diskItems[29] as any).fieldName).toBe('f_99');

    // Attempt flush that fails -> catch re-queue also caps at 30
    await adapter.flush();
    const rawDiskAfterFailedFlush = await storage.getItem('telemetry_bounded_spool');
    const diskItemsAfter = JSON.parse(rawDiskAfterFailedFlush!);
    expect(diskItemsAfter.length).toBe(30);
  });

  it('injects continuous sessionId across all form lifecycle telemetry events', () => {
    const events: FormTelemetryEvent[] = [];
    const schema: FormSchema = {
      id: 'session-continuity-form',
      title: 'Session Test',
      pages: [
        {
          id: 'step-1',
          title: 'Step 1',
          fields: [{ id: 'f1', name: 'firstName', type: 'text', required: true }],
        },
        {
          id: 'step-2',
          title: 'Step 2',
          fields: [{ id: 'f2', name: 'lastName', type: 'text', required: true }],
        },
      ],
    };

    const telemetry = {
      name: 'TestTelemetry',
      dispatch: (evt: FormTelemetryEvent) => {
        events.push(evt);
      },
    };

    const manager = new MultiStepFormManager(schema, () => {}, {
      experience: {
        telemetry,
        sessionId: 'custom_session_42',
      },
    });

    expect(manager.getSessionId()).toBe('custom_session_42');

    // Fill field and navigate
    manager.getFormManager().setFieldValue('firstName', 'Alice');
    manager.nextStep();

    // Verify all recorded events received the continuous sessionId
    expect(events.length).toBeGreaterThan(0);
    for (const evt of events) {
      expect(evt.sessionId).toBe('custom_session_42');
      expect(evt.formId).toBe('session-continuity-form');
    }
  });
});
