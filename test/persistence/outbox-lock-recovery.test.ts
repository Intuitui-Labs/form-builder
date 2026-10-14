import { describe, it, expect, vi } from 'vitest';
import { OfflineOutboxQueue } from '../../src/persistence/OfflineOutboxQueue.js';
import { MemoryStorageAdapter } from '../../src/adapters/storage/MemoryStorageAdapter.js';
import { AlwaysOnlineNetworkAdapter } from '../../src/adapters/network/AlwaysOnlineNetworkAdapter.js';
import type { ITransportPort, SubmissionReceipt } from '../../src/ports/ITransportPort.js';

describe('OfflineOutboxQueue - Hostile Lock Recovery & Heartbeat', () => {
  it('guarantees lock release and isFlushing reset via finally block even if transport crashes violently', async () => {
    const storage = new MemoryStorageAdapter();
    const transport: ITransportPort = {
      submit: vi.fn().mockRejectedValue(new Error('Violent transport unhandled panic')),
    };

    const queue = new OfflineOutboxQueue({
      storage,
      networkStatus: new AlwaysOnlineNetworkAdapter(),
      transport,
      storageKey: 'hostile_outbox',
      autoFlushOnReconnect: false,
    });

    // Enqueue an envelope with offline network mock
    await storage.setItem(
      'hostile_outbox',
      JSON.stringify([
        {
          envelope: {
            id: 'env_fatal_1',
            formId: 'fatal_form',
            values: { test: true },
            submittedAt: new Date().toISOString(),
            retryCount: 0,
          },
          queuedAt: Date.now(),
        },
      ]),
    );

    // Call flush; transport will reject
    const delivered = await queue.flush();
    expect(delivered).toBe(0);

    // Lock MUST be released
    const activeLock = await storage.getItem('hostile_outbox_flush_lock');
    expect(activeLock).toBeNull();

    // isFlushing must be reset so subsequent attempts are not blocked
    const subsequentFlush = await queue.flush();
    expect(subsequentFlush).toBe(0); // Attempted again rather than blocked by isFlushing mutex
  });

  it('heartbeats lock renewal during multi-envelope batches taking over 5000ms', async () => {
    let mockTime = 10000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

    const storage = new MemoryStorageAdapter();
    let initialLockTime: number = 0;
    let heartbeatedLockTime: number = 0;

    const transport: ITransportPort = {
      submit: vi.fn().mockImplementation(async (envelope) => {
        if (envelope.id === 'item_1') {
          initialLockTime = parseInt((await storage.getItem('heartbeat_outbox_flush_lock')) ?? '0', 10);
          mockTime += 6000;
        } else if (envelope.id === 'item_2') {
          heartbeatedLockTime = parseInt((await storage.getItem('heartbeat_outbox_flush_lock')) ?? '0', 10);
        }
        return { receiptId: `rcpt_${envelope.id}`, status: 'synced', timestamp: 'now' } as SubmissionReceipt;
      }),
    };

    const queue = new OfflineOutboxQueue({
      storage,
      networkStatus: new AlwaysOnlineNetworkAdapter(),
      transport,
      storageKey: 'heartbeat_outbox',
      autoFlushOnReconnect: false,
    });

    await storage.setItem(
      'heartbeat_outbox',
      JSON.stringify([
        {
          envelope: { id: 'item_1', formId: 'f', values: {}, submittedAt: 'now', retryCount: 0 },
          queuedAt: 10000,
        },
        {
          envelope: { id: 'item_2', formId: 'f', values: {}, submittedAt: 'now', retryCount: 0 },
          queuedAt: 10000,
        },
      ]),
    );

    const delivered = await queue.flush();
    expect(delivered).toBe(2);
    expect(transport.submit).toHaveBeenCalledTimes(2);
    expect(initialLockTime).toBe(10000);
    expect(heartbeatedLockTime).toBe(16000);

    // Verify lock is completely cleared after flush completes
    const finalLock = await storage.getItem('heartbeat_outbox_flush_lock');
    expect(finalLock).toBeNull();

    nowSpy.mockRestore();
  });
});
