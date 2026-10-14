export type HapticFeedbackPattern =
  | 'selection'
  | 'light-click'
  | 'medium-bump'
  | 'success'
  | 'warning'
  | 'error';

/**
 * Outbound Port: Contract for physical haptic and tactile micro-feedback.
 * Enforces rate-limiting to prevent thread starvation on low-end hardware.
 * Zero external dependencies.
 */
export interface IHapticFeedbackPort {
  readonly isSupported: boolean;
  trigger(pattern: HapticFeedbackPattern): void | Promise<void>;
}
