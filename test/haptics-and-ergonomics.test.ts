import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NullHapticAdapter } from '../src/adapters/haptics/NullHapticAdapter.js';
import { WebVibrationAdapter } from '../src/adapters/haptics/WebVibrationAdapter.js';
import { ExpoHapticsAdapter, type ExpoHapticsModule } from '../src/adapters/haptics/ExpoHapticsAdapter.js';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import type { FormSchema } from '../src/schema/FormSchema.js';
import type { IHapticFeedbackPort, HapticFeedbackPattern } from '../src/ports/IHapticFeedbackPort.js';

describe('Tactile Ergonomics & Haptics System', () => {
  describe('NullHapticAdapter', () => {
    it('provides a safe no-op implementation in headless/desktop environments', () => {
      const adapter = new NullHapticAdapter();
      expect(adapter.isSupported).toBe(false);

      const patterns: HapticFeedbackPattern[] = [
        'selection',
        'light-click',
        'medium-bump',
        'success',
        'warning',
        'error',
      ];

      for (const pattern of patterns) {
        expect(() => adapter.trigger(pattern)).not.toThrow();
      }
    });
  });

  describe('WebVibrationAdapter (Web & Mobile Browser)', () => {
    const originalNavigator = globalThis.navigator;

    afterEach(() => {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
      });
    });

    it('reports isSupported false when navigator.vibrate is undefined', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
      });

      const adapter = new WebVibrationAdapter();
      expect(adapter.isSupported).toBe(false);
      expect(() => adapter.trigger('selection')).not.toThrow();
    });

    it('translates tactile patterns to millisecond vibration arrays and throttles bridge calls', () => {
      const mockVibrate = vi.fn().mockReturnValue(true);
      Object.defineProperty(globalThis, 'navigator', {
        value: { vibrate: mockVibrate },
        configurable: true,
      });

      const adapter = new WebVibrationAdapter({ minIntervalMs: 80 });
      expect(adapter.isSupported).toBe(true);

      // Trigger selection
      adapter.trigger('selection');
      expect(mockVibrate).toHaveBeenCalledWith(10);

      // Trigger immediately again (should be throttled)
      mockVibrate.mockClear();
      adapter.trigger('light-click');
      expect(mockVibrate).not.toHaveBeenCalled();

      // Trigger after interval has passed
      const pastTime = Date.now() - 100;
      (adapter as any).lastTriggerTime = pastTime;
      adapter.trigger('success');
      expect(mockVibrate).toHaveBeenCalledWith([15, 30, 20]);

      // Warning & Error patterns
      (adapter as any).lastTriggerTime = pastTime;
      adapter.trigger('error');
      expect(mockVibrate).toHaveBeenCalledWith([50, 60, 50]);
    });

    it('survives exceptions thrown by navigator.vibrate without propagating errors', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          vibrate: () => {
            throw new Error('Permission denied');
          },
        },
        configurable: true,
      });

      const adapter = new WebVibrationAdapter({ minIntervalMs: 0 });
      expect(() => adapter.trigger('warning')).not.toThrow();
    });
  });

  describe('ExpoHapticsAdapter (React Native & Expo)', () => {
    it('safely handles missing or uninitialized native module', async () => {
      const adapter = new ExpoHapticsAdapter();
      expect(adapter.isSupported).toBe(false);
      await expect(adapter.trigger('selection')).resolves.toBeUndefined();
    });

    it('dispatches appropriate impact and notification async calls with throttling', async () => {
      const mockSelection = vi.fn().mockResolvedValue(undefined);
      const mockImpact = vi.fn().mockResolvedValue(undefined);
      const mockNotification = vi.fn().mockResolvedValue(undefined);

      const mockModule: ExpoHapticsModule = {
        selectionAsync: mockSelection,
        impactAsync: mockImpact,
        notificationAsync: mockNotification,
        ImpactFeedbackStyle: {
          Light: 'light_style',
          Medium: 'medium_style',
          Heavy: 'heavy_style',
        },
        NotificationFeedbackType: {
          Success: 'success_type',
          Warning: 'warning_type',
          Error: 'error_type',
        },
      };

      const adapter = new ExpoHapticsAdapter({
        hapticsModule: mockModule,
        minIntervalMs: 80,
      });

      expect(adapter.isSupported).toBe(true);

      // Selection pattern
      await adapter.trigger('selection');
      expect(mockSelection).toHaveBeenCalled();

      // Throttled call immediately after
      mockSelection.mockClear();
      await adapter.trigger('selection');
      expect(mockSelection).not.toHaveBeenCalled();

      // Fast-forward lastTriggerTime
      (adapter as any).lastTriggerTime = Date.now() - 100;
      await adapter.trigger('light-click');
      expect(mockImpact).toHaveBeenCalledWith('light_style');

      // Success notification
      (adapter as any).lastTriggerTime = Date.now() - 100;
      await adapter.trigger('success');
      expect(mockNotification).toHaveBeenCalledWith('success_type');

      // Error notification
      (adapter as any).lastTriggerTime = Date.now() - 100;
      await adapter.trigger('error');
      expect(mockNotification).toHaveBeenCalledWith('error_type');
    });
  });

  describe('MultiStepFormManager Integration with Haptics', () => {
    const schema: FormSchema = {
      id: 'haptic-form',
      version: '1.0',
      pages: [
        {
          id: 'step-1',
          title: 'Account Info',
          fields: [
            {
              id: 'username',
              name: 'username',
              label: 'Username',
              type: 'text',
              required: true,
              rules: [{ type: 'required', message: 'Username is mandatory' }],
            },
          ],
        },
        {
          id: 'step-2',
          title: 'Review',
          fields: [
            {
              id: 'notes',
              name: 'notes',
              label: 'Notes',
              type: 'text',
            },
          ],
        },
      ],
    };

    it('triggers error haptics when page validation fails on nextStep', () => {
      const mockTrigger = vi.fn();
      const mockHapticPort: IHapticFeedbackPort = {
        isSupported: true,
        trigger: mockTrigger,
      };

      const manager = new MultiStepFormManager(schema, vi.fn(), {
        experience: {
          hapticFeedback: mockHapticPort,
        },
      });

      // Try nextStep while required username is empty
      const advanced = manager.nextStep();
      expect(advanced).toBe(false);
      expect(mockTrigger).toHaveBeenCalledWith('error');
    });

    it('triggers selection haptics on step advance and light-click on prevStep', () => {
      const mockTrigger = vi.fn();
      const mockHapticPort: IHapticFeedbackPort = {
        isSupported: true,
        trigger: mockTrigger,
      };

      const manager = new MultiStepFormManager<{ username: string; notes: string }>(
        schema,
        vi.fn(),
        {
          experience: {
            hapticFeedback: mockHapticPort,
          },
        },
      );

      // Populate required field
      manager.getFormManager().setFieldValue('username', 'senior_dev');

      const advanced = manager.nextStep();
      expect(advanced).toBe(true);
      expect(manager.getCurrentPageIndex()).toBe(1);
      expect(mockTrigger).toHaveBeenCalledWith('selection');

      // Navigate back
      mockTrigger.mockClear();
      const wentBack = manager.prevStep();
      expect(wentBack).toBe(true);
      expect(manager.getCurrentPageIndex()).toBe(0);
      expect(mockTrigger).toHaveBeenCalledWith('light-click');
    });
  });
});
