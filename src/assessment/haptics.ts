import type { IHapticFeedbackPort, HapticFeedbackPattern } from '../ports/IHapticFeedbackPort.js';

export interface AssessmentHapticOptions {
  minIntervalMs?: number;
}

export class AssessmentHapticDriver {
  private lastTriggerEpochMs = 0;
  private readonly minIntervalMs: number;

  constructor(
    private readonly port?: IHapticFeedbackPort,
    options: AssessmentHapticOptions = {}
  ) {
    this.minIntervalMs = options.minIntervalMs ?? 80;
  }

  public trigger(pattern: HapticFeedbackPattern): void {
    if (!this.port || !this.port.isSupported) return;

    const now = Date.now();
    if (now - this.lastTriggerEpochMs < this.minIntervalMs) {
      return; // Throttled to protect native mobile UI thread
    }
    this.lastTriggerEpochMs = now;

    try {
      this.port.trigger(pattern);
    } catch {
      // Non-blocking sensory error recovery
    }
  }

  public onCorrectAnswer(): void {
    this.trigger('success');
  }

  public onIncorrectAnswer(): void {
    this.trigger('error');
  }

  public onTimerWarning(): void {
    this.trigger('warning');
  }

  public onOptionSelect(): void {
    this.trigger('selection');
  }
}
