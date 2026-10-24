import { describe, expect, it, vi } from 'vitest';
import { FeedoraHttpTransportAdapter } from '../apps/feedora-showcase/src/adapters/FeedoraHttpTransportAdapter.js';
import { FeedoraContributionAdapter } from '../apps/feedora-showcase/src/adapters/FeedoraContributionAdapter.js';
import { InMemoryEntityStore } from '../apps/feedora-showcase/src/adapters/InMemoryEntityStore.js';
import { OfflineOutboxQueue } from '../src/persistence/OfflineOutboxQueue.js';
import { MemoryStorageAdapter } from '../src/adapters/storage/MemoryStorageAdapter.js';
import { profileUserIdFromReceipt, recordRemoteSubmissionReceipt } from '../apps/feedora-showcase/src/domain/recordRemoteSubmissionReceipt.js';
import { scopeRefFromWire } from '../apps/feedora-showcase/src/domain/identity.js';
import type { RemoteSubmitResult } from '../apps/feedora-showcase/src/domain/ports/transportTypes.js';
import type { SubmissionEnvelope, SubmissionReceipt } from '../src/ports/ITransportPort.js';

describe('Feedora submission identity contract', () => {
  it('normalizes only explicit platform and organization scopes', () => {
    expect(scopeRefFromWire('platform', 'platform')).toEqual({ kind: 'platform', id: 'platform' });
    expect(scopeRefFromWire('organization', 'org-9')).toEqual({ kind: 'organization', id: 'org-9' });
    expect(scopeRefFromWire('platform', 'org-9')).toBeNull();
    expect(scopeRefFromWire('organization', 'user-9')).toBeNull();
    expect(scopeRefFromWire('organization', 'unscoped')).toBeNull();
    expect(scopeRefFromWire(undefined, 'org-9')).toBeNull();
  });

  it('sends server guest credentials and stable submission identity on every retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          ok: true,
          csrfToken: 'csrf-test',
          survey: { id: 7, uuid: 'survey-uuid', title: 'Example', description: '', is_hmsam: false, access_code: 'ABC123' },
          features: {},
          questions: [{
            id: 3,
            code: 'Q1',
            text: 'Question',
            type: 'likert',
            construct: '',
            required: true,
            options: [],
            ratingMax: 5,
            ratingStyle: 'numeric',
            sectionTitle: '',
            sectionNum: 1,
          }],
        }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          responseId: 12,
          submissionId: 'stable-submission-id',
          principalId: 'guest-install-a',
          scopeId: 'org-9',
          pointsEarned: 4,
          totalPoints: 104,
          accountTotalPoints: 104,
          scopeTotalPoints: 4,
          platformPoints: 80,
          acceptedAt: '2026-10-22T00:00:00Z',
          policyVersion: '1',
        }),
      });

    const transport = new FeedoraHttpTransportAdapter('https://api.example.test', fetchMock as any);
    transport.setGuestToken('opaque-server-issued-credential');
    const intent = {
      submissionId: 'stable-submission-id',
      principalId: 'guest-install-a',
      scopeId: 'org-9',
      guestParticipantId: 'guest-install-a',
    };

    const first = await transport.submitResponse('survey-uuid', { Q1: 4 }, intent);
    await transport.submitResponse('survey-uuid', { Q1: 4 }, intent);

    const requests = fetchMock.mock.calls.slice(1).map((call) => JSON.parse(call[1].body as string));
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ submissionId: intent.submissionId, scopeId: intent.scopeId });
    expect(requests[1]).toMatchObject({ submissionId: intent.submissionId, scopeId: intent.scopeId });
    expect(requests[0]).not.toHaveProperty('guestParticipantId');
    expect(requests[0]).not.toHaveProperty('principalId');
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ 'X-Feedora-Guest-Token': 'opaque-server-issued-credential' });
    expect(first).toMatchObject({ totalPoints: 104, accountTotalPoints: 104, scopeTotalPoints: 4, platformPoints: 80 });
  });

  it('replays saved question-code answers when metadata is now policy locked', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ ok: false, code: 'attempt_limit_reached', error: 'Attempt already completed.' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, responseId: 44, submissionId: 'accepted-before-restart', replayed: true }),
      });
    const transport = new FeedoraHttpTransportAdapter('https://api.example.test', fetchMock as any);

    const result = await transport.submitResponse('survey-uuid', { Q1: 4 }, {
      submissionId: 'accepted-before-restart',
      attemptId: 'attempt-after-restart',
      policyVersion: 'policy-v1',
      scopeId: 'org-9',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/submit/');
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string).answers).toEqual({ Q1: 4 });
  });

  it('uses the server principal when an offline local guest is rekeyed after reconnection', () => {
    expect(profileUserIdFromReceipt({ principalId: 'server-guest-uuid', user: undefined }, 'guest-local-temporary'))
      .toBe('server-guest-uuid');
    expect(profileUserIdFromReceipt({ principalId: 'user-42', user: undefined }, 'guest-local-temporary'))
      .toBe('42');
    expect(profileUserIdFromReceipt({ principalId: undefined, user: undefined }, 'guest-local-temporary'))
      .toBe('guest-local-temporary');
  });

  it('applies a canonical local receipt once even when the server replays it', async () => {
    const store = new InMemoryEntityStore([]);
    const contribution = new FeedoraContributionAdapter(store);
    const input = {
      submissionId: 'stable-submission-id',
      responseId: '42',
      userId: 'guest-install-a',
      displayName: 'Guest',
      avatar: '🎙️',
      entityId: 'org-9',
      formId: 'survey-uuid',
      surveyTitle: 'Example survey',
      points: 4,
      isCompletion: true,
      completedAt: '2026-10-22T00:00:00Z',
    };

    await contribution.recordReceipt(input);
    const replay = await contribution.recordReceipt(input);

    expect(replay.totalPoints).toBe(4);
    expect(replay.surveysCompleted).toBe(1);
    expect(await store.listUserHistory('guest-install-a')).toHaveLength(1);
  });

  it('runs receipt reconciliation before an outbox item is acknowledged', async () => {
    const onReceipt = vi.fn();
    const queue = new OfflineOutboxQueue({
      storageKey: 'receipt-reconcile-test',
      transport: {
        submit: async (envelope) => ({
          receiptId: envelope.id,
          status: 'accepted' as const,
          timestamp: '2026-10-22T00:00:00Z',
        }),
      },
      onReceipt,
    });

    await queue.enqueue({
      id: 'stable-submission-id',
      formId: 'survey-uuid',
      tenantId: 'org-9',
      context: {
        principalId: 'guest-install-a',
        profileUserId: 'guest-install-a',
        scopeId: 'org-9',
        guestParticipantId: 'guest-install-a',
        surveyId: 'survey-uuid',
        surveyTitle: 'Example survey',
        displayName: 'Guest',
        avatar: '🎙️',
      },
      values: { Q1: 4 },
      submittedAt: '2026-10-22T00:00:00Z',
      retryCount: 0,
    });

    expect(onReceipt).toHaveBeenCalledOnce();
    expect(onReceipt.mock.calls[0]?.[0].id).toBe('stable-submission-id');
    expect(await queue.getPendingCount()).toBe(0);
  });

  it('replays a server-committed response after restart and reconciles its scoped reward once', async () => {
    const storage = new MemoryStorageAdapter();
    const localStore = new InMemoryEntityStore([]);
    const contribution = new FeedoraContributionAdapter(localStore);
    const committedByServer = new Map<string, RemoteSubmitResult>();
    const receivedIntents: Array<{ id: string; values: Record<string, unknown> }> = [];
    let dropFirstResponse = true;

    const serverTransport = {
      submit: async (envelope: SubmissionEnvelope<Record<string, unknown>>): Promise<SubmissionReceipt> => {
        receivedIntents.push({ id: envelope.id, values: envelope.values });
        let result = committedByServer.get(envelope.id);
        if (!result) {
          result = {
            ok: true,
            status: 200,
            responseId: 42,
            submissionId: envelope.id,
            principalId: 'server-guest-7',
            scopeId: 'org-9',
            pointsEarned: 37,
            acceptedAt: '2026-10-24T01:00:00.000Z',
            replayed: false,
          };
          committedByServer.set(envelope.id, result);
        } else {
          result = { ...result, replayed: true };
        }

        if (dropFirstResponse) {
          dropFirstResponse = false;
          throw new Error('Connection lost after the server committed the response');
        }

        return {
          receiptId: String(result.responseId),
          status: 'accepted' as const,
          timestamp: result.acceptedAt ?? '2026-10-24T01:00:00.000Z',
          metadata: result as unknown as Record<string, unknown>,
        };
      },
    };

    const reconcileReceipt = async (
      envelope: SubmissionEnvelope<Record<string, unknown>>,
      receipt: SubmissionReceipt,
    ) => {
      const result = receipt.metadata as RemoteSubmitResult;
      await recordRemoteSubmissionReceipt(contribution, {
        submissionId: envelope.id,
        responseId: String(result.responseId),
        principalId: result.principalId ?? envelope.context?.principalId,
        userId: profileUserIdFromReceipt(result, envelope.context?.profileUserId ?? 'local-guest'),
        scopeId: result.scopeId ?? envelope.tenantId,
        surveyId: envelope.formId,
        surveyTitle: envelope.context?.surveyTitle ?? envelope.formId,
        displayName: envelope.context?.displayName ?? 'Guest',
        avatar: envelope.context?.avatar ?? '🎙️',
        points: result.pointsEarned ?? 0,
        completedAt: result.acceptedAt ?? '2026-10-24T01:00:00.000Z',
      });
    };

    const envelope = {
      id: 'stable-committed-submission',
      formId: 'survey-uuid',
      tenantId: 'org-9',
      context: {
        principalId: 'local-guest',
        profileUserId: 'local-guest',
        scopeId: 'org-9',
        guestParticipantId: 'guest-7',
        surveyId: 'survey-uuid',
        surveyTitle: 'Example survey',
        displayName: 'Guest',
        avatar: '🎙️',
      },
      values: { Q1: 4, Q2: 'kept answer' },
      submittedAt: '2026-10-24T00:59:00.000Z',
      retryCount: 0,
    };

    const firstProcess = new OfflineOutboxQueue({
      storageKey: 'committed-restart',
      storage,
      autoFlushOnReconnect: false,
      transport: serverTransport,
      onReceipt: reconcileReceipt,
    });
    expect(await firstProcess.enqueue(envelope)).toMatchObject({ status: 'queued' });
    expect(await firstProcess.getPendingCount()).toBe(1);
    expect(committedByServer.size).toBe(1);
    expect(await localStore.listUserHistory('server-guest-7')).toHaveLength(0);

    // A new queue instance models the next app process reading the same durable outbox.
    const restartedProcess = new OfflineOutboxQueue({
      storageKey: 'committed-restart',
      storage,
      autoFlushOnReconnect: false,
      transport: serverTransport,
      onReceipt: reconcileReceipt,
    });
    expect(await restartedProcess.flush(true)).toBe(1);

    expect(receivedIntents).toEqual([
      { id: envelope.id, values: envelope.values },
      { id: envelope.id, values: envelope.values },
    ]);
    expect(committedByServer.size).toBe(1);
    expect(await restartedProcess.getPendingCount()).toBe(0);
    expect(await localStore.listUserHistory('server-guest-7')).toHaveLength(1);
    expect(await contribution.getProfile('server-guest-7', 'org-9')).toMatchObject({
      totalPoints: 37,
      surveysCompleted: 1,
      entityId: 'org-9',
    });
  });

  it('keeps each contributor balance isolated by platform or organization scope', async () => {
    const store = new InMemoryEntityStore([]);
    const contribution = new FeedoraContributionAdapter(store);
    const base = {
      submissionId: 'scope-submission',
      responseId: 'response-1',
      userId: 'user-12',
      displayName: 'Research participant',
      avatar: '🗣️',
      formId: 'survey-uuid',
      surveyTitle: 'Example survey',
      isCompletion: true,
      completedAt: '2026-10-22T00:00:00Z',
    };

    await contribution.recordReceipt({ ...base, entityId: 'org-9', points: 24 });
    await contribution.recordReceipt({ ...base, responseId: 'response-2', submissionId: 'platform-submission', entityId: 'platform', points: 5 });

    expect((await contribution.getProfile('user-12', 'org-9'))?.totalPoints).toBe(24);
    expect((await contribution.getProfile('user-12', 'platform'))?.totalPoints).toBe(5);
  });

  it('requests platform-only standings and sends the owner opt-in with CSRF protection', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, scopeKind: 'platform' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, csrfToken: 'csrf-owner' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, shareAggregateStats: true }) });
    const transport = new FeedoraHttpTransportAdapter('https://api.example.test', fetchMock as any);

    await transport.fetchLeaderboard('platform');
    await transport.setOrganizationAggregateSharing('9', true);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('entity_id=platform&scope=global');
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'X-CSRFToken': 'csrf-owner' },
      body: JSON.stringify({ shareAggregateStats: true }),
    });
  });
});
