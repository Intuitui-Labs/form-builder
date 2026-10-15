import type { IBatteryStatusPort, BatteryStatus } from '../../ports/IBatteryStatusPort.js';

export interface SimulatedBatteryOptions {
  initialLevel?: number;
  initialCharging?: boolean;
  initialLowPowerMode?: boolean;
}

/**
 * SimulatedBatteryAdapter
 * Deterministic, controllable in-memory battery status adapter for testing
 * hostile offline outbox throttling and battery conservation policies.
 */
export class SimulatedBatteryAdapter implements IBatteryStatusPort {
  private status: BatteryStatus;
  private listeners: Set<(status: BatteryStatus) => void> = new Set();

  constructor(options?: SimulatedBatteryOptions) {
    this.status = {
      level: options?.initialLevel ?? 1.0,
      charging: options?.initialCharging ?? true,
      lowPowerMode: options?.initialLowPowerMode ?? false,
    };
  }

  public getBatteryStatus(): BatteryStatus {
    return { ...this.status };
  }

  public setBatteryStatus(updates: Partial<BatteryStatus>): void {
    this.status = {
      ...this.status,
      ...updates,
    };
    this.notify();
  }

  public subscribe(listener: (status: BatteryStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.getBatteryStatus();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('Error in SimulatedBatteryAdapter listener:', err);
      }
    }
  }
}
