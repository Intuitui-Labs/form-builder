import type { FormField, FormPage } from '../../schema/FormSchema.js';
import { evaluateCondition } from '../../core/ConditionEvaluator.js';
import type { AttachmentPointer } from '../../ports/index.js';
import type { MultiStepCoordinatorContext } from './types.js';

export class StepNavigationCoordinator<T extends Record<string, unknown>> {
  constructor(private ctx: MultiStepCoordinatorContext<T>) {}

  public getStepHistory(): number[] {
    return [...this.ctx.lifecyclePort.getContext().stepHistory];
  }

  public getCompletedStepIndices(): number[] {
    return Array.from(this.ctx.lifecyclePort.getContext().completedStepIndices).sort((a, b) => a - b);
  }

  public isFirstStep(): boolean {
    return this.ctx.getCurrentPageIndex() === 0;
  }

  public isLastStep(): boolean {
    return this.getNextPageIndex() === null;
  }

  /**
   * Validates only the visible fields on the current active page.
   */
  public validateCurrentStep(): boolean {
    const visibleFields = this.ctx.getVisibleFields(this.ctx.getCurrentPageIndex());
    let isPageValid = true;

    for (const field of visibleFields) {
      this.ctx.formManager.setFieldTouched(field.name as keyof T, true);
      if (!this.ctx.formManager.validateField(field.name as keyof T)) {
        isPageValid = false;
        if (this.ctx.telemetry) {
          const err = this.ctx.formManager.getState().errors[field.name as keyof T];
          this.ctx.telemetry.dispatch({
            type: 'field_error',
            formId: this.ctx.schema.id,
            stepIndex: this.ctx.getCurrentPageIndex(),
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
    const page = this.ctx.schema.pages[pageIndex];
    if (!page) return null;
    const values = this.ctx.formManager.getState().values as Record<string, unknown>;

    // 1. Evaluate jumpRules
    if (page.jumpRules && page.jumpRules.length > 0) {
      for (const rule of page.jumpRules) {
        if (evaluateCondition(rule.condition, values)) {
          const targetIndex = this.ctx.schema.pages.findIndex(
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
      const targetIndex = this.ctx.schema.pages.findIndex(
        (p) => p.id === page.defaultNextPageId
      );
      if (targetIndex !== -1) {
        return targetIndex;
      }
    }

    // 3. Fallback to linear progression
    if (pageIndex < this.ctx.schema.pages.length - 1) {
      return pageIndex + 1;
    }

    return null;
  }

  /**
   * Resolves the next target page index from current page by evaluating conditional jump rules,
   * defaultNextPageId, or falling back to linear sequence.
   */
  public getNextPageIndex(): number | null {
    return this.resolveNextPageIndexFrom(this.ctx.getCurrentPageIndex());
  }

  /**
   * Checks whether a page is a branching decision node (has configured jumpRules).
   */
  public isBranchingStep(pageIndex: number = this.ctx.getCurrentPageIndex()): boolean {
    const page = this.ctx.schema.pages[pageIndex];
    return Boolean(page && page.jumpRules && page.jumpRules.length > 0);
  }

  /**
   * Checks whether altering values on the given branching step would divert navigation
   * down a different path than previously traversed.
   */
  public willDivertBranch(pageIndex: number = this.ctx.getCurrentPageIndex()): boolean {
    if (!this.isBranchingStep(pageIndex)) return false;
    const branchTargetHistory = this.ctx.lifecyclePort.getContext().branchTargetHistory;
    if (!branchTargetHistory.has(pageIndex)) return false;
    const previousTarget = branchTargetHistory.get(pageIndex);
    const currentTarget = this.resolveNextPageIndexFrom(pageIndex);
    return previousTarget !== currentTarget;
  }

  /**
   * Checks whether downstream steps belonging to a previous branch taken from pageIndex
   * currently contain non-empty user input data.
   */
  public hasDownstreamBranchData(pageIndex: number = this.ctx.getCurrentPageIndex()): boolean {
    const downstream = this.ctx.lifecyclePort.getContext().branchLineage.get(pageIndex);
    if (!downstream || downstream.size === 0) return false;
    const values = this.ctx.formManager.getState().values as Record<string, unknown>;
    for (const stepIdx of downstream) {
      const page = this.ctx.schema.pages[stepIdx];
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
  public getDownstreamBranchStepIndices(pageIndex: number = this.ctx.getCurrentPageIndex()): number[] {
    return Array.from(this.ctx.lifecyclePort.getContext().branchLineage.get(pageIndex) ?? []);
  }

  /**
   * Calculates the active projected sequence of page indices from start to projected end,
   * taking into account history and dynamic jump rules with cycle detection.
   */
  public getProjectedPath(): number[] {
    const path: number[] = [...this.getStepHistory()];
    let currentIdx = path[path.length - 1] ?? 0;
    const visited = new Set<number>(path);
    const maxHops = this.ctx.schema.pages.length * 2;
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
    if (targetIndex < 0 || targetIndex >= this.ctx.schema.pages.length) {
      return false;
    }

    const currentIndex = this.ctx.getCurrentPageIndex();
    if (targetIndex === currentIndex) {
      return true;
    }

    if (this.ctx.policy.navigation === 'random-access-open') {
      return true;
    }

    const context = this.ctx.lifecyclePort.getContext();
    if (this.ctx.policy.navigation === 'visited-only') {
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
    if (!this.ctx.lifecyclePort.can('STEP_NEXT')) {
      if (this.ctx.telemetry) {
        this.ctx.telemetry.dispatch({
          type: 'transition_rejected' as any,
          formId: this.ctx.schema.id,
          stepIndex: this.ctx.getCurrentPageIndex(),
          phase: this.ctx.lifecyclePort.getPhase(),
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
      this.ctx.hapticPort?.trigger('error');
      const currentStepFields = this.ctx.getCurrentPage().fields.map((f) => f.name);
      this.ctx.focusController.focusFirstInvalid(
        this.ctx.formManager.getState().errors as Record<string, string | undefined>,
        currentStepFields
      );
      this.ctx.notify();
      return false;
    }

    // Prune stale values from fields that just became hidden
    this.ctx.pruneHiddenFieldValues();

    const completedIndex = this.ctx.getCurrentPageIndex();

    // Branch diversion management: if user changed their branching answer,
    // prune only downstream branch steps while leaving normal/ancestor steps intact
    let prunedSteps: number[] | undefined;
    if (this.isBranchingStep(completedIndex)) {
      if (this.willDivertBranch(completedIndex)) {
        if (this.ctx.telemetry) {
          this.ctx.telemetry.dispatch({
            type: 'branch_diverted',
            formId: this.ctx.schema.id,
            fromStep: completedIndex,
            targetStep: nextIndex,
            timestamp: Date.now(),
          });
        }
        const obsoleteSteps = this.ctx.lifecyclePort.getContext().branchLineage.get(completedIndex);
        if (obsoleteSteps && obsoleteSteps.size > 0) {
          prunedSteps = Array.from(obsoleteSteps);
          for (const stepIdx of prunedSteps) {
            // Reset values of fields belonging to obsolete branch steps
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
        }
      }
    }

    // Atomically dispatch transition to lifecycle kernel (SSOT)
    const transition = this.ctx.lifecyclePort.send({
      type: 'STEP_NEXT',
      nextIndex,
      branchFromIndex: this.isBranchingStep(completedIndex) ? completedIndex : undefined,
      prunedStepIndices: prunedSteps,
    });

    if (!transition.accepted) {
      return false;
    }

    if (this.ctx.autoSaveDraft) {
      this.ctx.saveDraft();
    }
    this.ctx.setInspectedPageIndex(null);
    this.ctx.hapticPort?.trigger('selection');
    this.ctx.notify();
    return true;
  }

  public prevStep(): boolean {
    if (!this.ctx.lifecyclePort.can('STEP_PREV')) {
      if (this.ctx.telemetry) {
        this.ctx.telemetry.dispatch({
          type: 'transition_rejected' as any,
          formId: this.ctx.schema.id,
          stepIndex: this.ctx.getCurrentPageIndex(),
          phase: this.ctx.lifecyclePort.getPhase(),
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
      const cur = this.ctx.getCurrentPageIndex();
      if (cur <= 0) return false;
      targetIndex = cur - 1;
    }

    const transition = this.ctx.lifecyclePort.send({ type: 'STEP_PREV', targetIndex });
    if (!transition.accepted) {
      return false;
    }

    if (this.ctx.autoSaveDraft) {
      this.ctx.saveDraft();
    }
    this.ctx.setInspectedPageIndex(null);
    this.ctx.hapticPort?.trigger('light-click');
    this.ctx.notify();
    return true;
  }

  public goToStep(index: number): boolean {
    if (!this.ctx.lifecyclePort.can('STEP_JUMP')) {
      if (this.ctx.telemetry) {
        this.ctx.telemetry.dispatch({
          type: 'transition_rejected' as any,
          formId: this.ctx.schema.id,
          stepIndex: this.ctx.getCurrentPageIndex(),
          targetIndex: index,
          phase: this.ctx.lifecyclePort.getPhase(),
          action: 'STEP_JUMP',
          timestamp: Date.now(),
        });
      }
      return false;
    }
    if (!this.canNavigateToStep(index)) {
      return false;
    }
    const transition = this.ctx.lifecyclePort.send({ type: 'STEP_JUMP', targetIndex: index });
    if (!transition.accepted) {
      return false;
    }
    if (this.ctx.autoSaveDraft) {
      this.ctx.saveDraft();
    }
    this.ctx.setInspectedPageIndex(null);
    this.ctx.notify();
    return true;
  }
}
