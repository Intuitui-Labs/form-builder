import { Effect, Context, Layer, Stream } from 'effect';
import type { IFormLifecyclePort } from '../../ports/IFormLifecyclePort.js';
import type {
  FormLifecycleContext,
  FormLifecycleEvent,
  FormLifecyclePhase,
  TransitionResult,
} from '../../core/state/FormLifecycleTypes.js';
import {
  FormLifecycleMachine,
  type FormLifecycleMachineOptions,
} from '../../core/state/FormLifecycleMachine.js';

export interface LifecycleEventUpdate<T = Record<string, unknown>> {
  context: FormLifecycleContext<T>;
  event: FormLifecycleEvent<T>;
}

/**
 * Tier 2 Hexagonal Adapter: Bridges IFormLifecyclePort into Effect v4.
 *
 * Implements IFormLifecyclePort directly so it plugs into MultiStepFormManager seamlessly,
 * while providing Effect-native effects (sendEffect, getPhaseEffect) and reactive Streams
 * (changesStream) for Effect 4 application pipelines.
 */
export class EffectLifecycleAdapter<T extends Record<string, unknown> = Record<string, unknown>>
  implements IFormLifecyclePort<T>
{
  private kernel: FormLifecycleMachine<T>;

  constructor(options?: FormLifecycleMachineOptions<T>) {
    this.kernel = new FormLifecycleMachine<T>(options);
  }

  // --- IFormLifecyclePort Contract (Zero-overhead sync implementation) ---

  public getContext(): Readonly<FormLifecycleContext<T>> {
    return this.kernel.getContext();
  }

  public getPhase(): FormLifecyclePhase {
    return this.kernel.getPhase();
  }

  public can(eventType: FormLifecycleEvent<T>['type']): boolean {
    return this.kernel.can(eventType);
  }

  public send(event: FormLifecycleEvent<T>): TransitionResult<T> {
    return this.kernel.send(event);
  }

  public subscribe(
    listener: (context: FormLifecycleContext<T>, event: FormLifecycleEvent<T>) => void
  ): () => void {
    return this.kernel.subscribe(listener);
  }

  public getAuditTrail(): ReadonlyArray<FormLifecycleEvent<T>> {
    return this.kernel.getAuditTrail();
  }

  public replay(events: FormLifecycleEvent<T>[]): FormLifecycleContext<T> {
    return this.kernel.replay(events);
  }

  // --- Effect v4 Native Methods ---

  /**
   * Dispatches a lifecycle event wrapped in an Effect.
   */
  public sendEffect(event: FormLifecycleEvent<T>): Effect.Effect<TransitionResult<T>> {
    return Effect.sync(() => this.send(event));
  }

  /**
   * Retrieves the active lifecycle phase wrapped in an Effect.
   */
  public getPhaseEffect(): Effect.Effect<FormLifecyclePhase> {
    return Effect.sync(() => this.getPhase());
  }

  /**
   * Retrieves the current context snapshot wrapped in an Effect.
   */
  public getContextEffect(): Effect.Effect<Readonly<FormLifecycleContext<T>>> {
    return Effect.sync(() => this.getContext());
  }

  /**
   * Streams lifecycle event updates as an Effect 4 Stream.
   * Cancelling or completing the stream automatically tears down the underlying subscription.
   */
  public changesStream(): Stream.Stream<LifecycleEventUpdate<T>, unknown> {
    const self = this;

    async function* generate() {
      const buffer: LifecycleEventUpdate<T>[] = [];
      let notify: (() => void) | null = null;
      let isDone = false;

      const unsubscribe = self.subscribe((context, event) => {
        buffer.push({ context, event });
        if (notify) {
          notify();
          notify = null;
        }
      });

      try {
        while (!isDone) {
          if (buffer.length > 0) {
            yield buffer.shift()!;
          } else {
            await new Promise<void>((resolve) => {
              notify = resolve;
            });
          }
        }
      } finally {
        isDone = true;
        unsubscribe();
      }
    }

    return Stream.fromAsyncIterable(generate(), (err) => err);
  }
}

/**
 * Official Effect 4.0 Service definition for Lifecycle management
 */
export class LifecycleService extends Context.Service<LifecycleService, IFormLifecyclePort<Record<string, unknown>>>()(
  '@intuitui-labs/LifecycleService',
) {
  public static readonly layer = (options?: FormLifecycleMachineOptions<Record<string, unknown>>) =>
    Layer.succeed(
      LifecycleService,
      LifecycleService.of(new EffectLifecycleAdapter<Record<string, unknown>>(options)),
    );
}
