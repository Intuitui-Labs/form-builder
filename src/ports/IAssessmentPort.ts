import type { AssessmentState, QuestionEvaluation, QuestionRubric } from '../assessment/types.js';
import type { ScoreCondition } from '../assessment/branching.js';

/**
 * Outbound Port: Contract for assessment and quiz evaluation engines.
 * Adheres strictly to the Hexagonal Architecture Invariant:
 * The kernel core interacts solely with this interface type.
 * It never constructs or statically imports the assessment implementation on the default path.
 */
export interface IAssessmentPort {
  /**
   * Submits or updates an answer for a specific field/question.
   */
  submitAnswer(
    fieldId: string,
    value: unknown,
    options?: { latencyMs?: number }
  ): QuestionEvaluation | undefined;

  /**
   * Requests a pedagogical hint for a given question (and applies hint penalty if configured).
   */
  requestHint(fieldId: string): string | undefined;

  /**
   * Evaluates all form values in batch (typically for deferred exam mode upon submission).
   */
  gradeAll(values: Record<string, unknown>): Record<string, QuestionEvaluation>;

  /**
   * Dynamically registers or updates an evaluation rubric for a field at runtime.
   */
  registerRubric?(fieldId: string, rubric: QuestionRubric): void;

  /**
   * Returns current immutable assessment state snapshot.
   */
  getState(): Readonly<AssessmentState>;

  /**
   * Subscribes to fine-grained assessment state changes.
   */
  subscribe(listener: (state: AssessmentState) => void): () => void;

  /**
   * Starts or restarts the step timer for the active step.
   */
  startStepTimer(seconds?: number): void;

  /**
   * Stops the active step timer.
   */
  stopStepTimer(): void;

  /**
   * Notifies the assessment engine of mobile app suspension / resume events.
   */
  handleAppStateChange(state: 'active' | 'background' | 'inactive'): void;

  /**
   * Evaluates a score condition for adaptive branch jumping.
   */
  evaluateScoreCondition(condition: ScoreCondition): boolean;

  /**
   * Whether the assessment is configured for instant evaluation feedback.
   */
  isInstantTiming(): boolean;

  /**
   * Whether the assessment has a step timer configured.
   */
  hasStepTimer(): boolean;

  /**
   * Cleans up timers and event listeners.
   */
  dispose(): void;
}
