import { describe, expect, it, vi } from 'vitest';
import { OfflineOutboxQueue } from '../src/persistence/OfflineOutboxQueue.js';
import { MemoryStorageAdapter } from '../src/adapters/storage/MemoryStorageAdapter.js';
import { AlwaysOnlineNetworkAdapter } from '../src/adapters/network/AlwaysOnlineNetworkAdapter.js';
import { recoverAdmissionDeniedResponse } from '../apps/feedora-showcase/src/domain/recoverAdmissionDeniedResponse';

describe('Feedora saved response admission recovery', () => {
  it('retries the first matching response with fresh admission and the original answers and id', async () => {
    const submit = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('Access grant expired.'), {
        status: 403,
        code: 'access_grant_invalid',
        retryable: false,
      }))
      .mockResolvedValueOnce({ receiptId: 'receipt-1', status: 'accepted', timestamp: 'now' });
    const outbox = new OfflineOutboxQueue<Record<string, unknown>>({
      storage: new MemoryStorageAdapter(),
      networkStatus: new AlwaysOnlineNetworkAdapter(),
      transport: { submit },
      storageKey: 'admission-recovery-test',
      autoFlushOnReconnect: false,
    });
    const answers = { Q1: 'saved choice' };
    const envelope = {
      id: 'stable-submission-id',
      formId: 'survey-1',
      tenantId: 'org-1',
      context: {
        principalId: 'guest-1',
        profileUserId: 'guest-1',
        scopeId: 'org-1',
        policyVersion: 'old-policy',
        transportMetadata: { attemptId: 'old-attempt', attemptStorageKey: 'old-key' },
        displayName: 'Guest',
        avatar: 'G',
        surveyId: 'survey-1',
      },
      values: answers,
      submittedAt: new Date().toISOString(),
      retryCount: 0,
    };

    await expect(outbox.enqueue(envelope)).rejects.toMatchObject({ code: 'access_grant_invalid' });
    const result = await recoverAdmissionDeniedResponse(outbox, {
      surveyId: 'survey-1',
      policyVersion: 'new-policy',
      scopeId: 'org-1',
      attemptId: 'new-attempt',
      attemptStorageKey: 'new-key',
    });

    expect(result).toEqual({ status: 'synced', submissionId: envelope.id });
    expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({
      id: envelope.id,
      values: answers,
      context: expect.objectContaining({
        policyVersion: 'new-policy',
        transportMetadata: { attemptId: 'new-attempt', attemptStorageKey: 'new-key' },
      }),
    }));
    expect(await outbox.getDeadLetterQueue()).toHaveLength(0);
  });

  it('does not retry when the selected survey has no matching admission rejection', async () => {
    const outbox = new OfflineOutboxQueue<Record<string, unknown>>({
      storage: new MemoryStorageAdapter(),
      networkStatus: new AlwaysOnlineNetworkAdapter(),
      transport: { submit: vi.fn() },
      storageKey: 'admission-recovery-empty-test',
      autoFlushOnReconnect: false,
    });

    const result = await recoverAdmissionDeniedResponse(outbox, {
      surveyId: 'survey-without-response',
      scopeId: 'org-1',
    });
    expect(result).toEqual({ status: 'no-saved-response' });
  });
});
