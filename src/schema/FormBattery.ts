import type { FormKind, FormAccessPolicy } from './FormSchema.js';

export type BatteryStage =
  | 'intake'
  | 'baseline'
  | 'intervention'
  | 'quiz'
  | 'longitudinal'
  | 'exit';

export interface BatteryPrerequisiteRule {
  /** IDs of forms that must be completed prior to unlocking this node */
  completedFormIds?: string[];
  /** Minimum score percentage required from prerequisite form(s) */
  minScorePercent?: number;
  /** Whether the user must supply an access code to enter */
  accessCodeRequired?: boolean;
  /** Valid access code if gated */
  validAccessCode?: string;
  /** Minimum delay in milliseconds after prerequisite completion before unlocking */
  unlockDelayMs?: number;
}

export interface BatteryNode {
  id: string;
  schemaId: string;
  title: string;
  description?: string;
  kind: FormKind;
  sequenceOrder: number;
  stage: BatteryStage;
  prerequisites?: BatteryPrerequisiteRule;
  accessPolicy?: FormAccessPolicy;
  /** Immediate next form ID to auto-suggest or transition into upon completion */
  nextFormId?: string;
  /** Optional metadata / tags */
  tags?: string[];
}

export interface SurveyBatterySchema {
  id: string;
  title: string;
  description?: string;
  initialFormId: string;
  nodes: BatteryNode[];
  createdAt?: string;
  updatedAt?: string;
}

export interface FormSubmissionHistoryItem {
  formId: string;
  completedAt?: string;
  isCompleted?: boolean;
  scorePercent?: number;
  pointsEarned?: number;
  attemptNumber: number;
  lastStepIndex?: number;
  totalSteps?: number;
  lastSavedAt?: string;
}

export interface BatteryAccessEvaluation {
  canStart: boolean;
  isCompleted: boolean;
  attemptsUsed: number;
  isLocked: boolean;
  reason?: 'prerequisite_unmet' | 'score_threshold_unmet' | 'max_attempts_reached' | 'time_locked' | 'cooldown_active' | 'access_code_required';
  missingFormIds?: string[];
  unlocksAt?: string;
  hasPartialProgress?: boolean;
  resumeStepIndex?: number;
}
