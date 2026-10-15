import type { IBatteryStatusPort, BatteryStatus } from '../../ports/IBatteryStatusPort.js';

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<{
    level: number;
    charging: boolean;
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
  }>;
}

/**
 * WebBatteryAdapter
 * Wraps the W3C Battery Status API (`navigator.getBattery()`) with safe fallbacks
 * for unsupported browsers, privacy-hardened runtimes, and SSR environments.
 */
export class WebBatteryAdapter implements IBatteryStatusPort {
  private cachedStatus: BatteryStatus = {
    level: 1.0,
    charging: true,
    lowPowerMode: false,
  };
  private listeners: Set<(status: BatteryStatus) => void> = new Set();
  private batteryManager?: any;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as NavigatorWithBattery;
    if (typeof nav.getBattery !== 'function') return;

    try {
      this.batteryManager = await nav.getBattery();
      this.updateFromManager();

      const handleChange = () => {
        this.updateFromManager();
        this.notify();
      };

      this.batteryManager.addEventListener('levelchange', handleChange);
      this.batteryManager.addEventListener('chargingchange', handleChange);
    } catch {
      // API blocked by permissions policy or private browsing mode
    }
  }

  private updateFromManager(): void {
    if (!this.batteryManager) return;
    this.cachedStatus = {
      level: typeof this.batteryManager.level === 'number' ? this.batteryManager.level : 1.0,
      charging: typeof this.batteryManager.charging === 'boolean' ? this.batteryManager.charging : true,
      lowPowerMode: false,
    };
  }

  public getBatteryStatus(): BatteryStatus {
    return { ...this.cachedStatus };
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
        console.error('Error in WebBatteryAdapter listener:', err);
      }
    }
  }
}
