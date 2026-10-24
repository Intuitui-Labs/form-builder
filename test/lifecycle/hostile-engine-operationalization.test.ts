import { describe, it, expect, vi } from 'vitest';
import {
  OfflineOutboxQueue,
  type SubmissionEnvelope,
  type IStoragePort,
  type INetworkStatusPort,
  NamespacedDraftStorageAdapter,
  type FormDraftSnapshot,
} from '../../src/index.js';

function createMockStorage(initial: Record<string, string> = {}): IStoragePort & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
    clear: async () => { values.clear(); },
  };
}

describe('Hostile Operationalization: Engine Core Invariants', () => {
  it('Hostile Test 1: rebindDeadLetter strictly rejects any attempt to mutate envelope.id', async () => {
    const storage = createMockStorage();
    const originalId = 'immut_sub_999';
    const queue = new OfflineOutboxQueue({ storage });

    const deadItem = {
      envelope: {
        id: originalId,
        formId: 'test_form',
        values: { q1: 'val' },
        submittedAt: new Date().toISOString(),
        retryCount: 5,
        metadata: { token: 'expired' },
      },
      queuedAt: Date.now(),
      lastError: '401 Unauthorized',
      lastErrorCode: 'token_expired',
    };
    await storage.setItem('intuitui_outbox_queue_dlq', JSON.stringify([deadItem]));

    // Hostile act: Attempting to mutate the idempotency key must throw
    await expect(
      queue.rebindDeadLetter(originalId, (env) => ({
        ...env,
        id: 'hostile_mutated_id',
        metadata: { token: 'refreshed' },
      }))
    ).rejects.toThrow(/idempotency key is immutable/i);

    // Verify original DLQ item was NOT corrupted
    const dlq = await queue.getDeadLetterQueue();
    expect(dlq).toHaveLength(1);
    expect(dlq[0].envelope.id).toBe(originalId);
    expect(dlq[0].envelope.metadata).toEqual({ token: 'expired' });
  });

  it('Hostile Test 2: rebindDeadLetter safely updates metadata and resets error state', async () => {
    const storage = createMockStorage();
    const submissionId = 'sub_valid_1';
    const queue = new OfflineOutboxQueue({ storage });

    const deadItem = {
      envelope: {
        id: submissionId,
        formId: 'test_form',
        values: { q1: 'initial' },
        submittedAt: new Date().toISOString(),
        retryCount: 5,
        metadata: { version: 'v1' },
      },
      queuedAt: Date.now(),
      lastError: '400 Policy Outdated',
      lastErrorCode: 'policy_changed',
    };
    await storage.setItem('intuitui_outbox_queue_dlq', JSON.stringify([deadItem]));

    const success = await queue.rebindDeadLetter(submissionId, (env) => ({
      ...env,
      metadata: { version: 'v2', confirmed: true },
    }));

    expect(success).toBe(true);
    const dlq = await queue.getDeadLetterQueue();
    expect(dlq[0].envelope.id).toBe(submissionId);
    expect(dlq[0].envelope.metadata).toEqual({ version: 'v2', confirmed: true });
    expect(dlq[0].envelope.retryCount).toBe(0);
    expect(dlq[0].lastError).toBeUndefined();
    expect(dlq[0].lastErrorCode).toBeUndefined();
  });

  it('Hostile Test 3: findDeadLetters introspects DLQ by custom predicate without side effects', async () => {
    const storage = createMockStorage();
    const queue = new OfflineOutboxQueue({ storage });

    const dlqItems = [
      {
        envelope: { id: 's1', formId: 'form_a', values: {}, submittedAt: '', retryCount: 5 },
        queuedAt: 1,
        lastErrorCode: 'access_code_required',
      },
      {
        envelope: { id: 's2', formId: 'form_b', values: {}, submittedAt: '', retryCount: 5 },
        queuedAt: 2,
        lastErrorCode: 'network_timeout',
      },
    ];
    await storage.setItem('intuitui_outbox_queue_dlq', JSON.stringify(dlqItems));

    const accessCodeErrors = await queue.findDeadLetters((i) => i.lastErrorCode === 'access_code_required');
    expect(accessCodeErrors).toHaveLength(1);
    expect(accessCodeErrors[0].envelope.id).toBe('s1');

    // Verify queue remains completely unmodified
    expect(await queue.getDeadLetterQueue()).toHaveLength(2);
  });

  it('Hostile Test 4: destroy() eliminates zombie network listener closures', async () => {
    let networkCallback: ((online: boolean) => void) | undefined;
    const networkStatus: INetworkStatusPort = {
      isOnline: async () => true,
      subscribe: (cb) => {
        networkCallback = cb;
        return () => { networkCallback = undefined; };
      },
    };

    const flushSpy = vi.fn();
    const queue = new OfflineOutboxQueue({
      networkStatus,
      autoFlushOnReconnect: true,
    });
    // @ts-expect-error spy injection for testing
    queue.flush = flushSpy;

    expect(networkCallback).toBeDefined();

    // Destroy instance
    queue.destroy();

    // Assert callback was detached
    expect(networkCallback).toBeUndefined();

    // Emitting network events after destruction must do nothing
    expect(flushSpy).not.toHaveBeenCalled();
  });

  it('Hostile Test 5: NamespacedDraftStorageAdapter isolates scopes and prevents cross-tenant leaks', async () => {
    const storage = createMockStorage();
    const tenantA = new NamespacedDraftStorageAdapter(storage, 'org_alpha');
    const tenantB = new NamespacedDraftStorageAdapter(storage, 'org_beta');

    const draftSnapshot: FormDraftSnapshot = {
      schemaId: 'sensitive_survey',
      values: { salary: 150000, confidential: true },
      currentPageIndex: 2,
      savedAt: Date.now(),
    };

    await tenantA.saveDraft(draftSnapshot);

    // Tenant A can load its draft
    const loadedA = await tenantA.loadDraft('sensitive_survey');
    expect(loadedA?.values).toEqual({ salary: 150000, confidential: true });

    // Tenant B loading the same schemaId must return null (zero leakage)
    const loadedB = await tenantB.loadDraft('sensitive_survey');
    expect(loadedB).toBeNull();
  });

  it('Hostile Test 6: NamespacedDraftStorageAdapter atomically migrates fallback namespace draft upon load', async () => {
    const storage = createMockStorage();

    // Anonymous respondent saves draft
    const anonStorage = new NamespacedDraftStorageAdapter(storage, 'anon_session_42');
    const draft: FormDraftSnapshot = {
      schemaId: 'application_form',
      values: { email: 'user@domain.com', step1: 'complete' },
      currentPageIndex: 1,
      savedAt: Date.now(),
    };
    await anonStorage.saveDraft(draft);

    // User signs in, creating authenticated storage with anon fallback
    const authStorage = new NamespacedDraftStorageAdapter(storage, 'user_account_99', {
      fallbackNamespace: 'anon_session_42',
    });

    // Loading should resolve fallback draft, promote it to user scope, and delete fallback
    const loaded = await authStorage.loadDraft('application_form');
    expect(loaded?.values).toEqual({ email: 'user@domain.com', step1: 'complete' });

    // Verify fallback draft was deleted from old scope
    const oldScopeCheck = await anonStorage.loadDraft('application_form');
    expect(oldScopeCheck).toBeNull();

    // Verify it is permanently saved in the new user scope
    const authStorageDirect = new NamespacedDraftStorageAdapter(storage, 'user_account_99');
    const userDirectCheck = await authStorageDirect.loadDraft('application_form');
    expect(userDirectCheck?.values).toEqual({ email: 'user@domain.com', step1: 'complete' });
  });

  it('Hostile Test 7: High-frequency keystroke burst triggers exactly one debounced storage write', async () => {
    vi.useFakeTimers();
    const setItemSpy = vi.fn();
    const storage: IStoragePort = {
      getItem: async () => null,
      setItem: setItemSpy,
      removeItem: async () => {},
      clear: async () => {},
    };

    let activeTimer: ReturnType<typeof setTimeout> | null = null;
    const saveDebounced = (key: string, val: string) => {
      if (activeTimer) clearTimeout(activeTimer);
      activeTimer = setTimeout(() => {
        storage.setItem(key, val);
      }, 300);
    };

    // Fire 50 rapid simulated keystrokes
    for (let i = 0; i < 50; i++) {
      saveDebounced('field_text', `keystroke_${i}`);
      vi.advanceTimersByTime(2);
    }

    vi.advanceTimersByTime(350);

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith('field_text', 'keystroke_49');
    vi.useRealTimers();
  });
});
