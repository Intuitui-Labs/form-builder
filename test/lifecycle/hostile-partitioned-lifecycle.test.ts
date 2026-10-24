import { describe, it, expect, vi } from 'vitest';
import {
  PartitionedOutboxManager,
  MultiStepFormManager,
  type FormSchema,
  type IStoragePort,
  type SubmissionEnvelope,
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

describe('Hostile Architectural Operationalization: Partitioned Lifecycle & Drift Invariants', () => {
  it('Hostile Test 1: PartitionedOutboxManager scope transfer rejects when active flush lock is held', async () => {
    const storage = createMockStorage();
    const manager = new PartitionedOutboxManager({ storage });

    const fromPartition = 'anon_guest_1';
    const toPartition = 'auth_user_1';

    // Simulate active background flush in progress on the source partition
    const sourceLockKey = manager.getLockKeyForPartition(fromPartition);
    await storage.setItem(sourceLockKey, String(Date.now()));

    // Seed some data in source
    const sourceDataKey = manager.getStorageKeyForPartition(fromPartition);
    const envelope: SubmissionEnvelope = {
      id: 'sub_pending_1',
      formId: 'survey_abc',
      values: { answer: 'yes' },
      submittedAt: new Date().toISOString(),
      retryCount: 0,
    };
    await storage.setItem(sourceDataKey, JSON.stringify([{ envelope, queuedAt: Date.now() }]));

    // Transfer attempt must abort and reject immediately without data corruption
    await expect(manager.transferScope(fromPartition, toPartition)).rejects.toThrow(
      /Wait for the current response sync to finish before changing its account scope/i
    );

    // Verify source data was NOT deleted or altered
    const sourceData = await storage.getItem(sourceDataKey);
    expect(sourceData).toBeDefined();
    expect(JSON.parse(sourceData!)[0].envelope.id).toBe('sub_pending_1');

    // Verify target partition remained untouched
    const targetDataKey = manager.getStorageKeyForPartition(toPartition);
    expect(await storage.getItem(targetDataKey)).toBeNull();
  });

  it('Hostile Test 2: PartitionedOutboxManager transfers active and DLQ items atomically and deduplicates', async () => {
    const storage = createMockStorage();
    const manager = new PartitionedOutboxManager({ storage });

    const fromPartition = 'guest_scope_2';
    const toPartition = 'user_scope_2';

    const fromDataKey = manager.getStorageKeyForPartition(fromPartition);
    const toDataKey = manager.getStorageKeyForPartition(toPartition);
    const fromDlqKey = manager.getDlqKeyForPartition(fromPartition);
    const toDlqKey = manager.getDlqKeyForPartition(toPartition);

    // Source has envelopes e1 (shared) and e2 (new)
    const e1: SubmissionEnvelope = { id: 'env_1', formId: 'f1', values: {}, submittedAt: '', retryCount: 0 };
    const e2: SubmissionEnvelope = { id: 'env_2', formId: 'f1', values: {}, submittedAt: '', retryCount: 0 };
    await storage.setItem(fromDataKey, JSON.stringify([
      { envelope: e1, queuedAt: 100 },
      { envelope: e2, queuedAt: 200 },
    ]));

    // Source DLQ has dead item d1
    const d1: SubmissionEnvelope = { id: 'env_dead_1', formId: 'f1', values: {}, submittedAt: '', retryCount: 5 };
    await storage.setItem(fromDlqKey, JSON.stringify([
      { envelope: d1, queuedAt: 300, lastError: 'Fatal error' },
    ]));

    // Destination already has e1 in active, and d2 in DLQ
    const d2: SubmissionEnvelope = { id: 'env_dead_2', formId: 'f1', values: {}, submittedAt: '', retryCount: 5 };
    await storage.setItem(toDataKey, JSON.stringify([{ envelope: e1, queuedAt: 50 }]));
    await storage.setItem(toDlqKey, JSON.stringify([{ envelope: d2, queuedAt: 60 }]));

    const result = await manager.transferScope(fromPartition, toPartition);

    expect(result.success).toBe(true);
    expect(result.transferredActive).toBe(1); // Only e2 transferred (e1 was deduplicated)
    expect(result.transferredDeadLetters).toBe(1); // d1 transferred
    expect(result.deduplicatedCount).toBe(1);

    // Verify destination active queue has e1 and e2
    const destActive = JSON.parse((await storage.getItem(toDataKey))!);
    expect(destActive.map((i: any) => i.envelope.id)).toEqual(['env_1', 'env_2']);

    // Verify destination DLQ has d2 and d1
    const destDlq = JSON.parse((await storage.getItem(toDlqKey))!);
    expect(destDlq.map((i: any) => i.envelope.id)).toEqual(['env_dead_2', 'env_dead_1']);

    // Verify source partition was completely removed
    expect(await storage.getItem(fromDataKey)).toBeNull();
    expect(await storage.getItem(fromDlqKey)).toBeNull();
  });

  it('Hostile Test 3: MultiStepFormManager blocks field input mutations and submit when participation is locked', async () => {
    const schema: FormSchema = {
      id: 'gated_eval_form',
      title: 'Performance Review',
      kind: 'survey',
      accessPolicy: {
        allowRedo: false,
        maxAttempts: 1,
        rewardStrategy: 'first_attempt_only',
      },
      pages: [
        {
          id: 'page_1',
          fields: [
            { id: 'f1', name: 'feedback', type: 'text', defaultValue: 'initial' },
          ],
        },
      ],
    };

    const submitSpy = vi.fn();
    const manager = new MultiStepFormManager(schema, submitSpy, {
      participation: {
        submissionHistory: [
          {
            formId: 'gated_eval_form',
            isCompleted: true,
            completedAt: new Date().toISOString(),
            attemptNumber: 1,
          },
        ],
      },
    });

    const participation = manager.getParticipationState();
    expect(participation.status).toBe('locked');
    expect(participation.isLocked).toBe(true);
    expect(participation.canSubmit).toBe(false);
    expect(participation.lockReasonDescription).toMatch(/completed the single allowed attempt/i);

    // Hostile act 1: Setting field value must be rejected
    const setSuccess = manager.setFieldValue('feedback', 'hostile_tamper');
    expect(setSuccess).toBe(false);
    expect(manager.getState().values.feedback).toBe('initial');

    // Hostile act 2: Batch setting field values must be rejected
    const batchResult = manager.batchSetFieldValues({ feedback: 'batch_tamper' });
    expect(batchResult.appliedFields).toEqual([]);
    expect(batchResult.appliedCount).toBe(0);
    expect(batchResult.skippedFields).toHaveLength(1);
    expect(manager.getState().values.feedback).toBe('initial');

    // Hostile act 3: Submitting when locked must reject
    await expect(manager.submit()).rejects.toThrow(/Cannot submit: participation is locked/i);
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('Hostile Test 4: MultiStepFormManager detects policy drift on draft restoration and blocks submit until confirmed', async () => {
    const schema: FormSchema = {
      id: 'evolving_policy_survey',
      title: 'Customer Sentiment',
      kind: 'survey',
      accessPolicy: {
        allowRedo: true,
        rewardStrategy: 'unrestricted',
        version: '2.0.0', // Updated policy version
      },
      pages: [
        {
          id: 'p1',
          fields: [
            { id: 'rating', name: 'rating', type: 'text', defaultValue: '' },
          ],
        },
      ],
    };

    const onPolicyDriftSpy = vi.fn();
    const onParticipationChangeSpy = vi.fn();
    const submitSpy = vi.fn();

    const manager = new MultiStepFormManager(schema, submitSpy, {
      participation: {
        onPolicyDrift: onPolicyDriftSpy,
        onParticipationChange: onParticipationChangeSpy,
      },
    });

    // Form starts eligible
    expect(manager.getParticipationState().status).toBe('eligible');

    // Respondent had an older draft saved under policyVersion 1.0.0
    const olderDraft: FormDraftSnapshot = {
      schemaId: 'evolving_policy_survey',
      schemaVersion: '1.0.0',
      policyVersion: '1.0.0', // Drift!
      savedAt: Date.now(),
      currentPageIndex: 0,
      values: { rating: '5_stars' },
    };

    // Hydrate draft
    await manager.restoreDraft(olderDraft);

    // Form values are restored
    expect(manager.getState().values.rating).toBe('5_stars');

    // State machine must flag policy_drift_detected
    const driftedState = manager.getParticipationState();
    expect(driftedState.status).toBe('policy_drift_detected');
    expect(driftedState.draftPolicyVersion).toBe('1.0.0');
    expect(driftedState.policyVersion).toBe('2.0.0');
    expect(onPolicyDriftSpy).toHaveBeenCalledWith({
      expectedVersion: '2.0.0',
      draftVersion: '1.0.0',
    });

    // Submitting with unconfirmed drift must reject
    await expect(manager.submit()).rejects.toThrow(
      /policy drift detected between draft and schema/i
    );
    expect(submitSpy).not.toHaveBeenCalled();

    // Confirm policy update
    await manager.confirmPolicyDrift('confirm_and_apply');

    // Status resolves to eligible
    expect(manager.getParticipationState().status).toBe('eligible');
    expect(manager.getParticipationState().draftPolicyVersion).toBeUndefined();

    // Submit now succeeds
    await manager.submit();
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy).toHaveBeenCalledWith({ rating: '5_stars' });
  });

  it('Hostile Test 5: confirmPolicyDrift with reject_and_clear purges draft and resets values', async () => {
    const schema: FormSchema = {
      id: 'drift_reset_survey',
      title: 'Drift Reset Survey',
      accessPolicy: {
        allowRedo: true,
        rewardStrategy: 'unrestricted',
        version: 'v3',
      },
      pages: [
        {
          id: 'p1',
          fields: [
            { id: 'f1', name: 'choice', type: 'text', defaultValue: 'default_val' },
          ],
        },
      ],
    };

    const manager = new MultiStepFormManager(schema, () => {}, {
      resilience: { autoSaveDraft: false },
    });

    const outdatedDraft: FormDraftSnapshot = {
      schemaId: 'drift_reset_survey',
      schemaVersion: '1.0.0',
      policyVersion: 'v1',
      savedAt: Date.now(),
      currentPageIndex: 0,
      values: { choice: 'outdated_answer' },
    };

    await manager.restoreDraft(outdatedDraft);
    expect(manager.getState().values.choice).toBe('outdated_answer');
    expect(manager.getParticipationState().status).toBe('policy_drift_detected');

    // User or respondent rejects changed policy
    await manager.confirmPolicyDrift('reject_and_clear');

    // Form values reset to default
    expect(manager.getState().values.choice).toBe('default_val');
    expect(manager.getParticipationState().status).toBe('eligible');
  });

  it('Hostile Test 6: Memoized partition registry ensures single instance per partition and safe cleanup', () => {
    const storage = createMockStorage();
    const manager = new PartitionedOutboxManager({ storage });

    const qA1 = manager.getQueue('account_alpha');
    const qA2 = manager.getQueue('account_alpha');
    const qB = manager.getQueue('account_beta');

    expect(qA1).toBe(qA2);
    expect(qA1).not.toBe(qB);

    // Destroy should clean up without error
    expect(() => manager.destroy()).not.toThrow();
  });
});
