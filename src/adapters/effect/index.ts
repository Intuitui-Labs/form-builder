export {
  EffectStorageAdapter,
  StorageService,
  type StorageServiceShape,
} from './EffectStorageAdapter.js';

export {
  EffectOutboxTransport,
  type EffectOutboxTransportOptions,
} from './EffectOutboxTransport.js';

export {
  EffectLifecycleAdapter,
  LifecycleService,
  type LifecycleEventUpdate,
} from './EffectLifecycleAdapter.js';

export {
  EffectStorageQuotaError,
  EffectStorageIOError,
  EffectStorageSecurityError,
  type EffectStorageError,
} from './EffectErrors.js';

import { EffectStorageAdapter, type StorageServiceShape } from './EffectStorageAdapter.js';
import { EffectOutboxTransport } from './EffectOutboxTransport.js';
import { EffectLifecycleAdapter } from './EffectLifecycleAdapter.js';
import type { FormLifecycleMachineOptions } from '../../core/state/FormLifecycleMachine.js';

import type { Effect } from 'effect';
import type { SubmissionEnvelope, SubmissionReceipt } from '../../ports/ITransportPort.js';
import type { TransportError } from '../../core/DomainErrors.js';

export interface EffectEnvironmentOptions<T extends Record<string, unknown> = Record<string, unknown>> {
  storageType?: 'localStorage' | 'sessionStorage' | 'memory';
  storageService?: StorageServiceShape;
  submitEffect?: (envelope: SubmissionEnvelope<T>) => Effect.Effect<SubmissionReceipt, TransportError>;
  timeoutMs?: number;
  maxRetries?: number;
  initialDelayMs?: number;
  lifecycleOptions?: FormLifecycleMachineOptions<T>;
}

export function createEffectEnvironment<T extends Record<string, unknown> = Record<string, unknown>>(options?: EffectEnvironmentOptions<T>) {
  const serviceShape = options?.storageService ?? (
    options?.storageType === 'memory' || typeof window === 'undefined'
      ? EffectStorageAdapter.createMemoryServiceShape()
      : EffectStorageAdapter.createWebStorageServiceShape(options?.storageType ?? 'localStorage')
  );

  return {
    storage: new EffectStorageAdapter(serviceShape),
    transport: new EffectOutboxTransport<T>({
      submitEffect: options?.submitEffect,
      timeoutMs: options?.timeoutMs,
      maxRetries: options?.maxRetries,
      initialDelayMs: options?.initialDelayMs,
    }),
    lifecycle: new EffectLifecycleAdapter<T>({
      autoHydrate: true,
      ...options?.lifecycleOptions,
    }),
  };
}
