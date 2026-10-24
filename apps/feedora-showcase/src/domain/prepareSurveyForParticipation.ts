import type { IEntityStore } from './ports/IEntityStore';
import type { ITransportPort } from './ports/ITransportPort';
import type { RemoteSurveyMeta } from './ports/transportTypes';

export interface ParticipationPreparationPorts {
  store: Pick<IEntityStore, 'getItem' | 'setItem'>;
  transport: Pick<ITransportPort, 'startSurveyAttempt'>;
  createAttemptId: () => string;
  confirmPolicyChange?: boolean;
}

/** Reserve or restore a respondent's server attempt while preserving the local draft. */
export async function prepareSurveyForParticipation(
  accessUuid: string,
  initialMeta: RemoteSurveyMeta,
  owner: string,
  fallbackScopeId: string,
  ports: ParticipationPreparationPorts,
): Promise<RemoteSurveyMeta> {
  let meta = initialMeta;
  const scopeId = meta.survey.scope?.id ?? meta.survey.scopeId ?? fallbackScopeId;
  const cacheKey = `feedora:survey-meta:v1:${accessUuid}`;
  const attemptStorageKey = `feedora:survey-attempt:v1:${owner}:${scopeId}:${accessUuid}`;
  const storedAttemptId = await ports.store.getItem(attemptStorageKey);
  let offlineResume = false;
  let policyConfirmationRequired = false;
  let reservation: Awaited<ReturnType<ITransportPort['startSurveyAttempt']>> | null = null;

  try {
    try {
      reservation = await ports.transport.startSurveyAttempt(
        accessUuid,
        storedAttemptId || ports.createAttemptId(),
        scopeId,
      );
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'policy_changed' && !ports.confirmPolicyChange) {
        policyConfirmationRequired = true;
      } else if (['policy_changed', 'attempt_not_active', 'attempt_completed'].includes(code ?? '')) {
      // A terminal reservation result does not invalidate the saved answers.
      // Ask the server for a current reservation before restoring the draft.
        reservation = await ports.transport.startSurveyAttempt(accessUuid, ports.createAttemptId(), scopeId);
      } else {
        throw error;
      }
    }
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status !== 0 || !storedAttemptId) throw error;
    offlineResume = true;
  }

  if (offlineResume) {
    const cached = await ports.store.getItem(cacheKey);
    if (!cached) throw new Error('Reconnect to continue this saved survey draft.');
    const cachedMeta = JSON.parse(cached) as RemoteSurveyMeta;
    if (cachedMeta.survey.uuid !== accessUuid || !cachedMeta.survey.policyVersion) {
      throw new Error('Reconnect to refresh the rules for this saved survey draft.');
    }
    meta = cachedMeta;
  } else if (reservation) {
    meta.survey.policyVersion = reservation.policyVersion;
    meta.survey.policyConfirmationRequired = false;
    meta.survey.scopeId = reservation.scopeId;
    meta.survey.scopeKind = reservation.scopeKind;
    meta.survey.attemptId = reservation.attemptId;
    await ports.store.setItem(attemptStorageKey, reservation.attemptId);
  } else if (policyConfirmationRequired) {
    meta.survey.policyConfirmationRequired = true;
    meta.survey.attemptId = storedAttemptId ?? undefined;
  }

  // Only safe survey metadata survives restart; access grants and CSRF tokens
  // remain in the transport adapter's in-memory credential stores.
  const { accessGrant: _grant, csrfToken: _csrf, ...safeMeta } = meta;
  await ports.store.setItem(cacheKey, JSON.stringify(safeMeta));
  // A policy mismatch intentionally returns refreshed metadata without a new
  // reservation. Keep the stale attempt attached until the respondent reviews
  // the changed rules; do not dereference a missing reservation here.
  if (offlineResume) meta.survey.attemptId = storedAttemptId!;
  else if (reservation) meta.survey.attemptId = reservation.attemptId;
  meta.survey.attemptStorageKey = attemptStorageKey;
  return meta;
}
