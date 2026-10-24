import { describe, expect, it, vi } from 'vitest';
import type { FormDraftSnapshot } from '../src/schema/FormDraft';
import { OfflineOutboxQueue } from '../src/persistence/OfflineOutboxQueue';
import { MemoryStorageAdapter } from '../src/adapters/storage/MemoryStorageAdapter';
import type { RemoteSurveyMeta } from '../apps/feedora-showcase/src/domain/ports/transportTypes';
import type { IEntityStore } from '../apps/feedora-showcase/src/domain/ports/IEntityStore';
import { ScopedDraftStorage } from '../apps/feedora-showcase/src/adapters/ScopedDraftStorage';
import { prepareSurveyForParticipation } from '../apps/feedora-showcase/src/domain/prepareSurveyForParticipation';

const surveyUuid = 'b33d2d12-1297-4f5a-8fa1-a764e142d931';
const scopeId = 'org-12';
const owner = 'guest-guest-7';
const cacheKey = `feedora:survey-meta:v1:${surveyUuid}`;
const attemptKey = `feedora:survey-attempt:v1:${owner}:${scopeId}:${surveyUuid}`;

function createMeta(uuid = surveyUuid): RemoteSurveyMeta {
  return {
    csrfToken: 'csrf-secret',
    accessGrant: 'grant-secret',
    survey: {
      id: 7,
      uuid,
      title: 'Restartable survey',
      description: 'A test survey',
      is_hmsam: false,
    },
    features: {},
    questions: [],
  };
}

function persistentStore(rows = new Map<string, string>()) {
  return {
    rows,
    store: {
      getItem: async (key: string) => rows.get(key) ?? null,
      setItem: async (key: string, value: string) => { rows.set(key, value); },
    } satisfies Pick<IEntityStore, 'getItem' | 'setItem'>,
  };
}

function reservation(attemptId: string, policyVersion = 'policy-v1') {
  return {
    attemptId,
    policyVersion,
    scopeId,
    scopeKind: 'organization' as const,
    resumed: false,
  };
}

describe('Feedora survey restart recovery', () => {
  it('persists only safe metadata and the server reservation before opening the form', async () => {
    const storage = persistentStore();
    const startSurveyAttempt = vi.fn().mockResolvedValue(reservation('attempt-1'));

    const prepared = await prepareSurveyForParticipation(surveyUuid, createMeta(), owner, scopeId, {
      store: storage.store,
      transport: { startSurveyAttempt },
      createAttemptId: () => 'client-attempt-1',
    });

    expect(startSurveyAttempt).toHaveBeenCalledWith(surveyUuid, 'client-attempt-1', scopeId);
    expect(prepared.survey.attemptId).toBe('attempt-1');
    expect(prepared.survey.attemptStorageKey).toBe(attemptKey);
    expect(storage.rows.get(attemptKey)).toBe('attempt-1');
    const cached = JSON.parse(storage.rows.get(cacheKey)!);
    expect(cached.survey.policyVersion).toBe('policy-v1');
    expect(cached.accessGrant).toBeUndefined();
    expect(cached.csrfToken).toBeUndefined();
  });

  it('restores the same attempt and cached metadata after a new runtime starts offline', async () => {
    const storage = persistentStore();
    await prepareSurveyForParticipation(surveyUuid, createMeta(), owner, scopeId, {
      store: storage.store,
      transport: { startSurveyAttempt: async () => reservation('attempt-persisted') },
      createAttemptId: () => 'attempt-first-run',
    });

    // A new store wrapper/runtime shares only durable key-value state.
    const restartedStorage = persistentStore(storage.rows);
    const offlineStart = vi.fn().mockRejectedValue(Object.assign(new Error('offline'), { status: 0 }));
    const cachedMeta = JSON.parse(restartedStorage.rows.get(cacheKey)!) as RemoteSurveyMeta;
    const resumed = await prepareSurveyForParticipation(surveyUuid, cachedMeta, owner, scopeId, {
      store: restartedStorage.store,
      transport: { startSurveyAttempt: offlineStart },
      createAttemptId: () => 'should-not-be-used',
    });

    expect(offlineStart).toHaveBeenCalledWith(surveyUuid, 'attempt-persisted', scopeId);
    expect(resumed.survey.attemptId).toBe('attempt-persisted');
    expect(resumed.survey.policyVersion).toBe('policy-v1');
    expect(resumed.accessGrant).toBeUndefined();
    expect(resumed.csrfToken).toBeUndefined();
  });

  it('does not use cached metadata for a different survey', async () => {
    const storage = persistentStore();
    storage.rows.set(attemptKey, 'attempt-1');
    storage.rows.set(cacheKey, JSON.stringify(createMeta('a7b3c681-6519-4f59-b407-68fcaf6a6589')));

    await expect(prepareSurveyForParticipation(surveyUuid, createMeta(), owner, scopeId, {
      store: storage.store,
      transport: { startSurveyAttempt: async () => { throw Object.assign(new Error('offline'), { status: 0 }); } },
      createAttemptId: () => 'new-attempt',
    })).rejects.toThrow('Reconnect to refresh the rules for this saved survey draft.');
  });

  it.each(['attempt_not_active', 'attempt_completed'])(
    're-reserves an %s attempt without discarding cached survey answers',
    async (code) => {
      const storage = persistentStore();
      storage.rows.set(attemptKey, 'old-attempt');
      storage.rows.set(cacheKey, JSON.stringify(createMeta()));
      const startSurveyAttempt = vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error(code), { code, status: 409 }))
        .mockResolvedValueOnce(reservation('fresh-attempt', 'policy-v2'));

      const prepared = await prepareSurveyForParticipation(surveyUuid, createMeta(), owner, scopeId, {
        store: storage.store,
        transport: { startSurveyAttempt },
        createAttemptId: () => 'fresh-client-id',
      });

      expect(startSurveyAttempt).toHaveBeenNthCalledWith(1, surveyUuid, 'old-attempt', scopeId);
      expect(startSurveyAttempt).toHaveBeenNthCalledWith(2, surveyUuid, 'fresh-client-id', scopeId);
      expect(prepared.survey.attemptId).toBe('fresh-attempt');
      expect(prepared.survey.policyVersion).toBe('policy-v2');
      expect(storage.rows.get(attemptKey)).toBe('fresh-attempt');
      expect(JSON.parse(storage.rows.get(cacheKey)!).survey.uuid).toBe(surveyUuid);
    },
  );

  it('holds a stale policy attempt until the respondent confirms updated rules', async () => {
    const storage = persistentStore();
    storage.rows.set(attemptKey, 'old-attempt');
    storage.rows.set(cacheKey, JSON.stringify(createMeta()));
    const startSurveyAttempt = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('policy_changed'), { code: 'policy_changed', status: 409 }))
      .mockRejectedValueOnce(Object.assign(new Error('policy_changed'), { code: 'policy_changed', status: 409 }))
      .mockResolvedValueOnce(reservation('fresh-attempt', 'policy-v2'));

    const review = await prepareSurveyForParticipation(surveyUuid, createMeta(), owner, scopeId, {
      store: storage.store,
      transport: { startSurveyAttempt },
      createAttemptId: () => 'fresh-client-id',
    });

    expect(startSurveyAttempt).toHaveBeenCalledTimes(1);
    expect(review.survey.policyConfirmationRequired).toBe(true);
    expect(review.survey.attemptId).toBe('old-attempt');
    expect(storage.rows.get(attemptKey)).toBe('old-attempt');
    expect(JSON.parse(storage.rows.get(cacheKey)!).survey.policyConfirmationRequired).toBe(true);

    const accepted = await prepareSurveyForParticipation(surveyUuid, createMeta(), owner, scopeId, {
      store: storage.store,
      transport: { startSurveyAttempt },
      createAttemptId: () => 'fresh-client-id',
      confirmPolicyChange: true,
    });
    expect(startSurveyAttempt).toHaveBeenNthCalledWith(2, surveyUuid, 'old-attempt', scopeId);
    expect(startSurveyAttempt).toHaveBeenNthCalledWith(3, surveyUuid, 'fresh-client-id', scopeId);
    expect(accepted.survey.policyConfirmationRequired).toBe(false);
    expect(accepted.survey.attemptId).toBe('fresh-attempt');
    expect(storage.rows.get(attemptKey)).toBe('fresh-attempt');
  });

  it('restores a persisted form draft only in its original principal and scope', async () => {
    const storage = persistentStore();
    const draft: FormDraftSnapshot = {
      schemaId: surveyUuid,
      schemaVersion: '1',
      savedAt: '2026-10-23T00:00:00.000Z',
      currentPageIndex: 1,
      completedStepIndices: [0],
      stepHistory: [0],
      branchLineage: [],
      branchTargetHistory: [],
      values: { Q1: 'saved' },
      isSubmitted: false,
    };
    const store = storage.store as unknown as IEntityStore;
    const firstRuntime = new ScopedDraftStorage(store, `${owner}:${scopeId}`);
    await firstRuntime.saveDraft(draft);

    const restartedRuntime = new ScopedDraftStorage(store, `${owner}:${scopeId}`);
    const otherOrganization = new ScopedDraftStorage(store, `${owner}:org-99`);
    const otherPrincipal = new ScopedDraftStorage(store, `user-42:${scopeId}`);

    expect(await restartedRuntime.loadDraft(surveyUuid)).toEqual(draft);
    expect(await otherOrganization.loadDraft(surveyUuid)).toBeNull();
    expect(await otherPrincipal.loadDraft(surveyUuid)).toBeNull();
  });

  it('replays the same attempt and submission identifiers after an app restart', async () => {
    const storage = new MemoryStorageAdapter();
    let online = false;
    const network = {
      isOnline: async () => online,
      subscribe: () => () => undefined,
    };
    const firstRun = new OfflineOutboxQueue<Record<string, unknown>>({
      storageKey: 'restart-replay', storage, networkStatus: network, autoFlushOnReconnect: false,
      transport: { submit: async () => { throw new Error('offline'); } },
    });
    await firstRun.enqueue({
      id: 'stable-submission-22',
      formId: surveyUuid,
      tenantId: scopeId,
      context: {
        principalId: owner,
        profileUserId: owner,
        scopeId,
        guestParticipantId: 'guest-7',
        policyVersion: 'policy-v1',
        transportMetadata: { attemptId: 'attempt-22', attemptStorageKey: attemptKey },
        displayName: 'Guest',
        avatar: '🎙️',
        surveyId: surveyUuid,
      },
      values: { Q1: 'retained answer' },
      submittedAt: '2026-10-23T00:00:00.000Z',
      retryCount: 0,
    });
    expect(await firstRun.getPendingCount()).toBe(1);

    // A newly constructed queue represents the next app process reading the
    // same Expo SQLite key-value/outbox persistence.
    const replayed: Array<{ id: string; attemptId?: string; values: unknown }> = [];
    online = true;
    const restartedRun = new OfflineOutboxQueue<Record<string, unknown>>({
      storageKey: 'restart-replay', storage, networkStatus: network, autoFlushOnReconnect: false,
      transport: {
        submit: async (envelope) => {
          replayed.push({
            id: envelope.id,
            attemptId: envelope.context?.transportMetadata?.attemptId,
            values: envelope.values,
          });
          return { receiptId: 'response-22', status: 'accepted', timestamp: '2026-10-23T00:01:00.000Z' };
        },
      },
    });

    await restartedRun.flush(true);

    expect(replayed).toEqual([{
      id: 'stable-submission-22',
      attemptId: 'attempt-22',
      values: { Q1: 'retained answer' },
    }]);
    expect(await restartedRun.getPendingCount()).toBe(0);
  });
});
