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
  ITelemetryPort,
  FormTelemetryEvent,
  SubmissionEnvelope,
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
} from '../ports/index.js';
import type { IEntityExtractorPort } from '../ports/IEntityExtractorPort.js';
import type { IHapticFeedbackPort } from '../ports/IHapticFeedbackPort.js';
import { RegexRuleExtractorAdapter } from '../adapters/ai/RegexRuleExtractorAdapter.js';
import { AddressFieldMapper, type ExplicitAddressFieldMap } from '../affordance/AddressFieldMapper.js';
import { ContactFieldMapper, type ExplicitContactFieldMap } from '../affordance/ContactFieldMapper.js';
import { FormLifecycleMachine } from '../core/state/FormLifecycleMachine.js';
import type { FormLifecyclePhase, FormLifecycleEvent, FormLifecycleContext } from '../core/state/FormLifecycleTypes.js';
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
import { DefaultSanitizer } from '../core/DefaultSanitizer.js';
import type { CardBrand } from '../schema/FormGuidance.js';
import { NativeFocusController } from '../focus/NativeFocusController.js';
import { FormManager } from './FormManager.js';


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
}

export interface FormSecurityOptions {
  sanitizer?: ISanitizerPort;
  attachmentStorage?: IAttachmentStoragePort;
  onAttachmentPruned?: (field: string, pointer: AttachmentPointer) => void;
  schemaValidator?: ISchemaValidator<FormSchema>;
  validateSchemaOnMount?: boolean;
}

export interface MultiStepFormOptions<T extends Record<string, unknown> = Record<string, unknown>> {
  // Domain Grouped Subsystems
  resilience?: FormResilienceOptions<T>;
  experience?: FormExperienceOptions;
  security?: FormSecurityOptions;
  lifecyclePort?: IFormLifecyclePort<T>;

  // Backward Compatible Flat Aliases
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
  telemetry?: ITelemetryPort;
  autoRestoreDraft?: boolean;
  draftDebounceMs?: number;
  enableOutbox?: boolean;
  attachmentStorage?: IAttachmentStoragePort;
  onAttachmentPruned?: (field: string, pointer: AttachmentPointer) => void;
  sanitizer?: ISanitizerPort;
  sessionId?: string;
  hapticFeedback?: IHapticFeedbackPort;
}

export class MultiStepFormManager<T extends Record<string, unknown>> {
  private schema: FormSchema;
  private formManager: FormManager<T>;
  private sessionId: string;
  private lifecyclePort: IFormLifecyclePort<T>;
  private evaluatedMilestones: Set<string> = new Set();
  private subscribers: Set<(manager: MultiStepFormManager<T>) => void> = new Set();
  private unsubscribeNetwork?: () => void;
  private unsubscribeOutbox?: () => void;
  private unsubscribeForm?: () => void;
  private unsubscribeLifecycle?: () => void;

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

  private hasSavedDraftState = false;

  private telemetry?: ITelemetryPort;
  private formStartTime: number = Date.now();
  private stepStartTime: number = Date.now();

  private attachmentStorage?: IAttachmentStoragePort;
  private onAttachmentPruned?: (field: string, pointer: AttachmentPointer) => void;
  private inspectedPageIndex: number | null = null;
  private sanitizer: ISanitizerPort;
  private hapticPort?: IHapticFeedbackPort;

  constructor(
    schema: FormSchema,
    onSubmit: (values: T) => Promise<void> | void,
    options?: MultiStepFormOptions<T>,
  ) {
    const resOpt = options?.resilience;
    const expOpt = options?.experience;
    const secOpt = options?.security;

    const schemaValidator = secOpt?.schemaValidator ?? options?.schemaValidator;
    const validateSchemaOnMount = secOpt?.validateSchemaOnMount ?? options?.validateSchemaOnMount;
    if (validateSchemaOnMount && schemaValidator) {
      schemaValidator.validate(schema);
    }

    this.schema = schema;
    this.sessionId = expOpt?.sessionId ?? options?.sessionId ?? `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const rawTelemetry = expOpt?.telemetry ?? options?.telemetry;
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
    this.attachmentStorage = secOpt?.attachmentStorage ?? options?.attachmentStorage;
    this.onAttachmentPruned = secOpt?.onAttachmentPruned ?? options?.onAttachmentPruned;
    this.sanitizer = secOpt?.sanitizer ?? options?.sanitizer ?? new DefaultSanitizer();
    this.hapticPort = expOpt?.hapticFeedback ?? options?.hapticFeedback;
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
      options?.affordanceConfig ||
      schema.affordanceConfig ||
      schema.settings?.affordanceConfig;

    this.policy = resolveAffordanceConfig(userConfig);

    // Resolve Strategy & Ports
    const progressStrategyOpt = expOpt?.progressStrategy ?? options?.progressStrategy;
    if (typeof progressStrategyOpt === 'function') {
      const calcFn = progressStrategyOpt;
      this.progressStrategy = { calculateProgress: calcFn };
    } else if (progressStrategyOpt) {
      this.progressStrategy = progressStrategyOpt;
    } else if (this.policy.progress === 'weighted-velocity') {
      this.progressStrategy = new WeightedFieldProgressAdapter();
    } else {
      this.progressStrategy = new LinearStepProgressAdapter();
    }

    this.rewardEngine = expOpt?.rewardEngine ?? options?.rewardEngine ?? new NullRewardAdapter();
    this.feedbackNotifier = expOpt?.feedbackNotifier ?? options?.feedbackNotifier;

    // Phase 2: Storage, Network & Outbox resolution
    this.storagePort = resOpt?.storage ?? options?.storage ?? new MemoryStorageAdapter();
    this.networkStatusPort = resOpt?.networkStatus ?? options?.networkStatus ?? new AlwaysOnlineNetworkAdapter();
    this.transportPort = (resOpt?.transport ?? options?.transport ?? new CallbackTransportAdapter<T>(onSubmit)) as ITransportPort<T>;
    this.enableOutbox = resOpt?.enableOutbox ?? options?.enableOutbox ?? true;
    this.autoRestoreDraft = resOpt?.autoRestoreDraft ?? options?.autoRestoreDraft ?? false;

    if (resOpt?.draftStorage ?? options?.draftStorage) {
      this.draftStorage = (resOpt?.draftStorage ?? options?.draftStorage)!;
    } else {
      this.draftStorage = new DraftManager({
        storage: this.storagePort,
        debounceMs: resOpt?.draftDebounceMs ?? options?.draftDebounceMs,
      });
    }

    this.autoSaveDraft = resOpt?.autoSaveDraft ?? options?.autoSaveDraft ?? false;

    const netPromise = this.networkStatusPort.isOnline();
    const initialOnline = typeof netPromise === 'boolean' ? netPromise : true;

    this.lifecyclePort =
      options?.lifecyclePort ??
      new FormLifecycleMachine<T>({
        initialStepIndex: 0,
        isOnline: initialOnline,
        autoHydrate: !this.autoRestoreDraft,
      });

    this.unsubscribeLifecycle = this.lifecyclePort.subscribe((context, event) => {
      this.onLifecycleTransition(context, event);
    });

    if (this.enableOutbox) {
      this.outboxQueue = new OfflineOutboxQueue<T>({
        storage: this.storagePort,
        networkStatus: this.networkStatusPort,
        transport: this.transportPort,
      });

      this.unsubscribeOutbox = this.outboxQueue.subscribe((q) => {
        q.getPendingCount().then((count) => {
          this.lifecyclePort.send({ type: 'OUTBOX_COUNT_CHANGE', count });
          this.notify();
        });
      });
    }

    if (typeof netPromise !== 'boolean') {
      netPromise.then((onl) => {
        this.lifecyclePort.send({ type: 'ONLINE_CHANGE', isOnline: onl });
        this.notify();
      });
    }

    this.unsubscribeNetwork = this.networkStatusPort.subscribe((isOnline) => {
      this.lifecyclePort.send({ type: 'ONLINE_CHANGE', isOnline });
      this.notify();
    });

    // Check draft existence / auto-restore
    const checkDraft = async () => {
      try {
        const exists = await this.hasSavedDraft();
        this.hasSavedDraftState = exists;
        if (exists && this.autoRestoreDraft) {
          await this.restoreDraft();
        } else {
          // Transition machine to idle when no draft exists to prevent unhydrated deadlock
          this.lifecyclePort.send({ type: 'HYDRATE_SUCCESS' });
        }
      } catch (err: any) {
        this.lifecyclePort.send({
          type: 'HYDRATE_ERROR',
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        this.notify();
      }
    };
    checkDraft();

    // Flatten all fields across all pages to pass to FormHydrator
    const allFields = schema.pages.flatMap((page) => page.fields);
    this.formManager = FormHydrator.hydrate<T>({ fields: allFields as any }, onSubmit);

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

  /**
   * Atomically enriches multiple form fields in a single transaction.
   * Dispatches lifecycle transitions and auto-saves drafts when appropriate.
   */
  public batchSetFieldValues(
    updates: Partial<T>,
    options?: BatchSetOptions<T>,
  ): BatchEnrichmentResult<T> {
    const result = this.formManager.batchSetFieldValues(updates, options);
    if (result.appliedFields.length > 0) {
      for (const field of result.appliedFields) {
        const val = this.formManager.getState().values[field];
        this.lifecyclePort.send({
          type: 'FIELD_CHANGE',
          field,
          value: val,
        });
      }
      if (this.autoSaveDraft && this.isHydrated()) {
        this.scheduleAutoSaveDraft();
      }
      this.notify();
    }
    return result;
  }

  /**
   * Reverts fields that were enriched via autofill back to their previous values.
   */
  public revertEnrichedFields(fields?: Array<keyof T>): Array<keyof T> {
    const reverted = this.formManager.revertEnrichedFields(fields);
    if (reverted.length > 0) {
      for (const field of reverted) {
        const val = this.formManager.getState().values[field];
        this.lifecyclePort.send({
          type: 'FIELD_CHANGE',
          field,
          value: val,
        });
      }
      if (this.autoSaveDraft && this.isHydrated()) {
        this.scheduleAutoSaveDraft();
      }
      this.notify();
    }
    return reverted;
  }

  /**
   * Retrieves audit origin information for a field.
   */
  public getFieldOrigin<K extends keyof T>(field: K): FieldOriginInfo | undefined {
    return this.formManager.getFieldOrigin(field);
  }

  /**
   * Enriches multi-step form fields from an AddressCandidate, automatically inferring
   * mappings across all schema pages.
   */
  public enrichFromAddressCandidate(
    candidate: Partial<AddressCandidate>,
    options?: BatchSetOptions<T> & { explicitMap?: ExplicitAddressFieldMap },
  ): BatchEnrichmentResult<T> {
    const allFields = this.schema.pages.flatMap((p) => p.fields);
    const fieldMap = options?.explicitMap ?? AddressFieldMapper.inferFieldMap(allFields);
    const updates = AddressFieldMapper.candidateToFormValues(candidate, fieldMap) as Partial<T>;
    return this.batchSetFieldValues(updates, {
      origin: options?.origin ?? 'autofill-address',
      overwritePolicy: options?.overwritePolicy ?? 'preserve-user-edits',
      ...options,
    });
  }

  /**
   * Alias for enrichFromAddressCandidate.
   */
  public enrichFromAddress(
    candidate: Partial<AddressCandidate>,
    options?: BatchSetOptions<T> & { explicitMap?: ExplicitAddressFieldMap },
  ): BatchEnrichmentResult<T> {
    return this.enrichFromAddressCandidate(candidate, options);
  }

  /**
   * Enriches multi-step form fields from a PickedContact, decomposing name components,
   * assigning contact channels, and unpacking addresses across pages.
   */
  public enrichFromContact(
    contact: Partial<PickedContact>,
    options?: BatchSetOptions<T> & { explicitMap?: ExplicitContactFieldMap },
  ): BatchEnrichmentResult<T> {
    const allFields = this.schema.pages.flatMap((p) => p.fields);
    const fieldMap = options?.explicitMap ?? ContactFieldMapper.inferFieldMap(allFields);
    const updates = ContactFieldMapper.contactToFormValues(contact, fieldMap) as Partial<T>;
    return this.batchSetFieldValues(updates, {
      origin: options?.origin ?? 'autofill-contact',
      overwritePolicy: options?.overwritePolicy ?? 'preserve-user-edits',
      ...options,
    });
  }

  /**
   * Enriches multi-step form fields from freeform unstructured text across all pages.
   */
  public async enrichFromFreeformText(
    text: string,
    options?: BatchSetOptions<T> & {
      extractor?: IEntityExtractorPort;
      minConfidenceThreshold?: number;
    },
  ): Promise<BatchEnrichmentResult<T>> {
    const extractor = options?.extractor ?? new RegexRuleExtractorAdapter();
    const threshold = options?.minConfidenceThreshold ?? 0.7;
    const allFields = this.schema.pages.flatMap((p) => p.fields);

    const entities = await extractor.extractEntities({
      text,
      targetFields: allFields,
    });

    const updates: Partial<T> = {};
    const fieldMap = new Set(allFields.map((f) => f.name));
    for (const entity of entities) {
      if (entity.confidence >= threshold && fieldMap.has(entity.field)) {
        updates[entity.field as keyof T] = entity.value as T[keyof T];
      }
    }

    return this.batchSetFieldValues(updates, {
      origin: options?.origin ?? 'ghost-paste',
      overwritePolicy: options?.overwritePolicy ?? 'preserve-user-edits',
      ...options,
    });
  }

  private fieldFocusTimestamps: Map<string, number> = new Map();

  public blurField<K extends keyof T>(field: K): void {
    const fieldName = String(field);
    const focusTime = this.fieldFocusTimestamps.get(fieldName);
    const dwellMs = focusTime ? Math.max(0, Date.now() - focusTime) : 0;
    this.fieldFocusTimestamps.delete(fieldName);

    const val = (this.formManager.getState().values as Record<string, unknown>)[fieldName];
    const hasValue = val !== undefined && val !== null && val !== '';
    const valueLength =
      typeof val === 'string'
        ? val.length
        : Array.isArray(val)
          ? val.length
          : undefined;

    this.recordFieldBlur(fieldName, dwellMs, hasValue, valueLength);
    this.lifecyclePort.send({ type: 'FIELD_BLUR', field: field as keyof T, dwellMs });
    this.formManager.blurField(field);
    this.notify();
  }

  public focusField<K extends keyof T>(field: K): void {
    this.fieldFocusTimestamps.set(String(field), Date.now());
    this.recordFieldFocus(String(field));
    this.lifecyclePort.send({ type: 'FIELD_FOCUS', field: field as keyof T });
  }

  public getActiveFocusedField(): keyof T | undefined {
    return this.lifecyclePort.getContext().activeFocusedField;
  }

  public recordFieldFocus(fieldName: string): void {
    if (this.telemetry) {
      this.telemetry.dispatch({
        type: 'field_focused',
        formId: this.schema.id,
        stepIndex: this.getCurrentPageIndex(),
        fieldName,
        timestamp: Date.now(),
      });
    }
  }

  public recordFieldBlur(fieldName: string, dwellMs: number, hasValue: boolean, valueLength?: number): void {
    if (this.telemetry) {
      this.telemetry.dispatch({
        type: 'field_blurred',
        formId: this.schema.id,
        stepIndex: this.getCurrentPageIndex(),
        fieldName,
        dwellMs,
        hasValue,
        valueLength,
        timestamp: Date.now(),
      });
    }
  }

  public recordFieldError(fieldName: string, errorRule: string, errorMessage?: string): void {
    if (this.telemetry) {
      this.telemetry.dispatch({
        type: 'field_error',
        formId: this.schema.id,
        stepIndex: this.getCurrentPageIndex(),
        fieldName,
        errorRule,
        errorMessage,
        timestamp: Date.now(),
      });
    }
  }

  public recordFormAbandoned(): void {
    if (this.telemetry) {
      this.telemetry.dispatch({
        type: 'form_abandoned',
        formId: this.schema.id,
        lastStepIndex: this.getCurrentPageIndex(),
        completedSteps: this.lifecyclePort.getContext().completedStepIndices.size,
        totalDurationMs: Date.now() - this.formStartTime,
        experimentLineage: this.schema.settings?.experimentLineage as any,
        timestamp: Date.now(),
      });
      this.telemetry.flush?.();
    }
  }

  public getFormManager(): FormManager<T> {
    return this.formManager;
  }


  public getPages(): FormPage[] {
    return this.schema.pages;
  }

  public sanitizePage(page: FormPage): FormPage {
    if (!page) return page;
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

  /**
   * Enters read-only peek mode on any target step (past or future), allowing
   * the user to inspect upcoming/previous questions without violating validation gates.
   */
  public peekStep(pageIndex: number): boolean {
    if (pageIndex < 0 || pageIndex >= this.schema.pages.length) {
      return false;
    }
    this.inspectedPageIndex = pageIndex;
    this.notify();
    return true;
  }

  /**
   * Exits peek mode and returns the viewport to the active validated step.
   */
  public stopPeeking(): void {
    if (this.inspectedPageIndex !== null) {
      this.inspectedPageIndex = null;
      this.notify();
    }
  }

  /**
   * Checks whether the user is currently peeking at a step different from active editing step.
   */
  public isPeeking(): boolean {
    return this.inspectedPageIndex !== null && this.inspectedPageIndex !== this.getCurrentPageIndex();
  }

  /**
   * Returns the index of the currently viewed page (inspected step if peeking, otherwise active step).
   */
  public getInspectedPageIndex(): number {
    return this.inspectedPageIndex ?? this.getCurrentPageIndex();
  }

  /**
   * Returns the FormPage currently being inspected/viewed.
   */
  public getInspectedPage(): FormPage {
    const idx = this.getInspectedPageIndex();
    const raw = this.schema.pages[idx]!;
    return this.sanitizePage(raw);
  }

  public getStepHistory(): number[] {
    return [...this.lifecyclePort.getContext().stepHistory];
  }

  public getTotalPages(): number {
    return this.schema.pages.length;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public isFirstStep(): boolean {
    return this.getCurrentPageIndex() === 0;
  }

  public isLastStep(): boolean {
    return this.getNextPageIndex() === null;
  }

  public getCompletedStepIndices(): number[] {
    return Array.from(this.lifecyclePort.getContext().completedStepIndices).sort((a, b) => a - b);
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

  /**
   * Validates only the visible fields on the current active page.
   */
  public validateCurrentStep(): boolean {
    const visibleFields = this.getVisibleFields(this.getCurrentPageIndex());
    let isPageValid = true;

    for (const field of visibleFields) {
      this.formManager.setFieldTouched(field.name as keyof T, true);
      if (!this.formManager.validateField(field.name as keyof T)) {
        isPageValid = false;
        if (this.telemetry) {
          const err = this.formManager.getState().errors[field.name as keyof T];
          this.telemetry.dispatch({
            type: 'field_error',
            formId: this.schema.id,
            stepIndex: this.getCurrentPageIndex(),
            fieldName: field.name,
            errorRule: field.rules?.[0]?.type ?? 'validation_failed',
            errorMessage: err,
            timestamp: Date.now(),
          });
        }
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
    return this.resolveNextPageIndexFrom(this.getCurrentPageIndex());
  }

  /**
   * Checks whether a page is a branching decision node (has configured jumpRules).
   */
  public isBranchingStep(pageIndex: number = this.getCurrentPageIndex()): boolean {
    const page = this.schema.pages[pageIndex];
    return Boolean(page && page.jumpRules && page.jumpRules.length > 0);
  }

  /**
   * Checks whether altering values on the given branching step would divert navigation
   * down a different path than previously traversed.
   */
  public willDivertBranch(pageIndex: number = this.getCurrentPageIndex()): boolean {
    if (!this.isBranchingStep(pageIndex)) return false;
    const branchTargetHistory = this.lifecyclePort.getContext().branchTargetHistory;
    if (!branchTargetHistory.has(pageIndex)) return false;
    const previousTarget = branchTargetHistory.get(pageIndex);
    const currentTarget = this.resolveNextPageIndexFrom(pageIndex);
    return previousTarget !== currentTarget;
  }

  /**
   * Checks whether downstream steps belonging to a previous branch taken from pageIndex
   * currently contain non-empty user input data.
   */
  public hasDownstreamBranchData(pageIndex: number = this.getCurrentPageIndex()): boolean {
    const downstream = this.lifecyclePort.getContext().branchLineage.get(pageIndex);
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
  public getDownstreamBranchStepIndices(pageIndex: number = this.getCurrentPageIndex()): number[] {
    return Array.from(this.lifecyclePort.getContext().branchLineage.get(pageIndex) ?? []);
  }

  /**
   * Calculates the active projected sequence of page indices from start to projected end,
   * taking into account history and dynamic jump rules with cycle detection.
   */
  public getProjectedPath(): number[] {
    const path: number[] = [...this.getStepHistory()];
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

    const currentIndex = this.getCurrentPageIndex();
    if (targetIndex === currentIndex) {
      return true;
    }

    if (this.policy.navigation === 'random-access-open') {
      return true;
    }

    const context = this.lifecyclePort.getContext();
    if (this.policy.navigation === 'visited-only') {
      if (context.completedStepIndices.has(targetIndex)) {
        return true;
      }
      const nextIndex = this.getNextPageIndex();
      if (targetIndex === nextIndex && this.validateCurrentStep()) {
        return true;
      }
      return false;
    }

    // 'strict-linear': can retrace to immediate previous step or advance if valid
    const prevHistory = context.stepHistory[context.stepHistory.length - 2];
    if (targetIndex === prevHistory || targetIndex === currentIndex - 1) {
      return true;
    }
    const nextIndex = this.getNextPageIndex();
    if (targetIndex === nextIndex && this.validateCurrentStep()) {
      return true;
    }

    return false;
  }

  public nextStep(): boolean {
    if (!this.lifecyclePort.can('STEP_NEXT')) {
      if (this.telemetry) {
        this.telemetry.dispatch({
          type: 'transition_rejected' as any,
          formId: this.schema.id,
          stepIndex: this.getCurrentPageIndex(),
          phase: this.lifecyclePort.getPhase(),
          action: 'STEP_NEXT',
          timestamp: Date.now(),
        });
      }
      return false;
    }

    const nextIndex = this.getNextPageIndex();
    if (nextIndex === null) {
      return false;
    }

    // Validate only visible fields on current page
    if (!this.validateCurrentStep()) {
      this.hapticPort?.trigger('error');
      const currentStepFields = this.getCurrentPage().fields.map((f) => f.name);
      this.focusController.focusFirstInvalid(this.formManager.getState().errors as Record<string, string | undefined>, currentStepFields);
      this.notify();
      return false;
    }

    // Prune stale values from fields that just became hidden
    this.pruneHiddenFieldValues();

    const completedIndex = this.getCurrentPageIndex();
    const completedPage = this.getCurrentPage();

    // Branch diversion management: if user changed their branching answer,
    // prune only downstream branch steps while leaving normal/ancestor steps intact
    let prunedSteps: number[] | undefined;
    if (this.isBranchingStep(completedIndex)) {
      if (this.willDivertBranch(completedIndex)) {
        if (this.telemetry) {
          this.telemetry.dispatch({
            type: 'branch_diverted',
            formId: this.schema.id,
            fromStep: completedIndex,
            targetStep: nextIndex,
            timestamp: Date.now(),
          });
        }
        const obsoleteSteps = this.lifecyclePort.getContext().branchLineage.get(completedIndex);
        if (obsoleteSteps && obsoleteSteps.size > 0) {
          prunedSteps = Array.from(obsoleteSteps);
          for (const stepIdx of prunedSteps) {
            // Reset values of fields belonging to obsolete branch steps
            const page = this.schema.pages[stepIdx];
            if (page) {
              for (const f of page.fields) {
                const oldVal = (this.formManager.getState().values as Record<string, unknown>)[f.name];
                if (oldVal && typeof oldVal === 'object' && 'localUri' in oldVal) {
                  const ptr = oldVal as AttachmentPointer;
                  this.onAttachmentPruned?.(f.name, ptr);
                  if (this.attachmentStorage && ptr.id) {
                    this.attachmentStorage.deleteLocal(ptr.id).catch(() => {});
                  }
                }
                this.formManager.setFieldValue(f.name as any, (f.defaultValue ?? '') as any);
              }
            }
          }
        }
      }
    }

    // Atomically dispatch transition to lifecycle kernel (SSOT)
    // The reactive onLifecycleTransition subscriber automatically triggers milestone rewards and telemetry
    const transition = this.lifecyclePort.send({
      type: 'STEP_NEXT',
      nextIndex,
      branchFromIndex: this.isBranchingStep(completedIndex) ? completedIndex : undefined,
      prunedStepIndices: prunedSteps,
    });

    if (!transition.accepted) {
      return false;
    }

    if (this.autoSaveDraft) {
      this.saveDraft();
    }
    this.inspectedPageIndex = null;
    this.hapticPort?.trigger('selection');
    this.notify();
    return true;
  }

  public prevStep(): boolean {
    if (!this.lifecyclePort.can('STEP_PREV')) {
      if (this.telemetry) {
        this.telemetry.dispatch({
          type: 'transition_rejected' as any,
          formId: this.schema.id,
          stepIndex: this.getCurrentPageIndex(),
          phase: this.lifecyclePort.getPhase(),
          action: 'STEP_PREV',
          timestamp: Date.now(),
        });
      }
      return false;
    }
    if (this.isFirstStep()) {
      return false;
    }

    const history = this.getStepHistory();
    let targetIndex: number;
    if (history.length > 1) {
      targetIndex = history[history.length - 2];
    } else {
      const cur = this.getCurrentPageIndex();
      if (cur <= 0) return false;
      targetIndex = cur - 1;
    }

    const transition = this.lifecyclePort.send({ type: 'STEP_PREV', targetIndex });
    if (!transition.accepted) {
      return false;
    }

    if (this.autoSaveDraft) {
      this.saveDraft();
    }
    this.inspectedPageIndex = null;
    this.hapticPort?.trigger('light-click');
    this.notify();
    return true;
  }

  public goToStep(index: number): boolean {
    if (!this.lifecyclePort.can('STEP_JUMP')) {
      if (this.telemetry) {
        this.telemetry.dispatch({
          type: 'transition_rejected' as any,
          formId: this.schema.id,
          stepIndex: this.getCurrentPageIndex(),
          targetIndex: index,
          phase: this.lifecyclePort.getPhase(),
          action: 'STEP_JUMP',
          timestamp: Date.now(),
        });
      }
      return false;
    }
    if (!this.canNavigateToStep(index)) {
      return false;
    }
    const transition = this.lifecyclePort.send({ type: 'STEP_JUMP', targetIndex: index });
    if (!transition.accepted) {
      return false;
    }
    if (this.autoSaveDraft) {
      this.saveDraft();
    }
    this.inspectedPageIndex = null;
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
          this.triggerRewardEvaluation(completedIndex, completedPage);
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
    const projectedPath = this.getProjectedPath();
    const projectedPages = projectedPath.map((idx) => this.schema.pages[idx]!);
    const completedSet = this.lifecyclePort.getContext().completedStepIndices;
    const completedInPath = projectedPath.filter((idx) =>
      completedSet.has(idx)
    );

    return this.progressStrategy.calculateProgress({
      formId: this.schema.id,
      currentStepIndex: this.getCurrentPageIndex(),
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
  public getStepFocusPlan(pageIndex: number = this.getCurrentPageIndex()): StepFocusPlan {
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
    const completedSet = this.lifecyclePort.getContext().completedStepIndices;
    const currentIndex = this.getCurrentPageIndex();

    const breadcrumbs: BreadcrumbItem[] = this.schema.pages.map((page, index) => {
      let status: StepStatus;
      const isSkipped = !projectedSet.has(index) && !completedSet.has(index);

      if (index === currentIndex) {
        status = 'current';
      } else if (completedSet.has(index)) {
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
        isHydrated: this.isHydrated(),
        hasSavedDraft: this.hasSavedDraftState,
        lastSavedAt: this.lifecyclePort.getContext().lastSavedAt,
        pendingOutboxCount: this.lifecyclePort.getContext().pendingOutboxCount,
        isOnline: this.lifecyclePort.getContext().isOnline,
        syncStatus: this.outboxQueue?.getSyncStatus() ?? 'idle',
        lastSyncError: this.outboxQueue?.getLastSyncError() ?? this.lifecyclePort.getContext().lastError,
      },
      policy: { ...this.policy },
    };
  }

  public isHydrated(): boolean {
    const phase = this.lifecyclePort.getPhase();
    return phase !== 'unhydrated' && phase !== 'hydrating';
  }

  /**
   * Creates and persists a serializable snapshot of the active form state.
   */
  public createDraftSnapshot(): FormDraftSnapshot<T> {
    const state = this.formManager.getState();
    const context = this.lifecyclePort.getContext();
    const branchLineageArray: Array<[number, number[]]> = Array.from(
      context.branchLineage.entries()
    ).map(([src, set]) => [src, Array.from(set)]);

    const branchTargetHistoryArray: Array<[number, number]> = Array.from(
      context.branchTargetHistory.entries()
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

    // Hostile Trap 1: Storage Quota Poisoning Defense (Clean Attachment Pointers only, no base64 buffers)
    for (const [key, val] of Object.entries(sanitizedValues as Record<string, unknown>)) {
      if (typeof val === 'string' && val.startsWith('data:') && val.length > 512) {
        // Strip raw inline base64 data to prevent AsyncStorage / localStorage quota crash
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

    return {
      schemaId: this.schema.id,
      schemaVersion: this.schema.version ?? '1.0.0',
      savedAt: new Date().toISOString(),
      currentPageIndex: this.getCurrentPageIndex(),
      completedStepIndices: this.getCompletedStepIndices(),
      stepHistory: this.getStepHistory(),
      branchLineage: branchLineageArray,
      branchTargetHistory: branchTargetHistoryArray,
      values: sanitizedValues,
      redactedFields: redactedFields.length > 0 ? redactedFields : undefined,
      isSubmitted: state.submitSuccess,
    };
  }

  /**
   * Creates and persists a serializable snapshot of the active form state immediately.
   */
  public saveDraft(): FormDraftSnapshot<T> {
    const snapshot = this.createDraftSnapshot();
    this.draftStorage.saveDraft(snapshot as FormDraftSnapshot);
    this.hasSavedDraftState = true;
    this.lifecyclePort.send({ type: 'DRAFT_SAVED', savedAt: snapshot.savedAt });
    return snapshot;
  }

  private scheduleAutoSaveDraft(): void {
    const snapshot = this.createDraftSnapshot();
    if (this.draftStorage.scheduleAutoSave) {
      this.draftStorage.scheduleAutoSave(
        snapshot as FormDraftSnapshot,
        (saved) => {
          this.hasSavedDraftState = true;
          this.lifecyclePort.send({ type: 'DRAFT_SAVED', savedAt: saved.savedAt });
          this.notify();
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

    // Re-evaluate visibility and dynamic conditions
    this.pruneHiddenFieldValues();

    // Restore state atomically into FLM SSOT
    this.lifecyclePort.send({ type: 'HYDRATE_SUCCESS', draft: snapshot });
    this.notify();
    return true;
  }

  /**
   * Clears any saved draft for this schema from the storage adapter.
   */
  public async clearDraft(): Promise<void> {
    await this.draftStorage.clearDraft(this.schema.id);
    this.hasSavedDraftState = false;
    this.lifecyclePort.send({ type: 'DRAFT_CLEARED' });
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
    const pending = await this.outboxQueue.getPendingCount();
    this.lifecyclePort.send({ type: 'OUTBOX_COUNT_CHANGE', count: pending });
    this.notify();
    return count;
  }

  public getOutboxQueue(): OfflineOutboxQueue<T> | undefined {
    return this.outboxQueue;
  }

  public async submit() {
    if (!this.lifecyclePort.can('SUBMIT_START')) {
      if (this.telemetry) {
        this.telemetry.dispatch({
          type: 'submit_rejected' as any,
          formId: this.schema.id,
          stepIndex: this.getCurrentPageIndex(),
          phase: this.lifecyclePort.getPhase(),
          action: 'SUBMIT_START',
          timestamp: Date.now(),
        });
      }
      return;
    }

    this.pruneHiddenFieldValues();
    const startResult = this.lifecyclePort.send({ type: 'SUBMIT_START' });
    if (!startResult.accepted) {
      return;
    }

    // Validate only visible fields across pages in the active branch path before final submission
    let allValid = true;
    const activePathIndices = Array.from(new Set([...this.getStepHistory(), ...this.getProjectedPath()]));
    for (const pageIdx of activePathIndices) {
      const visibleFields = this.getVisibleFields(pageIdx);
      for (const field of visibleFields) {
        if (!this.formManager.validateField(field.name as keyof T)) {
          allValid = false;
        }
      }
    }

    if (!allValid) {
      this.lifecyclePort.send({ type: 'SUBMIT_ERROR', error: 'Validation failed' });
      this.notify();
      return;
    }

    // Mark visited steps as completed in FLM
    this.lifecyclePort.send({
      type: 'COMPLETE_STEPS',
      stepIndices: this.getStepHistory(),
    });

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
      this.lifecyclePort.send({ type: 'SUBMIT_OFFLINE', outboxId: envelope.id });
      await this.clearDraft();
    } else {
      // Device is online: submit directly via formManager
      try {
        await this.formManager.submit({ skipValidation: true });
        const success = !!this.formManager.getState().submitSuccess;
        if (success) {
          this.lifecyclePort.send({ type: 'SUBMIT_SUCCESS' });
          await this.clearDraft();
        } else {
          this.lifecyclePort.send({ type: 'SUBMIT_ERROR', error: 'Submit failed' });
        }
      } catch (err: any) {
        this.lifecyclePort.send({ type: 'SUBMIT_ERROR', error: err?.message ?? 'Submit error' });
      }
    }
    this.notify();
  }

  /**
   * Disposes all subscriptions, outbox listeners, network monitors, and debounced timers.
   * Defends against mobile React Native memory leaks upon screen unmount.
   */
  public destroy(): void {
    if (this.unsubscribeNetwork) {
      this.unsubscribeNetwork();
      this.unsubscribeNetwork = undefined;
    }
    if (this.unsubscribeOutbox) {
      this.unsubscribeOutbox();
      this.unsubscribeOutbox = undefined;
    }
    if (this.unsubscribeForm) {
      this.unsubscribeForm();
      this.unsubscribeForm = undefined;
    }
    if (this.unsubscribeLifecycle) {
      this.unsubscribeLifecycle();
      this.unsubscribeLifecycle = undefined;
    }
    if (this.outboxQueue) {
      this.outboxQueue.destroy();
    }
    if (this.draftStorage && 'flush' in this.draftStorage) {
      (this.draftStorage as any).flush?.();
    }
    if (this.telemetry && 'flush' in this.telemetry) {
      (this.telemetry as any).flush?.();
    }
    this.subscribers.clear();
  }

  public dispose(): void {
    this.destroy();
  }
}
