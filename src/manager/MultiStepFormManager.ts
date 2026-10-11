import { FormHydrator } from '../hydrator/FormHydrator.js';
import type { FormField, FormPage, FormSchema } from '../schema/FormSchema.js';
import type {
  BreadcrumbItem,
  FeedbackAffordanceMode,
  FormAffordanceConfig,
  FormAffordanceState,
  NavigationPolicy,
  ProgressMetrics,
  ProgressPresentation,
  StepStatus,
} from '../schema/FormAffordance.js';
import type {
  FieldGuidanceState,
  StepFocusPlan,
} from '../schema/FormGuidance.js';
import type { FormDraftSnapshot } from '../schema/FormDraft.js';
import type {
  IFeedbackNotifierPort,
  IProgressStrategyPort,
  IRewardEnginePort,
  ISchemaValidator,
  IDraftStoragePort,
  IStoragePort,
  INetworkStatusPort,
  ITransportPort,
  SubmissionEnvelope,
  RewardPayload,
  StepProgressContext,
  ProgressCalculationResult,
} from '../ports/index.js';
import {
  LinearStepProgressAdapter,
  WeightedFieldProgressAdapter,
  NullRewardAdapter,
  MemoryStorageAdapter,
  AlwaysOnlineNetworkAdapter,
  CallbackTransportAdapter,
  resolveAffordanceConfig,
  type ResolvedAffordanceConfig,
} from '../adapters/index.js';
import { DraftManager } from '../persistence/DraftManager.js';
import { OfflineOutboxQueue, type OutboxSyncStatus } from '../persistence/OfflineOutboxQueue.js';
import { evaluateCondition } from '../core/ConditionEvaluator.js';
import { resolveSemanticIntent } from '../core/SemanticIntentResolver.js';
import { PaymentCardHelper } from '../core/PaymentCardHelper.js';
import { PasswordEntropyEstimator } from '../core/PasswordEntropyEstimator.js';
import type { CardBrand } from '../schema/FormGuidance.js';
import { NativeFocusController } from '../focus/NativeFocusController.js';
import { FormManager } from './FormManager.js';


export type ProgressCalculatorFunction = (
  context: StepProgressContext
) => ProgressCalculationResult;

export interface MultiStepFormOptions {
  schemaValidator?: ISchemaValidator<FormSchema>;
  validateSchemaOnMount?: boolean;
  affordanceConfig?: FormAffordanceConfig;
  progressStrategy?: IProgressStrategyPort | ProgressCalculatorFunction;
  rewardEngine?: IRewardEnginePort;
  feedbackNotifier?: IFeedbackNotifierPort;
  draftStorage?: IDraftStoragePort;
  autoSaveDraft?: boolean;
  storage?: IStoragePort;
  networkStatus?: INetworkStatusPort;
  transport?: ITransportPort;
  autoRestoreDraft?: boolean;
  draftDebounceMs?: number;
  enableOutbox?: boolean;
}

export class MultiStepFormManager<T extends Record<string, unknown>> {
  private schema: FormSchema;
  private formManager: FormManager<T>;
  private currentPageIndex = 0;
  private completedStepIndices: Set<number> = new Set();
  private evaluatedMilestones: Set<string> = new Set();
  private stepHistory: number[] = [0];
  private branchLineage: Map<number, Set<number>> = new Map();
  private branchTargetHistory: Map<number, number> = new Map();
  private subscribers: Set<(manager: MultiStepFormManager<T>) => void> = new Set();

  private policy: ResolvedAffordanceConfig;
  private progressStrategy: IProgressStrategyPort;
  private rewardEngine: IRewardEnginePort;
  private feedbackNotifier?: IFeedbackNotifierPort;
  private draftStorage: IDraftStoragePort;
  private autoSaveDraft: boolean;
  private activeReward: RewardPayload | null = null;

  // Phase 2: Persistence & Outbox state
  private storagePort: IStoragePort;
  private networkStatusPort: INetworkStatusPort;
  private transportPort: ITransportPort<T>;
  private outboxQueue?: OfflineOutboxQueue<T>;
  private enableOutbox: boolean;
  private autoRestoreDraft: boolean;

  public readonly focusController: NativeFocusController = new NativeFocusController();

  private isHydratedState = false;
  private hasSavedDraftState = false;
  private lastSavedAtState?: string;
  private pendingOutboxCountState = 0;
  private isOnlineState = true;
  private syncStatusState: OutboxSyncStatus = 'idle';
  private lastSyncErrorState?: string;


  constructor(
    schema: FormSchema,
    onSubmit: (values: T) => Promise<void> | void,
    options?: MultiStepFormOptions,
  ) {
    if (options?.validateSchemaOnMount && options.schemaValidator) {
      options.schemaValidator.validate(schema);
    }

    this.schema = schema;

    // Resolve Affordance Policy
    const userConfig =
      options?.affordanceConfig ||
      schema.affordanceConfig ||
      schema.settings?.affordanceConfig;

    this.policy = resolveAffordanceConfig(userConfig);

    // Resolve Strategy & Ports
    if (typeof options?.progressStrategy === 'function') {
      const calcFn = options.progressStrategy;
      this.progressStrategy = { calculateProgress: calcFn };
    } else if (options?.progressStrategy) {
      this.progressStrategy = options.progressStrategy;
    } else if (this.policy.progress === 'weighted-velocity') {
      this.progressStrategy = new WeightedFieldProgressAdapter();
    } else {
      this.progressStrategy = new LinearStepProgressAdapter();
    }

    this.rewardEngine = options?.rewardEngine ?? new NullRewardAdapter();
    this.feedbackNotifier = options?.feedbackNotifier;

    // Phase 2: Storage, Network & Outbox resolution
    this.storagePort = options?.storage ?? new MemoryStorageAdapter();
    this.networkStatusPort = options?.networkStatus ?? new AlwaysOnlineNetworkAdapter();
    this.transportPort = options?.transport ?? new CallbackTransportAdapter<T>(onSubmit);
    this.enableOutbox = options?.enableOutbox ?? true;
    this.autoRestoreDraft = options?.autoRestoreDraft ?? false;

    if (options?.draftStorage) {
      this.draftStorage = options.draftStorage;
    } else {
      this.draftStorage = new DraftManager({
        storage: this.storagePort,
        debounceMs: options?.draftDebounceMs,
      });
    }

    this.autoSaveDraft = options?.autoSaveDraft ?? false;

    if (this.enableOutbox) {
      this.outboxQueue = new OfflineOutboxQueue<T>({
        storage: this.storagePort,
        networkStatus: this.networkStatusPort,
        transport: this.transportPort,
      });

      this.outboxQueue.subscribe((q) => {
        this.syncStatusState = q.getSyncStatus();
        this.lastSyncErrorState = q.getLastSyncError();
        q.getPendingCount().then((count) => {
          this.pendingOutboxCountState = count;
          this.notify();
        });
      });
    }

    const netPromise = this.networkStatusPort.isOnline();
    if (typeof netPromise === 'boolean') {
      this.isOnlineState = netPromise;
    } else {
      netPromise.then((onl) => {
        this.isOnlineState = onl;
        this.notify();
      });
    }

    this.networkStatusPort.subscribe((isOnline) => {
      this.isOnlineState = isOnline;
      this.notify();
    });

    this.isHydratedState = !this.autoRestoreDraft;

    // Check draft existence / auto-restore
    const checkDraft = async () => {
      try {
        const exists = await this.hasSavedDraft();
        this.hasSavedDraftState = exists;
        if (exists && this.autoRestoreDraft) {
          await this.restoreDraft();
        }
      } finally {
        this.isHydratedState = true;
        this.notify();
      }
    };
    checkDraft();

    // Flatten all fields across all pages to pass to FormHydrator
    const allFields = schema.pages.flatMap((page) => page.fields);
    this.formManager = FormHydrator.hydrate<T>({ fields: allFields as any }, onSubmit);

    // Asynchronous Hydration Race Guard: never save initial empty state over existing storage!
    let isSubscribedMounted = false;
    this.formManager.subscribe(() => {
      if (!isSubscribedMounted) {
        isSubscribedMounted = true;
        return;
      }
      if (this.autoSaveDraft && this.isHydratedState) {
        this.saveDraft();
      }
      this.notify();
    });
  }

  public getState(): ReturnType<FormManager<T>['getState']> & { fieldErrors: Partial<Record<keyof T, string>> } {
    const s = this.formManager.getState();
    return {
      ...s,
      fieldErrors: s.errors,
    };
  }



  public getFocusController(): NativeFocusController {
    return this.focusController;
  }

  public subscribeToField<K extends keyof T>(
    field: K,
    callback: (value: T[K], error?: string, isVisible?: boolean) => void,
  ): () => void {
    return this.formManager.subscribeToField(field, callback);
  }

  public setFieldTouched<K extends keyof T>(field: K, isTouched = true): void {
    this.formManager.setFieldTouched(field, isTouched);
  }

  public isFieldTouched<K extends keyof T>(field: K): boolean {
    return this.formManager.isFieldTouched(field);
  }

  public setFieldValue<K extends keyof T>(field: K, value: T[K]): void {
    this.formManager.setFieldValue(field, value);
  }

  public blurField<K extends keyof T>(field: K): void {
    this.formManager.blurField(field);
    this.notify();
  }

  public getFormManager(): FormManager<T> {
    return this.formManager;
  }


  public getPages(): FormPage[] {
    return this.schema.pages;
  }

  public getCurrentPage(): FormPage {
    return this.schema.pages[this.currentPageIndex]!;
  }

  public getCurrentPageIndex(): number {
    return this.currentPageIndex;
  }

  public getTotalPages(): number {
    return this.schema.pages.length;
  }

  public isFirstStep(): boolean {
    return this.currentPageIndex === 0;
  }

  public isLastStep(): boolean {
    return this.getNextPageIndex() === null;
  }

  public getCompletedStepIndices(): number[] {
    return Array.from(this.completedStepIndices).sort((a, b) => a - b);
  }

  public getActiveReward(): RewardPayload | null {
    return this.activeReward;
  }

  public clearActiveReward(): void {
    this.activeReward = null;
    this.notify();
  }

  public resetMilestones(): void {
    this.evaluatedMilestones.clear();
    this.activeReward = null;
    this.notify();
  }

  public subscribe(callback: (manager: MultiStepFormManager<T>) => void): () => void {
    this.subscribers.add(callback);
    callback(this);
    return () => this.subscribers.delete(callback);
  }

  private notify() {
    this.subscribers.forEach((cb) => cb(this));
  }

  /**
   * Returns only the fields that are currently visible on the target page.
   * Evaluates field-level `visibleIf` rules against active form values.
   */
  public getVisibleFields(pageIndex: number = this.currentPageIndex): FormField[] {
    const page = this.schema.pages[pageIndex];
    if (!page) return [];
    const values = this.formManager.getState().values as Record<string, unknown>;
    return page.fields.filter((field) => {
      if (!field.visibleIf) return true;
      return evaluateCondition(field.visibleIf, values);
    });
  }

  /**
   * Cleans up stale data for fields that have become hidden and configured to clearValueOnHide.
   */
  public pruneHiddenFieldValues(): void {
    const values = this.formManager.getState().values as Record<string, unknown>;
    for (const page of this.schema.pages) {
      for (const field of page.fields) {
        if (field.visibleIf && field.clearValueOnHide !== false) {
          const isVisible = evaluateCondition(field.visibleIf, values);
          if (!isVisible && values[field.name] !== undefined) {
            this.formManager.setFieldValue(field.name as keyof T, undefined as any);
          }
        }
      }
    }
  }

  public markFieldTouched(fieldName: string): void {
    this.formManager.setFieldTouched(fieldName as keyof T, true);
    this.notify();
  }

  /**
   * Validates only the visible fields on the current active page.
   */
  public validateCurrentStep(): boolean {
    const visibleFields = this.getVisibleFields(this.currentPageIndex);
    let isPageValid = true;

    for (const field of visibleFields) {
      this.formManager.setFieldTouched(field.name as keyof T, true);
      if (!this.formManager.validateField(field.name as keyof T)) {
        isPageValid = false;
      }
    }

    return isPageValid;
  }


  /**
   * Resolves the next target page index from a given page index.
   */
  public resolveNextPageIndexFrom(pageIndex: number): number | null {
    const page = this.schema.pages[pageIndex];
    if (!page) return null;
    const values = this.formManager.getState().values as Record<string, unknown>;

    // 1. Evaluate jumpRules
    if (page.jumpRules && page.jumpRules.length > 0) {
      for (const rule of page.jumpRules) {
        if (evaluateCondition(rule.condition, values)) {
          const targetIndex = this.schema.pages.findIndex(
            (p) => p.id === rule.targetPageId
          );
          if (targetIndex !== -1) {
            return targetIndex;
          }
        }
      }
    }

    // 2. Evaluate defaultNextPageId
    if (page.defaultNextPageId) {
      const targetIndex = this.schema.pages.findIndex(
        (p) => p.id === page.defaultNextPageId
      );
      if (targetIndex !== -1) {
        return targetIndex;
      }
    }

    // 3. Fallback to linear progression
    if (pageIndex < this.schema.pages.length - 1) {
      return pageIndex + 1;
    }

    return null;
  }

  /**
   * Resolves the next target page index from current page by evaluating conditional jump rules,
   * defaultNextPageId, or falling back to linear sequence.
   */
  public getNextPageIndex(): number | null {
    return this.resolveNextPageIndexFrom(this.currentPageIndex);
  }

  /**
   * Checks whether a page is a branching decision node (has configured jumpRules).
   */
  public isBranchingStep(pageIndex: number = this.currentPageIndex): boolean {
    const page = this.schema.pages[pageIndex];
    return Boolean(page && page.jumpRules && page.jumpRules.length > 0);
  }

  /**
   * Checks whether altering values on the given branching step would divert navigation
   * down a different path than previously traversed.
   */
  public willDivertBranch(pageIndex: number = this.currentPageIndex): boolean {
    if (!this.isBranchingStep(pageIndex)) return false;
    if (!this.branchTargetHistory.has(pageIndex)) return false;
    const previousTarget = this.branchTargetHistory.get(pageIndex);
    const currentTarget = this.resolveNextPageIndexFrom(pageIndex);
    return previousTarget !== currentTarget;
  }

  /**
   * Checks whether downstream steps belonging to a previous branch taken from pageIndex
   * currently contain non-empty user input data.
   */
  public hasDownstreamBranchData(pageIndex: number = this.currentPageIndex): boolean {
    const downstream = this.branchLineage.get(pageIndex);
    if (!downstream || downstream.size === 0) return false;
    const values = this.formManager.getState().values as Record<string, unknown>;
    for (const stepIdx of downstream) {
      const page = this.schema.pages[stepIdx];
      if (page) {
        for (const f of page.fields) {
          const val = values[f.name];
          if (val !== undefined && val !== null && val !== '') {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Returns the list of downstream step indices that were visited under the branch originating at pageIndex.
   */
  public getDownstreamBranchStepIndices(pageIndex: number = this.currentPageIndex): number[] {
    return Array.from(this.branchLineage.get(pageIndex) ?? []);
  }

  /**
   * Calculates the active projected sequence of page indices from start to projected end,
   * taking into account history and dynamic jump rules with cycle detection.
   */
  public getProjectedPath(): number[] {
    const path: number[] = [...this.stepHistory];
    let currentIdx = path[path.length - 1] ?? 0;
    const visited = new Set<number>(path);
    const maxHops = this.schema.pages.length * 2;
    let hops = 0;

    while (hops < maxHops) {
      hops++;
      const nextIdx = this.resolveNextPageIndexFrom(currentIdx);
      if (nextIdx === null || visited.has(nextIdx)) {
        break;
      }
      path.push(nextIdx);
      visited.add(nextIdx);
      currentIdx = nextIdx;
    }

    return path;
  }

  /**
   * Check whether navigation to target page index is permitted under the active policy.
   */
  public canNavigateToStep(targetIndex: number): boolean {
    if (targetIndex < 0 || targetIndex >= this.schema.pages.length) {
      return false;
    }

    if (targetIndex === this.currentPageIndex) {
      return true;
    }

    if (this.policy.navigation === 'random-access-open') {
      return true;
    }

    if (this.policy.navigation === 'visited-only') {
      if (this.completedStepIndices.has(targetIndex)) {
        return true;
      }
      const nextIndex = this.getNextPageIndex();
      if (targetIndex === nextIndex && this.validateCurrentStep()) {
        return true;
      }
      return false;
    }

    // 'strict-linear': can retrace to immediate previous step or advance if valid
    const prevHistory = this.stepHistory[this.stepHistory.length - 2];
    if (targetIndex === prevHistory || targetIndex === this.currentPageIndex - 1) {
      return true;
    }
    const nextIndex = this.getNextPageIndex();
    if (targetIndex === nextIndex && this.validateCurrentStep()) {
      return true;
    }

    return false;
  }

  public nextStep(): boolean {
    const nextIndex = this.getNextPageIndex();
    if (nextIndex === null) {
      return false;
    }

    // Validate only visible fields on current page
    if (!this.validateCurrentStep()) {
      const currentStepFields = this.getCurrentPage().fields.map((f) => f.name);
      this.focusController.focusFirstInvalid(this.formManager.getState().errors as Record<string, string | undefined>, currentStepFields);
      this.notify();
      return false;
    }



    // Prune stale values from fields that just became hidden
    this.pruneHiddenFieldValues();

    const completedIndex = this.currentPageIndex;
    const completedPage = this.getCurrentPage();

    // Branch diversion management: if user changed their branching answer,
    // prune only downstream branch steps while leaving normal/ancestor steps intact
    if (this.isBranchingStep(completedIndex)) {
      if (this.willDivertBranch(completedIndex)) {
        const obsoleteSteps = this.branchLineage.get(completedIndex);
        if (obsoleteSteps) {
          for (const stepIdx of obsoleteSteps) {
            this.completedStepIndices.delete(stepIdx);
            // Reset values of fields belonging to obsolete branch steps
            const page = this.schema.pages[stepIdx];
            if (page) {
              for (const f of page.fields) {
                this.formManager.setFieldValue(f.name as any, (f.defaultValue ?? '') as any);
              }
            }
          }
          this.branchLineage.delete(completedIndex);
        }
      }
      this.branchTargetHistory.set(completedIndex, nextIndex);
      const lineageSet = this.branchLineage.get(completedIndex) ?? new Set<number>();
      lineageSet.add(nextIndex);
      this.branchLineage.set(completedIndex, lineageSet);
    } else {
      // Normal linear step: track into active ancestor branch lineages if inside a branch
      for (const [, steps] of this.branchLineage.entries()) {
        if (steps.has(completedIndex)) {
          steps.add(nextIndex);
        }
      }
    }

    this.completedStepIndices.add(completedIndex);

    // Evaluate potential milestone rewards (deduplicated by milestone key)
    this.triggerRewardEvaluation(completedIndex, completedPage);

    this.stepHistory.push(nextIndex);
    this.currentPageIndex = nextIndex;
    if (this.autoSaveDraft) {
      this.saveDraft();
    }
    this.notify();
    return true;
  }

  public prevStep(): boolean {
    if (this.isFirstStep()) {
      return false;
    }

    if (this.stepHistory.length > 1) {
      this.stepHistory.pop(); // Remove current
      this.currentPageIndex = this.stepHistory[this.stepHistory.length - 1]!;
      if (this.autoSaveDraft) {
        this.saveDraft();
      }
      this.notify();
      return true;
    }

    if (this.currentPageIndex > 0) {
      this.currentPageIndex--;
      if (this.autoSaveDraft) {
        this.saveDraft();
      }
      this.notify();
      return true;
    }

    return false;
  }

  public goToStep(index: number): boolean {
    if (!this.canNavigateToStep(index)) {
      return false;
    }
    this.stepHistory.push(index);
    this.currentPageIndex = index;
    if (this.autoSaveDraft) {
      this.saveDraft();
    }
    this.notify();
    return true;
  }

  private triggerRewardEvaluation(completedIndex: number, completedPage: FormPage): void {
    const milestoneKey = `${this.schema.id}:${completedPage.id}:${completedIndex}`;
    if (this.evaluatedMilestones.has(milestoneKey)) {
      return; // Milestone already evaluated this session (prevents farming)
    }
    this.evaluatedMilestones.add(milestoneKey);

    const formState = this.formManager.getState();
    const allValues = formState.values;
    const stepData: Record<string, unknown> = {};

    for (const field of completedPage.fields) {
      stepData[field.name] = (allValues as Record<string, unknown>)[field.name];
    }

    const progress = this.getProgress();
    const context = {
      formId: this.schema.id,
      completedStepId: completedPage.id,
      completedStepIndex: completedIndex,
      completedPage,
      stepIndex: completedIndex,
      totalSteps: this.schema.pages.length,
      stepData,
      allValues: allValues as Record<string, unknown>,
      progress,
    };

    const maybeReward = this.rewardEngine.evaluateMilestone(context);
    if (maybeReward instanceof Promise) {
      maybeReward.then((reward) => {
        if (reward) {
          this.activeReward = reward;
          this.feedbackNotifier?.notifyRewardUnlocked(reward);
          this.notify();
        }
      });
    } else if (maybeReward) {
      this.activeReward = maybeReward;
      this.feedbackNotifier?.notifyRewardUnlocked(maybeReward);
    }
  }

  public getProgress(): ProgressMetrics {
    const projectedPath = this.getProjectedPath();
    const projectedPages = projectedPath.map((idx) => this.schema.pages[idx]!);
    const completedInPath = projectedPath.filter((idx) =>
      this.completedStepIndices.has(idx)
    );

    return this.progressStrategy.calculateProgress({
      formId: this.schema.id,
      currentStepIndex: this.currentPageIndex,
      currentStepId: this.getCurrentPage()?.id ?? '',
      completedStepIds: completedInPath.map((idx) => this.schema.pages[idx]?.id ?? ''),
      completedStepIndices: completedInPath,
      pages: projectedPages,
      totalProjectedSteps: Math.max(1, projectedPath.length),
      fieldValues: this.formManager.getState().values as Record<string, unknown>,
    });
  }

  /**
   * Generates a proactive focus and keyboard traversal plan for the active page,
   * mapping auto-focus targets and next/done return keys across visible interactive fields.
   * Excludes multiline textareas from single-line next/done return keys to preserve multiline editing.
   */
  public getStepFocusPlan(pageIndex: number = this.currentPageIndex): StepFocusPlan {
    const visibleFields = this.getVisibleFields(pageIndex);
    const interactiveFields = visibleFields.filter(
      (f) => f.type !== 'heading' && f.type !== 'divider'
    );

    const traversalOrder = interactiveFields.map((f) => f.name);
    const returnKeyTypes: Record<string, 'next' | 'done' | 'default'> = {};

    interactiveFields.forEach((f, idx) => {
      if (f.type === 'textarea') {
        returnKeyTypes[f.name] = 'default';
      } else {
        returnKeyTypes[f.name] = idx === interactiveFields.length - 1 ? 'done' : 'next';
      }
    });

    const explicitAutoFocus = interactiveFields.find((f) => f.autoFocus);
    const initialFocusFieldId = explicitAutoFocus
      ? explicitAutoFocus.id
      : interactiveFields[0]?.id;

    return {
      initialFocusFieldId,
      traversalOrder,
      returnKeyTypes: returnKeyTypes as Record<string, 'next' | 'done'>,
    };
  }

  /**
   * Returns proactive human-centric guidance metadata for a specific field,
   * avoiding reactive error shaming until the user has actually touched the field.
   */
  public getFieldGuidance(fieldName: string): FieldGuidanceState | undefined {
    let foundField: FormField | undefined;
    for (const page of this.schema.pages) {
      const f = page.fields.find((field) => field.name === fieldName);
      if (f) {
        foundField = f;
        break;
      }
    }

    if (!foundField) return undefined;

    const values = this.formManager.getState().values as Record<string, unknown>;
    const isVisible = foundField.visibleIf
      ? evaluateCondition(foundField.visibleIf, values)
      : true;

    const formState = this.formManager.getState();
    const error = formState.errors?.[fieldName as keyof T];
    const isValid = !error;
    const isTouched = this.isFieldTouched(fieldName as keyof T);

    const semanticMeta = resolveSemanticIntent(foundField.semanticIntent);
    const isSensitive = foundField.sensitive ?? semanticMeta?.isSensitive ?? false;
    const privacyRationale = foundField.privacyRationale;

    // Strict Precedence Hierarchy:
    // 1. Explicit developer prop
    // 2. SemanticIntent resolved default
    // 3. Fallback type-based inference
    let keyboardType = foundField.keyboardType ?? semanticMeta?.keyboardType;
    let inputMode = foundField.inputMode ?? semanticMeta?.inputMode;
    let autoCapitalize = foundField.autoCapitalize ?? semanticMeta?.autoCapitalize;
    let autoCorrect = foundField.autoCorrect ?? semanticMeta?.autoCorrect;
    let autoComplete = foundField.autoComplete ?? semanticMeta?.autoComplete;
    let textContentType = foundField.textContentType ?? semanticMeta?.textContentType;
    let formatMask = foundField.formatMask ?? semanticMeta?.formatMask;

    const lowerType = String(foundField.type ?? '').toLowerCase();
    const lowerName = String(foundField.name ?? '').toLowerCase();

    if (!keyboardType) {
      if (lowerType === 'email') keyboardType = 'email-address';
      else if (lowerType === 'number') keyboardType = 'numeric';
      else if (lowerType === 'tel') keyboardType = 'phone-pad';
      else if (lowerType === 'url') keyboardType = 'url';
      else keyboardType = 'default';
    }

    if (!inputMode) {
      if (lowerType === 'number') inputMode = 'numeric';
      else if (lowerType === 'email') inputMode = 'email';
      else if (lowerType === 'tel') inputMode = 'tel';
      else if (lowerType === 'url') inputMode = 'url';
    }

    if (!autoCapitalize) {
      if (lowerType === 'email' || lowerType === 'url' || lowerType === 'password') {
        autoCapitalize = 'none';
      } else if (lowerName.includes('name')) {
        autoCapitalize = 'words';
      } else {
        autoCapitalize = 'sentences';
      }
    }

    if (autoCorrect === undefined) {
      if (lowerType === 'email' || lowerType === 'url' || lowerType === 'password') {
        autoCorrect = false;
      } else {
        autoCorrect = true;
      }
    }

    if (!autoComplete) {
      if (lowerType === 'email') autoComplete = 'email';
      else if (lowerType === 'tel') autoComplete = 'tel';
      else if (lowerType === 'password') autoComplete = 'current-password';
      else if (lowerName === 'name' || lowerName === 'fullname') autoComplete = 'name';
      else if (lowerName.includes('street') || lowerName.includes('address')) autoComplete = 'street-address';
    }

    if (!textContentType) {
      if (lowerType === 'email') textContentType = 'emailAddress';
      else if (lowerType === 'tel') textContentType = 'telephoneNumber';
      else if (lowerType === 'password') textContentType = 'password';
      else if (lowerName === 'name' || lowerName === 'fullname') textContentType = 'name';
      else if (lowerName.includes('street') || lowerName.includes('address')) textContentType = 'fullStreetAddress';
    }

    const accessibilityLabel = foundField.accessibilityLabel ?? foundField.label;
    const accessibilityHint = foundField.accessibilityHint ?? foundField.helperText;

    // Conclusive auto-advancement calculation
    const rawVal = (formState.values as Record<string, unknown>)[fieldName];
    const hasValue = rawVal !== undefined && rawVal !== null && rawVal !== '';
    const shouldAutoAdvance = Boolean(foundField.autoAdvanceOnComplete && isValid && hasValue);

    // Payment Card intelligence & brand detection
    let cardBrand: CardBrand | undefined;
    if (foundField.semanticIntent === 'payment-card-number' || lowerName.includes('cardnumber')) {
      cardBrand = PaymentCardHelper.detectCardBrand(rawVal);
    }

    // Dynamic CVC mask adaptation based on card brand (e.g. Amex 4 digits vs Visa/Mastercard 3 digits)
    if (foundField.semanticIntent === 'payment-card-cvc') {
      let associatedCardVal: unknown;
      for (const p of this.schema.pages) {
        const cardF = p.fields.find(
          (f) => f.semanticIntent === 'payment-card-number' || f.name.toLowerCase().includes('cardnumber')
        );
        if (cardF) {
          associatedCardVal = (formState.values as Record<string, unknown>)[cardF.name];
          break;
        }
      }
      if (associatedCardVal) {
        const detectedBrand = PaymentCardHelper.detectCardBrand(associatedCardVal);
        const specs = PaymentCardHelper.getCvcSpecs(detectedBrand);
        formatMask = foundField.formatMask ?? specs.mask;
      }
    }

    // Password Entropy & Strength Guidance
    let entropyScore: (0 | 1 | 2 | 3 | 4) | undefined;
    let entropyFeedback: string[] | undefined;
    if (
      foundField.type === 'password' ||
      foundField.semanticIntent === 'new-password' ||
      foundField.rules?.some((r) => r.type === 'passwordStrength')
    ) {
      if (typeof rawVal === 'string' && rawVal.length > 0) {
        const entropyResult = PasswordEntropyEstimator.estimate(rawVal);
        entropyScore = entropyResult.score;
        entropyFeedback = entropyResult.feedback;
      }
    }

    return {
      fieldId: foundField.id,
      name: foundField.name,
      type: foundField.type,
      label: foundField.label,
      placeholder: foundField.placeholder,
      helperText: foundField.helperText,
      formatExample: foundField.formatExample,
      formatMask,
      autoFocus: foundField.autoFocus,
      isVisible,
      hasBeenTouched: isTouched,
      isValid,
      showError: isTouched && !isValid,
      errorMessage: error,
      autoComplete,
      textContentType,
      keyboardType,
      inputMode,
      autoCapitalize,
      autoCorrect,
      accessibilityLabel,
      accessibilityHint,
      semanticIntent: foundField.semanticIntent,
      isSensitive,
      privacyRationale,
      shouldAutoAdvance,
      cardBrand,
      entropyScore,
      entropyFeedback,
    };
  }

  public getAffordanceState(): FormAffordanceState<RewardPayload> {
    const projectedPath = this.getProjectedPath();
    const projectedSet = new Set<number>(projectedPath);

    const breadcrumbs: BreadcrumbItem[] = this.schema.pages.map((page, index) => {
      let status: StepStatus;
      const isSkipped = !projectedSet.has(index) && !this.completedStepIndices.has(index);

      if (index === this.currentPageIndex) {
        status = 'current';
      } else if (this.completedStepIndices.has(index)) {
        status = 'completed';
      } else if (isSkipped) {
        status = 'skipped';
      } else if (this.canNavigateToStep(index)) {
        status = 'unvisited';
      } else {
        status = 'locked';
      }

      return {
        stepId: page.id,
        title: page.title || `Step ${index + 1}`,
        index,
        status,
        canNavigateTo: !isSkipped && this.canNavigateToStep(index),
        isSkipped,
      };
    });

    const progress = this.getProgress();

    return {
      breadcrumbs,
      progress,
      activeReward: this.activeReward,
      navigation: {
        canGoNext: !this.isLastStep(),
        canGoPrev: !this.isFirstStep(),
        canSubmit: this.isLastStep(),
        isFirstStep: this.isFirstStep(),
        isLastStep: this.isLastStep(),
        isBranchingStep: this.isBranchingStep(),
        willDivertBranch: this.willDivertBranch(),
        hasDownstreamBranchData: this.hasDownstreamBranchData(),
        canSaveAndExit: this.policy.allowSaveAndResumeLater,
      },
      persistence: {
        isHydrated: this.isHydratedState,
        hasSavedDraft: this.hasSavedDraftState,
        lastSavedAt: this.lastSavedAtState,
        pendingOutboxCount: this.pendingOutboxCountState,
        isOnline: this.isOnlineState,
        syncStatus: this.syncStatusState,
        lastSyncError: this.lastSyncErrorState,
      },
      policy: { ...this.policy },
    };
  }

  public isHydrated(): boolean {
    return this.isHydratedState;
  }

  /**
   * Creates and persists a serializable snapshot of the active form state.
   */
  public saveDraft(): FormDraftSnapshot<T> {
    const state = this.formManager.getState();
    const branchLineageArray: Array<[number, number[]]> = Array.from(
      this.branchLineage.entries()
    ).map(([src, set]) => [src, Array.from(set)]);

    const branchTargetHistoryArray: Array<[number, number]> = Array.from(
      this.branchTargetHistory.entries()
    );

    // Zero-Knowledge Draft Redaction: detect sensitive fields across all pages
    const redactedFields: string[] = [];
    for (const page of this.schema.pages) {
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

    const snapshot: FormDraftSnapshot<T> = {
      schemaId: this.schema.id,
      schemaVersion: this.schema.version ?? '1.0.0',
      savedAt: new Date().toISOString(),
      currentPageIndex: this.currentPageIndex,
      completedStepIndices: Array.from(this.completedStepIndices),
      stepHistory: [...this.stepHistory],
      branchLineage: branchLineageArray,
      branchTargetHistory: branchTargetHistoryArray,
      values: sanitizedValues,
      redactedFields: redactedFields.length > 0 ? redactedFields : undefined,
      isSubmitted: state.submitSuccess,
    };

    this.draftStorage.saveDraft(snapshot as FormDraftSnapshot);
    return snapshot;
  }

  /**
   * Restores form state and multi-branch lineage from a saved draft snapshot.
   * If no snapshot is passed, attempts to load from the configured draftStorage.
   * Returns true (or Promise<boolean>) if a draft was found and successfully restored, false otherwise.
   */
  public restoreDraft(inputSnapshot?: FormDraftSnapshot<T>): boolean | Promise<boolean> {
    if (inputSnapshot) {
      return this.applyDraftSnapshot(inputSnapshot);
    }

    const maybeSnapshot = this.draftStorage.loadDraft(this.schema.id);
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
    if (snapshot.schemaId !== this.schema.id) {
      return false;
    }

    // Restore field values
    if (snapshot.values) {
      for (const [key, value] of Object.entries(snapshot.values)) {
        this.formManager.setFieldValue(key as keyof T, value as any);
      }
    }

    if (snapshot.redactedFields) {
      for (const fieldName of snapshot.redactedFields) {
        (this.formManager as any).tsForm.setFieldValue(fieldName as any, undefined);
        this.formManager.resetFieldValidation(fieldName as keyof T);
      }
    }


    // Restore step navigation & history
    this.currentPageIndex = Math.min(
      Math.max(0, snapshot.currentPageIndex),
      this.schema.pages.length - 1
    );
    this.completedStepIndices = new Set(snapshot.completedStepIndices ?? []);
    this.stepHistory =
      snapshot.stepHistory && snapshot.stepHistory.length > 0
        ? [...snapshot.stepHistory]
        : [this.currentPageIndex];

    // Restore branch lineage & target history
    this.branchLineage = new Map();
    if (snapshot.branchLineage) {
      for (const [key, targets] of snapshot.branchLineage) {
        this.branchLineage.set(key, new Set(targets));
      }
    }

    this.branchTargetHistory = new Map();
    if (snapshot.branchTargetHistory) {
      for (const [key, target] of snapshot.branchTargetHistory) {
        this.branchTargetHistory.set(key, target);
      }
    }

    // Re-evaluate visibility and dynamic conditions
    this.pruneHiddenFieldValues();

    this.notify();
    return true;
  }

  /**
   * Clears any saved draft for this schema from the storage adapter.
   */
  public async clearDraft(): Promise<void> {
    await this.draftStorage.clearDraft(this.schema.id);
    this.hasSavedDraftState = false;
    this.lastSavedAtState = undefined;
    this.notify();
  }

  /**
   * Checks if a saved draft exists for this schema.
   */
  public async hasSavedDraft(): Promise<boolean> {
    const res = await this.draftStorage.hasDraft(this.schema.id);
    this.hasSavedDraftState = res;
    return res;
  }

  public async flushOutbox(): Promise<number> {
    if (!this.outboxQueue) return 0;
    const count = await this.outboxQueue.flush();
    this.pendingOutboxCountState = await this.outboxQueue.getPendingCount();
    this.notify();
    return count;
  }

  public getOutboxQueue(): OfflineOutboxQueue<T> | undefined {
    return this.outboxQueue;
  }

  public async submit() {
    this.pruneHiddenFieldValues();

    // Validate only visible fields across pages in the active branch path before final submission
    let allValid = true;
    const activePathIndices = Array.from(new Set([...this.stepHistory, ...this.getProjectedPath()]));
    for (const pageIdx of activePathIndices) {
      const visibleFields = this.getVisibleFields(pageIdx);
      for (const field of visibleFields) {
        if (!this.formManager.validateField(field.name as keyof T)) {
          allValid = false;
        }
      }
    }

    if (!allValid) {
      this.notify();
      return;
    }

    // Mark visited steps as completed
    for (const stepIdx of this.stepHistory) {
      this.completedStepIndices.add(stepIdx);
    }

    const isOnline = await this.networkStatusPort.isOnline();

    if (!isOnline && this.enableOutbox && this.outboxQueue) {
      // Device is offline: enqueue into persistent outbox queue
      const envelope: SubmissionEnvelope<T> = {
        id: `sub_${this.schema.id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        formId: this.schema.id,
        tenantId: this.schema.tenantId,
        values: { ...(this.formManager.getState().values as T) },
        submittedAt: new Date().toISOString(),
        retryCount: 0,
      };

      await this.outboxQueue.enqueue(envelope);
      await this.clearDraft();
    } else {
      // Device is online: submit directly via formManager
      try {
        await this.formManager.submit({ skipValidation: true });
        if (this.formManager.getState().submitSuccess) {
          await this.clearDraft();
        }
      } catch {
        // Submission failed inside onSubmit callback: draft remains intact for retry!
      }
    }
    this.notify();
  }
}
