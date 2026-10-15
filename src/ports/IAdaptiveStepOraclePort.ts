import type { FormPage } from '../schema/FormSchema.js';
import type { AssessmentState } from '../assessment/types.js';

export interface AdaptiveStepContext<T = Record<string, unknown>> {
  completedPage: FormPage;
  completedPageIndex: number;
  currentValues: T;
  stepHistory: number[];
  assessmentState?: AssessmentState;
}

export type AdaptiveOracleDecision =
  | { action: 'continue' }
  | { action: 'inject_step'; page: FormPage; options?: { afterPageId?: string } }
  | { action: 'replace_branch'; anchorPageId: string; pages: FormPage[] }
  | { action: 'terminate'; confirmationMessage?: string };

/**
 * Outbound driven port for Runtime Generative AI Step Oracles.
 * Evaluates respondent responses at step boundaries to dynamically inject, branch,
 * or adapt upcoming pages in real time based on AI reasoning, medical triage, or adaptive difficulty.
 */
export interface IAdaptiveStepOraclePort<T = Record<string, unknown>> {
  readonly providerId: string;
  evaluateNextStep(context: AdaptiveStepContext<T>): Promise<AdaptiveOracleDecision>;
}
