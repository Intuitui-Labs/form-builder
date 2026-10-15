import type { IBatteryStatusPort, BatteryStatus } from '../../ports/IBatteryStatusPort.js';

/**
 * AlwaysFullBatteryAdapter
 * Default zero-overhead adapter that assumes the device is connected to AC power with 100% battery.
 */
export class AlwaysFullBatteryAdapter implements IBatteryStatusPort {
  public getBatteryStatus(): BatteryStatus {
    return {
      level: 1.0,
      charging: true,
      lowPowerMode: false,
    };
  }
}
