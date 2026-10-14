import type { IHapticFeedbackPort, HapticFeedbackPattern } from '../../ports/IHapticFeedbackPort.js';

export interface WebVibrationOptions {
  minIntervalMs?: number; // Throttling interval to prevent browser thread freeze (default 80ms)
}

/**
 * WebVibrationAdapter: Uses navigator.vibrate() to deliver tactile sensory feedback in mobile browsers.
 * Defends against main-thread starvation by strictly throttling triggers.
 */
export class WebVibrationAdapter implements IHapticFeedbackPort {
  private lastTriggerTime = 0;
  private minIntervalMs: number;

  constructor(options?: WebVibrationOptions) {
    this.minIntervalMs = options?.minIntervalMs ?? 80;
  }

  public get isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  public trigger(pattern: HapticFeedbackPattern): void {
    if (!this.isSupported) return;

    const now = Date.now();
    if (now - this.lastTriggerTime < this.minIntervalMs) {
      return; // Throttled
    }
    this.lastTriggerTime = now;

    try {
      switch (pattern) {
        case 'selection':
          navigator.vibrate(10);
          break;
        case 'light-click':
          navigator.vibrate(15);
          break;
        case 'medium-bump':
          navigator.vibrate(25);
          break;
        case 'success':
          navigator.vibrate([15, 30, 20]);
          break;
        case 'warning':
          navigator.vibrate([30, 40, 30]);
          break;
        case 'error':
          navigator.vibrate([50, 60, 50]);
          break;
      }
    } catch {
      // Graceful fail-safe if browser denies vibration permission or background tab
    }
  }
}
