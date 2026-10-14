import type { Result } from '../core/Result.js';
import type { TransportError } from '../core/DomainErrors.js';

/**
 * Envelope containing a queued or submitted form response with idempotency metadata.
 */
export interface SubmissionEnvelope<T = Record<string, unknown>> {
  id: string; // Unique idempotency key (UUID/hash)
  formId: string;
  tenantId?: string;
  values: T;
  submittedAt: string;
  retryCount: number;
  experimentMetadata?: {
    experimentKey: string;
    variantId: string;
  };
}

/**
 * Receipt returned upon successful data delivery to the backend.
 */
export interface SubmissionReceipt {
  receiptId: string;
  status: 'accepted' | 'synced' | 'pending';
  timestamp: string;
  metadata?: Record<string, unknown>;
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
