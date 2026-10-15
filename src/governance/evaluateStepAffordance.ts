import type { FormGovernanceConfig, StepAffordanceSnapshot } from './types.js';

export interface EvaluateStepAffordanceParams {
  governance?: FormGovernanceConfig;
  stepIndex: number;
  totalSteps: number;
  isStepValid: boolean;
  isStepAnswered: boolean;
  isSubmitting?: boolean;
}

/**
 * Pure, zero-dependency affordance evaluator.
 * Derives allowable actions from declarative governance policies in O(1) time.
 */
export function evaluateStepAffordance(
  params: EvaluateStepAffordanceParams
): StepAffordanceSnapshot {
  const { governance, stepIndex, totalSteps, isStepValid, isStepAnswered, isSubmitting } = params;

  const nav = governance?.navigation;
  const interact = governance?.interaction;

  // 1. Navigation Affordance: Previous
  const allowBack = nav?.allowBack ?? true;
  const canGoBack = stepIndex > 0 && allowBack && !isSubmitting;

  // 2. Navigation Affordance: Advance
  const requireValid = nav?.requireStepValidToAdvance ?? true;
  const isAdvanceBlockedByValidation = requireValid && !isStepValid;
  const canAdvance = stepIndex < totalSteps - 1 && !isAdvanceBlockedByValidation && !isSubmitting;

  // 3. Interaction Affordance: Selection & Locking
  const lockOnSelection = interact?.lockOnSelection ?? false;
  const allowRetry = interact?.allowRetry ?? false;
  const isLockedBySelection = lockOnSelection && isStepAnswered && !allowRetry;
  const isStepLocked = Boolean(isSubmitting || isLockedBySelection);

  // 4. Input Affordances
  const canSelectAnswer = !isStepLocked;
  const canRequestHint = !isStepLocked && !isSubmitting;

  return {
    canGoBack,
    canAdvance,
    canSelectAnswer,
    isStepLocked,
    canRequestHint,
    autoAdvanceDelayMs: nav?.autoAdvanceDelayMs,
  };
}
