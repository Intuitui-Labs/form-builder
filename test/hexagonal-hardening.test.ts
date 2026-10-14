import { describe, it, expect, vi } from 'vitest';
import { Result } from '../src/core/Result.js';
import { ValidationEngine, applyRule } from '../src/validation/ValidationEngine.js';
import { StandardStorageAdapter } from '../src/adapters/storage/StandardStorageAdapter.js';
import { StandardFetchTransportAdapter } from '../src/adapters/transport/StandardFetchTransportAdapter.js';
import { DraftManager } from '../src/persistence/DraftManager.js';
import { OfflineOutboxQueue } from '../src/persistence/OfflineOutboxQueue.js';
import {
  EffectStorageAdapter,
  StorageService,
  EffectOutboxTransport,
  EffectLifecycleAdapter,
  LifecycleService,
  createEffectEnvironment,
} from '../src/adapters/effect/index.js';
import { Effect, Stream } from 'effect';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import type { FormSchema } from '../src/schema/FormSchema.js';
import type { FormDraftSnapshot } from '../src/schema/FormDraft.js';
import type { SubmissionEnvelope, SubmissionReceipt } from '../src/ports/ITransportPort.js';

describe('Hexagonal Engine Hardening & Dual-Tier Adapters', () => {
  describe('Result Monad (Zero Dependencies)', () => {
    it('creates and matches ok and err results', () => {
      const okRes = Result.ok('hello');
      const errRes = Result.err({ _tag: 'StorageQuotaExceeded', key: 'draft' } as const);

      expect(Result.isOk(okRes)).toBe(true);
      expect(Result.isErr(errRes)).toBe(true);

      const okMapped = Result.map(okRes, (s) => s.toUpperCase());
      expect(Result.unwrapOr(okMapped, '')).toBe('HELLO');

      const matched = Result.match(errRes, {
        ok: () => 'success',
        err: (e) => e._tag,
      });
      expect(matched).toBe('StorageQuotaExceeded');
    });
  });

  describe('ValidationEngine Adversarial Hardening', () => {
    it('rejects malformed regex patterns instead of silently passing', () => {
      // Adversarial test: pattern with unclosed bracket
      const result = applyRule(
        { type: 'pattern', value: '[a-', message: 'Invalid pattern rule' },
        'anything',
        'broken_field',
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid pattern rule');
    });

    it('rejects relational comparisons when data cannot be coerced to number or date', () => {
      const result = applyRule(
        { type: 'greaterThanField', targetField: 'start_date' },
        'unparseable-gibberish-a',
        'end_date',
        { start_date: 'unparseable-gibberish-b' },
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('cannot be compared');
    });

    it('aborts immediately when AbortSignal is cancelled', () => {
      const controller = new AbortController();
      controller.abort();

      const result = applyRule(
        { type: 'required' },
        'valid string',
        'field1',
        {},
        { signal: controller.signal },
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Validation aborted');
    });
  });

  describe('Tier 1 Standard Storage Adapter & Quota Management', () => {
    it('catches QuotaExceededError and returns typed Result.err', async () => {
      const mockStorage: Storage = {
        length: 0,
        clear: vi.fn(),
        key: vi.fn(),
        getItem: vi.fn().mockReturnValue(null),
        removeItem: vi.fn(),
        setItem: vi.fn().mockImplementation(() => {
          const quotaErr = new Error('Quota exceeded');
          quotaErr.name = 'QuotaExceededError';
          throw quotaErr;
        }),
      };

      const adapter = new StandardStorageAdapter({ storage: mockStorage, fallbackToMemory: false });
      const result = await adapter.setItemSafe('heavy_payload', 'data...');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('StorageQuotaExceeded');
        expect(result.error.key).toBe('heavy_payload');
      }
    });

    it('handles draft schema version mismatch and applies draft migration hook', async () => {
      const draftV1: FormDraftSnapshot = {
        schemaId: 'user-profile',
        schemaVersion: '1.0.0',
        savedAt: new Date().toISOString(),
        currentPageIndex: 0,
        completedStepIndices: [],
        stepHistory: [0],
        branchLineage: [],
        branchTargetHistory: [],
        values: { oldNameField: 'Alice Smith' },
        isSubmitted: false,
      };

      const adapter = new StandardStorageAdapter();
      const draftManager = new DraftManager({
        storage: adapter,
        targetSchemaVersion: '2.0.0',
        migrateDraft: (oldSnapshot, targetVersion) => ({
          ...oldSnapshot,
          schemaVersion: targetVersion,
          values: {
            firstName: 'Alice',
            lastName: 'Smith',
          },
        }),
      });

      await draftManager.saveDraft(draftV1);
      const loadRes = await draftManager.loadDraftSafe('user-profile');

      expect(loadRes.ok).toBe(true);
      if (loadRes.ok && loadRes.value) {
        expect(loadRes.value.schemaVersion).toBe('2.0.0');
        expect(loadRes.value.values).toEqual({ firstName: 'Alice', lastName: 'Smith' });
      }
    });
  });

  describe('Offline Outbox & Dead Letter Queue (DLQ)', () => {
    it('routes non-retryable 422 HTTP rejection immediately to DLQ without burning retries', async () => {
      const onDeadLetterSpy = vi.fn();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ error: 'Unprocessable Entity: email domain blocked' }),
      } as any);

      const transport = new StandardFetchTransportAdapter({
        endpoint: 'https://api.test/submit',
        fetchFn: mockFetch,
      });

      const outbox = new OfflineOutboxQueue({
        transport,
        maxRetries: 5,
        onDeadLetter: onDeadLetterSpy,
      });

      const envelope: SubmissionEnvelope = {
        id: 'env_422',
        formId: 'test-form',
        values: { email: 'blocked@domain.com' },
        submittedAt: new Date().toISOString(),
        retryCount: 0,
      };

      await expect(outbox.enqueue(envelope)).rejects.toThrow();

      expect(onDeadLetterSpy).toHaveBeenCalledTimes(1);
      const [deadItem, deadError] = onDeadLetterSpy.mock.calls[0];
      expect(deadItem.envelope.id).toBe('env_422');
      expect(deadError._tag).toBe('DeadLetterMaxRetriesExceeded');

      const dlq = await outbox.getDeadLetterQueue();
      expect(dlq.length).toBe(1);
      expect(dlq[0].envelope.id).toBe('env_422');
    });

    it('routes expired items to DLQ when max retries exceeded during flush', async () => {
      const onDeadLetterSpy = vi.fn();
      let attemptCount = 0;
      const failingTransport = {
        submit: async () => {
          attemptCount++;
          throw new Error('Transient 503 Service Unavailable');
        },
      };

      const outbox = new OfflineOutboxQueue({
        transport: failingTransport,
        maxRetries: 2,
        onDeadLetter: onDeadLetterSpy,
      });

      const envelope: SubmissionEnvelope = {
        id: 'env_retry_exhausted',
        formId: 'test-form',
        values: {},
        submittedAt: new Date().toISOString(),
        retryCount: 0,
      };

      // Enqueue while failing
      try {
        await outbox.enqueue(envelope);
      } catch {
        // Enqueued
      }

      // Flush until retries exhausted
      await outbox.flush(); // retry 1
      await outbox.flush(); // retry 2 -> exceeds maxRetries (2) -> moved to DLQ

      const dlq = await outbox.getDeadLetterQueue();
      expect(dlq.length).toBe(1);
      expect(dlq[0].envelope.id).toBe('env_retry_exhausted');
      expect(onDeadLetterSpy).toHaveBeenCalled();
    });
  });

  describe('Tier 2 Effect v4 Hexagonal Adapters', () => {
    it('executes EffectStorageAdapter reads and writes via Effect runtime', async () => {
      const effectAdapter = new EffectStorageAdapter();

      const writeRes = await effectAdapter.setItemSafe('test_key', 'effect_val');
      expect(writeRes.ok).toBe(true);

      const readRes = await effectAdapter.getItemSafe('test_key');
      expect(readRes.ok).toBe(true);
      if (readRes.ok) {
        expect(readRes.value).toBe('effect_val');
      }

      const standardVal = await effectAdapter.getItem('test_key');
      expect(standardVal).toBe('effect_val');
    });

    it('provides StorageService via official Effect 4 Layer and uses Effect.gen', async () => {
      const program = Effect.gen(function* () {
        const storage = yield* StorageService;
        yield* storage.set('layer_key', 'layer_value');
        const retrieved = yield* storage.get('layer_key');
        return retrieved;
      }).pipe(Effect.provide(StorageService.memoryLayer));

      const val = await Effect.runPromise(program);
      expect(val).toBe('layer_value');
    });

    it('retries transient errors with Effect Schedule and succeeds', async () => {
      let attempts = 0;
      const effectTransport = new EffectOutboxTransport({
        maxRetries: 3,
        initialDelayMs: 10,
        submitEffect: (envelope) =>
          Effect.gen(function* () {
            attempts++;
            if (attempts < 2) {
              return yield* Effect.fail({
                _tag: 'TransportServerError',
                status: 503,
                retryable: true as const,
              });
            }
            return {
              receiptId: `rcpt_${envelope.id}`,
              status: 'synced' as const,
              timestamp: new Date().toISOString(),
            };
          }),
      });

      const envelope: SubmissionEnvelope = {
        id: 'effect_envelope',
        formId: 'test-form',
        values: { score: 100 },
        submittedAt: new Date().toISOString(),
        retryCount: 0,
      };

      const result = await effectTransport.submitSafe(envelope);
      expect(result.ok).toBe(true);
      expect(attempts).toBe(2);
      if (result.ok) {
        expect(result.value.receiptId).toBe('rcpt_effect_envelope');
      }
    });

    it('does not retry when Effect transport returns non-retryable 4xx rejection', async () => {
      let attempts = 0;
      const effectTransport = new EffectOutboxTransport({
        maxRetries: 3,
        initialDelayMs: 10,
        submitEffect: () =>
          Effect.gen(function* () {
            attempts++;
            return yield* Effect.fail({
              _tag: 'TransportClientRejected',
              status: 400,
              retryable: false as const,
            });
          }),
      });

      const envelope: SubmissionEnvelope = {
        id: 'effect_rejected',
        formId: 'test-form',
        values: {},
        submittedAt: new Date().toISOString(),
        retryCount: 0,
      };

      const result = await effectTransport.submitSafe(envelope);
      expect(result.ok).toBe(false);
      expect(attempts).toBe(1); // Aborted after 1 attempt because retryable is false!
      if (!result.ok) {
        expect(result.error._tag).toBe('TransportClientRejected');
      }
    });

    it('manages lifecycle state via EffectLifecycleAdapter and streams events', async () => {
      const adapter = new EffectLifecycleAdapter<{ name: string }>({ autoHydrate: true });

      expect(adapter.getPhase()).toBe('idle');

      // Send event via Effect
      const stepProg = adapter.sendEffect({ type: 'STEP_NEXT', nextIndex: 1 });
      const transition = await Effect.runPromise(stepProg);
      expect(transition.accepted).toBe(true);
      expect(transition.context.activeStepIndex).toBe(1);

      // Read phase via Effect
      const phase = await Effect.runPromise(adapter.getPhaseEffect());
      expect(phase).toBe('idle');

      // Stream events
      const changesStream = adapter.changesStream();
      const firstEventFiber = Effect.runPromise(Stream.runHead(changesStream));

      // Trigger event to emit into stream
      adapter.send({ type: 'FIELD_CHANGE', field: 'name', value: 'Alice' });

      const emittedOpt = await firstEventFiber;
      expect((emittedOpt as any)._tag).toBe('Some');
      expect((emittedOpt as any).value.event.type).toBe('FIELD_CHANGE');
      expect((emittedOpt as any).value.context.values.name).toBe('Alice');
    });

    it('wires createEffectEnvironment into MultiStepFormManager with full port parity', async () => {
      const simpleSchema: FormSchema = {
        id: 'effect-form',
        title: 'Effect Flow',
        pages: [
          {
            id: 'p1',
            title: 'Page 1',
            fields: [
              { id: 'f_name', name: 'userName', type: 'text', label: 'User Name', required: true },
            ],
          },
        ],
      };

      const onSubmitSpy = vi.fn().mockResolvedValue(undefined);
      const env = createEffectEnvironment({
        storageType: 'memory',
        submitEffect: (env) =>
          Effect.succeed({
            receiptId: `rcpt_effect_${env.id}`,
            status: 'synced',
            timestamp: new Date().toISOString(),
          }),
      });

      const manager = new MultiStepFormManager(simpleSchema, onSubmitSpy, {
        storage: env.storage,
        transport: env.transport,
        lifecyclePort: env.lifecycle,
      });

      expect(manager.getLifecyclePort()).toBe(env.lifecycle);
      expect(manager.getLifecyclePhase()).toBe('idle');

      manager.getFormManager().setFieldValue('userName', 'EffectUser');
      await manager.submit();

      expect(onSubmitSpy).toHaveBeenCalledTimes(1);
      expect(manager.getLifecyclePhase()).toBe('submitted');
    });
  });
});
