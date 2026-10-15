/**
 * IBatteryStatusPort
 * Hexagonal driven port for observing device power and battery levels.
 * Allows headless offline outbox and background synchronizers to throttle
 * battery-intensive network I/O when the device is under critical power conditions.
 */

export interface BatteryStatus {
  /** Battery charge level from 0.0 to 1.0 (e.g. 0.15 = 15%) */
  level: number;
  /** Whether the device is currently plugged into an external power source */
  charging: boolean;
  /** Whether the OS or user has enabled battery saver / low-power mode */
  lowPowerMode?: boolean;
}

export interface IBatteryStatusPort {
  /**
   * Retrieves the current battery status snapshot.
   */
  getBatteryStatus(): Promise<BatteryStatus> | BatteryStatus;

  /**
   * Optional subscription for reactive battery status updates.
   * Returns an unsubscribe function.
   */
  subscribe?(listener: (status: BatteryStatus) => void): () => void;
}
