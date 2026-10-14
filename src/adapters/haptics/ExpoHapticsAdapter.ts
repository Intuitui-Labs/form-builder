import type { IHapticFeedbackPort, HapticFeedbackPattern } from '../../ports/IHapticFeedbackPort.js';

export interface ExpoHapticsModule {
  selectionAsync?: () => Promise<void>;
  impactAsync?: (style: unknown) => Promise<void>;
  notificationAsync?: (type: unknown) => Promise<void>;
  ImpactFeedbackStyle?: {
    Light?: unknown;
    Medium?: unknown;
    Heavy?: unknown;
  };
  NotificationFeedbackType?: {
    Success?: unknown;
    Warning?: unknown;
    Error?: unknown;
  };
}

export interface ExpoHapticsOptions {
  hapticsModule?: ExpoHapticsModule;
  minIntervalMs?: number; // Throttling threshold (default 80ms)
}

/**
 * ExpoHapticsAdapter: Adapts expo-haptics for React Native and Expo applications.
 * Injects dependency dynamically to maintain 0 kB core bundle bloat.
 * Throttles async bridge calls to prevent frame drops on low-end Android hardware.
 */
export class ExpoHapticsAdapter implements IHapticFeedbackPort {
  private hapticsModule?: ExpoHapticsModule;
  private minIntervalMs: number;
  private lastTriggerTime = 0;

  constructor(options?: ExpoHapticsOptions) {
    this.hapticsModule = options?.hapticsModule;
    this.minIntervalMs = options?.minIntervalMs ?? 80;
  }

  public get isSupported(): boolean {
    return Boolean(
      this.hapticsModule &&
        (typeof this.hapticsModule.selectionAsync === 'function' ||
          typeof this.hapticsModule.impactAsync === 'function'),
    );
  }

  public async trigger(pattern: HapticFeedbackPattern): Promise<void> {
    if (!this.isSupported || !this.hapticsModule) return;

    const now = Date.now();
    if (now - this.lastTriggerTime < this.minIntervalMs) {
      return; // Throttled to preserve 60 FPS frame rate
    }
    this.lastTriggerTime = now;

    try {
      const mod = this.hapticsModule;
      switch (pattern) {
        case 'selection':
          if (mod.selectionAsync) {
            await mod.selectionAsync();
          }
          break;
        case 'light-click':
          if (mod.impactAsync && mod.ImpactFeedbackStyle?.Light !== undefined) {
            await mod.impactAsync(mod.ImpactFeedbackStyle.Light);
          }
          break;
        case 'medium-bump':
          if (mod.impactAsync && mod.ImpactFeedbackStyle?.Medium !== undefined) {
            await mod.impactAsync(mod.ImpactFeedbackStyle.Medium);
          }
          break;
        case 'success':
          if (mod.notificationAsync && mod.NotificationFeedbackType?.Success !== undefined) {
            await mod.notificationAsync(mod.NotificationFeedbackType.Success);
          }
          break;
        case 'warning':
          if (mod.notificationAsync && mod.NotificationFeedbackType?.Warning !== undefined) {
            await mod.notificationAsync(mod.NotificationFeedbackType.Warning);
          }
          break;
        case 'error':
          if (mod.notificationAsync && mod.NotificationFeedbackType?.Error !== undefined) {
            await mod.notificationAsync(mod.NotificationFeedbackType.Error);
          }
          break;
      }
    } catch {
      // Graceful fail-safe if native device module throws or permissions fail
    }
  }
}
