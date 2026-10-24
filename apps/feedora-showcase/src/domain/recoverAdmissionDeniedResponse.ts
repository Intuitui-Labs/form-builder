export interface AdmissionRecoveryOutboxPort {
  getDeadLetterQueue(): Promise<Array<{
    envelope: { id: string; formId: string };
    lastErrorCode?: string;
  }>>;
  rebindDeadLetterContext(
    submissionId: string,
    context: {
      policyVersion?: string;
      scopeId: string;
      transportMetadata: { attemptId: string; attemptStorageKey: string };
    },
  ): Promise<boolean>;
  retryDeadLetter(submissionId: string): Promise<boolean>;
  flush(force?: boolean): Promise<number>;
}

export type AdmissionRecoveryResult =
  | { status: 'no-saved-response' }
  | { status: 'retry-unavailable'; submissionId: string }
  | { status: 'still-rejected'; submissionId: string }
  | { status: 'synced'; submissionId: string };

/** Rebind one access-denied response to fresh server admission and retry its stable ID. */
export async function recoverAdmissionDeniedResponse(
  outbox: AdmissionRecoveryOutboxPort,
  input: {
    surveyId: string;
    policyVersion?: string;
    scopeId: string;
    attemptId?: string;
    attemptStorageKey?: string;
  },
): Promise<AdmissionRecoveryResult> {
  const accessErrors = new Set(['access_code_required', 'access_grant_invalid']);
  const item = (await outbox.getDeadLetterQueue()).find((entry) =>
    entry.envelope.formId === input.surveyId && accessErrors.has(entry.lastErrorCode ?? ''),
  );
  if (!item) return { status: 'no-saved-response' };

  const submissionId = item.envelope.id;
  const rebound = await outbox.rebindDeadLetterContext(submissionId, {
    policyVersion: input.policyVersion,
    scopeId: input.scopeId,
    transportMetadata: {
      attemptId: input.attemptId ?? '',
      attemptStorageKey: input.attemptStorageKey ?? '',
    },
  });
  if (!rebound || !await outbox.retryDeadLetter(submissionId)) {
    return { status: 'retry-unavailable', submissionId };
  }

  await outbox.flush(true);
  const stillRejected = (await outbox.getDeadLetterQueue()).some((entry) => entry.envelope.id === submissionId);
  return stillRejected
    ? { status: 'still-rejected', submissionId }
    : { status: 'synced', submissionId };
}
