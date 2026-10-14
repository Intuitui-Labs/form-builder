import type { IHapticFeedbackPort, HapticFeedbackPattern } from '../../ports/IHapticFeedbackPort.js';

export class NullHapticAdapter implements IHapticFeedbackPort {
  readonly isSupported = false;

  public trigger(_pattern: HapticFeedbackPattern): void {
    // Silent no-op
  }
}
