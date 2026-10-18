import type { RemoteSurveyMeta, RemoteSubmitResult } from './transportTypes';

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
    },
  ): Promise<RemoteSubmitResult>;
}
