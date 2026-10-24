import type { OfflineOutboxQueue, QueuedSubmission } from './OfflineOutboxQueue.js';

export type AdmissionRecoveryStatus =
  | 'no_saved_response'
  | 'retry_unavailable'
  | 'still_rejected'
  | 'synced';

export interface AdmissionRecoveryResult {
  readonly status: AdmissionRecoveryStatus;
  readonly submissionId?: string;
}

export interface AdmissionRecoveryInput {
  readonly formId: string;
  readonly policyVersion?: string;
  readonly scopeId?: string;
  readonly attemptId?: string;
  readonly attemptStorageKey?: string;
  readonly metadataPatch?: Record<string, unknown>;
  /** Error codes in DLQ that qualify for admission recovery (default: access errors and policy changes). */
  readonly targetErrorCodes?: string[];
}

const DEFAULT_TARGET_ERROR_CODES = new Set([
  'access_code_required',
  'access_grant_invalid',
  'policy_changed',
  'access_denied',
  '401',
  '403',
]);

/**
 * Enterprise Admission Recovery Orchestrator.
 * Automates the inspection of Dead-Letter Queues (DLQs) for submissions rejected
 * due to access gating or policy changes, rebinds fresh credentials/attempts,
 * and retries them with strict idempotency key preservation.
 * Zero external runtime dependencies.
 */
export class AdmissionRecoveryOrchestrator {
  /**
   * Recovers and retries a dead-lettered submission for a specific form after the user
   * provides valid credentials, access codes, or accepts an updated policy.
   */
  public static async recoverAdmissionDenied<T = Record<string, unknown>>(
    outbox: OfflineOutboxQueue<T>,
    input: AdmissionRecoveryInput,
  ): Promise<AdmissionRecoveryResult> {
    const errorCodes = input.targetErrorCodes
      ? new Set(input.targetErrorCodes)
      : DEFAULT_TARGET_ERROR_CODES;

    const deadLetters = await outbox.findDeadLetters((entry: QueuedSubmission<T>) => {
      if (entry.envelope.formId !== input.formId) return false;
      const code = entry.lastErrorCode || (entry.lastError?.includes('401') ? '401' : entry.lastError?.includes('403') ? '403' : undefined);
      return code !== undefined && errorCodes.has(code);
    });

    if (deadLetters.length === 0) {
      return { status: 'no_saved_response' };
    }

    const targetItem = deadLetters[0];
    const submissionId = targetItem.envelope.id;

    // Rebind metadata, policy version, and transport context while preserving envelope.id
    const rebound = await outbox.rebindDeadLetter(submissionId, (env) => {
      const patchedContext = env.context ? {
        ...env.context,
        policyVersion: input.policyVersion ?? env.context.policyVersion,
        scopeId: input.scopeId ?? env.context.scopeId,
        transportMetadata: {
          ...env.context.transportMetadata,
          ...(input.attemptId ? { attemptId: input.attemptId } : {}),
          ...(input.attemptStorageKey ? { attemptStorageKey: input.attemptStorageKey } : {}),
        },
      } : undefined;

      const patchedMetadata = {
        ...(env.metadata as Record<string, unknown> | undefined),
        ...input.metadataPatch,
        ...(input.attemptId ? { attemptId: input.attemptId } : {}),
        ...(input.scopeId ? { scopeId: input.scopeId } : {}),
      };

      return {
        ...env,
        policyVersion: input.policyVersion ?? env.policyVersion,
        context: patchedContext,
        metadata: patchedMetadata as any,
      };
    });

    if (!rebound) {
      return { status: 'retry_unavailable', submissionId };
    }

    const rescheduled = await outbox.retryDeadLetter(submissionId);
    if (!rescheduled) {
      return { status: 'retry_unavailable', submissionId };
    }

    // Attempt immediate delivery
    await outbox.flush(true);

    // Verify whether the item succeeded or was returned back to DLQ
    const remainingDlq = await outbox.getDeadLetterQueue();
    const stillFailed = remainingDlq.some((entry) => entry.envelope.id === submissionId);

    return stillFailed
      ? { status: 'still_rejected', submissionId }
      : { status: 'synced', submissionId };
  }
}
