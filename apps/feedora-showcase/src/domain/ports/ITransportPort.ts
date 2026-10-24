import type { RemoteSurveyMeta, RemoteSubmitResult } from './transportTypes';
import type { PrincipalId, ScopeRef } from '../identity';

/**
 * Application-level port: how the showcase talks to the Feedora research
 * backend over HTTP.
 *
 * Deliberately generic and server-shape-agnostic: today it is implemented by
 * `FeedoraHttpTransportAdapter` (form-encoded submit + JSON meta), but a
 * Supabase or in-memory implementation could slot in unchanged. The engine
 * knows nothing about this port.
 */
export interface ITransportPort {
  readonly name: string;

  /** Read-only survey metadata (features + questions) as JSON by UUID. */
  fetchSurveyMeta(accessUuid: string): Promise<RemoteSurveyMeta>;

  /** Reserve or resume a server-authorized attempt before opening a response draft. */
  startSurveyAttempt(accessUuid: string, attemptId: string, scopeId?: string): Promise<{ attemptId: string; policyVersion: string; scopeId: string; scopeKind: 'platform' | 'organization'; resumed: boolean }>;

  /** Verify a private survey code and retain the short-lived server grant. */
  verifySurveyAccessCode(accessUuid: string, accessCode: string): Promise<void>;

  /** Read-only survey metadata by 6-char access code. */
  fetchSurveyMetaByCode(accessCode: string): Promise<RemoteSurveyMeta>;

  /**
   * Submit answers keyed by question code (e.g. "PEU1"). The adapter maps codes
   * onto the server's question ids before posting.
   */
  submitResponse(
    accessUuid: string,
    answersByCode: Record<string, unknown>,
    options?: {
      variant?: string;
      platform?: string;
      durationMs?: number;
      dwellMs?: Record<string, number>;
      qualityFlags?: string[];
      consentVersion?: string;
      guestParticipantId?: string;
      submissionId?: string;
      principalId?: PrincipalId;
      scope?: ScopeRef;
      scopeId?: string;
      policyVersion?: string;
      attemptId?: string;
    },
  ): Promise<RemoteSubmitResult>;

  /** Fetch authoritative server-side analysis including construct scores and arm comparisons. */
  fetchSurveyAnalysis(accessUuid: string): Promise<import('./transportTypes').RemoteSurveyAnalysis>;

  /** Fetch leaderboard values calculated from responses in the selected organization. */
  fetchLeaderboard(entityId: string): Promise<import('./transportTypes').RemoteLeaderboardResult>;

  /** Update an organization's preference for aggregate completion counts. */
  setOrganizationAggregateSharing(entityId: string, enabled: boolean): Promise<void>;
}
