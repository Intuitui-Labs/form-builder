export interface CadenceTimerCallbacks {
  onStepTick?: (remainingSeconds: number) => void;
  onGlobalTick?: (remainingSeconds: number) => void;
  onStepWarning?: (remainingSeconds: number) => void;
  onGlobalWarning?: (remainingSeconds: number) => void;
  onStepExpired?: () => void;
  onGlobalExpired?: () => void;
}

export interface CadenceTimerOptions {
  warningThresholdSeconds?: number;
  tickIntervalMs?: number;
}

export class CadenceTimerController {
  private globalDeadlineEpochMs?: number;
  private stepDeadlineEpochMs?: number;
  private globalDurationSeconds?: number;
  private stepDurationSeconds?: number;

  private isGlobalExpired = false;
  private isStepExpired = false;
  private isPaused = false;
  private pausedAtEpochMs?: number;

  private hasFiredGlobalWarning = false;
  private hasFiredStepWarning = false;

  private timerInterval?: ReturnType<typeof setInterval>;
  private readonly callbacks: CadenceTimerCallbacks;
  private readonly warningThresholdSeconds: number;
  private readonly tickIntervalMs: number;

  constructor(callbacks: CadenceTimerCallbacks = {}, options: CadenceTimerOptions = {}) {
    this.callbacks = callbacks;
    this.warningThresholdSeconds = options.warningThresholdSeconds ?? 5;
    this.tickIntervalMs = options.tickIntervalMs ?? 500;
  }

  public startGlobalTimer(seconds: number): void {
    if (seconds <= 0) return;
    this.globalDurationSeconds = seconds;
    this.globalDeadlineEpochMs = Date.now() + seconds * 1000;
    this.isGlobalExpired = false;
    this.hasFiredGlobalWarning = false;
    this.ensureIntervalRunning();
    this.tick();
  }

  public startStepTimer(seconds: number): void {
    if (seconds <= 0) return;
    this.stepDurationSeconds = seconds;
    this.stepDeadlineEpochMs = Date.now() + seconds * 1000;
    this.isStepExpired = false;
    this.hasFiredStepWarning = false;
    this.ensureIntervalRunning();
    this.tick();
  }

  public stopStepTimer(): void {
    this.stepDeadlineEpochMs = undefined;
    this.stepDurationSeconds = undefined;
    this.isStepExpired = false;
    this.hasFiredStepWarning = false;
    if (!this.globalDeadlineEpochMs) {
      this.clearInterval();
    }
  }

  public stopAll(): void {
    this.globalDeadlineEpochMs = undefined;
    this.stepDeadlineEpochMs = undefined;
    this.clearInterval();
  }

  public getGlobalRemainingSeconds(): number | undefined {
    if (this.isGlobalExpired) return 0;
    if (!this.globalDeadlineEpochMs) return undefined;
    const now = this.isPaused && this.pausedAtEpochMs ? this.pausedAtEpochMs : Date.now();
    const rawSec = Math.ceil((this.globalDeadlineEpochMs - now) / 1000);
    return Math.min(this.globalDurationSeconds ?? Infinity, Math.max(0, rawSec));
  }

  public getStepRemainingSeconds(): number | undefined {
    if (this.isStepExpired) return 0;
    if (!this.stepDeadlineEpochMs) return undefined;
    const now = this.isPaused && this.pausedAtEpochMs ? this.pausedAtEpochMs : Date.now();
    const rawSec = Math.ceil((this.stepDeadlineEpochMs - now) / 1000);
    return Math.min(this.stepDurationSeconds ?? Infinity, Math.max(0, rawSec));
  }

  /**
   * Mobile Lifecycle & Suspension Sentry:
   * Handles React Native AppState change ('active' | 'background' | 'inactive')
   */
  public handleAppStateChange(nextAppState: 'active' | 'background' | 'inactive'): void {
    if (nextAppState === 'background' || nextAppState === 'inactive') {
      this.pauseDisplayTicker();
    } else if (nextAppState === 'active') {
      this.resumeDisplayTicker();
    }
  }

  private pauseDisplayTicker(): void {
    if (this.isPaused) return;
    this.clearInterval();
    this.isPaused = true;
    this.pausedAtEpochMs = Date.now();
  }

  private resumeDisplayTicker(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.pausedAtEpochMs = undefined;
    // Immediately evaluate actual clock drift against epoch deadlines
    this.ensureIntervalRunning();
    this.tick();
  }

  /**
   * Periodic evaluation tick against epoch time
   */
  public tick(): void {
    const now = Date.now();

    // 1. Evaluate Step Timer
    if (this.stepDeadlineEpochMs && !this.isStepExpired) {
      const remainingMs = this.stepDeadlineEpochMs - now;
      const rawSec = Math.ceil(remainingMs / 1000);
      const remainingSec = Math.min(this.stepDurationSeconds ?? Infinity, Math.max(0, rawSec));

      this.callbacks.onStepTick?.(remainingSec);

      if (
        remainingSec <= this.warningThresholdSeconds &&
        remainingSec > 0 &&
        !this.hasFiredStepWarning
      ) {
        this.hasFiredStepWarning = true;
        this.callbacks.onStepWarning?.(remainingSec);
      }

      if (remainingMs <= 0) {
        this.isStepExpired = true;
        this.stepDeadlineEpochMs = undefined;
        this.callbacks.onStepExpired?.();
      }
    }

    // 2. Evaluate Global Timer
    if (this.globalDeadlineEpochMs && !this.isGlobalExpired) {
      const remainingMs = this.globalDeadlineEpochMs - now;
      const rawSec = Math.ceil(remainingMs / 1000);
      const remainingSec = Math.min(this.globalDurationSeconds ?? Infinity, Math.max(0, rawSec));

      this.callbacks.onGlobalTick?.(remainingSec);

      if (
        remainingSec <= this.warningThresholdSeconds &&
        remainingSec > 0 &&
        !this.hasFiredGlobalWarning
      ) {
        this.hasFiredGlobalWarning = true;
        this.callbacks.onGlobalWarning?.(remainingSec);
      }

      if (remainingMs <= 0) {
        this.isGlobalExpired = true;
        this.globalDeadlineEpochMs = undefined;
        this.callbacks.onGlobalExpired?.();
      }
    }

    if (!this.stepDeadlineEpochMs && !this.globalDeadlineEpochMs) {
      this.clearInterval();
    }
  }

  private ensureIntervalRunning(): void {
    if (this.timerInterval) return;
    this.timerInterval = setInterval(() => this.tick(), this.tickIntervalMs);
  }

  private clearInterval(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = undefined;
    }
  }

  public dispose(): void {
    this.clearInterval();
    this.globalDeadlineEpochMs = undefined;
    this.stepDeadlineEpochMs = undefined;
  }
}
