import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MemoryStorageAdapter,
  WebStorageAdapter,
  AlwaysOnlineNetworkAdapter,
  WebNetworkStatusAdapter,
  CallbackTransportAdapter,
} from '../src/adapters/index.js';
import type { IStoragePort, INetworkStatusPort, SubmissionEnvelope } from '../src/ports/index.js';
import { DraftManager } from '../src/persistence/DraftManager.js';
import { OfflineOutboxQueue } from '../src/persistence/OfflineOutboxQueue.js';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import type { FormSchema } from '../src/schema/FormSchema.js';

describe('Storage & Network Adapters', () => {
  it('MemoryStorageAdapter provides synchronous/asynchronous key-value store', async () => {
    const storage = new MemoryStorageAdapter();
    expect(await storage.getItem('key1')).toBeNull();

    await storage.setItem('key1', 'value1');
    expect(await storage.getItem('key1')).toBe('value1');
    expect(await storage.getAllKeys()).toContain('key1');

    await storage.removeItem('key1');
    expect(await storage.getItem('key1')).toBeNull();
  });

  it('WebStorageAdapter gracefully falls back to in-memory store in non-DOM / restricted environment', async () => {
    const storage = new WebStorageAdapter('localStorage');
    await storage.setItem('testKey', 'testVal');
    expect(await storage.getItem('testKey')).toBe('testVal');
    await storage.removeItem('testKey');
    expect(await storage.getItem('testKey')).toBeNull();
  });

  it('AlwaysOnlineNetworkAdapter reports online and allows subscriptions', () => {
    const net = new AlwaysOnlineNetworkAdapter();
    expect(net.isOnline()).toBe(true);
    const cb = vi.fn();
    const unsub = net.subscribe(cb);
    unsub();
  });

  it('CallbackTransportAdapter wraps onSubmit callback and returns delivery receipt', async () => {
    const onSubmit = vi.fn();
    const transport = new CallbackTransportAdapter(onSubmit);

    const envelope: SubmissionEnvelope = {
      id: 'sub-123',
      formId: 'form-test',
      values: { name: 'Alice' },
      submittedAt: new Date().toISOString(),
      retryCount: 0,
    };

    const receipt = await transport.submit(envelope);
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Alice' }, envelope);
    expect(receipt.receiptId).toBe('sub-123');
    expect(receipt.status).toBe('synced');
  });
});

describe('DraftManager (Debounced Auto-Saving & Snapshot Storage)', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  it('debounces rapid write calls into a single durable store write', async () => {
    const draftManager = new DraftManager({ storage, debounceMs: 50 });

    const baseSnapshot = {
      schemaId: 'user-profile',
      schemaVersion: '1.0',
      savedAt: new Date().toISOString(),
      currentPageIndex: 0,
      completedStepIndices: [],
      stepHistory: [0],
      branchLineage: [],
      branchTargetHistory: [],
      isSubmitted: false,
    };

    const setItemSpy = vi.spyOn(storage, 'setItem');

    // Simulate rapid typing: 3 calls in rapid succession
    draftManager.scheduleAutoSave({ ...baseSnapshot, values: { name: 'A' } });
    draftManager.scheduleAutoSave({ ...baseSnapshot, values: { name: 'Al' } });
    draftManager.scheduleAutoSave({ ...baseSnapshot, values: { name: 'Alice' } });

    // Not written yet before debounce duration
    expect(setItemSpy).not.toHaveBeenCalled();

    // Wait for debounce duration
    await new Promise((res) => setTimeout(res, 80));

    expect(setItemSpy).toHaveBeenCalledTimes(1);

    const loaded = await draftManager.loadDraft('user-profile');
    expect(loaded?.values).toEqual({ name: 'Alice' });
  });

  it('flush() immediately persists any pending debounced draft', async () => {
    const draftManager = new DraftManager({ storage, debounceMs: 500 });

    draftManager.scheduleAutoSave({
      schemaId: 'user-profile',
      schemaVersion: '1.0',
      savedAt: new Date().toISOString(),
      currentPageIndex: 1,
      completedStepIndices: [0],
      stepHistory: [0, 1],
      branchLineage: [],
      branchTargetHistory: [],
      values: { email: 'test@example.com' },
      isSubmitted: false,
    });

    await draftManager.flush();

    const loaded = await draftManager.loadDraft('user-profile');
    expect(loaded?.values).toEqual({ email: 'test@example.com' });
    expect(await draftManager.hasDraft('user-profile')).toBe(true);

    await draftManager.clearDraft('user-profile');
    expect(await draftManager.hasDraft('user-profile')).toBe(false);
  });
});

describe('OfflineOutboxQueue (14-day TTL, 50-Item Capacity, Backoff & Reconnect)', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  it('enqueues submission when offline and updates syncStatus to offline-queued', async () => {
    const offlineNet: INetworkStatusPort = {
      isOnline: () => false,
      subscribe: () => () => {},
    };

    const outbox = new OfflineOutboxQueue({
      storage,
      networkStatus: offlineNet,
    });

    const envelope: SubmissionEnvelope = {
      id: 'sub-001',
      formId: 'registration',
      values: { username: 'testuser' },
      submittedAt: new Date().toISOString(),
      retryCount: 0,
    };

    const res = await outbox.enqueue(envelope);
    expect(res.status).toBe('queued');
    expect(outbox.getSyncStatus()).toBe('offline-queued');
    expect(await outbox.getPendingCount()).toBe(1);
  });

  it('retains pending submissions beyond the former 14-day TTL', async () => {
    const outbox = new OfflineOutboxQueue({
      storage,
      ttlMs: 100, // 100ms TTL for testing
    });

    const envelope: SubmissionEnvelope = {
      id: 'expired-sub',
      formId: 'registration',
      values: { val: 1 },
      submittedAt: new Date().toISOString(),
      retryCount: 0,
    };

    await outbox.enqueue(envelope);
    expect(await outbox.getPendingCount()).toBe(1);

    // Waiting time alone cannot discard a response requiring delivery.
    await new Promise((res) => setTimeout(res, 120));

    expect(await outbox.getPendingCount()).toBe(1);
  });

  it('rejects new submissions at capacity without evicting saved responses', async () => {
    const outbox = new OfflineOutboxQueue({
      storage,
      networkStatus: { isOnline: () => false, subscribe: () => () => {} },
      maxQueueSize: 3, // Bound to 3 for testing
    });

    for (let i = 1; i <= 3; i++) {
      await outbox.enqueue({
        id: `sub-${i}`,
        formId: 'test',
        values: { i },
        submittedAt: new Date().toISOString(),
        retryCount: 0,
      });
    }
    await expect(outbox.enqueue({
      id: 'sub-4', formId: 'test', values: { i: 4 },
      submittedAt: new Date().toISOString(), retryCount: 0,
    })).rejects.toThrow('queue is full');
    expect(await outbox.getPendingCount()).toBe(3);
  });

  it('durably stores an intent before attempting its transport', async () => {
    let durable = false;
    const storage = {
      getItem: async () => null,
      setItem: async () => { durable = true; },
      removeItem: async () => {},
    };
    const outbox = new OfflineOutboxQueue({
      storage,
      transport: {
        submit: async () => {
          expect(durable).toBe(true);
          throw Object.assign(new Error('network interrupted'), { status: 0, retryable: true });
        },
      },
    });

    const result = await outbox.enqueue({
      id: 'persist-before-send', formId: 'survey', values: { answer: 1 },
      submittedAt: new Date().toISOString(), retryCount: 0,
    });
    expect(result.status).toBe('queued');
    expect(durable).toBe(true);
  });

  it('automatically flushes queued submissions upon network reconnection', async () => {
    let currentOnline = false;
    let netCallback: ((online: boolean) => void) | null = null;

    const mockNet: INetworkStatusPort = {
      isOnline: () => currentOnline,
      subscribe: (cb) => {
        netCallback = cb;
        return () => {
          netCallback = null;
        };
      },
    };

    const submitSpy = vi.fn().mockResolvedValue({ receiptId: 'ok', status: 'synced', timestamp: '' });
    const transport = { submit: submitSpy };

    const outbox = new OfflineOutboxQueue({
      storage,
      networkStatus: mockNet,
      transport,
      autoFlushOnReconnect: true,
    });

    // Enqueue while offline
    await outbox.enqueue({
      id: 'offline-001',
      formId: 'order',
      values: { item: 'Laptop' },
      submittedAt: new Date().toISOString(),
      retryCount: 0,
    });

    expect(await outbox.getPendingCount()).toBe(1);
    expect(submitSpy).not.toHaveBeenCalled();

    // Simulate network reconnection!
    currentOnline = true;
    if (netCallback) {
      netCallback(true);
    }

    // Allow async flush loop to deliver
    await new Promise((res) => setTimeout(res, 30));

    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(await outbox.getPendingCount()).toBe(0);
    expect(outbox.getSyncStatus()).toBe('synced');
  });
});

describe('MultiStepFormManager Integration with Host Ports & Affordances', () => {
  const schema: FormSchema = {
    v: '1.0',
    id: 'lead-qualification',
    tenantId: 'tenant-enterprise',
    title: 'Lead Qualification',
    pages: [
      {
        id: 'step-contact',
        title: 'Contact',
        fields: [
          { id: 'f1', name: 'email', type: 'email', label: 'Email', required: true, order: 0 },
        ],
      },
      {
        id: 'step-company',
        title: 'Company',
        fields: [
          { id: 'f2', name: 'company', type: 'text', label: 'Company', required: true, order: 0 },
        ],
      },
    ],
    settings: {
      affordanceConfig: {
        allowSaveAndResumeLater: true,
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('allows host app to inject custom storage (mocking MMKV / SQLite)', async () => {
    const hostStorageMap = new Map<string, string>();
    const hostStorage: IStoragePort = {
      getItem: (key) => hostStorageMap.get(key) ?? null,
      setItem: (key, val) => {
        hostStorageMap.set(key, val);
      },
      removeItem: (key) => {
        hostStorageMap.delete(key);
      },
    };

    const manager = new MultiStepFormManager(schema, vi.fn(), {
      resilience: { storage: hostStorage },
    });

    manager.getFormManager().setFieldValue('email', 'lead@acme.com');
    manager.saveDraft();

    expect(await manager.hasSavedDraft()).toBe(true);
    expect(hostStorageMap.size).toBeGreaterThan(0);

    // Create fresh manager with same host storage
    const freshManager = new MultiStepFormManager(schema, vi.fn(), {
      resilience: { storage: hostStorage },
    });

    expect(await freshManager.hasSavedDraft()).toBe(true);
    await freshManager.restoreDraft();
    expect(freshManager.getFormManager().getState().values.email).toBe('lead@acme.com');
  });

  it('supports automatic draft restoration on mount when autoRestoreDraft is true (Decision A1)', async () => {
    const storage = new MemoryStorageAdapter();

    // 1. First session saves draft
    const session1 = new MultiStepFormManager(schema, vi.fn(), {
      resilience: { storage },
    });
    session1.getFormManager().setFieldValue('email', 'auto@acme.com');
    session1.saveDraft();

    // 2. Second session mounts with autoRestoreDraft: true
    const session2 = new MultiStepFormManager(schema, vi.fn(), {
      resilience: {
        storage,
        autoRestoreDraft: true,
      },
    });

    // Wait for mount check
    await new Promise((res) => setTimeout(res, 20));

    expect(session2.getFormManager().getState().values.email).toBe('auto@acme.com');
  });

  it('reflects persistence affordance state (hasSavedDraft, pendingOutboxCount, isOnline, syncStatus)', async () => {
    let isOnline = true;
    const net: INetworkStatusPort = {
      isOnline: () => isOnline,
      subscribe: () => () => {},
    };

    const storage = new MemoryStorageAdapter();
    const onSubmit = vi.fn();

    const manager = new MultiStepFormManager(schema, onSubmit, {
      resilience: {
        storage,
        networkStatus: net,
      },
    });

    const affordance = manager.getAffordanceState();
    expect(affordance.persistence).toBeDefined();
    expect(affordance.persistence?.isOnline).toBe(true);
    expect(affordance.persistence?.syncStatus).toBe('idle');

    // Fill form and save draft
    manager.getFormManager().setFieldValue('email', 'affordance@acme.com');
    manager.nextStep();
    manager.getFormManager().setFieldValue('company', 'Acme Corp');

    // Toggle offline
    isOnline = false;

    // Submit while offline -> enqueues to outbox
    await manager.submit();

    expect(onSubmit).not.toHaveBeenCalled();
    const offlineAffordance = manager.getAffordanceState();
    expect(offlineAffordance.persistence?.syncStatus).toBe('offline-queued');
    expect(offlineAffordance.persistence?.pendingOutboxCount).toBe(1);

    // Toggle online and flush outbox
    isOnline = true;
    const flushed = await manager.flushOutbox();
    expect(flushed).toBe(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    const onlineAffordance = manager.getAffordanceState();
    expect(onlineAffordance.persistence?.syncStatus).toBe('synced');
    expect(onlineAffordance.persistence?.pendingOutboxCount).toBe(0);
  });
});
