export interface StepNavigationPolicy {
  /** If false, prohibits navigating backward (essential for speed quizzes & proctored exams) */
  allowBack?: boolean;
  /** If true, permits jumping ahead to unvisited steps */
  allowForwardJump?: boolean;
  /** If true, requires all visible required fields on the current step to pass validation before nextStep() */
  requireStepValidToAdvance?: boolean;
  /** Automatically trigger nextStep() after the step's question is answered */
  autoAdvanceOnComplete?: boolean;
  /** Delay in milliseconds before auto-advancing, allowing respondents to view feedback */
  autoAdvanceDelayMs?: number;
}

export interface InteractionPolicy {
  /** If true, locks all fields on the current step immediately after an answer is selected */
  lockOnSelection?: boolean;
  /** If true, allows changing selection before moving to the next step */
  allowRetry?: boolean;
  /** Maximum answer attempts permitted per question or step */
  maxAttemptsPerStep?: number;
}

export interface FeedbackPolicy {
  /** When evaluation and scoring feedback are revealed */
  timing?: 'instant' | 'on-step-submit' | 'deferred' | 'never';
  /** Whether to reveal the correct answer on failure */
  revealCorrectAnswer?: boolean;
  /** Whether to reveal rubric pedagogical explanation */
  revealExplanation?: boolean;
}

export interface IsolationPolicy {
  /** If true, strictly flushes any temporary question locks or selection flags on entering a new step */
  resetEphemeralLocksOnMount?: boolean;
  /** If true, strictly partitions form field values to prevent cross-step option collisions */
  isolateStepNamespace?: boolean;
}

export interface FormGovernanceConfig {
  navigation?: StepNavigationPolicy;
  interaction?: InteractionPolicy;
  feedback?: FeedbackPolicy;
  isolation?: IsolationPolicy;
}

export interface StepAffordanceSnapshot {
  /** Whether the user is permitted to navigate to the previous step */
  canGoBack: boolean;
  /** Whether the user is permitted to advance to the next step */
  canAdvance: boolean;
  /** Whether inputs on the active step are interactive and accept answers */
  canSelectAnswer: boolean;
  /** Whether the active step is currently locked due to policy or in-flight evaluation */
  isStepLocked: boolean;
  /** Whether the user is allowed to request hints */
  canRequestHint: boolean;
  /** Configured auto-advance delay in milliseconds */
  autoAdvanceDelayMs?: number;
}
