import type { FormDraftSnapshot } from '../../schema/FormDraft.js';
import type {
  IDraftStoragePort,
  IStoragePort,
  INetworkStatusPort,
  ITransportPort,
  SubmissionEnvelope,
} from '../../ports/index.js';
import { DraftManager } from '../../persistence/DraftManager.js';
import { OfflineOutboxQueue } from '../../persistence/OfflineOutboxQueue.js';
import { resolveSemanticIntent } from '../../core/SemanticIntentResolver.js';
import type { FormResilienceOptions } from '../MultiStepFormManager.js';
import { MemoryStorageAdapter } from '../../adapters/storage/MemoryStorageAdapter.js';
import { AlwaysOnlineNetworkAdapter } from '../../adapters/network/AlwaysOnlineNetworkAdapter.js';
import { CallbackTransportAdapter } from '../../adapters/transport/CallbackTransportAdapter.js';
import type { MultiStepCoordinatorContext } from './types.js';

export class FormPersistenceCoordinator<T extends Record<string, unknown>> {
  public draftStorage: IDraftStoragePort;
  public storagePort: IStoragePort;
  public networkStatusPort: INetworkStatusPort;
  public transportPort: ITransportPort<T>;
  public outboxQueue?: OfflineOutboxQueue<T>;
  public enableOutbox: boolean;
  public autoRestoreDraft: boolean;
  public hasSavedDraftState: boolean = false;

  private unsubscribeNetwork?: () => void;
  private unsubscribeOutbox?: () => void;

  constructor(
    private ctx: MultiStepCoordinatorContext<T>,
    resOpt?: FormResilienceOptions<T>,
    onSubmit?: (values: T) => Promise<void> | void,
  ) {
    this.storagePort = resOpt?.storage ?? new MemoryStorageAdapter();
    this.networkStatusPort = resOpt?.networkStatus ?? new AlwaysOnlineNetworkAdapter();
    this.transportPort = (resOpt?.transport ?? new CallbackTransportAdapter<T>(onSubmit ?? (() => {}))) as ITransportPort<T>;
    this.enableOutbox = resOpt?.enableOutbox ?? true;
    this.autoRestoreDraft = resOpt?.autoRestoreDraft ?? false;

    if (resOpt?.draftStorage) {
      this.draftStorage = resOpt.draftStorage;
    } else {
      this.draftStorage = new DraftManager({
        storage: this.storagePort,
        debounceMs: resOpt?.draftDebounceMs,
      });
    }

    if (this.enableOutbox) {
      this.outboxQueue = new OfflineOutboxQueue<T>({
        storage: this.storagePort,
        networkStatus: this.networkStatusPort,
        transport: this.transportPort,
        batteryStatus: resOpt?.batteryStatus,
        criticalBatteryThreshold: resOpt?.criticalBatteryThreshold,
        throttleOnLowPower: resOpt?.throttleOnLowPower,
      });

      this.unsubscribeOutbox = this.outboxQueue.subscribe((q) => {
        q.getPendingCount().then((count) => {
          this.ctx.lifecyclePort.send({ type: 'OUTBOX_COUNT_CHANGE', count });
          this.ctx.notify();
        });
      });
    }

    const netPromise = this.networkStatusPort.isOnline();
    if (typeof netPromise !== 'boolean') {
      netPromise.then((onl) => {
        this.ctx.lifecyclePort.send({ type: 'ONLINE_CHANGE', isOnline: onl });
        this.ctx.notify();
      });
    }

    this.unsubscribeNetwork = this.networkStatusPort.subscribe((isOnline) => {
      this.ctx.lifecyclePort.send({ type: 'ONLINE_CHANGE', isOnline });
      this.ctx.notify();
    });
  }

  public initDraftCheck(): void {
    const checkDraft = async () => {
      try {
        const exists = await this.hasSavedDraft();
        this.hasSavedDraftState = exists;
        this.ctx.setHasSavedDraftState(exists);
        if (exists && this.autoRestoreDraft) {
          await this.restoreDraft();
        } else {
          // Transition machine to idle when no draft exists to prevent unhydrated deadlock
          this.ctx.lifecyclePort.send({ type: 'HYDRATE_SUCCESS' });
        }
      } catch (err: any) {
        this.ctx.lifecyclePort.send({
          type: 'HYDRATE_ERROR',
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        this.ctx.notify();
      }
    };
    checkDraft();
  }

  /**
   * Creates and persists a serializable snapshot of the active form state.
   */
  public createDraftSnapshot(): FormDraftSnapshot<T> {
    const state = this.ctx.formManager.getState();
    const context = this.ctx.lifecyclePort.getContext();
    const branchLineageArray: Array<[number, number[]]> = Array.from(
      context.branchLineage.entries()
    ).map(([src, set]) => [src, Array.from(set)]);

    const branchTargetHistoryArray: Array<[number, number]> = Array.from(
      context.branchTargetHistory.entries()
    );

    // Zero-Knowledge Draft Redaction: detect sensitive fields across all pages
    const redactedFields: string[] = [];
    for (const page of this.ctx.schema.pages) {
      for (const field of page.fields) {
        const meta = resolveSemanticIntent(field.semanticIntent);
        if (field.sensitive === true || meta?.isSensitive === true) {
          redactedFields.push(field.name);
        }
      }
    }

    const sanitizedValues = { ...(state.values as T) };
    for (const name of redactedFields) {
      delete (sanitizedValues as Record<string, unknown>)[name];
    }

    // Hostile Trap 1: Storage Quota Poisoning Defense (Clean Attachment Pointers only, no base64 buffers)
    for (const [key, val] of Object.entries(sanitizedValues as Record<string, unknown>)) {
      if (typeof val === 'string' && val.startsWith('data:') && val.length > 512) {
        delete (sanitizedValues as Record<string, unknown>)[key];
      } else if (val && typeof val === 'object') {
        if ('localUri' in val && 'size' in val) {
          const p = val as Record<string, unknown>;
          (sanitizedValues as Record<string, unknown>)[key] = {
            id: String(p.id || key),
            name: String(p.name || 'attachment'),
            size: Number(p.size || 0),
            mimeType: String(p.mimeType || 'application/octet-stream'),
            localUri: String(p.localUri || ''),
            remoteUrl: p.remoteUrl ? String(p.remoteUrl) : undefined,
          };
        }
      }
    }

    const partConfig = this.ctx.getParticipationConfig?.();
    const activePolicyVersion = partConfig?.policyVersion ?? (this.ctx.schema.accessPolicy as any)?.version;
    const attemptId = partConfig?.attemptId;

    return {
      schemaId: this.ctx.schema.id,
      schemaVersion: this.ctx.schema.version ?? '1.0.0',
      savedAt: new Date().toISOString(),
      currentPageIndex: this.ctx.getCurrentPageIndex(),
      completedStepIndices: Array.from(context.completedStepIndices).sort((a, b) => a - b),
      stepHistory: [...context.stepHistory],
      branchLineage: branchLineageArray,
      branchTargetHistory: branchTargetHistoryArray,
      values: sanitizedValues,
      redactedFields: redactedFields.length > 0 ? redactedFields : undefined,
      isSubmitted: state.submitSuccess,
      policyVersion: activePolicyVersion ? String(activePolicyVersion) : undefined,
      attemptId: attemptId ? String(attemptId) : undefined,
    };
  }

  /**
   * Creates and persists a serializable snapshot of the active form state immediately.
   */
  public saveDraft(): FormDraftSnapshot<T> {
    const snapshot = this.createDraftSnapshot();
    this.draftStorage.saveDraft(snapshot as FormDraftSnapshot);
    this.hasSavedDraftState = true;
    this.ctx.setHasSavedDraftState(true);
    this.ctx.lifecyclePort.send({ type: 'DRAFT_SAVED', savedAt: String(snapshot.savedAt) });
    return snapshot;
  }

  public scheduleAutoSaveDraft(): void {
    const snapshot = this.createDraftSnapshot();
    if (this.draftStorage.scheduleAutoSave) {
      this.draftStorage.scheduleAutoSave(
        snapshot as FormDraftSnapshot,
        (saved) => {
          this.hasSavedDraftState = true;
          this.ctx.setHasSavedDraftState(true);
          this.ctx.lifecyclePort.send({ type: 'DRAFT_SAVED', savedAt: String(saved.savedAt) });
          this.ctx.notify();
        },
        (err) => {
          console.warn('[MultiStepFormManager] Debounced autosave failed:', err);
        },
      );
    } else {
      this.saveDraft();
    }
  }

  public async flushDraft(): Promise<void> {
    if (this.draftStorage.flush) {
      await this.draftStorage.flush();
    }
  }

  public restoreDraft(inputSnapshot?: FormDraftSnapshot<T>): boolean | Promise<boolean> {
    if (inputSnapshot) {
      return this.applyDraftSnapshot(inputSnapshot);
    }

    const maybeSnapshot = this.draftStorage.loadDraft(this.ctx.schema.id);
    if (maybeSnapshot instanceof Promise) {
      return maybeSnapshot.then((snap) => {
        if (!snap) return false;
        return this.applyDraftSnapshot(snap as FormDraftSnapshot<T>);
      });
    }

    if (!maybeSnapshot) return false;
    return this.applyDraftSnapshot(maybeSnapshot as FormDraftSnapshot<T>);
  }

  private applyDraftSnapshot(snapshot: FormDraftSnapshot<T>): boolean {
    if (snapshot.schemaId !== this.ctx.schema.id) {
      return false;
    }

    // Restore field values
    if (snapshot.values) {
      for (const [key, value] of Object.entries(snapshot.values)) {
        this.ctx.formManager.setFieldValue(key as keyof T, value as any);
      }
    }

    if (snapshot.redactedFields) {
      for (const fieldName of snapshot.redactedFields) {
        (this.ctx.formManager as any).tsForm.setFieldValue(fieldName as any, undefined);
        this.ctx.formManager.resetFieldValidation(fieldName as keyof T);
      }
    }

    // Re-evaluate visibility and dynamic conditions
    this.ctx.pruneHiddenFieldValues();

    // Restore state atomically into FLM SSOT
    this.ctx.lifecyclePort.send({ type: 'HYDRATE_SUCCESS', draft: snapshot });
    this.ctx.onDraftHydrated?.(snapshot);
    this.ctx.notify();
    return true;
  }

  public async clearDraft(): Promise<void> {
    await this.draftStorage.clearDraft(this.ctx.schema.id);
    this.hasSavedDraftState = false;
    this.ctx.setHasSavedDraftState(false);
    this.ctx.lifecyclePort.send({ type: 'DRAFT_CLEARED' });
    this.ctx.notify();
  }

  public async hasSavedDraft(): Promise<boolean> {
    const res = await this.draftStorage.hasDraft(this.ctx.schema.id);
    this.hasSavedDraftState = res;
    this.ctx.setHasSavedDraftState(res);
    return res;
  }

  public async flushOutbox(force?: boolean): Promise<number> {
    if (!this.outboxQueue) return 0;
    const count = await this.outboxQueue.flush(force);
    const pending = await this.outboxQueue.getPendingCount();
    this.ctx.lifecyclePort.send({ type: 'OUTBOX_COUNT_CHANGE', count: pending });
    this.ctx.notify();
    return count;
  }

  public getOutboxQueue(): OfflineOutboxQueue<T> | undefined {
    return this.outboxQueue;
  }

  public async submit(): Promise<void> {
    if (!this.ctx.lifecyclePort.can('SUBMIT_START')) {
      if (this.ctx.telemetry) {
        this.ctx.telemetry.dispatch({
          type: 'submit_rejected' as any,
          formId: this.ctx.schema.id,
          stepIndex: this.ctx.getCurrentPageIndex(),
          phase: this.ctx.lifecyclePort.getPhase(),
          action: 'SUBMIT_START',
          timestamp: Date.now(),
        });
      }
      return;
    }

    this.ctx.pruneHiddenFieldValues();
    const startResult = this.ctx.lifecyclePort.send({ type: 'SUBMIT_START' });
    if (!startResult.accepted) {
      return;
    }

    // Validate only visible fields across pages in the active branch path before final submission
    let allValid = true;
    const activePathIndices = Array.from(new Set([...this.ctx.getStepHistory(), ...this.ctx.getProjectedPath()]));
    for (const pageIdx of activePathIndices) {
      const visibleFields = this.ctx.getVisibleFields(pageIdx);
      for (const field of visibleFields) {
        if (!this.ctx.formManager.validateField(field.name as keyof T)) {
          allValid = false;
        }
      }
    }

    if (!allValid) {
      this.ctx.lifecyclePort.send({ type: 'SUBMIT_ERROR', error: 'Validation failed' });
      this.ctx.notify();
      return;
    }

    // Mark visited steps as completed in FLM
    this.ctx.lifecyclePort.send({
      type: 'COMPLETE_STEPS',
      stepIndices: this.ctx.getStepHistory(),
    });

    const isOnline = await this.networkStatusPort.isOnline();

    if (!isOnline && this.enableOutbox && this.outboxQueue) {
      // Device is offline: enqueue into persistent outbox queue
      const envelope: SubmissionEnvelope<T> = {
        id: `sub_${this.ctx.schema.id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        formId: this.ctx.schema.id,
        tenantId: this.ctx.schema.tenantId,
        values: { ...(this.ctx.formManager.getState().values as T) },
        submittedAt: new Date().toISOString(),
        retryCount: 0,
      };

      await this.outboxQueue.enqueue(envelope);
      this.ctx.lifecyclePort.send({ type: 'SUBMIT_OFFLINE', outboxId: envelope.id });
      await this.clearDraft();
    } else {
      // Device is online: submit directly via formManager
      try {
        await this.ctx.formManager.submit({ skipValidation: true });
        const success = !!this.ctx.formManager.getState().submitSuccess;
        if (success) {
          this.ctx.lifecyclePort.send({ type: 'SUBMIT_SUCCESS' });
          await this.clearDraft();
        } else {
          this.ctx.lifecyclePort.send({ type: 'SUBMIT_ERROR', error: 'Submit failed' });
        }
      } catch (err: any) {
        this.ctx.lifecyclePort.send({ type: 'SUBMIT_ERROR', error: err?.message ?? 'Submit error' });
      }
    }
    this.ctx.notify();
  }

  public isOnline(): boolean {
    return this.ctx.lifecyclePort.getContext().isOnline;
  }

  public getPendingOutboxCount(): number {
    return this.ctx.lifecyclePort.getContext().pendingOutboxCount;
  }

  public destroy(): void {
    if (this.unsubscribeNetwork) {
      this.unsubscribeNetwork();
      this.unsubscribeNetwork = undefined;
    }
    if (this.unsubscribeOutbox) {
      this.unsubscribeOutbox();
      this.unsubscribeOutbox = undefined;
    }
    if (this.outboxQueue) {
      this.outboxQueue.destroy();
    }
    if (this.draftStorage && 'flush' in this.draftStorage) {
      (this.draftStorage as any).flush?.();
    }
  }
}
