import type {
  IProgressStrategyPort,
  ProgressCalculationResult,
  StepProgressContext,
} from '@intuitui-labs/form-builder-engine';
import type { FormPage } from '@intuitui-labs/form-builder-engine';

/**
 * Outbound adapter -> engine's IProgressStrategyPort.
 *
 * Progress blends completed steps with how much of the current step the
 * respondent has answered, so the bar moves as they tap through a page rather
 * than only jumping on step change. Effort is counted in answered questions.
 */
export class FeedoraProgressAdapter implements IProgressStrategyPort {
  readonly name = 'FeedoraProgressAdapter';

  constructor(private readonly averageSecondsPerStep = 9) {}

  calculateProgress(context: StepProgressContext): ProgressCalculationResult {
    const total = Math.max(1, context.totalProjectedSteps);
    const completed = context.completedStepIds.length;

    const currentPage = context.pages?.find(
      (page: FormPage) => page.id === context.currentStepId,
    );
    const currentAnsweredFraction = this.answeredFraction(currentPage, context.fieldValues);

    const effective = completed + currentAnsweredFraction;
    const percentage = Math.min(100, Math.round((effective / total) * 100));

    let effortCompleted = 0;
    let effortTotal = 0;
    for (const page of context.pages ?? []) {
      for (const field of page.fields) {
        effortTotal += 1;
        const value = context.fieldValues[field.name];
        if (value !== undefined && value !== null && value !== '') {
          effortCompleted += 1;
        }
      }
    }

    const remainingSteps = Math.max(0, total - completed);
    const remainingSeconds = remainingSteps * this.averageSecondsPerStep;

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
      const value = values[field.name];
      return value !== undefined && value !== null && value !== '';
    }).length;
    return answered / page.fields.length;
  }

  private formatDuration(seconds: number): string {
    if (seconds <= 0) return 'Almost done';
    if (seconds < 60) return `~${Math.max(5, Math.round(seconds / 5) * 5)}s remaining`;
    return `~${Math.round(seconds / 60)} min remaining`;
  }
}
