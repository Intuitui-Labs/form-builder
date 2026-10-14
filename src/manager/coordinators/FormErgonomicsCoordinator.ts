import type { FormField, FormPage } from '../../schema/FormSchema.js';
import type {
  BreadcrumbItem,
  FormAffordanceState,
  ProgressMetrics,
  StepStatus,
} from '../../schema/FormAffordance.js';
import type {
  CardBrand,
  FieldGuidanceState,
  StepFocusPlan,
} from '../../schema/FormGuidance.js';
import type {
  IFeedbackNotifierPort,
  IProgressStrategyPort,
  IRewardEnginePort,
  RewardPayload,
} from '../../ports/index.js';
import { evaluateCondition } from '../../core/ConditionEvaluator.js';
import { resolveSemanticIntent } from '../../core/SemanticIntentResolver.js';
import { PaymentCardHelper } from '../../core/PaymentCardHelper.js';
import { PasswordEntropyEstimator } from '../../core/PasswordEntropyEstimator.js';
import type { MultiStepCoordinatorContext } from './types.js';

export class FormErgonomicsCoordinator<T extends Record<string, unknown>> {
  private fieldFocusTimestamps: Map<string, number> = new Map();
  private evaluatedMilestones: Set<string> = new Set();
  private activeReward: RewardPayload | null = null;
  public progressStrategy: IProgressStrategyPort;
  public rewardEngine: IRewardEnginePort;
  public feedbackNotifier?: IFeedbackNotifierPort;

  constructor(
    private ctx: MultiStepCoordinatorContext<T>,
    progressStrategy: IProgressStrategyPort,
    rewardEngine: IRewardEnginePort,
    feedbackNotifier?: IFeedbackNotifierPort,
  ) {
    this.progressStrategy = progressStrategy;
    this.rewardEngine = rewardEngine;
    this.feedbackNotifier = feedbackNotifier;
  }

  public getActiveReward(): RewardPayload | null {
    return this.activeReward;
  }

  public clearActiveReward(): void {
    this.activeReward = null;
    this.ctx.notify();
  }

  public resetMilestones(): void {
    this.evaluatedMilestones.clear();
    this.activeReward = null;
    this.ctx.notify();
  }

  public blurField<K extends keyof T>(field: K): void {
    const fieldName = String(field);
    const focusTime = this.fieldFocusTimestamps.get(fieldName);
    const dwellMs = focusTime ? Math.max(0, Date.now() - focusTime) : 0;
    this.fieldFocusTimestamps.delete(fieldName);

    const val = (this.ctx.formManager.getState().values as Record<string, unknown>)[fieldName];
    const hasValue = val !== undefined && val !== null && val !== '';
    const valueLength =
      typeof val === 'string'
        ? val.length
        : Array.isArray(val)
          ? val.length
          : undefined;

    this.recordFieldBlur(fieldName, dwellMs, hasValue, valueLength);
    this.ctx.lifecyclePort.send({ type: 'FIELD_BLUR', field: field as keyof T, dwellMs });
    this.ctx.formManager.blurField(field);
    this.ctx.notify();
  }

  public focusField<K extends keyof T>(field: K): void {
    this.fieldFocusTimestamps.set(String(field), Date.now());
    this.recordFieldFocus(String(field));
    this.ctx.lifecyclePort.send({ type: 'FIELD_FOCUS', field: field as keyof T });
  }

  public getActiveFocusedField(): keyof T | undefined {
    return this.ctx.lifecyclePort.getContext().activeFocusedField;
  }

  public recordFieldFocus(fieldName: string): void {
    if (this.ctx.telemetry) {
      this.ctx.telemetry.dispatch({
        type: 'field_focused',
        formId: this.ctx.schema.id,
        stepIndex: this.ctx.getCurrentPageIndex(),
        fieldName,
        timestamp: Date.now(),
      });
    }
  }

  public recordFieldBlur(fieldName: string, dwellMs: number, hasValue: boolean, valueLength?: number): void {
    if (this.ctx.telemetry) {
      this.ctx.telemetry.dispatch({
        type: 'field_blurred',
        formId: this.ctx.schema.id,
        stepIndex: this.ctx.getCurrentPageIndex(),
        fieldName,
        dwellMs,
        hasValue,
        valueLength,
        timestamp: Date.now(),
      });
    }
  }

  public recordFieldError(fieldName: string, errorRule: string, errorMessage?: string): void {
    if (this.ctx.telemetry) {
      this.ctx.telemetry.dispatch({
        type: 'field_error',
        formId: this.ctx.schema.id,
        stepIndex: this.ctx.getCurrentPageIndex(),
        fieldName,
        errorRule,
        errorMessage,
        timestamp: Date.now(),
      });
    }
  }

  public recordFormAbandoned(): void {
    if (this.ctx.telemetry) {
      const now = Date.now();
      const currentIdx = this.ctx.getCurrentPageIndex();
      const completedSteps = this.ctx.lifecyclePort.getContext().completedStepIndices.size;
      this.ctx.telemetry.dispatch({
        type: 'form_abandoned',
        formId: this.ctx.schema.id,
        lastStepIndex: currentIdx,
        completedSteps,
        totalDurationMs: now - this.ctx.formStartTime,
        experimentLineage: this.ctx.schema.settings?.experimentLineage as any,
        timestamp: now,
      });
      this.ctx.telemetry.flush?.();
    }
  }

  public triggerRewardEvaluation(completedIndex: number, completedPage: FormPage): void {
    const milestoneKey = `${this.ctx.schema.id}:${completedPage.id}:${completedIndex}`;
    if (this.evaluatedMilestones.has(milestoneKey)) {
      return; // Milestone already evaluated this session (prevents farming)
    }
    this.evaluatedMilestones.add(milestoneKey);

    const formState = this.ctx.formManager.getState();
    const allValues = formState.values;
    const stepData: Record<string, unknown> = {};

    for (const field of completedPage.fields) {
      stepData[field.name] = (allValues as Record<string, unknown>)[field.name];
    }

    const progress = this.getProgress();
    const context = {
      formId: this.ctx.schema.id,
      completedStepId: completedPage.id,
      completedStepIndex: completedIndex,
      completedPage,
      stepIndex: completedIndex,
      totalSteps: this.ctx.schema.pages.length,
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
          this.ctx.notify();
        }
      });
    } else if (maybeReward) {
      this.activeReward = maybeReward;
      this.feedbackNotifier?.notifyRewardUnlocked(maybeReward);
    }
  }

  public getProgress(): ProgressMetrics {
    const projectedPath = this.ctx.getProjectedPath();
    const projectedPages = projectedPath.map((idx) => this.ctx.schema.pages[idx]!);
    const completedSet = this.ctx.lifecyclePort.getContext().completedStepIndices;
    const completedInPath = projectedPath.filter((idx) =>
      completedSet.has(idx)
    );

    return this.progressStrategy.calculateProgress({
      formId: this.ctx.schema.id,
      currentStepIndex: this.ctx.getCurrentPageIndex(),
      currentStepId: this.ctx.getCurrentPage()?.id ?? '',
      completedStepIds: completedInPath.map((idx) => this.ctx.schema.pages[idx]?.id ?? ''),
      completedStepIndices: completedInPath,
      pages: projectedPages,
      totalProjectedSteps: Math.max(1, projectedPath.length),
      fieldValues: this.ctx.formManager.getState().values as Record<string, unknown>,
    });
  }

  /**
   * Generates a proactive focus and keyboard traversal plan for the active page,
   * mapping auto-focus targets and next/done return keys across visible interactive fields.
   * Excludes multiline textareas from single-line next/done return keys to preserve multiline editing.
   */
  public getStepFocusPlan(pageIndex: number = this.ctx.getCurrentPageIndex()): StepFocusPlan {
    const visibleFields = this.ctx.getVisibleFields(pageIndex);
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
    for (const page of this.ctx.schema.pages) {
      const f = page.fields.find((field) => field.name === fieldName);
      if (f) {
        foundField = f;
        break;
      }
    }

    if (!foundField) return undefined;

    const values = this.ctx.formManager.getState().values as Record<string, unknown>;
    const isVisible = foundField.visibleIf
      ? evaluateCondition(foundField.visibleIf, values)
      : true;

    const formState = this.ctx.formManager.getState();
    const error = formState.errors?.[fieldName as keyof T];
    const isValid = !error;
    const isTouched = this.ctx.formManager.isFieldTouched(fieldName as keyof T);

    const semanticMeta = resolveSemanticIntent(foundField.semanticIntent);
    const isSensitive = foundField.sensitive ?? semanticMeta?.isSensitive ?? false;
    const privacyRationale = foundField.privacyRationale;

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

    // Dynamic CVC mask adaptation based on card brand
    if (foundField.semanticIntent === 'payment-card-cvc') {
      let associatedCardVal: unknown;
      for (const p of this.ctx.schema.pages) {
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
    const projectedPath = this.ctx.getProjectedPath();
    const projectedSet = new Set<number>(projectedPath);
    const completedSet = this.ctx.lifecyclePort.getContext().completedStepIndices;
    const currentIndex = this.ctx.getCurrentPageIndex();

    const breadcrumbs: BreadcrumbItem[] = this.ctx.schema.pages.map((page, index) => {
      let status: StepStatus;
      const isSkipped = !projectedSet.has(index) && !completedSet.has(index);

      if (index === currentIndex) {
        status = 'current';
      } else if (completedSet.has(index)) {
        status = 'completed';
      } else if (isSkipped) {
        status = 'skipped';
      } else if (this.ctx.canNavigateToStep(index)) {
        status = 'unvisited';
      } else {
        status = 'locked';
      }

      return {
        stepId: page.id,
        title: page.title || `Step ${index + 1}`,
        index,
        status,
        canNavigateTo: !isSkipped && this.ctx.canNavigateToStep(index),
        isSkipped,
      };
    });

    const progress = this.getProgress();

    return {
      breadcrumbs,
      progress,
      activeReward: this.activeReward,
      navigation: {
        canGoNext: !this.ctx.isLastStep(),
        canGoPrev: !this.ctx.isFirstStep(),
        canSubmit: this.ctx.isLastStep(),
        isFirstStep: this.ctx.isFirstStep(),
        isLastStep: this.ctx.isLastStep(),
        isBranchingStep: this.ctx.isBranchingStep(),
        willDivertBranch: this.ctx.willDivertBranch(),
        hasDownstreamBranchData: this.ctx.hasDownstreamBranchData(),
        canSaveAndExit: this.ctx.policy.allowSaveAndResumeLater,
      },
      persistence: {
        isHydrated: this.ctx.isHydrated(),
        hasSavedDraft: this.ctx.hasSavedDraftState,
        lastSavedAt: this.ctx.lifecyclePort.getContext().lastSavedAt,
        pendingOutboxCount: this.ctx.lifecyclePort.getContext().pendingOutboxCount,
        isOnline: this.ctx.lifecyclePort.getContext().isOnline,
        syncStatus: this.ctx.getOutboxSyncStatus(),
        lastSyncError: this.ctx.getOutboxLastSyncError() ?? this.ctx.lifecyclePort.getContext().lastError,
      },
      policy: { ...this.ctx.policy },
    };
  }
}
