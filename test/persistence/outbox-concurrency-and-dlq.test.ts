import { describe, it, expect, vi } from 'vitest';
import { OfflineOutboxQueue } from '../../src/persistence/OfflineOutboxQueue.js';
import { MemoryStorageAdapter } from '../../src/adapters/storage/MemoryStorageAdapter.js';
import { AlwaysOnlineNetworkAdapter } from '../../src/adapters/network/AlwaysOnlineNetworkAdapter.js';
import type { ITransportPort, SubmissionEnvelope, SubmissionReceipt } from '../../src/ports/ITransportPort.js';

describe('OfflineOutboxQueue - Distributed Locking, Concurrency & DLQ Management', () => {
  it('prevents concurrent double-flush across multi-tab instances using lease lock', async () => {
    const sharedStorage = new MemoryStorageAdapter();
    const mockSubmit = vi.fn().mockResolvedValue({ receiptId: 'rcpt_1', status: 'synced', timestamp: 'now' } as SubmissionReceipt);
    const transport: ITransportPort = {
      submit: mockSubmit,
    };

    const worker1 = new OfflineOutboxQueue({
      storage: sharedStorage,
      networkStatus: { isOnline: () => false, subscribe: () => () => {} },
      transport,
      storageKey: 'shared_outbox',
      autoFlushOnReconnect: false,
    });

    const worker2 = new OfflineOutboxQueue({
      storage: sharedStorage,
      networkStatus: new AlwaysOnlineNetworkAdapter(),
      transport,
      storageKey: 'shared_outbox',
      autoFlushOnReconnect: false,
    });

    // Enqueue an envelope via worker 1 (storage offline simulation)
    await worker1.enqueue({
      id: 'env_1',
      formId: 'test_form',
      schemaVersion: '1.0',
      data: { name: 'John' },
      idempotencyKey: 'idem_1',
      submittedAt: Date.now(),
      retryCount: 0,
    });

    // Simulate worker 1 holding active lock
    await sharedStorage.setItem('shared_outbox_flush_lock', String(Date.now()));

    // Worker 2 attempts flush while lock is actively held -> must be blocked
    const worker2Delivered = await worker2.flush();
    expect(worker2Delivered).toBe(0);

    // Simulate worker 1 lock expired (> 10s ago)
    await sharedStorage.setItem('shared_outbox_flush_lock', String(Date.now() - 15000));

    // Worker 2 can now acquire lease and deliver
    const worker2DeliveredAfterExpiry = await worker2.flush();
    expect(worker2DeliveredAfterExpiry).toBe(1);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });

  it('caps DLQ to maximum 25 items and allows operator retrying dead envelopes', async () => {
    const storage = new MemoryStorageAdapter();
    const failingTransport: ITransportPort = {
      submit: vi.fn().mockRejectedValue({
        name: 'Error',
        message: 'Unprocessable Entity',
        status: 422,
        retryable: false,
      }),
    };

    const outbox = new OfflineOutboxQueue({
      storage,
      networkStatus: new AlwaysOnlineNetworkAdapter(),
      transport: failingTransport,
      storageKey: 'dlq_test_outbox',
      autoFlushOnReconnect: false,
    });

    // Enqueue 30 non-retryable 422 errors
    for (let i = 0; i < 30; i++) {
      try {
        await outbox.enqueue({
          id: `dead_env_${i}`,
          formId: 'form_x',
          schemaVersion: '1.0',
          data: { field: i },
          idempotencyKey: `idem_${i}`,
          submittedAt: Date.now(),
          retryCount: 0,
        });
      } catch {
        // Expected throw for non-retryable 422
      }
    }

    // DLQ must be capped at 25 items to protect local storage
    const dlq = await outbox.getDeadLetterQueue();
    expect(dlq.length).toBe(25);
    expect(dlq[dlq.length - 1].envelope.id).toBe('dead_env_29');

    // Operator retries an envelope from the DLQ
    const targetId = 'dead_env_29';
    const retried = await outbox.retryDeadLetter(targetId);
    expect(retried).toBe(true);

    // Should now be removed from DLQ and placed in active pending queue
    const updatedDlq = await outbox.getDeadLetterQueue();
    expect(updatedDlq.length).toBe(24);
    expect(updatedDlq.some((i) => i.envelope.id === targetId)).toBe(false);

    const pendingCount = await outbox.getPendingCount();
    expect(pendingCount).toBe(1);
  });
});
