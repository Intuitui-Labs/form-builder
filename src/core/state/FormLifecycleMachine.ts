import type { IFormLifecyclePort } from '../../ports/IFormLifecyclePort.js';
import type {
  FormLifecycleContext,
  FormLifecycleEvent,
  FormLifecyclePhase,
  TransitionResult,
} from './FormLifecycleTypes.js';

export interface FormLifecycleMachineOptions<T extends Record<string, unknown>> {
  initialValues?: T;
  isOnline?: boolean;
  initialStepIndex?: number;
  autoHydrate?: boolean;
}

/**
 * Pure, zero-dependency Finite State Machine (FSM) kernel for form lifecycles.
 * Eliminates impossible states, enforces deterministic phase transitions,
 * and maintains an immutable audit trail for telemetry and replay.
 */
export class FormLifecycleMachine<T extends Record<string, unknown>>
  implements IFormLifecyclePort<T>
{
  private context: FormLifecycleContext<T>;
  private auditTrail: FormLifecycleEvent<T>[] = [];
  private listeners: Set<(context: FormLifecycleContext<T>, event: FormLifecycleEvent<T>) => void> = new Set();

  constructor(options?: FormLifecycleMachineOptions<T>) {
    this.context = {
      phase: options?.autoHydrate ? 'idle' : 'unhydrated',
      activeStepIndex: options?.initialStepIndex ?? 0,
      stepHistory: [options?.initialStepIndex ?? 0],
      completedStepIndices: new Set<number>(),
      branchLineage: new Map<number, Set<number>>(),
      branchTargetHistory: new Map<number, number>(),
      values: (options?.initialValues ? { ...options.initialValues } : {}) as T,
      fieldErrors: {},
      touched: {},
      isOnline: options?.isOnline ?? true,
      pendingOutboxCount: 0,
    };
  }

  public getContext(): Readonly<FormLifecycleContext<T>> {
    return this.context;
  }

  public getPhase(): FormLifecyclePhase {
    return this.context.phase;
  }

  public getAuditTrail(): ReadonlyArray<FormLifecycleEvent<T>> {
    return [...this.auditTrail];
  }

  /**
   * Evaluates if a given event type can be legally accepted from the current lifecycle phase.
   */
  public can(eventType: FormLifecycleEvent<T>['type']): boolean {
    const { phase } = this.context;

    // Disallow advancing/submitting while unhydrated or during initial storage load
    if (phase === 'unhydrated' || phase === 'hydrating') {
      if (
        eventType === 'STEP_NEXT' ||
        eventType === 'STEP_PREV' ||
        eventType === 'STEP_JUMP' ||
        eventType === 'SUBMIT_START'
      ) {
        return false;
      }
    }

    // Disallow re-submitting, mutating fields, or navigating while submit/validation is in flight
    if (phase === 'submitting' || phase === 'validating_form') {
      if (
        eventType === 'SUBMIT_START' ||
        eventType === 'STEP_NEXT' ||
        eventType === 'STEP_PREV' ||
        eventType === 'STEP_JUMP' ||
        eventType === 'RESET' ||
        eventType === 'FIELD_CHANGE'
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Dispatches a lifecycle event to drive an atomic state transition.
   */
  public send(event: FormLifecycleEvent<T>): TransitionResult<T> {
    const previousPhase = this.context.phase;

    if (!this.can(event.type)) {
      return {
        accepted: false,
        context: this.context,
        previousPhase,
        reason: `Event '${event.type}' is rejected in phase '${previousPhase}'`,
      };
    }

    this.auditTrail.push(event);
    const nextContext = this.transition(this.context, event);
    this.context = nextContext;

    this.notify(event);

    return {
      accepted: true,
      context: this.context,
      previousPhase,
    };
  }

  public subscribe(
    listener: (context: FormLifecycleContext<T>, event: FormLifecycleEvent<T>) => void
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: FormLifecycleEvent<T>): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.context, event);
      } catch (err) {
        console.error('[FormLifecycleMachine] Listener error:', err);
      }
    });
  }

  private transition(
    ctx: FormLifecycleContext<T>,
    event: FormLifecycleEvent<T>
  ): FormLifecycleContext<T> {
    switch (event.type) {
      case 'HYDRATE_START':
        return { ...ctx, phase: 'hydrating' };

      case 'HYDRATE_SUCCESS': {
        const next: FormLifecycleContext<T> = { ...ctx, phase: 'idle' };
        if (event.draft) {
          next.values = { ...event.draft.values };
          next.activeStepIndex =
            event.draft.currentPageIndex ??
            (event.draft as any).activePageIndex ??
            0;
          next.stepHistory = [
            ...(event.draft.stepHistory ?? [next.activeStepIndex]),
          ];
          next.completedStepIndices = new Set(
            event.draft.completedStepIndices ??
              (event.draft as any).completedPageIndices ??
              []
          );
          next.lastSavedAt =
            event.draft.savedAt ?? (event.draft as any).updatedAt;
          if (Array.isArray(event.draft.branchLineage)) {
            next.branchLineage = new Map(
              event.draft.branchLineage.map(([k, v]) => [k, new Set(v)])
            );
          }
          if (Array.isArray(event.draft.branchTargetHistory)) {
            next.branchTargetHistory = new Map(event.draft.branchTargetHistory);
          }
        }
        return next;
      }

      case 'HYDRATE_ERROR':
        return { ...ctx, phase: 'idle', lastError: event.error };

      case 'FIELD_CHANGE': {
        const updatedValues = { ...ctx.values, [event.field]: event.value };
        const updatedTouched = { ...ctx.touched, [event.field]: true };
        const nextPhase =
          ctx.phase === 'unhydrated' || ctx.phase === 'submitting' || ctx.phase === 'validating_form'
            ? ctx.phase
            : 'idle';
        return {
          ...ctx,
          values: updatedValues,
          touched: updatedTouched,
          phase: nextPhase,
        };
      }

      case 'FIELD_FOCUS': {
        return {
          ...ctx,
          activeFocusedField: event.field,
        };
      }

      case 'FIELD_BLUR': {
        const updatedTouched = { ...ctx.touched, [event.field]: true };
        return {
          ...ctx,
          touched: updatedTouched,
          activeFocusedField:
            ctx.activeFocusedField === event.field ? undefined : ctx.activeFocusedField,
        };
      }

      case 'STEP_NEXT': {
        const nextIndex = event.nextIndex ?? ctx.activeStepIndex + 1;
        const nextCompleted = new Set(ctx.completedStepIndices);
        nextCompleted.add(ctx.activeStepIndex);

        // Prune obsolete steps if branch diversion occurred
        if (event.prunedStepIndices && event.prunedStepIndices.length > 0) {
          for (const pruned of event.prunedStepIndices) {
            nextCompleted.delete(pruned);
          }
        }

        // Update branch lineages & target history
        const nextLineage = new Map<number, Set<number>>();
        for (const [k, v] of ctx.branchLineage.entries()) {
          nextLineage.set(k, new Set(v));
        }
        const nextTargetHistory = new Map(ctx.branchTargetHistory);

        if (event.branchFromIndex !== undefined) {
          if (event.prunedStepIndices && event.prunedStepIndices.length > 0) {
            nextLineage.delete(event.branchFromIndex);
          }
          nextTargetHistory.set(event.branchFromIndex, nextIndex);
          const lineageSet = nextLineage.get(event.branchFromIndex) ?? new Set<number>();
          lineageSet.add(nextIndex);
          nextLineage.set(event.branchFromIndex, lineageSet);
        } else {
          for (const [, steps] of nextLineage.entries()) {
            if (steps.has(ctx.activeStepIndex)) {
              steps.add(nextIndex);
            }
          }
        }

        return {
          ...ctx,
          phase: 'idle',
          activeStepIndex: nextIndex,
          stepHistory: [...ctx.stepHistory, nextIndex],
          completedStepIndices: nextCompleted,
          branchLineage: nextLineage,
          branchTargetHistory: nextTargetHistory,
        };
      }

      case 'STEP_PREV': {
        if (event.targetIndex !== undefined) {
          const nextHistory = ctx.stepHistory.slice(0, ctx.stepHistory.lastIndexOf(event.targetIndex) + 1);
          return {
            ...ctx,
            phase: 'idle',
            activeStepIndex: event.targetIndex,
            stepHistory: nextHistory.length > 0 ? nextHistory : [event.targetIndex],
          };
        }
        if (ctx.stepHistory.length > 1) {
          const nextHistory = [...ctx.stepHistory];
          nextHistory.pop();
          const target = nextHistory[nextHistory.length - 1];
          return {
            ...ctx,
            phase: 'idle',
            activeStepIndex: target,
            stepHistory: nextHistory,
          };
        }
        return { ...ctx, phase: 'idle' };
      }

      case 'STEP_JUMP': {
        return {
          ...ctx,
          phase: 'idle',
          activeStepIndex: event.targetIndex,
          stepHistory: [...ctx.stepHistory, event.targetIndex],
        };
      }

      case 'COMPLETE_STEPS': {
        const nextCompleted = new Set(ctx.completedStepIndices);
        for (const stepIdx of event.stepIndices) {
          nextCompleted.add(stepIdx);
        }
        return {
          ...ctx,
          completedStepIndices: nextCompleted,
        };
      }

      case 'SUBMIT_START':
        return { ...ctx, phase: 'submitting', lastError: undefined };

      case 'SUBMIT_SUCCESS':
        return { ...ctx, phase: 'submitted', lastError: undefined };

      case 'SUBMIT_OFFLINE':
        return {
          ...ctx,
          phase: 'outbox_queued',
          pendingOutboxCount: ctx.pendingOutboxCount + 1,
        };

      case 'SUBMIT_ERROR':
        return { ...ctx, phase: 'idle', lastError: event.error };

      case 'OUTBOX_SYNC_START':
        return { ...ctx, phase: 'outbox_syncing' };

      case 'OUTBOX_SYNC_SUCCESS':
        return {
          ...ctx,
          phase: 'submitted',
          pendingOutboxCount: Math.max(0, ctx.pendingOutboxCount - 1),
        };

      case 'OUTBOX_SYNC_FAIL':
        return { ...ctx, phase: 'sync_error', lastError: event.error };

      case 'ONLINE_CHANGE':
        return { ...ctx, isOnline: event.isOnline };

      case 'OUTBOX_COUNT_CHANGE':
        return { ...ctx, pendingOutboxCount: event.count };

      case 'DRAFT_SAVED':
        return { ...ctx, lastSavedAt: event.savedAt };

      case 'DRAFT_CLEARED':
        return { ...ctx, lastSavedAt: undefined };

      case 'RESET':
        return {
          ...ctx,
          phase: 'idle',
          activeStepIndex: 0,
          stepHistory: [0],
          completedStepIndices: new Set<number>(),
          branchLineage: new Map<number, Set<number>>(),
          branchTargetHistory: new Map<number, number>(),
          values: {} as T,
          fieldErrors: {},
          touched: {},
          lastError: undefined,
          activeFocusedField: undefined,
        };

      default:
        return ctx;
    }
  }

  /**
   * Resets the machine and deterministically replays an array of lifecycle events.
   */
  public replay(events: FormLifecycleEvent<T>[]): FormLifecycleContext<T> {
    this.send({ type: 'RESET' });
    for (const evt of events) {
      this.send(evt);
    }
    return this.context;
  }
}
