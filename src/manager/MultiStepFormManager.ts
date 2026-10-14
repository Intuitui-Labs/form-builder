import { FormHydrator } from '../hydrator/FormHydrator.js';
import type { FormField, FormPage, FormSchema } from '../schema/FormSchema.js';
import type {
  FormAffordanceConfig,
  FormAffordanceState,
  ProgressMetrics,
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
  ITelemetryPort,
  FormTelemetryEvent,
  RewardPayload,
  StepProgressContext,
  ProgressCalculationResult,
  AttachmentPointer,
  IAttachmentStoragePort,
  ISanitizerPort,
  IFormLifecyclePort,
  AddressCandidate,
  PickedContact,
  BatchSetOptions,
  BatchEnrichmentResult,
  FieldOriginInfo,
  ISpeechSynthesisPort,
} from '../ports/index.js';
import type { IEntityExtractorPort } from '../ports/IEntityExtractorPort.js';
import type { IHapticFeedbackPort } from '../ports/IHapticFeedbackPort.js';
import { AddressFieldMapper, type ExplicitAddressFieldMap } from '../affordance/AddressFieldMapper.js';
import { ContactFieldMapper, type ExplicitContactFieldMap } from '../affordance/ContactFieldMapper.js';
import { FormLifecycleMachine } from '../core/state/FormLifecycleMachine.js';
import type { FormLifecyclePhase, FormLifecycleEvent, FormLifecycleContext } from '../core/state/FormLifecycleTypes.js';
import {
  LinearStepProgressAdapter,
  WeightedFieldProgressAdapter,
  NullRewardAdapter,
  resolveAffordanceConfig,
  type ResolvedAffordanceConfig,
} from '../adapters/index.js';
import { OfflineOutboxQueue } from '../persistence/OfflineOutboxQueue.js';
import { evaluateCondition } from '../core/ConditionEvaluator.js';
import type {
  PeekBranchStatus,
  BranchSwitchImpact,
  BranchSwitchOptions,
  BranchSwitchResult,
} from '../schema/FormBranching.js';
import { DefaultSanitizer } from '../core/DefaultSanitizer.js';
import { NativeFocusController } from '../focus/NativeFocusController.js';
import { FormManager } from './FormManager.js';
import {
  type MultiStepCoordinatorContext,
  StepNavigationCoordinator,
  BranchSwitchCoordinator,
  FieldEnrichmentCoordinator,
  FormErgonomicsCoordinator,
  FormPersistenceCoordinator,
} from './coordinators/index.js';

export type ProgressCalculatorFunction = (
  context: StepProgressContext
) => ProgressCalculationResult;

export interface FormResilienceOptions<T = Record<string, unknown>> {
  storage?: IStoragePort;
  transport?: ITransportPort<T>;
  networkStatus?: INetworkStatusPort;
  draftStorage?: IDraftStoragePort;
  enableOutbox?: boolean;
  autoSaveDraft?: boolean;
  autoRestoreDraft?: boolean;
  draftDebounceMs?: number;
}

export interface FormExperienceOptions {
  telemetry?: ITelemetryPort;
  rewardEngine?: IRewardEnginePort;
  feedbackNotifier?: IFeedbackNotifierPort;
  affordanceConfig?: FormAffordanceConfig;
  progressStrategy?: IProgressStrategyPort | ProgressCalculatorFunction;
  sessionId?: string;
  hapticFeedback?: IHapticFeedbackPort;
  speechSynthesis?: ISpeechSynthesisPort;
}

export interface FormSecurityOptions {
  sanitizer?: ISanitizerPort;
  attachmentStorage?: IAttachmentStoragePort;
  onAttachmentPruned?: (field: string, pointer: AttachmentPointer) => void;
  schemaValidator?: ISchemaValidator<FormSchema>;
  validateSchemaOnMount?: boolean;
}

export interface MultiStepFormOptions<T extends Record<string, unknown> = Record<string, unknown>> {
  resilience?: FormResilienceOptions<T>;
  experience?: FormExperienceOptions;
  security?: FormSecurityOptions;
  lifecyclePort?: IFormLifecyclePort<T>;
}

export class MultiStepFormManager<T extends Record<string, unknown>> {
  private schema: FormSchema;
  private formManager: FormManager<T>;
  private sessionId: string;
  private lifecyclePort: IFormLifecyclePort<T>;
  private subscribers: Set<(manager: MultiStepFormManager<T>) => void> = new Set();
  private unsubscribeForm?: () => void;
  private unsubscribeLifecycle?: () => void;

  private policy: ResolvedAffordanceConfig;
  private autoSaveDraft: boolean;
  public readonly focusController: NativeFocusController = new NativeFocusController();

  private telemetry?: ITelemetryPort;
  private formStartTime: number = Date.now();
  private stepStartTime: number = Date.now();

  private attachmentStorage?: IAttachmentStoragePort;
  private onAttachmentPruned?: (field: string, pointer: AttachmentPointer) => void;
  private sanitizer: ISanitizerPort;
  private hapticPort?: IHapticFeedbackPort;
  private speechSynthesisPort?: ISpeechSynthesisPort;

  // Subsystem Coordinators
  private navigationCoordinator!: StepNavigationCoordinator<T>;
  private branchSwitchCoordinator!: BranchSwitchCoordinator<T>;
  private enrichmentCoordinator!: FieldEnrichmentCoordinator<T>;
  private ergonomicsCoordinator!: FormErgonomicsCoordinator<T>;
  private persistenceCoordinator!: FormPersistenceCoordinator<T>;

  constructor(
    schema: FormSchema,
    onSubmit: (values: T) => Promise<void> | void,
    options?: MultiStepFormOptions<T>,
  ) {
    const resOpt = options?.resilience;
    const expOpt = options?.experience;
    const secOpt = options?.security;

    const schemaValidator = secOpt?.schemaValidator;
    const validateSchemaOnMount = secOpt?.validateSchemaOnMount;
    if (validateSchemaOnMount && schemaValidator) {
      schemaValidator.validate(schema);
    }

    this.schema = schema;
    this.sessionId = expOpt?.sessionId ?? `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const rawTelemetry = expOpt?.telemetry;
    if (rawTelemetry) {
      const origTelemetry = rawTelemetry;
      const sessId = this.sessionId;
      this.telemetry = {
        name: origTelemetry.name,
        dispatch: (event: FormTelemetryEvent) => {
          origTelemetry.dispatch({
            sessionId: sessId,
            ...event,
          });
        },
        flush: origTelemetry.flush ? () => origTelemetry.flush?.() : undefined,
      };
    }
    this.attachmentStorage = secOpt?.attachmentStorage;
    this.onAttachmentPruned = secOpt?.onAttachmentPruned;
    this.sanitizer = secOpt?.sanitizer ?? new DefaultSanitizer();
    this.hapticPort = expOpt?.hapticFeedback;
    this.speechSynthesisPort = expOpt?.speechSynthesis;
    this.formStartTime = Date.now();
    this.stepStartTime = Date.now();

    if (this.telemetry) {
      this.telemetry.dispatch({
        type: 'form_mounted',
        formId: schema.id,
        schemaVersion: String(schema.v ?? schema.version ?? '1.0'),
        experimentLineage: schema.settings?.experimentLineage as any,
        totalSteps: schema.pages.length,
        timestamp: this.formStartTime,
      });

      const firstPage = schema.pages[0];
      if (firstPage) {
        this.telemetry.dispatch({
          type: 'step_viewed',
          formId: schema.id,
          stepIndex: 0,
          stepId: firstPage.id,
          stepTitle: firstPage.title,
          timestamp: this.stepStartTime,
        });
      }
    }

    // Resolve Affordance Policy
    const userConfig =
      expOpt?.affordanceConfig ||
      schema.affordanceConfig ||
      schema.settings?.affordanceConfig;

    this.policy = resolveAffordanceConfig(userConfig);

    // Resolve Strategy & Ports
    let progressStrategy: IProgressStrategyPort;
    const progressStrategyOpt = expOpt?.progressStrategy;
    if (typeof progressStrategyOpt === 'function') {
      const calcFn = progressStrategyOpt;
      progressStrategy = { calculateProgress: calcFn };
    } else if (progressStrategyOpt) {
      progressStrategy = progressStrategyOpt;
    } else if (this.policy.progress === 'weighted-velocity') {
      progressStrategy = new WeightedFieldProgressAdapter();
    } else {
      progressStrategy = new LinearStepProgressAdapter();
    }

    const rewardEngine = expOpt?.rewardEngine ?? new NullRewardAdapter();
    const feedbackNotifier = expOpt?.feedbackNotifier;

    this.autoSaveDraft = resOpt?.autoSaveDraft ?? false;

    // Flatten all fields across all pages to pass to FormHydrator
    const allFields = schema.pages.flatMap((page) => page.fields);
    this.formManager = FormHydrator.hydrate<T>({ fields: allFields as any }, onSubmit);

    this.lifecyclePort =
      options?.lifecyclePort ??
      new FormLifecycleMachine<T>({
        initialStepIndex: 0,
        isOnline: true,
        autoHydrate: !(resOpt?.autoRestoreDraft ?? false),
      });

    this.unsubscribeLifecycle = this.lifecyclePort.subscribe((context, event) => {
      this.onLifecycleTransition(context, event);
    });

    // Construct coordinator context
    const coordinatorContext: MultiStepCoordinatorContext<T> = {
      schema: this.schema,
      formManager: this.formManager,
      lifecyclePort: this.lifecyclePort,
      policy: this.policy,
      focusController: this.focusController,
      sanitizer: this.sanitizer,
      telemetry: this.telemetry,
      hapticPort: this.hapticPort,
      speechSynthesisPort: this.speechSynthesisPort,
      attachmentStorage: this.attachmentStorage,
      onAttachmentPruned: this.onAttachmentPruned,
      autoSaveDraft: this.autoSaveDraft,
      sessionId: this.sessionId,
      formStartTime: this.formStartTime,
      getStepStartTime: () => this.stepStartTime,
      setStepStartTime: (t) => { this.stepStartTime = t; },
      notify: () => this.notify(),
      saveDraft: () => this.saveDraft(),
      scheduleAutoSaveDraft: () => this.scheduleAutoSaveDraft(),
      isHydrated: () => this.isHydrated(),
      getVisibleFields: (idx) => this.getVisibleFields(idx),
      pruneHiddenFieldValues: () => this.pruneHiddenFieldValues(),
      getCurrentPageIndex: () => this.getCurrentPageIndex(),
      getCurrentPage: () => this.getCurrentPage(),
      getInspectedPageIndex: () => this.getInspectedPageIndex(),
      setInspectedPageIndex: (idx) => this.branchSwitchCoordinator.setInspectedPageIndex(idx),
      getProjectedPath: () => this.navigationCoordinator.getProjectedPath(),
      canNavigateToStep: (idx) => this.navigationCoordinator.canNavigateToStep(idx),
      getNextPageIndex: () => this.navigationCoordinator.getNextPageIndex(),
      getStepHistory: () => this.navigationCoordinator.getStepHistory(),
      isFirstStep: () => this.navigationCoordinator.isFirstStep(),
      isLastStep: () => this.navigationCoordinator.isLastStep(),
      isBranchingStep: (idx) => this.navigationCoordinator.isBranchingStep(idx),
      willDivertBranch: (idx) => this.navigationCoordinator.willDivertBranch(idx),
      hasDownstreamBranchData: (idx) => this.navigationCoordinator.hasDownstreamBranchData(idx),
      validateCurrentStep: () => this.navigationCoordinator.validateCurrentStep(),
      getProgress: () => this.ergonomicsCoordinator.getProgress(),
      triggerRewardEvaluation: (idx, page) => this.ergonomicsCoordinator.triggerRewardEvaluation(idx, page),
      hasSavedDraftState: false,
      setHasSavedDraftState: (st) => {
        if (this.persistenceCoordinator) {
          this.persistenceCoordinator.hasSavedDraftState = st;
        }
      },
      getOutboxQueue: () => this.persistenceCoordinator?.getOutboxQueue(),
      getOutboxSyncStatus: () => this.persistenceCoordinator?.getOutboxQueue()?.getSyncStatus() ?? 'idle',
      getOutboxLastSyncError: () => this.persistenceCoordinator?.getOutboxQueue()?.getLastSyncError() ?? this.lifecyclePort.getContext().lastError,
    };

    // Instantiate modular coordinators
    this.navigationCoordinator = new StepNavigationCoordinator(coordinatorContext);
    this.branchSwitchCoordinator = new BranchSwitchCoordinator(coordinatorContext);
    this.enrichmentCoordinator = new FieldEnrichmentCoordinator(coordinatorContext);
    this.ergonomicsCoordinator = new FormErgonomicsCoordinator(
      coordinatorContext,
      progressStrategy,
      rewardEngine,
      feedbackNotifier
    );
    this.persistenceCoordinator = new FormPersistenceCoordinator(
      coordinatorContext,
      resOpt,
      onSubmit
    );

    // Initialize draft checking
    this.persistenceCoordinator.initDraftCheck();

    // Asynchronous Hydration Race Guard: never save initial empty state over existing storage!
    let isSubscribedMounted = false;
    this.unsubscribeForm = this.formManager.subscribe((formState) => {
      if (!isSubscribedMounted) {
        isSubscribedMounted = true;
        return;
      }
      for (const [key, val] of Object.entries(formState.values)) {
        const currentVal = this.lifecyclePort.getContext().values[key];
        if (currentVal !== val) {
          this.lifecyclePort.send({
            type: 'FIELD_CHANGE',
            field: key as keyof T,
            value: val,
          });
        }
      }
      if (this.autoSaveDraft && this.isHydrated()) {
        this.scheduleAutoSaveDraft();
      }
      this.notify();
    });
  }

  // Lifecycle
  public getLifecyclePort(): IFormLifecyclePort<T> {
    return this.lifecyclePort;
  }

  public getLifecyclePhase(): FormLifecyclePhase {
    return this.lifecyclePort.getPhase();
  }

  public getLifecycleAuditTrail(): ReadonlyArray<FormLifecycleEvent<T>> {
    return this.lifecyclePort.getAuditTrail();
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

  // Enrichment Delegation
  public batchSetFieldValues(
    updates: Partial<T>,
    options?: BatchSetOptions<T>,
  ): BatchEnrichmentResult<T> {
    return this.enrichmentCoordinator.batchSetFieldValues(updates, options);
  }

  public revertEnrichedFields(fields?: Array<keyof T>): Array<keyof T> {
    return this.enrichmentCoordinator.revertEnrichedFields(fields);
  }

  public getFieldOrigin<K extends keyof T>(field: K): FieldOriginInfo | undefined {
    return this.enrichmentCoordinator.getFieldOrigin(field);
  }

  public enrichFromAddressCandidate(
    candidate: Partial<AddressCandidate>,
    options?: BatchSetOptions<T> & { explicitMap?: ExplicitAddressFieldMap },
  ): BatchEnrichmentResult<T> {
    return this.enrichmentCoordinator.enrichFromAddressCandidate(candidate, options);
  }

  public enrichFromAddress(
    candidate: Partial<AddressCandidate>,
    options?: BatchSetOptions<T> & { explicitMap?: ExplicitAddressFieldMap },
  ): BatchEnrichmentResult<T> {
    return this.enrichmentCoordinator.enrichFromAddress(candidate, options);
  }

  public enrichFromContact(
    contact: Partial<PickedContact>,
    options?: BatchSetOptions<T> & { explicitMap?: ExplicitContactFieldMap },
  ): BatchEnrichmentResult<T> {
    return this.enrichmentCoordinator.enrichFromContact(contact, options);
  }

  public async enrichFromFreeformText(
    text: string,
    options?: BatchSetOptions<T> & {
      extractor?: IEntityExtractorPort;
      minConfidenceThreshold?: number;
    },
  ): Promise<BatchEnrichmentResult<T>> {
    return this.enrichmentCoordinator.enrichFromFreeformText(text, options);
  }

  // Focus & Telemetry Delegation
  public blurField<K extends keyof T>(field: K): void {
    this.ergonomicsCoordinator.blurField(field);
  }

  public focusField<K extends keyof T>(field: K): void {
    this.ergonomicsCoordinator.focusField(field);
  }

  public getActiveFocusedField(): keyof T | undefined {
    return this.ergonomicsCoordinator.getActiveFocusedField();
  }

  public recordFieldFocus(fieldName: string): void {
    this.ergonomicsCoordinator.recordFieldFocus(fieldName);
  }

  public recordFieldBlur(fieldName: string, dwellMs: number, hasValue: boolean, valueLength?: number): void {
    this.ergonomicsCoordinator.recordFieldBlur(fieldName, dwellMs, hasValue, valueLength);
  }

  public recordFieldError(fieldName: string, errorRule: string, errorMessage?: string): void {
    this.ergonomicsCoordinator.recordFieldError(fieldName, errorRule, errorMessage);
  }

  public recordFormAbandoned(): void {
    this.ergonomicsCoordinator.recordFormAbandoned();
  }

  public getFormManager(): FormManager<T> {
    return this.formManager;
  }

  public getPages(): FormPage[] {
    return this.schema.pages.map((p) => this.sanitizePage(p));
  }

  public sanitizePage(page: FormPage): FormPage {
    if (!this.sanitizer) return page;
    let modified = false;
    let sanitizedMedia = page.media;

    if (page.media?.url) {
      const cleanUrl = this.sanitizer.sanitizeUrl(page.media.url);
      if (cleanUrl !== page.media.url) {
        sanitizedMedia = { ...page.media, url: cleanUrl };
        modified = true;
      }
    }

    const sanitizedFields = page.fields.map((field) => {
      if (field.type === 'rich-text' && field.content) {
        const cleanContent = this.sanitizer.sanitizeRichText(field.content);
        if (cleanContent !== field.content) {
          modified = true;
          return { ...field, content: cleanContent };
        }
      }
      return field;
    });

    if (!modified) return page;
    return {
      ...page,
      media: sanitizedMedia,
      fields: sanitizedFields,
    };
  }

  public getCurrentPage(): FormPage {
    const raw = this.schema.pages[this.getCurrentPageIndex()]!;
    return this.sanitizePage(raw);
  }

  public getCurrentPageIndex(): number {
    return this.lifecyclePort.getContext().activeStepIndex;
  }

  // Branch Peeking Delegation
  public peekStep(pageIndex: number): boolean {
    return this.branchSwitchCoordinator.peekStep(pageIndex);
  }

  public stopPeeking(): void {
    this.branchSwitchCoordinator.stopPeeking();
  }

  public isPeeking(): boolean {
    return this.branchSwitchCoordinator.isPeeking();
  }

  public getInspectedPageIndex(): number {
    return this.branchSwitchCoordinator.getInspectedPageIndex();
  }

  public getInspectedPage(): FormPage {
    return this.branchSwitchCoordinator.getInspectedPage();
  }

  public getPeekBranchStatus(pageIndex: number): PeekBranchStatus {
    return this.branchSwitchCoordinator.getPeekBranchStatus(pageIndex);
  }

  public explainPeekStep(targetIndex: number = this.getInspectedPageIndex()): BranchSwitchImpact {
    return this.branchSwitchCoordinator.explainPeekStep(targetIndex);
  }

  public previewBranchSwitch(targetPageIndex: number = this.getInspectedPageIndex()): BranchSwitchImpact {
    return this.branchSwitchCoordinator.previewBranchSwitch(targetPageIndex);
  }

  public confirmBranchSwitch(
    targetPageIndex: number = this.getInspectedPageIndex(),
    options?: BranchSwitchOptions
  ): BranchSwitchResult {
    return this.branchSwitchCoordinator.confirmBranchSwitch(targetPageIndex, options);
  }

  public cancelBranchSwitch(): void {
    this.branchSwitchCoordinator.cancelBranchSwitch();
  }

  public speakPeekExplanation(targetIndex: number = this.getInspectedPageIndex()): void {
    this.branchSwitchCoordinator.speakPeekExplanation(targetIndex);
  }

  public stopSpeaking(): void {
    this.branchSwitchCoordinator.stopSpeaking();
  }

  public isSpeaking(): boolean {
    return this.branchSwitchCoordinator.isSpeaking();
  }

  // Navigation Delegation
  public getStepHistory(): number[] {
    return this.navigationCoordinator.getStepHistory();
  }

  public getTotalPages(): number {
    return this.schema.pages.length;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public isFirstStep(): boolean {
    return this.navigationCoordinator.isFirstStep();
  }

  public isLastStep(): boolean {
    return this.navigationCoordinator.isLastStep();
  }

  public getCompletedStepIndices(): number[] {
    return this.navigationCoordinator.getCompletedStepIndices();
  }

  public getActiveReward(): RewardPayload | null {
    return this.ergonomicsCoordinator.getActiveReward();
  }

  public clearActiveReward(): void {
    this.ergonomicsCoordinator.clearActiveReward();
  }

  public resetMilestones(): void {
    this.ergonomicsCoordinator.resetMilestones();
  }

  public subscribe(callback: (manager: MultiStepFormManager<T>) => void): () => void {
    this.subscribers.add(callback);
    callback(this);
    return () => this.subscribers.delete(callback);
  }

  private notify() {
    this.subscribers.forEach((cb) => cb(this));
  }

  public getVisibleFields(pageIndex: number = this.getCurrentPageIndex()): FormField[] {
    const page = this.schema.pages[pageIndex];
    if (!page) return [];
    const values = this.formManager.getState().values as Record<string, unknown>;
    return page.fields.filter((field) => {
      if (!field.visibleIf) return true;
      return evaluateCondition(field.visibleIf, values);
    });
  }

  public getSanitizer(): ISanitizerPort {
    return this.sanitizer;
  }

  public pruneHiddenFieldValues(): void {
    const values = this.formManager.getState().values as Record<string, unknown>;
    for (const page of this.schema.pages) {
      for (const field of page.fields) {
        if (field.visibleIf && field.clearValueOnHide !== false) {
          const isVisible = evaluateCondition(field.visibleIf, values);
          if (!isVisible && values[field.name] !== undefined) {
            const oldVal = values[field.name];
            if (oldVal && typeof oldVal === 'object' && 'localUri' in oldVal) {
              const ptr = oldVal as AttachmentPointer;
              this.onAttachmentPruned?.(field.name, ptr);
              if (this.attachmentStorage && ptr.id) {
                this.attachmentStorage.deleteLocal(ptr.id).catch(() => {});
              }
            }
            this.formManager.setFieldValue(field.name as keyof T, undefined as any);
          }
        }
      }
    }
  }

  public markFieldTouched(fieldName: string): void {
    this.formManager.setFieldTouched(fieldName as keyof T, true);
    this.lifecyclePort.send({ type: 'FIELD_BLUR', field: fieldName as keyof T });
    this.notify();
  }

  public validateCurrentStep(): boolean {
    return this.navigationCoordinator.validateCurrentStep();
  }

  public resolveNextPageIndexFrom(pageIndex: number): number | null {
    return this.navigationCoordinator.resolveNextPageIndexFrom(pageIndex);
  }

  public getNextPageIndex(): number | null {
    return this.navigationCoordinator.getNextPageIndex();
  }

  public isBranchingStep(pageIndex: number = this.getCurrentPageIndex()): boolean {
    return this.navigationCoordinator.isBranchingStep(pageIndex);
  }

  public willDivertBranch(pageIndex: number = this.getCurrentPageIndex()): boolean {
    return this.navigationCoordinator.willDivertBranch(pageIndex);
  }

  public hasDownstreamBranchData(pageIndex: number = this.getCurrentPageIndex()): boolean {
    return this.navigationCoordinator.hasDownstreamBranchData(pageIndex);
  }

  public getDownstreamBranchStepIndices(pageIndex: number = this.getCurrentPageIndex()): number[] {
    return this.navigationCoordinator.getDownstreamBranchStepIndices(pageIndex);
  }

  public getProjectedPath(): number[] {
    return this.navigationCoordinator.getProjectedPath();
  }

  public canNavigateToStep(targetIndex: number): boolean {
    return this.navigationCoordinator.canNavigateToStep(targetIndex);
  }

  public nextStep(): boolean {
    return this.navigationCoordinator.nextStep();
  }

  public prevStep(): boolean {
    return this.navigationCoordinator.prevStep();
  }

  public goToStep(index: number): boolean {
    return this.navigationCoordinator.goToStep(index);
  }

  private onLifecycleTransition(
    context: FormLifecycleContext<T>,
    event: FormLifecycleEvent<T>
  ): void {
    const now = Date.now();
    switch (event.type) {
      case 'STEP_NEXT': {
        const completedIndex =
          context.stepHistory.length >= 2
            ? context.stepHistory[context.stepHistory.length - 2]
            : 0;
        const completedPage = this.schema.pages[completedIndex];
        const nextIndex = context.activeStepIndex;
        const newPage = this.schema.pages[nextIndex];

        if (completedPage) {
          this.ergonomicsCoordinator.triggerRewardEvaluation(completedIndex, completedPage);
        }

        if (this.telemetry) {
          const durationMs = now - this.stepStartTime;
          if (completedPage) {
            this.telemetry.dispatch({
              type: 'step_completed',
              formId: this.schema.id,
              stepIndex: completedIndex,
              stepId: completedPage.id,
              durationMs,
              timestamp: now,
            });
          }
          if (newPage) {
            this.telemetry.dispatch({
              type: 'step_viewed',
              formId: this.schema.id,
              stepIndex: nextIndex,
              stepId: newPage.id,
              stepTitle: newPage.title,
              timestamp: now,
            });
          }
        }
        this.stepStartTime = now;
        break;
      }

      case 'STEP_PREV':
      case 'STEP_JUMP': {
        const activeIndex = context.activeStepIndex;
        const activePage = this.schema.pages[activeIndex];
        if (this.telemetry && activePage) {
          this.telemetry.dispatch({
            type: 'step_viewed',
            formId: this.schema.id,
            stepIndex: activeIndex,
            stepId: activePage.id,
            stepTitle: activePage.title,
            timestamp: now,
          });
        }
        this.stepStartTime = now;
        break;
      }

      case 'SUBMIT_SUCCESS': {
        if (this.telemetry) {
          this.telemetry.dispatch({
            type: 'form_submitted',
            formId: this.schema.id,
            totalDurationMs: now - this.formStartTime,
            success: true,
            errorCount: 0,
            experimentLineage: this.schema.settings?.experimentLineage as any,
            timestamp: now,
          });
          this.telemetry.flush?.();
        }
        break;
      }

      case 'SUBMIT_OFFLINE': {
        if (this.telemetry) {
          this.telemetry.dispatch({
            type: 'form_submitted',
            formId: this.schema.id,
            totalDurationMs: now - this.formStartTime,
            success: true,
            errorCount: 0,
            experimentLineage: this.schema.settings?.experimentLineage as any,
            timestamp: now,
          });
          this.telemetry.flush?.();
        }
        break;
      }

      case 'SUBMIT_ERROR': {
        if (this.telemetry) {
          const errorCount = Object.keys(this.formManager?.getState()?.errors ?? {}).length || 1;
          this.telemetry.dispatch({
            type: 'form_submitted',
            formId: this.schema.id,
            totalDurationMs: now - this.formStartTime,
            success: false,
            errorCount,
            experimentLineage: this.schema.settings?.experimentLineage as any,
            timestamp: now,
          });
          this.telemetry.flush?.();
        }
        break;
      }

      default:
        break;
    }
  }

  public getProgress(): ProgressMetrics {
    return this.ergonomicsCoordinator.getProgress();
  }

  public getStepFocusPlan(pageIndex: number = this.getCurrentPageIndex()): StepFocusPlan {
    return this.ergonomicsCoordinator.getStepFocusPlan(pageIndex);
  }

  public getFieldGuidance(fieldName: string): FieldGuidanceState | undefined {
    return this.ergonomicsCoordinator.getFieldGuidance(fieldName);
  }

  public getAffordanceState(): FormAffordanceState<RewardPayload> {
    return this.ergonomicsCoordinator.getAffordanceState();
  }

  public isHydrated(): boolean {
    const phase = this.lifecyclePort.getPhase();
    return phase !== 'unhydrated' && phase !== 'hydrating';
  }

  // Persistence Delegation
  public createDraftSnapshot(): FormDraftSnapshot<T> {
    return this.persistenceCoordinator.createDraftSnapshot();
  }

  public saveDraft(): FormDraftSnapshot<T> {
    return this.persistenceCoordinator.saveDraft();
  }

  private scheduleAutoSaveDraft(): void {
    this.persistenceCoordinator.scheduleAutoSaveDraft();
  }

  public async flushDraft(): Promise<void> {
    return this.persistenceCoordinator.flushDraft();
  }

  public restoreDraft(inputSnapshot?: FormDraftSnapshot<T>): boolean | Promise<boolean> {
    return this.persistenceCoordinator.restoreDraft(inputSnapshot);
  }

  public async clearDraft(): Promise<void> {
    return this.persistenceCoordinator.clearDraft();
  }

  public async hasSavedDraft(): Promise<boolean> {
    return this.persistenceCoordinator.hasSavedDraft();
  }

  public async flushOutbox(): Promise<number> {
    return this.persistenceCoordinator.flushOutbox();
  }

  public getOutboxQueue(): OfflineOutboxQueue<T> | undefined {
    return this.persistenceCoordinator.getOutboxQueue();
  }

  public async submit(): Promise<void> {
    return this.persistenceCoordinator.submit();
  }

  public isOnline(): boolean {
    return this.persistenceCoordinator.isOnline();
  }

  public getPendingOutboxCount(): number {
    return this.persistenceCoordinator.getPendingOutboxCount();
  }

  public destroy(): void {
    if (this.unsubscribeForm) {
      this.unsubscribeForm();
      this.unsubscribeForm = undefined;
    }
    if (this.unsubscribeLifecycle) {
      this.unsubscribeLifecycle();
      this.unsubscribeLifecycle = undefined;
    }
    this.persistenceCoordinator.destroy();
    if (this.telemetry && 'flush' in this.telemetry) {
      (this.telemetry as any).flush?.();
    }
    this.subscribers.clear();
  }

  public dispose(): void {
    this.destroy();
  }
}
