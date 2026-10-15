import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CadenceTimerController } from '../../src/assessment/timer.js';

describe('CadenceTimerController & Mobile Lifecycle Sentry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down step timer based on epoch time and fires expiration', () => {
    const onTick = vi.fn();
    const onExpired = vi.fn();

    const controller = new CadenceTimerController({
      onStepTick: onTick,
      onStepExpired: onExpired,
    }, { tickIntervalMs: 500 });

    controller.startStepTimer(3); // 3 seconds
    expect(controller.getStepRemainingSeconds()).toBe(3);

    // Advance 1.5 seconds
    vi.advanceTimersByTime(1500);
    expect(controller.getStepRemainingSeconds()).toBe(2);

    // Advance to end
    vi.advanceTimersByTime(1600);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(controller.getStepRemainingSeconds()).toBe(0);

    controller.dispose();
  });

  it('triggers warning callback when time drops to warning threshold', () => {
    const onWarning = vi.fn();
    const controller = new CadenceTimerController({
      onGlobalWarning: onWarning,
    }, { warningThresholdSeconds: 5, tickIntervalMs: 500 });

    controller.startGlobalTimer(10); // 10 seconds total

    // Advance 4 seconds (6 seconds left - not yet warning)
    vi.advanceTimersByTime(4000);
    expect(onWarning).not.toHaveBeenCalled();

    // Advance 1.5 seconds (4.5 seconds left - should fire warning)
    vi.advanceTimersByTime(1500);
    expect(onWarning).toHaveBeenCalledWith(5);

    controller.dispose();
  });

  it('handles mobile app backgrounding and evaluates drift upon foreground resume', () => {
    const onExpired = vi.fn();
    const controller = new CadenceTimerController({
      onGlobalExpired: onExpired,
    }, { tickIntervalMs: 500 });

    controller.startGlobalTimer(5); // 5 seconds

    // User switches to WhatsApp / background at t=1s
    vi.advanceTimersByTime(1000);
    controller.handleAppStateChange('background');

    // Phone is backgrounded for 6 seconds (total 7 seconds, deadline has passed)
    vi.advanceTimersByTime(6000);

    // While backgrounded, interval ticker was stopped; expiration hasn't fired yet
    expect(onExpired).not.toHaveBeenCalled();

    // User resumes app to active
    controller.handleAppStateChange('active');

    // Upon resume, epoch evaluation immediately detects deadline expired
    expect(onExpired).toHaveBeenCalledTimes(1);

    controller.dispose();
  });
});
