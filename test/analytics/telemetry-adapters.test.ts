import { describe, it, expect, vi } from 'vitest';
import {
  MemoryTelemetryAdapter,
  BatchingTelemetryAdapter,
  CallbackTelemetryAdapter,
} from '../../src/adapters/index.js';
import type { FormTelemetryEvent } from '../../src/index.js';


describe('Telemetry Outbound Adapters', () => {
  describe('MemoryTelemetryAdapter', () => {
    it('buffers events and retrieves them in order', () => {
      const adapter = new MemoryTelemetryAdapter({ maxEvents: 100 });
      expect(adapter.name).toBe('MemoryTelemetryAdapter');

      adapter.dispatch({
        type: 'form_mounted',
        formId: 'checkout_form',
        schemaVersion: '1.0.0',
        timestamp: 1000,
      });

      adapter.dispatch({
        type: 'step_viewed',
        formId: 'checkout_form',
        stepIndex: 0,
        stepId: 'step_billing',
        timestamp: 1005,
      });

      adapter.dispatch({
        type: 'form_mounted',
        formId: 'survey_form',
        schemaVersion: '1.0.0',
        timestamp: 2000,
      });

      expect(adapter.getEvents()).toHaveLength(3);
      expect(adapter.getEvents('checkout_form')).toHaveLength(2);
      expect(adapter.getEvents('survey_form')).toHaveLength(1);

      adapter.clear();
      expect(adapter.getEvents()).toHaveLength(0);
    });

    it('enforces FIFO eviction when max capacity is reached', () => {
      const adapter = new MemoryTelemetryAdapter({ maxEvents: 2 });
      adapter.dispatch({ type: 'step_viewed', formId: 'f1', stepIndex: 0, stepId: 's0', timestamp: 1 });
      adapter.dispatch({ type: 'step_viewed', formId: 'f1', stepIndex: 1, stepId: 's1', timestamp: 2 });
      adapter.dispatch({ type: 'step_viewed', formId: 'f1', stepIndex: 2, stepId: 's2', timestamp: 3 });

      const events = adapter.getEvents();
      expect(events).toHaveLength(2);
      expect((events[0] as any).stepIndex).toBe(1);
      expect((events[1] as any).stepIndex).toBe(2);
    });
  });

  describe('BatchingTelemetryAdapter', () => {
    it('batches events and automatically flushes when batchSize is met', async () => {
      const flushedBatches: FormTelemetryEvent[][] = [];
      const onFlush = vi.fn(async (events: FormTelemetryEvent[]) => {
        flushedBatches.push(events);
      });

      const adapter = new BatchingTelemetryAdapter({
        batchSize: 3,
        flushIntervalMs: 10000, // Large so interval does not fire early
        onFlush,
      });

      adapter.dispatch({ type: 'form_mounted', formId: 'f1', schemaVersion: '1.0.0', timestamp: 1 });
      adapter.dispatch({ type: 'step_viewed', formId: 'f1', stepIndex: 0, stepId: 's0', timestamp: 2 });
      expect(onFlush).not.toHaveBeenCalled();

      // Third event triggers batch flush
      adapter.dispatch({ type: 'step_completed', formId: 'f1', stepIndex: 0, stepId: 's0', durationMs: 500, timestamp: 3 });
      expect(onFlush).toHaveBeenCalledTimes(1);
      expect(flushedBatches[0]).toHaveLength(3);

      adapter.destroy();
    });

    it('supports manual flush and respects sampling rate', async () => {
      const flushed: FormTelemetryEvent[] = [];
      const adapter = new BatchingTelemetryAdapter({
        batchSize: 100,
        sampleRate: 1.0,
        onFlush: (events) => {
          flushed.push(...events);
        },
      });

      adapter.dispatch({ type: 'field_focused', formId: 'f1', stepIndex: 0, fieldName: 'email', timestamp: 10 });
      expect(flushed).toHaveLength(0);

      await adapter.flush();
      expect(flushed).toHaveLength(1);
      expect(flushed[0].type).toBe('field_focused');

      adapter.destroy();
    });

    it('drops events when sampleRate is 0', async () => {
      const flushed: FormTelemetryEvent[] = [];
      const adapter = new BatchingTelemetryAdapter({
        sampleRate: 0.0,
        onFlush: (events) => flushed.push(...events),
      });

      adapter.dispatch({ type: 'form_mounted', formId: 'f1', schemaVersion: '1.0.0', timestamp: 1 });
      await adapter.flush();
      expect(flushed).toHaveLength(0);

      adapter.destroy();
    });
  });

  describe('CallbackTelemetryAdapter', () => {
    it('forwards dispatched events synchronously to external callback', () => {
      const received: FormTelemetryEvent[] = [];
      const flushFn = vi.fn();

      const adapter = new CallbackTelemetryAdapter({
        onDispatch: (evt) => received.push(evt),
        onFlush: flushFn,
      });

      expect(adapter.name).toBe('CallbackTelemetryAdapter');

      adapter.dispatch({
        type: 'branch_diverted',
        formId: 'f1',
        fromStep: 0,
        targetStep: 2,
        conditionId: 'rule_skip_tier',
        timestamp: 100,
      });

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('branch_diverted');

      adapter.flush();
      expect(flushFn).toHaveBeenCalledTimes(1);
    });
  });
});
