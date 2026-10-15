import { describe, it, expect } from 'vitest';
import { OfflineOutboxQueue } from '../../src/persistence/OfflineOutboxQueue.js';
import { MemoryStorageAdapter } from '../../src/adapters/storage/MemoryStorageAdapter.js';
import { SimulatedBatteryAdapter } from '../../src/adapters/battery/SimulatedBatteryAdapter.js';
import { SimulatedNetworkAdapter } from '../../src/adapters/network/SimulatedNetworkAdapter.js';
import { CallbackTransportAdapter } from '../../src/adapters/transport/CallbackTransportAdapter.js';
import type { SubmissionEnvelope } from '../../src/ports/ITransportPort.js';

describe('Hostile Operationalization: Battery-Aware Outbox & Power Throttling', () => {
  const createSampleEnvelope = (id: string): SubmissionEnvelope => ({
    id,
    formId: 'battery-form-1',
    tenantId: 'tenant-1',
    submittedAt: new Date().toISOString(),
    retryCount: 0,
    values: { test: 'payload' },
  });

  it('Throttles background flush when device battery is critically low (<= 15%) and discharging', async () => {
    let sentCount = 0;
    const transport = new CallbackTransportAdapter(async (_values, _envelope) => {
      sentCount++;
    });

    const storage = new MemoryStorageAdapter();
    const battery = new SimulatedBatteryAdapter({
      initialLevel: 0.12, // 12% critical level
      initialCharging: false, // On battery (discharging)
      initialLowPowerMode: false,
    });

    const outbox = new OfflineOutboxQueue({
      storage,
      transport,
      batteryStatus: battery,
      criticalBatteryThreshold: 0.15,
      throttleOnLowPower: true,
      autoFlushOnReconnect: false,
    });

    // 1. Enqueue item while battery is low (should queue rather than immediate delivery)
    const enqueueResult = await outbox.enqueue(createSampleEnvelope('env-1'));
    expect(enqueueResult.status).toBe('queued');

    // Verify queue count
    const pending = await outbox.getPendingCount();
    expect(pending).toBe(1);

    // 2. Query battery throttle status
    const isThrottled = await outbox.isBatteryThrottled();
    expect(isThrottled).toBe(true);

    // 3. Attempt automated/background flush without force
    const flushedCount = await outbox.flush();
    expect(flushedCount).toBe(0);
    expect(sentCount).toBe(0); // Transport was NOT called
    expect(outbox.getStatus()).toBe('offline-queued'); // Remains queued

    // 4. Force manual flush bypasses battery throttling (e.g. user taps "Sync Now")
    const forcedCount = await outbox.flush(true);
    expect(forcedCount).toBe(1);
    expect(sentCount).toBe(1);
    expect(await outbox.getPendingCount()).toBe(0);
    expect(outbox.getStatus()).toBe('synced');
  });

  it('Allows flush when critically low battery is actively charging on AC power', async () => {
    let sentCount = 0;
    const transport = new CallbackTransportAdapter(async (_values, _envelope) => {
      sentCount++;
    });

    const storage = new MemoryStorageAdapter();
    const network = new SimulatedNetworkAdapter(false); // Starts offline so it queues
    const battery = new SimulatedBatteryAdapter({
      initialLevel: 0.05, // 5% critically low
      initialCharging: true, // BUT plugged in to charger
      initialLowPowerMode: false,
    });

    const outbox = new OfflineOutboxQueue({
      storage,
      networkStatus: network,
      transport,
      batteryStatus: battery,
      criticalBatteryThreshold: 0.15,
      throttleOnLowPower: true,
      autoFlushOnReconnect: false,
    });

    await outbox.enqueue(createSampleEnvelope('env-plugged-in'));
    expect(await outbox.getPendingCount()).toBe(1);

    // Bring network online
    network.setOnline(true);

    // Invariant: Charging overrides low battery check
    expect(await outbox.isBatteryThrottled()).toBe(false);

    const flushedCount = await outbox.flush();
    expect(flushedCount).toBe(1);
    expect(sentCount).toBe(1);
    expect(await outbox.getPendingCount()).toBe(0);
  });

  it('Throttles background flush when lowPowerMode is engaged regardless of percentage', async () => {
    let sentCount = 0;
    const transport = new CallbackTransportAdapter(async (_values, _envelope) => {
      sentCount++;
    });

    const storage = new MemoryStorageAdapter();
    const battery = new SimulatedBatteryAdapter({
      initialLevel: 0.85, // 85% battery
      initialCharging: false,
      initialLowPowerMode: true, // User enabled Battery Saver
    });

    const outbox = new OfflineOutboxQueue({
      storage,
      transport,
      batteryStatus: battery,
      throttleOnLowPower: true,
      autoFlushOnReconnect: false,
    });

    const enqueueResult = await outbox.enqueue(createSampleEnvelope('env-power-saver'));
    expect(enqueueResult.status).toBe('queued');
    expect(await outbox.isBatteryThrottled()).toBe(true);

    const flushedCount = await outbox.flush();
    expect(flushedCount).toBe(0);
    expect(sentCount).toBe(0);

    // Turn off battery saver
    battery.setBatteryStatus({ lowPowerMode: false });
    expect(await outbox.isBatteryThrottled()).toBe(false);

    const secondAttempt = await outbox.flush();
    expect(secondAttempt).toBe(1);
    expect(sentCount).toBe(1);
    expect(await outbox.getPendingCount()).toBe(0);
  });
});
