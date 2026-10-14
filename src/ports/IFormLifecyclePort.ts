import type {
  FormLifecycleContext,
  FormLifecycleEvent,
  FormLifecyclePhase,
  TransitionResult,
} from '../core/state/FormLifecycleTypes.js';

/**
 * Outbound Port: Hexagonal contract for Form Lifecycle State Management.
 * Allows enterprise consumers to bridge the headless engine to external state
 * orchestrators (such as XState v5, Legend-State, Redux, Zustand, or Vue/Svelte stores)
 * or use the default zero-dependency FormLifecycleMachine kernel.
 */
export interface IFormLifecyclePort<T extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * Retrieves current immutable context snapshot
   */
  getContext(): Readonly<FormLifecycleContext<T>>;

  /**
   * Retrieves current lifecycle phase
   */
  getPhase(): FormLifecyclePhase;

  /**
   * Evaluates if a given event type can be legally accepted from the current phase
   */
  can(eventType: FormLifecycleEvent<T>['type']): boolean;

  /**
   * Dispatches a lifecycle event to drive an atomic state transition
   */
  send(event: FormLifecycleEvent<T>): TransitionResult<T>;

  /**
   * Subscribes to lifecycle transitions and context modifications
   */
  subscribe(
    listener: (context: FormLifecycleContext<T>, event: FormLifecycleEvent<T>) => void
  ): () => void;

  /**
   * Returns immutable audit trail of all accepted events
   */
  getAuditTrail(): ReadonlyArray<FormLifecycleEvent<T>>;

  /**
   * Resets the machine and deterministically replays an array of lifecycle events
   */
  replay(events: FormLifecycleEvent<T>[]): FormLifecycleContext<T>;
}
