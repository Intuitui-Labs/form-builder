import type { Result } from '../core/Result.js';
import type { TransportError } from '../core/DomainErrors.js';

/**
 * Immutable actor attribution captured at the moment of form submission.
 * Decoupled from application-specific concepts like avatars or survey titles.
 */
export interface SubmissionAttribution {
  principalId: string;
  accountId?: string;
  anonymousId?: string;
  tenantId?: string;
  scopeId?: string;
  sessionId?: string;
}

/**
 * Runtime telemetry and psychometric quality flags captured during completion.
 */
export interface SubmissionTelemetryContext {
  platform?: 'ios' | 'android' | 'web' | 'desktop' | 'cli' | string;
  durationMs?: number;
  dwellMs?: Record<string, number>;
  qualityFlags?: string[];
  consentVersion?: string;
  clientVersion?: string;
}

/**
 * Envelope containing a queued or submitted form response with idempotency metadata.
 */
export interface SubmissionEnvelope<T = Record<string, unknown>, TMeta = Record<string, unknown>> {
  id: string; // Unique idempotency key (UUID/hash)
  formId: string;
  schemaVersion?: string;
  policyVersion?: string;
  tenantId?: string;
  values: T;
  submittedAt: string;
  retryCount: number;
  /** Immutable actor attribution captured when the intent was created. */
  attribution?: SubmissionAttribution;
  /** Runtime telemetry and audit quality flags captured during execution. */
  telemetry?: SubmissionTelemetryContext;
  /** Opaque consumer/adapter metadata treated immutably by the core engine. */
  metadata?: TMeta;
  /**
   * @deprecated Legacy context field preserved for backwards compatibility with existing adapters.
   * Prefer using `attribution`, `telemetry`, and `metadata`.
   */
  context?: {
    principalId?: string;
    profileUserId?: string;
    scopeId?: string;
    guestParticipantId?: string;
    policyVersion?: string;
    /** Adapter-owned opaque metadata needed to resume a remote submission workflow. */
    transportMetadata?: Record<string, string>;
    surveyTitle?: string;
    displayName?: string;
    avatar?: string;
    surveyId?: string;
    variant?: string;
    platform?: string;
    durationMs?: number;
    dwellMs?: Record<string, number>;
    qualityFlags?: string[];
    consentVersion?: string;
    [key: string]: unknown;
  };
  experimentMetadata?: {
    experimentKey: string;
    variantId: string;
  };
}

/**
 * Receipt returned upon successful data delivery to the backend.
 */
export interface SubmissionReceipt<TMeta = Record<string, unknown>> {
  receiptId: string;
  status: 'accepted' | 'synced' | 'pending';
  timestamp: string;
  metadata?: TMeta;
}

/**
 * Outbound Port: Contract for submitting form payloads to cloud APIs or callbacks.
 */
export interface ITransportPort<T = Record<string, unknown>> {
  submit(envelope: SubmissionEnvelope<T>): Promise<SubmissionReceipt>;
}

/**
 * Hardened Outbound Port: Contract for transport adapters that return
 * typed Result monads with classified retryability (e.g. 4xx client rejection vs 5xx server error).
 */
export interface IResilientTransportPort<T = Record<string, unknown>> extends ITransportPort<T> {
  submitSafe(envelope: SubmissionEnvelope<T>): Promise<Result<SubmissionReceipt, TransportError>>;
}
