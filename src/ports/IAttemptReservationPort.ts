/**
 * Result returned upon successful reservation or restoration of an attempt on the backend.
 */
export interface AttemptReservationReceipt {
  readonly attemptId: string;
  readonly policyVersion: string;
  readonly scopeId?: string;
  readonly scopeKind?: 'organization' | 'platform' | string;
  readonly resumed?: boolean;
  readonly metadata?: Record<string, unknown>;
}

export interface AttemptReservationError {
  readonly message: string;
  readonly status?: number; // 0 for offline/timeout, 400, 401, 403, 404, etc.
  readonly code?:
    | 'policy_changed'
    | 'attempt_not_active'
    | 'attempt_completed'
    | 'access_denied'
    | 'access_code_required'
    | string;
}

/**
 * Outbound Port: Contract for reserving or verifying a remote attempt session with a backend.
 * Zero external runtime dependencies.
 */
export interface IAttemptReservationPort {
  startAttempt(
    formId: string,
    attemptId: string,
    scopeId?: string,
  ): Promise<AttemptReservationReceipt>;
}
