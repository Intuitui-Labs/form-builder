import type { IFormLifecyclePort } from '../../ports/IFormLifecyclePort.js';
import type {
  FormLifecycleContext,
  FormLifecycleEvent,
  FormLifecyclePhase,
  TransitionResult,
} from '../../core/state/FormLifecycleTypes.js';
import { FormLifecycleMachine } from '../../core/state/FormLifecycleMachine.js';

export interface XStateActorLike<T = Record<string, unknown>> {
  send: (event: FormLifecycleEvent<T>) => void;
  getSnapshot: () => {
    value: string | Record<string, string>;
    context?: Partial<FormLifecycleContext<T>>;
  };
  subscribe?: (listener: (snapshot: any) => void) => { unsubscribe: () => void } | (() => void);
}

export interface XStateLifecycleAdapterOptions<T extends Record<string, unknown>> {
  /**
   * Optional external XState v5 actor instance.
   * If not provided, adapter operates with a built-in statechart-compatible FSM kernel.
   */
  actor?: XStateActorLike<T>;
  initialValues?: T;
  isOnline?: boolean;
  initialStepIndex?: number;
  autoHydrate?: boolean;
}

/**
 * Hexagonal Adapter: Bridges IFormLifecyclePort to an external XState v5 Actor or Stately Inspector.
 * Allows enterprise teams to plug Stately visualizer / actor hierarchies without coupling
 * the core engine bundle to the xstate runtime.
 */
export class XStateLifecycleAdapter<T extends Record<string, unknown> = Record<string, unknown>>
  implements IFormLifecyclePort<T>
{
  private fallbackKernel: FormLifecycleMachine<T>;
  private actor?: XStateActorLike<T>;
  private listeners: Set<(context: FormLifecycleContext<T>, event: FormLifecycleEvent<T>) => void> = new Set();
  private auditTrail: FormLifecycleEvent<T>[] = [];

  constructor(options?: XStateLifecycleAdapterOptions<T>) {
    this.actor = options?.actor;
    this.fallbackKernel = new FormLifecycleMachine<T>({
      initialValues: options?.initialValues,
      isOnline: options?.isOnline,
      initialStepIndex: options?.initialStepIndex,
      autoHydrate: options?.autoHydrate ?? true,
    });

    if (this.actor?.subscribe) {
      this.actor.subscribe((snapshot) => {
        const phase = this.mapSnapshotValueToPhase(snapshot.value);
        const ctx: FormLifecycleContext<T> = {
          ...this.fallbackKernel.getContext(),
          ...(snapshot.context as Partial<FormLifecycleContext<T>>),
          phase,
        };
        const lastEvt = this.auditTrail[this.auditTrail.length - 1] ?? ({ type: 'RESET' } as FormLifecycleEvent<T>);
        this.listeners.forEach((listener) => listener(ctx, lastEvt));
      });
    }
  }

  public getContext(): Readonly<FormLifecycleContext<T>> {
    if (this.actor) {
      const snap = this.actor.getSnapshot();
      return {
        ...this.fallbackKernel.getContext(),
        ...(snap.context as Partial<FormLifecycleContext<T>>),
        phase: this.mapSnapshotValueToPhase(snap.value),
      };
    }
    return this.fallbackKernel.getContext();
  }

  public getPhase(): FormLifecyclePhase {
    if (this.actor) {
      const snap = this.actor.getSnapshot();
      return this.mapSnapshotValueToPhase(snap.value);
    }
    return this.fallbackKernel.getPhase();
  }

  public can(eventType: FormLifecycleEvent<T>['type']): boolean {
    return this.fallbackKernel.can(eventType);
  }

  public send(event: FormLifecycleEvent<T>): TransitionResult<T> {
    this.auditTrail.push(event);
    if (this.actor) {
      this.actor.send(event);
    }
    const result = this.fallbackKernel.send(event);
    this.listeners.forEach((l) => l(result.context, event));
    return result;
  }

  public subscribe(
    listener: (context: FormLifecycleContext<T>, event: FormLifecycleEvent<T>) => void
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getAuditTrail(): ReadonlyArray<FormLifecycleEvent<T>> {
    return [...this.auditTrail];
  }

  public replay(events: FormLifecycleEvent<T>[]): FormLifecycleContext<T> {
    this.auditTrail = [];
    return this.fallbackKernel.replay(events);
  }

  private mapSnapshotValueToPhase(value: string | Record<string, string>): FormLifecyclePhase {
    if (typeof value === 'string') {
      const validPhases: FormLifecyclePhase[] = [
        'unhydrated',
        'hydrating',
        'idle',
        'field_evaluating',
        'validating_step',
        'transitioning',
        'validating_form',
        'submitting',
        'submitted',
        'outbox_queued',
        'outbox_syncing',
        'sync_error',
        'fatal_error',
      ];
      if (validPhases.includes(value as FormLifecyclePhase)) {
        return value as FormLifecyclePhase;
      }
    }
    return 'idle';
  }
}
