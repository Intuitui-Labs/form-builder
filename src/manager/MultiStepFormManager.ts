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
  IBatteryStatusPort,
  IAdaptiveStepOraclePort,
  IPsychometricAuditorPort,
  PsychometricAuditResult,
  QuestionMetadata,
} from '../ports/index.js';
import type { IEntityExtractorPort } from '../ports/IEntityExtractorPort.js';
import type { IHapticFeedbackPort } from '../ports/IHapticFeedbackPort.js';
import { AddressFieldMapper, type ExplicitAddressFieldMap } from '../affordance/AddressFieldMapper.js';
import { ContactFieldMapper, type ExplicitContactFieldMap } from '../affordance/ContactFieldMapper.js';
import { FormLifecycleMachine } from '../core/state/FormLifecycleMachine.js';
import type { FormLifecyclePhase, FormLifecycleEvent, FormLifecycleContext } from '../core/state/FormLifecycleTypes.js';
import {
  resolveAffordanceConfig,
  type ResolvedAffordanceConfig,
} from '../affordance/presets.js';
import { stepIndexProgress, silentReward } from './kernelDefaults.js';
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
import { evaluateStepAffordance, type StepAffordanceSnapshot } from '../governance/index.js';
import { FormManager } from './FormManager.js';
import { BatteryEngine } from '../battery/BatteryEngine.js';
import type { BatteryAccessEvaluation, FormSubmissionHistoryItem } from '../schema/FormBattery.js';
import type {
  FormParticipationStatus,
  FormParticipationState,
  FormParticipationConfig,
} from '../schema/FormParticipation.js';

export type {
  FormParticipationStatus,
  FormParticipationState,
  FormParticipationConfig,
};


import {
  type MultiStepCoordinatorContext,
  StepNavigationCoordinator,
  BranchSwitchCoordinator,
  FieldEnrichmentCoordinator,
  FormErgonomicsCoordinator,
  FormPersistenceCoordinator,
} from './coordinators/index.js';
import type { IAssessmentPort } from '../ports/IAssessmentPort.js';
import type { AssessmentState } from '../assessment/types.js';

export type ProgressCalculatorFunction = (
  context: StepProgressContext
) => ProgressCalculationResult;

export interface FormResilienceOptions<T = Record<string, unknown>> {
  storage?: IStoragePort;
  transport?: ITransportPort<T>;
  networkStatus?: INetworkStatusPort;
  batteryStatus?: IBatteryStatusPort;
  criticalBatteryThreshold?: number;
  throttleOnLowPower?: boolean;
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
  assessmentEngine?: IAssessmentPort;
  adaptiveStepOracle?: IAdaptiveStepOraclePort;
  psychometricAuditor?: IPsychometricAuditorPort;
  onPsychometricAudit?: (result: PsychometricAuditResult) => void;
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
  participation?: FormParticipationConfig;
}

export class MultiStepFormManager<T extends Record<string, unknown>> {
  private schema: FormSchema;
  private formManager: FormManager<T>;
  private sessionId: string;
  private lifecyclePort: IFormLifecyclePort<T>;
  private subscribers: Set<(manager: MultiStepFormManager<T>) => void> = new Set();
  private unsubscribeForm?: () => void;
  private unsubscribeLifecycle?: () => void;

  private participationConfig?: FormParticipationConfig;
  private participationState!: FormParticipationState;
  private participationSubscribers: Set<(state: FormParticipationState) => void> = new Set();

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
  private assessmentEngine?: IAssessmentPort;
  private adaptiveStepOracle?: IAdaptiveStepOraclePort;
  private speechSynthesisPort?: ISpeechSynthesisPort;
  private psychometricAuditor?: IPsychometricAuditorPort;
  private onPsychometricAudit?: (result: PsychometricAuditResult) => void;

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
    this.participationConfig = options?.participation;
    this.participationState = this.evaluateParticipation();
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
    // Policy is a seam — the app passes the object; the kernel never constructs it.
    // Weighted progress, custom rewards, etc. are built by the composition root (the app),
    // not here on the default path. See kernelDefaults.ts for the shared singletons.
    let progressStrategy: IProgressStrategyPort;
    const progressStrategyOpt = expOpt?.progressStrategy;
    if (typeof progressStrategyOpt === 'function') {
      const calcFn = progressStrategyOpt;
      progressStrategy = { calculateProgress: calcFn };
    } else if (progressStrategyOpt) {
      progressStrategy = progressStrategyOpt;
    } else {
      progressStrategy = stepIndexProgress;
    }

    const rewardEngine = expOpt?.rewardEngine ?? silentReward;
    const feedbackNotifier = expOpt?.feedbackNotifier;

    this.autoSaveDraft = resOpt?.autoSaveDraft ?? false;

    // Resolve Assessment Engine Seam (Injected by composition root, never constructed by kernel)
    this.assessmentEngine = expOpt?.assessmentEngine;
    this.adaptiveStepOracle = expOpt?.adaptiveStepOracle;
    this.psychometricAuditor = expOpt?.psychometricAuditor;
    this.onPsychometricAudit = expOpt?.onPsychometricAudit;

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
      getAssessmentEngine: () => this.assessmentEngine,
      getParticipationConfig: () => this.participationConfig,
      onDraftHydrated: (snapshot) => this.handleDraftHydrated(snapshot),
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
          if (this.assessmentEngine?.isInstantTiming()) {
            try {
              this.assessmentEngine.submitAnswer(key, val);
            } catch {
              // Outbound port failure must not crash field change handling
            }
          }
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

  public setFieldValue<K extends keyof T>(field: K, value: T[K]): boolean {
    if (this.participationState?.status === 'locked') {
      return false;
    }
    if (this.schema.governance?.interaction?.lockOnSelection) {
      const affordance = this.getStepAffordance();
      if (affordance.isStepLocked) {
        return false;
      }
    }
    this.formManager.setFieldValue(field, value);
    return true;
  }

  public getStepAffordance(): StepAffordanceSnapshot {
    const curIdx = this.getCurrentPageIndex();
    const values = this.formManager.getState().values as Record<string, unknown>;
    const visibleFields = this.getVisibleFields(curIdx);
    const isStepAnswered = visibleFields.some(
      (f) => values[f.name] !== undefined && values[f.name] !== ''
    );
    const isStepValid = this.validateCurrentStep();
    const isSubmitting = this.lifecyclePort.getPhase() === 'submitting';

    return evaluateStepAffordance({
      governance: this.schema.governance,
      stepIndex: curIdx,
      totalSteps: this.getTotalPages(),
      isStepValid,
      isStepAnswered,
      isSubmitting,
    });
  }


  // Enrichment Delegation
  public batchSetFieldValues(
    updates: Partial<T>,
    options?: BatchSetOptions<T>,
  ): BatchEnrichmentResult<T> {
    if (this.participationState?.status === 'locked') {
      return {
        appliedFields: [],
        appliedCount: 0,
        skippedFields: (Object.keys(updates) as (keyof T)[]).map((field) => ({
          field,
          reason: 'already_set' as const,
          currentValue: undefined,
          attemptedValue: updates[field],
        })),
        rollback: () => [],
      };
    }
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

  public getSchema(): FormSchema {
    return this.schema;
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

  /**
   * Asynchronously advances to the next step, querying the IAdaptiveStepOraclePort (if configured)
   * to dynamically inject follow-up pages, adapt difficulty, or re-route branches based on live AI reasoning.
   */
  public async nextStepAsync(): Promise<boolean> {
    if (!this.navigationCoordinator.validateCurrentStep()) {
      return this.navigationCoordinator.nextStep();
    }

    if (this.adaptiveStepOracle) {
      try {
        const curIdx = this.getCurrentPageIndex();
        const curPage = this.getCurrentPage();
        const values = this.getState().values as T;
        const decision = await this.adaptiveStepOracle.evaluateNextStep({
          completedPage: curPage,
          completedPageIndex: curIdx,
          currentValues: values,
          stepHistory: this.getStepHistory(),
          assessmentState: this.assessmentEngine?.getState(),
        });

        if (decision.action === 'inject_step') {
          this.injectDynamicPage(decision.page, decision.options ?? { afterPageId: curPage.id });
        } else if (decision.action === 'replace_branch') {
          this.replaceDynamicBranch(decision.anchorPageId, decision.pages);
        } else if (decision.action === 'terminate') {
          if (decision.confirmationMessage && this.schema.settings) {
            this.schema.settings.confirmationMessage = decision.confirmationMessage;
          }
          await this.submit();
          return true;
        }
      } catch (err) {
        // Oracle timeout or failure must not deadlock navigation - graceful fallback to standard DAG
        if (this.telemetry) {
          this.telemetry.dispatch({
            type: 'transition_rejected',
            formId: this.schema.id,
            stepIndex: this.getCurrentPageIndex(),
            action: 'ADAPTIVE_STEP_ORACLE_EVALUATION',
            reason: (err as Error).message,
            timestamp: Date.now(),
          });
        }
      }
    }

    return this.navigationCoordinator.nextStep();
  }

  /**
   * Injects a dynamically generated page at runtime without resetting existing form state.
   */
  public injectDynamicPage(
    page: FormPage,
    options?: { afterPageId?: string; insertIndex?: number }
  ): boolean {
    if (!page || !page.id || !Array.isArray(page.fields)) {
      return false;
    }

    // Prevent duplicate page IDs
    const existingIdx = this.schema.pages.findIndex((p) => p.id === page.id);
    if (existingIdx !== -1) {
      return false;
    }

    let insertAt = this.schema.pages.length;
    if (options?.afterPageId) {
      const anchorIdx = this.schema.pages.findIndex((p) => p.id === options.afterPageId);
      if (anchorIdx !== -1) {
        insertAt = anchorIdx + 1;
      }
    } else if (typeof options?.insertIndex === 'number') {
      insertAt = Math.max(0, Math.min(this.schema.pages.length, options.insertIndex));
    }

    // Insert into schema
    this.schema.pages.splice(insertAt, 0, page);

    // Register all fields into formManager and assessmentEngine
    for (const field of page.fields) {
      this.formManager.registerField(field.name as any, {
        label: field.label,
        type: field.type,
        placeholder: field.placeholder,
        required: field.required,
        defaultValue: field.defaultValue as any,
        options: field.options,
        min: field.min,
        max: field.max,
        rules: field.rules,
        visibleIf: field.visibleIf,
        clearValueOnHide: field.clearValueOnHide,
        semanticIntent: field.semanticIntent,
      });

      if (field.rubric && this.assessmentEngine?.registerRubric) {
        this.assessmentEngine.registerRubric(field.name, field.rubric);
      }
    }

    this.notify();
    return true;
  }

  /**
   * Replaces an entire downstream dynamic branch with newly synthesized pages from an AI agent.
   */
  public replaceDynamicBranch(anchorPageId: string, dynamicPages: FormPage[]): boolean {
    const anchorIdx = this.schema.pages.findIndex((p) => p.id === anchorPageId);
    if (anchorIdx === -1) return false;

    // Remove obsolete pages between anchor and end
    const pagesToRemove = this.schema.pages.slice(anchorIdx + 1);
    for (const page of pagesToRemove) {
      for (const field of page.fields) {
        this.formManager.unregisterField(field.name as any);
      }
    }
    this.schema.pages.splice(anchorIdx + 1, pagesToRemove.length);

    // Insert dynamic pages
    for (let i = 0; i < dynamicPages.length; i++) {
      this.injectDynamicPage(dynamicPages[i], { insertIndex: anchorIdx + 1 + i });
    }

    return true;
  }

  /**
   * Removes a dynamically injected page.
   */
  public removeDynamicPage(pageId: string): boolean {
    const pageIdx = this.schema.pages.findIndex((p) => p.id === pageId);
    if (pageIdx === -1 || pageIdx === this.getCurrentPageIndex() || this.schema.pages.length <= 1) {
      return false;
    }

    const [removedPage] = this.schema.pages.splice(pageIdx, 1);
    for (const field of removedPage.fields) {
      this.formManager.unregisterField(field.name as any);
    }

    this.notify();
    return true;
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

        if (this.assessmentEngine?.hasStepTimer()) {
          this.assessmentEngine.startStepTimer();
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

  public async flushOutbox(force?: boolean): Promise<number> {
    return this.persistenceCoordinator.flushOutbox(force);
  }

  public getOutboxQueue(): OfflineOutboxQueue<T> | undefined {
    return this.persistenceCoordinator.getOutboxQueue();
  }

  public getAssessmentEngine(): IAssessmentPort | undefined {
    return this.assessmentEngine;
  }

  public isAssessment(): boolean {
    return Boolean(this.assessmentEngine);
  }

  public getAssessmentState(): AssessmentState | undefined {
    return this.assessmentEngine?.getState();
  }

  public requestAssessmentHint(fieldName: string): string | undefined {
    return this.assessmentEngine?.requestHint(fieldName);
  }

  public handleAppStateChange(state: 'active' | 'background' | 'inactive'): void {
    this.assessmentEngine?.handleAppStateChange(state);
  }

  public async submit(): Promise<void> {
    if (this.participationState?.status === 'locked') {
      throw new Error(
        `Cannot submit: participation is locked (${this.participationState.lockReasonDescription ?? this.participationState.evaluation?.reason ?? 'locked'})`
      );
    }
    if (this.participationState?.status === 'policy_drift_detected') {
      throw new Error(
        'Cannot submit: policy drift detected between draft and schema. Please confirm policy update.'
      );
    }

    if (this.assessmentEngine && !this.assessmentEngine.isInstantTiming()) {
      try {
        this.assessmentEngine.gradeAll(this.formManager.getState().values as Record<string, unknown>);
      } catch {
        // Outbound port failure must not crash submission
      }
    }

    if (this.psychometricAuditor) {
      try {
        const questions: QuestionMetadata[] = [];
        for (const page of this.schema.pages) {
          for (const field of page.fields) {
            questions.push({
              id: field.id,
              name: field.name,
              type: field.type,
              construct: (field as { construct?: string }).construct,
              minRating: (field as { minRating?: number }).minRating,
              maxRating: (field as { maxRating?: number }).maxRating,
            });
          }
        }

        const audit = this.psychometricAuditor.auditSubmission({
          answers: this.formManager.getState().values as Record<string, unknown>,
          questions,
        });

        if (this.onPsychometricAudit) {
          this.onPsychometricAudit(audit);
        }
      } catch {
        // Auditor failure must not crash submission
      }
    }

    return this.persistenceCoordinator.submit();
  }

  public getPsychometricAuditor(): IPsychometricAuditorPort | undefined {
    return this.psychometricAuditor;
  }

  public isOnline(): boolean {
    return this.persistenceCoordinator.isOnline();
  }

  public getPendingOutboxCount(): number {
    return this.persistenceCoordinator.getPendingOutboxCount();
  }

  // Participation & Policy Drift Management
  public getParticipationState(): FormParticipationState {
    return this.participationState;
  }

  public subscribeParticipation(callback: (state: FormParticipationState) => void): () => void {
    this.participationSubscribers.add(callback);
    return () => this.participationSubscribers.delete(callback);
  }

  public updateParticipation(config: Partial<FormParticipationConfig>): FormParticipationState {
    this.participationConfig = {
      ...this.participationConfig,
      ...config,
    };
    this.participationState = this.evaluateParticipation();
    this.notifyParticipation();
    this.notify();
    return this.participationState;
  }

  public async confirmPolicyDrift(action: 'confirm_and_apply' | 'reject_and_clear'): Promise<void> {
    if (this.participationState.status !== 'policy_drift_detected') {
      return;
    }

    if (action === 'confirm_and_apply') {
      const baseEvaluation = this.evaluateParticipation();
      this.participationState = {
        ...baseEvaluation,
        policyVersion: this.getActivePolicyVersion(),
        draftPolicyVersion: undefined,
        driftDetails: undefined,
      };
      this.saveDraft();
      this.notifyParticipation();
      this.notify();
    } else {
      await this.clearDraft();
      for (const page of this.schema.pages) {
        for (const field of page.fields) {
          (this.formManager as any).tsForm?.setFieldValue(field.name as any, field.defaultValue);
        }
      }
      const baseEvaluation = this.evaluateParticipation();
      this.participationState = {
        ...baseEvaluation,
        policyVersion: this.getActivePolicyVersion(),
        draftPolicyVersion: undefined,
        driftDetails: undefined,
      };
      this.notifyParticipation();
      this.notify();
    }
  }

  private evaluateParticipation(): FormParticipationState {
    const history = this.participationConfig?.submissionHistory ?? [];
    const evaluation = BatteryEngine.evaluateFormAccess(
      {
        id: this.schema.id,
        title: this.schema.title ?? this.schema.id,
        kind: this.schema.kind,
        accessPolicy: this.schema.accessPolicy,
        prerequisites: this.schema.prerequisites,
      },
      history,
    );

    const isLocked = evaluation.isLocked && !evaluation.canStart;
    const lockReasonDescription = isLocked
      ? BatteryEngine.describeAccessEvaluation(evaluation, { formTitles: this.participationConfig?.formTitles })
      : undefined;

    const activePolicyVersion = this.getActivePolicyVersion();

    return {
      status: isLocked ? 'locked' : 'eligible',
      isLocked,
      canSubmit: !isLocked,
      evaluation,
      lockReasonDescription,
      attemptId: this.participationConfig?.attemptId,
      policyVersion: activePolicyVersion,
    };
  }

  private getActivePolicyVersion(): string | undefined {
    if (this.participationConfig?.policyVersion) {
      return String(this.participationConfig.policyVersion);
    }
    if (this.schema.accessPolicy?.version) {
      return String(this.schema.accessPolicy.version);
    }
    return undefined;
  }

  private handleDraftHydrated(snapshot: FormDraftSnapshot<T>): void {
    const activeVersion = this.getActivePolicyVersion();
    const draftVersion = snapshot.policyVersion;

    if (draftVersion && activeVersion && draftVersion !== activeVersion) {
      const driftDetails = {
        expectedVersion: activeVersion,
        draftVersion: draftVersion,
      };
      this.participationState = {
        ...this.participationState,
        status: 'policy_drift_detected',
        draftPolicyVersion: draftVersion,
        driftDetails,
      };
      this.participationConfig?.onPolicyDrift?.(driftDetails);
      this.notifyParticipation();
    }
  }

  private notifyParticipation(): void {
    this.participationConfig?.onParticipationChange?.(this.participationState);
    this.participationSubscribers.forEach((cb) => cb(this.participationState));
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
    if (this.assessmentEngine) {
      this.assessmentEngine.dispose();
      this.assessmentEngine = undefined;
    }
    this.persistenceCoordinator.destroy();
    if (this.telemetry && 'flush' in this.telemetry) {
      (this.telemetry as any).flush?.();
    }
    this.subscribers.clear();
    this.participationSubscribers.clear();
  }

  public dispose(): void {
    this.destroy();
  }
}
