import type { FormDraftSnapshot } from '../../schema/FormDraft.js';

export type FormLifecyclePhase =
  | 'unhydrated'
  | 'hydrating'
  | 'idle'
  | 'field_evaluating'
  | 'validating_step'
  | 'transitioning'
  | 'validating_form'
  | 'submitting'
  | 'submitted'
  | 'outbox_queued'
  | 'outbox_syncing'
  | 'sync_error'
  | 'fatal_error';

export type FormLifecycleEvent<T = Record<string, unknown>> =
  | { type: 'HYDRATE_START' }
  | { type: 'HYDRATE_SUCCESS'; draft?: FormDraftSnapshot<T> | null }
  | { type: 'HYDRATE_ERROR'; error: string }
  | { type: 'FIELD_CHANGE'; field: keyof T; value: unknown }
  | { type: 'FIELD_BLUR'; field: keyof T; dwellMs?: number }
  | { type: 'FIELD_FOCUS'; field: keyof T }
  | {
      type: 'STEP_NEXT';
      nextIndex?: number;
      branchFromIndex?: number;
      prunedStepIndices?: number[];
    }
  | { type: 'STEP_PREV'; targetIndex?: number }
  | { type: 'STEP_JUMP'; targetIndex: number }
  | { type: 'COMPLETE_STEPS'; stepIndices: number[] }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; receiptId?: string }
  | { type: 'SUBMIT_OFFLINE'; outboxId?: string }
  | { type: 'SUBMIT_ERROR'; error: string }
  | { type: 'OUTBOX_SYNC_START' }
  | { type: 'OUTBOX_SYNC_SUCCESS' }
  | { type: 'OUTBOX_SYNC_FAIL'; error: string }
  | { type: 'ONLINE_CHANGE'; isOnline: boolean }
  | { type: 'OUTBOX_COUNT_CHANGE'; count: number }
  | { type: 'DRAFT_SAVED'; savedAt: string }
  | { type: 'DRAFT_CLEARED' }
  | { type: 'RESET' };

export interface FormLifecycleContext<T = Record<string, unknown>> {
  phase: FormLifecyclePhase;
  activeStepIndex: number;
  stepHistory: number[];
  completedStepIndices: Set<number>;
  branchLineage: Map<number, Set<number>>;
  branchTargetHistory: Map<number, number>;
  values: T;
  fieldErrors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isOnline: boolean;
  pendingOutboxCount: number;
  lastSavedAt?: string;
  lastError?: string;
  activeFocusedField?: keyof T;
}

export interface TransitionResult<T = Record<string, unknown>> {
  accepted: boolean;
  context: FormLifecycleContext<T>;
  previousPhase: FormLifecyclePhase;
  reason?: string;
}
