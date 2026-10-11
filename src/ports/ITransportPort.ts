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
