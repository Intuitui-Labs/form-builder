import type { FormPage } from '../../schema/FormSchema.js';
import type {
  Condition,
  ConditionPredicate,
  CompoundCondition,
  PeekBranchStatus,
  BranchPrerequisite,
  DiscardedFieldInfo,
  BranchSwitchImpact,
  BranchSwitchOptions,
  BranchSwitchResult,
} from '../../schema/FormBranching.js';
import { evaluatePredicate } from '../../core/ConditionEvaluator.js';
import type { AttachmentPointer } from '../../ports/index.js';
import type { MultiStepCoordinatorContext } from './types.js';

export class BranchSwitchCoordinator<T extends Record<string, unknown>> {
  private inspectedPageIndex: number | null = null;

  constructor(private ctx: MultiStepCoordinatorContext<T>) {}

  public setInspectedPageIndex(index: number | null): void {
    this.inspectedPageIndex = index;
  }

  /**
   * Enters read-only peek mode on any target step (past or future), allowing
   * the user to inspect upcoming/previous questions without violating validation gates.
   */
  public peekStep(pageIndex: number): boolean {
    if (pageIndex < 0 || pageIndex >= this.ctx.schema.pages.length) {
      return false;
    }
    this.inspectedPageIndex = pageIndex;
    this.ctx.notify();
    return true;
  }

  /**
   * Exits peek mode and returns the viewport to the active validated step.
   */
  public stopPeeking(): void {
    if (this.inspectedPageIndex !== null) {
      this.inspectedPageIndex = null;
      this.ctx.notify();
    }
  }

  /**
   * Checks whether the user is currently peeking at a step different from active editing step.
   */
  public isPeeking(): boolean {
    return this.inspectedPageIndex !== null && this.inspectedPageIndex !== this.ctx.getCurrentPageIndex();
  }

  /**
   * Returns the index of the currently viewed page (inspected step if peeking, otherwise active step).
   */
  public getInspectedPageIndex(): number {
    return this.inspectedPageIndex ?? this.ctx.getCurrentPageIndex();
  }

  /**
   * Returns the FormPage currently being inspected/viewed.
   */
  public getInspectedPage(): FormPage {
    const idx = this.getInspectedPageIndex();
    const raw = this.ctx.schema.pages[idx]!;
    return this.ctx.sanitizer ? this.sanitizePage(raw) : raw;
  }

  private sanitizePage(page: FormPage): FormPage {
    if (!this.ctx.sanitizer) return page;
    let modified = false;
    let sanitizedMedia = page.media;

    if (page.media?.url) {
      const cleanUrl = this.ctx.sanitizer.sanitizeUrl(page.media.url);
      if (cleanUrl !== page.media.url) {
        sanitizedMedia = { ...page.media, url: cleanUrl };
        modified = true;
      }
    }

    const sanitizedFields = page.fields.map((field) => {
      if (field.type === 'rich-text' && field.content) {
        const cleanContent = this.ctx.sanitizer.sanitizeRichText(field.content);
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

  private extractConditionPredicates(condition: Condition): ConditionPredicate[] {
    if (!condition) return [];
    if ('field' in condition && typeof (condition as ConditionPredicate).field === 'string') {
      return [condition as ConditionPredicate];
    }
    if ('predicates' in condition && Array.isArray((condition as CompoundCondition).predicates)) {
      return (condition as CompoundCondition).predicates.flatMap((p) => this.extractConditionPredicates(p));
    }
    return [];
  }

  /**
   * Classifies any step index relative to the active branch path.
   */
  public getPeekBranchStatus(pageIndex: number): PeekBranchStatus {
    if (pageIndex < 0 || pageIndex >= this.ctx.schema.pages.length) {
      return 'unreachable';
    }
    const current = this.ctx.getCurrentPageIndex();
    if (pageIndex === current) {
      return 'current';
    }
    const history = this.ctx.getStepHistory();
    if (history.includes(pageIndex)) {
      return 'visited';
    }
    const projectedPath = this.ctx.getProjectedPath();
    if (projectedPath.includes(pageIndex)) {
      return 'active-path';
    }

    // Check if the page is reachable via any jump rule, defaultNextPageId, or linear sequence in the schema
    const targetId = this.ctx.schema.pages[pageIndex]?.id;
    let hasIncomingEdge = false;
    for (let i = 0; i < this.ctx.schema.pages.length; i++) {
      if (i === pageIndex) continue;
      const p = this.ctx.schema.pages[i]!;
      if (p.jumpRules?.some((r) => r.targetPageId === targetId)) {
        hasIncomingEdge = true;
        break;
      }
      if (p.defaultNextPageId === targetId) {
        hasIncomingEdge = true;
        break;
      }
      if (i + 1 === pageIndex && (!p.jumpRules || p.jumpRules.length === 0) && !p.defaultNextPageId) {
        hasIncomingEdge = true;
        break;
      }
    }

    return hasIncomingEdge ? 'conditional-branch' : 'unreachable';
  }

  /**
   * Comprehensive inspection of a peeked step, analyzing branch prerequisites,
   * data loss impact if diverted, and generating human/accessible spoken narrative.
   */
  public explainPeekStep(targetIndex: number = this.getInspectedPageIndex()): BranchSwitchImpact {
    const defaultInvalid: BranchSwitchImpact = {
      targetPageIndex: targetIndex,
      targetPageId: '',
      targetPageTitle: '',
      status: 'unreachable',
      isConditional: false,
      isActivePath: false,
      divergentFromStepIndex: null,
      divergentFromStepTitle: null,
      prerequisites: [],
      prunedStepIndices: [],
      prunedFields: [],
      hasDataLoss: false,
      spokenExplanation: 'Target step does not exist in this form schema.',
      canSwitch: false,
    };

    if (targetIndex < 0 || targetIndex >= this.ctx.schema.pages.length) {
      return defaultInvalid;
    }

    const targetPage = this.ctx.schema.pages[targetIndex]!;
    const status = this.getPeekBranchStatus(targetIndex);
    const isActivePath = status === 'current' || status === 'visited' || status === 'active-path';
    const isConditional = status === 'conditional-branch';
    const values = this.ctx.formManager.getState().values as Record<string, unknown>;

    // 1. Locate incoming rules and identify divergent ancestor step & prerequisites
    const prerequisites: BranchPrerequisite[] = [];
    let divergentFromStepIndex: number | null = null;
    let divergentFromStepTitle: string | null = null;

    // Scan for direct jumpRules targeting this page
    for (let i = 0; i < this.ctx.schema.pages.length; i++) {
      const page = this.ctx.schema.pages[i]!;
      const matchingRule = page.jumpRules?.find((r) => r.targetPageId === targetPage.id);
      if (matchingRule) {
        divergentFromStepIndex = i;
        divergentFromStepTitle = page.title ?? `Step ${i + 1}`;
        const preds = this.extractConditionPredicates(matchingRule.condition);
        for (const pred of preds) {
          const fieldDef = this.ctx.schema.pages.flatMap((p) => p.fields).find((f) => f.name === pred.field);
          const currentValue = values[pred.field];
          const satisfied = evaluatePredicate(pred, values);
          prerequisites.push({
            field: pred.field,
            fieldLabel: fieldDef?.label ?? pred.field,
            operator: pred.operator,
            expectedValue: pred.value,
            currentValue,
            satisfied,
          });
        }
        break;
      }
    }

    // If no direct jump rule, check defaultNextPageId or fallback
    if (divergentFromStepIndex === null) {
      for (let i = 0; i < this.ctx.schema.pages.length; i++) {
        const page = this.ctx.schema.pages[i]!;
        if (page.defaultNextPageId === targetPage.id) {
          divergentFromStepIndex = i;
          divergentFromStepTitle = page.title ?? `Step ${i + 1}`;
          break;
        }
      }
    }

    // 2. Calculate discarded downstream steps and fields
    const prunedStepIndices: number[] = [];
    const prunedFields: DiscardedFieldInfo[] = [];

    if (isConditional) {
      const history = this.ctx.getStepHistory();
      const currentIdx = this.ctx.getCurrentPageIndex();
      // Steps visited after the divergence point that are not the target or divergent step
      const visitedSteps = Array.from(new Set([...history, currentIdx]));
      const divIdx = divergentFromStepIndex ?? 0;

      for (const stepIdx of visitedSteps) {
        if (stepIdx > divIdx && stepIdx !== targetIndex) {
          prunedStepIndices.push(stepIdx);
          const page = this.ctx.schema.pages[stepIdx];
          if (page) {
            for (const f of page.fields) {
              const val = values[f.name];
              if (val !== undefined && val !== null && val !== '') {
                prunedFields.push({
                  name: f.name,
                  label: f.label ?? f.name,
                  value: val,
                  stepIndex: stepIdx,
                  stepTitle: page.title ?? `Step ${stepIdx + 1}`,
                });
              }
            }
          }
        }
      }
    }

    const hasDataLoss = prunedFields.length > 0;

    // 3. Construct spoken / accessible explanation
    let spokenExplanation = '';
    const title = targetPage.title ?? `Step ${targetIndex + 1}`;
    switch (status) {
      case 'current':
        spokenExplanation = `You are currently viewing Step ${targetIndex + 1}: ${title}.`;
        break;
      case 'visited':
        spokenExplanation = `Step ${targetIndex + 1}: ${title} was already completed. You can safely return here at any time.`;
        break;
      case 'active-path':
        spokenExplanation = `Step ${targetIndex + 1}: ${title} is on your active path. Complete your current step to advance here.`;
        break;
      case 'conditional-branch': {
        const prereqStrings = prerequisites.map(
          (p) => `${p.fieldLabel || p.field} must be '${p.expectedValue}' (currently '${p.currentValue ?? 'unset'}')`
        );
        const prereqSummary = prereqStrings.length > 0 ? ` Requires: ${prereqStrings.join('; ')}.` : '';
        const lossSummary = hasDataLoss
          ? ` Switching to this branch will discard ${prunedFields.length} answered field(s) across ${prunedStepIndices.length} step(s): ${prunedFields.map((f) => f.label).join(', ')}.`
          : ' You can switch to this branch with zero data loss.';
        spokenExplanation = `Step ${targetIndex + 1}: ${title} is an alternate conditional branch.${prereqSummary}${lossSummary}`;
        break;
      }
      case 'unreachable':
        spokenExplanation = `Step ${targetIndex + 1}: ${title} is not reachable under the current form schema.`;
        break;
    }

    return {
      targetPageIndex: targetIndex,
      targetPageId: targetPage.id,
      targetPageTitle: title,
      status,
      isConditional,
      isActivePath,
      divergentFromStepIndex,
      divergentFromStepTitle,
      prerequisites,
      prunedStepIndices,
      prunedFields,
      hasDataLoss,
      spokenExplanation,
      canSwitch: status !== 'unreachable' && status !== 'current',
    };
  }

  /**
   * Evaluates the impact of switching branches without mutating state.
   */
  public previewBranchSwitch(targetPageIndex: number = this.getInspectedPageIndex()): BranchSwitchImpact {
    return this.explainPeekStep(targetPageIndex);
  }

  /**
   * Atomically transitions the active step to targetPageIndex, optionally satisfying branch
   * prerequisites, pruning abandoned downstream data, and cleaning up attachments with full rollback resilience.
   */
  public confirmBranchSwitch(
    targetPageIndex: number = this.getInspectedPageIndex(),
    options?: BranchSwitchOptions
  ): BranchSwitchResult {
    const impact = this.explainPeekStep(targetPageIndex);
    const currentIndex = this.ctx.getCurrentPageIndex();

    if (!impact.canSwitch) {
      return {
        success: false,
        error: `Cannot switch to step ${targetPageIndex} with status '${impact.status}'`,
        newActiveIndex: currentIndex,
      };
    }

    // Atomic Snapshot for Rollback
    const valuesSnapshot = { ...this.ctx.formManager.getState().values };

    try {
      // 1. Auto-satisfy branch prerequisites if enabled (default true)
      if (options?.autoSatisfyPrerequisites !== false && impact.prerequisites.length > 0) {
        for (const prereq of impact.prerequisites) {
          if (!prereq.satisfied && prereq.expectedValue !== undefined) {
            this.ctx.formManager.setFieldValue(prereq.field as any, prereq.expectedValue as any);
          }
        }
      }

      // 2. Prune abandoned downstream steps & fields
      for (const stepIdx of impact.prunedStepIndices) {
        const page = this.ctx.schema.pages[stepIdx];
        if (page) {
          for (const f of page.fields) {
            const oldVal = (this.ctx.formManager.getState().values as Record<string, unknown>)[f.name];
            if (oldVal && typeof oldVal === 'object' && 'localUri' in oldVal) {
              const ptr = oldVal as AttachmentPointer;
              this.ctx.onAttachmentPruned?.(f.name, ptr);
              if (this.ctx.attachmentStorage && ptr.id) {
                this.ctx.attachmentStorage.deleteLocal(ptr.id).catch(() => {});
              }
            }
            this.ctx.formManager.setFieldValue(f.name as any, (f.defaultValue ?? '') as any);
          }
        }
      }

      // 3. Atomically update lifecycle kernel
      const transition = this.ctx.lifecyclePort.send({
        type: 'STEP_JUMP',
        targetIndex: targetPageIndex,
        branchFromIndex: impact.divergentFromStepIndex ?? undefined,
        prunedStepIndices: impact.prunedStepIndices.length > 0 ? impact.prunedStepIndices : undefined,
      });

      if (!transition.accepted) {
        throw new Error('Lifecycle kernel rejected transition to branch step');
      }

      // Exit peek mode
      this.inspectedPageIndex = null;

      // Auto-save draft if enabled
      if (this.ctx.autoSaveDraft) {
        this.ctx.saveDraft();
      }

      // Dispatch telemetry event
      if (this.ctx.telemetry) {
        this.ctx.telemetry.dispatch({
          type: 'branch_switched' as any,
          formId: this.ctx.schema.id,
          fromStep: currentIndex,
          targetStep: targetPageIndex,
          divergentFromStep: impact.divergentFromStepIndex,
          prunedFieldsCount: impact.prunedFields.length,
          timestamp: Date.now(),
        });
      }

      this.ctx.hapticPort?.trigger('selection');
      this.ctx.notify();

      return {
        success: true,
        newActiveIndex: targetPageIndex,
      };
    } catch (err) {
      // Rollback to snapshot
      for (const [k, v] of Object.entries(valuesSnapshot)) {
        this.ctx.formManager.setFieldValue(k as any, v as any);
      }
      return {
        success: false,
        error: String(err),
        rollbackApplied: true,
        newActiveIndex: currentIndex,
      };
    }
  }

  /**
   * Cancels any pending branch switch and returns viewport to active editing step.
   */
  public cancelBranchSwitch(): void {
    this.stopPeeking();
  }

  /**
   * Reads aloud the spoken narrative / explanation for the peeked or current step
   * using the injected ISpeechSynthesisPort (accessible screen-reader affordance).
   */
  public speakPeekExplanation(targetIndex: number = this.getInspectedPageIndex()): void {
    if (!this.ctx.speechSynthesisPort) return;
    const impact = this.explainPeekStep(targetIndex);
    this.ctx.speechSynthesisPort.speak(impact.spokenExplanation);
  }

  /**
   * Immediately stops any active speech synthesis readout.
   */
  public stopSpeaking(): void {
    this.ctx.speechSynthesisPort?.stop();
  }

  /**
   * Returns whether speech synthesis is actively reading out form guidance.
   */
  public isSpeaking(): boolean {
    return this.ctx.speechSynthesisPort ? this.ctx.speechSynthesisPort.isSpeaking() : false;
  }
}
