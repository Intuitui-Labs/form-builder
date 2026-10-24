import type {
  IProgressStrategyPort,
  ProgressCalculationResult,
  StepProgressContext,
} from '../../ports/IProgressStrategyPort.js';
import type { FormPage } from '../../schema/FormSchema.js';

export interface FieldWeightedProgressOptions {
  /** Average estimated seconds a respondent spends per field. Default: 9 */
  averageSecondsPerField?: number;
}

/**
 * Headless progress calculation strategy.
 * Blends completed step transitions with real-time field-level completion on the active page,
 * ensuring the progress bar increments smoothly on every user input rather than stalling.
 */
export class FieldWeightedProgressAdapter implements IProgressStrategyPort {
  readonly name = 'FieldWeightedProgressAdapter';
  private readonly averageSecondsPerField: number;

  constructor(options?: FieldWeightedProgressOptions) {
    this.averageSecondsPerField = options?.averageSecondsPerField ?? 9;
  }

  calculateProgress(context: StepProgressContext): ProgressCalculationResult {
    const total = Math.max(1, context.totalProjectedSteps);
    const completed = context.completedStepIds.length;

    const currentPage = context.pages?.find(
      (page: FormPage) => page.id === context.currentStepId,
    );
    const currentFraction = this.answeredFraction(currentPage, context.fieldValues);

    const effective = completed + currentFraction;
    const percentage = Math.min(100, Math.round((effective / total) * 100));

    let effortCompleted = 0;
    let effortTotal = 0;
    for (const page of context.pages ?? []) {
      for (const field of page.fields) {
        effortTotal += 1;
        const val = context.fieldValues[field.name];
        if (val !== undefined && val !== null && val !== '') {
          effortCompleted += 1;
        }
      }
    }

    const remainingFields = Math.max(0, effortTotal - effortCompleted);
    const remainingSeconds = remainingFields * this.averageSecondsPerField;

    return {
      percentage,
      estimatedTimeRemainingText:
        percentage >= 100 ? 'Complete' : this.formatDuration(remainingSeconds),
      effortCompleted,
      effortTotal,
    };
  }

  private answeredFraction(page: FormPage | undefined, values: Record<string, unknown>): number {
    if (!page || page.fields.length === 0) return 0;
    const answered = page.fields.filter((field) => {
      const val = values[field.name];
      return val !== undefined && val !== null && val !== '';
    }).length;
    return answered / page.fields.length;
  }

  private formatDuration(seconds: number): string {
    if (seconds <= 0) return 'Almost done';
    if (seconds < 60) return `~${Math.max(5, Math.round(seconds / 5) * 5)}s remaining`;
    return `~${Math.round(seconds / 60)} min remaining`;
  }
}
