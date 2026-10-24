import type { BatteryAccessEvaluation, FormSubmissionHistoryItem } from './FormBattery.js';

export type FormParticipationStatus =
  | 'eligible'
  | 'locked'
  | 'policy_drift_detected'
  | 'reserving';

export interface FormParticipationState {
  readonly status: FormParticipationStatus;
  readonly isLocked: boolean;
  readonly canSubmit: boolean;
  readonly evaluation?: BatteryAccessEvaluation;
  readonly lockReasonDescription?: string;
  readonly attemptId?: string;
  readonly policyVersion?: string;
  readonly draftPolicyVersion?: string;
  readonly driftDetails?: {
    readonly expectedVersion: string;
    readonly draftVersion: string;
  };
}

export interface FormParticipationConfig {
  readonly submissionHistory?: FormSubmissionHistoryItem[];
  readonly attemptId?: string;
  readonly policyVersion?: string;
  readonly formTitles?: Record<string, string>;
  readonly onPolicyDrift?: (drift: { expectedVersion: string; draftVersion: string }) => void;
  readonly onParticipationChange?: (state: FormParticipationState) => void;
}
