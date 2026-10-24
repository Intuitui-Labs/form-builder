import type { IContributionPort } from './ports/IContributionPort';
import type { RemoteSubmitResult } from './ports/transportTypes';
import type { ContributionProfile } from './types';

export interface RemoteSubmissionReceiptInput {
  submissionId: string;
  responseId: string;
  principalId: string;
  userId: string;
  scopeId: string;
  surveyId: string;
  surveyTitle: string;
  displayName: string;
  avatar: string;
  points: number;
  completedAt: string;
}

/** Resolve local profile ownership from the server receipt, which is authoritative. */
export function profileUserIdFromReceipt(
  receipt: Pick<RemoteSubmitResult, 'principalId' | 'user'>,
  fallbackUserId: string,
): string {
  if (receipt.user?.id !== undefined && receipt.user?.id !== null) return String(receipt.user.id);
  if (receipt.principalId) {
    return receipt.principalId.startsWith('user-')
      ? receipt.principalId.slice('user-'.length)
      : receipt.principalId;
  }
  return fallbackUserId;
}

/** Reconcile a server receipt through the contribution port; safe to replay by submission ID. */
export function recordRemoteSubmissionReceipt(
  contributionPort: IContributionPort,
  input: RemoteSubmissionReceiptInput,
): Promise<ContributionProfile> {
  return contributionPort.recordReceipt({
    userId: input.userId,
    displayName: input.displayName,
    avatar: input.avatar,
    entityId: input.scopeId,
    formId: input.surveyId,
    surveyTitle: input.surveyTitle,
    points: input.points,
    isCompletion: true,
    submissionId: input.submissionId,
    responseId: input.responseId,
    completedAt: input.completedAt,
  });
}
