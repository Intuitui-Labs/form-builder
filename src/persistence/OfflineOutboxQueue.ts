import type { IStoragePort } from '../ports/IStoragePort.js';
import type { INetworkStatusPort } from '../ports/INetworkStatusPort.js';
import type { IBatteryStatusPort } from '../ports/IBatteryStatusPort.js';
import type {
  ITransportPort,
  IResilientTransportPort,
  SubmissionEnvelope,
  SubmissionReceipt,
} from '../ports/ITransportPort.js';
import { MemoryStorageAdapter } from '../adapters/storage/MemoryStorageAdapter.js';
import { AlwaysOnlineNetworkAdapter } from '../adapters/network/AlwaysOnlineNetworkAdapter.js';
import type { OutboxDeadLetterError, TransportError } from '../core/DomainErrors.js';

export type OutboxSyncStatus =
  | 'idle'
  | 'saving'
  | 'offline-queued'
  | 'syncing'
  | 'synced'
  | 'error';

export interface OutboxQueueOptions<T = Record<string, unknown>> {
  storage?: IStoragePort;
  networkStatus?: INetworkStatusPort;
  transport?: ITransportPort<T>;
  batteryStatus?: IBatteryStatusPort;
  criticalBatteryThreshold?: number; // Default 0.15 (15%)
  throttleOnLowPower?: boolean; // Default true
  storageKey?: string;
  maxQueueSize?: number; // Default 50 items
  /** @deprecated Pending submissions are no longer discarded by age. Retained for source compatibility. */
  ttlMs?: number;
  maxRetries?: number; // Default 5
  baseDelayMs?: number; // Default 1000ms
  autoFlushOnReconnect?: boolean; // Default true
  onDeadLetter?: (item: QueuedSubmission<T>, error: OutboxDeadLetterError) => void;
  /** Persist local projections from the canonical response before removing an intent. */
  onReceipt?: (envelope: SubmissionEnvelope<T>, receipt: SubmissionReceipt) => Promise<void> | void;
}

export interface QueuedSubmission<T = Record<string, unknown>> {
  envelope: SubmissionEnvelope<T>;
  queuedAt: number; // epoch ms
  lastAttemptAt?: number;
  lastError?: string;
  lastErrorCode?: string;
}

function isNonRetryableResponse(error: any): boolean {
  if (error?.retryable === false) return true;
  const status = Number(error?.status);
  return status >= 400 && status < 500 && ![408, 425, 429].includes(status);
}

/**
 * Durable FIFO outbox queue for resilient offline form submissions.
 * Handles offline enqueueing, durable intent retention, max-size bounding,
 * network reconnection auto-flush, Dead-Letter Queue (DLQ) routing,
 * and intelligent non-retryable 4xx rejection detection.
 */
export class OfflineOutboxQueue<T = Record<string, unknown>> {
  private storage: IStoragePort;
  private networkStatus: INetworkStatusPort;
  private transport?: ITransportPort<T>;
  private batteryStatus?: IBatteryStatusPort;
  private criticalBatteryThreshold: number;
  private throttleOnLowPower: boolean;
  private storageKey: string;
  private dlqKey: string;
  private lockKey: string;
  private maxQueueSize: number;
  private maxRetries: number;
  private baseDelayMs: number;
  private onDeadLetter?: (item: QueuedSubmission<T>, error: OutboxDeadLetterError) => void;
  private onReceipt?: OutboxQueueOptions<T>['onReceipt'];

  private syncStatus: OutboxSyncStatus = 'idle';
  private lastSyncError?: string;
  private isFlushing = false;
  private subscribers: Set<(queue: OfflineOutboxQueue<T>) => void> = new Set();
  private unsubscribeNetwork?: () => void;

  constructor(options?: OutboxQueueOptions<T>) {
    this.storage = options?.storage ?? new MemoryStorageAdapter();
    this.networkStatus = options?.networkStatus ?? new AlwaysOnlineNetworkAdapter();
    this.transport = options?.transport;
    this.batteryStatus = options?.batteryStatus;
    this.criticalBatteryThreshold = options?.criticalBatteryThreshold ?? 0.15;
    this.throttleOnLowPower = options?.throttleOnLowPower ?? true;
    this.storageKey = options?.storageKey ?? 'intuitui_outbox_queue';
    this.dlqKey = `${this.storageKey}_dlq`;
    this.lockKey = `${this.storageKey}_flush_lock`;
    this.maxQueueSize = options?.maxQueueSize ?? 50;
    this.maxRetries = options?.maxRetries ?? 5;
    this.baseDelayMs = options?.baseDelayMs ?? 1000;
    this.onDeadLetter = options?.onDeadLetter;
    this.onReceipt = options?.onReceipt;

    if (options?.autoFlushOnReconnect !== false) {
      this.unsubscribeNetwork = this.networkStatus.subscribe((isOnline) => {
        if (isOnline) {
          this.flush();
        }
      });
    }
  }

  public getStatus(): OutboxSyncStatus {
    return this.syncStatus;
  }

  public getSyncStatus(): OutboxSyncStatus {
    return this.syncStatus;
  }

  public getLastError(): string | undefined {
    return this.lastSyncError;
  }

  public getLastSyncError(): string | undefined {
    return this.lastSyncError;
  }

  public subscribe(callback: (queue: OfflineOutboxQueue<T>) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify(): void {
    this.subscribers.forEach((cb) => cb(this));
  }

  private async loadQueue(): Promise<QueuedSubmission<T>[]> {
    const raw = await this.storage.getItem(this.storageKey);
    if (!raw) return [];
    try {
      const items: QueuedSubmission<T>[] = JSON.parse(raw);
      // Pending responses are user data. Age alone must never delete an intent.
      return items;
    } catch {
      return [];
    }
  }

  private async saveQueue(queue: QueuedSubmission<T>[]): Promise<void> {
    await this.storage.setItem(this.storageKey, JSON.stringify(queue));
  }

  private async routeToDeadLetter(
    item: QueuedSubmission<T>,
    errorReason: TransportError | string,
  ): Promise<void> {
    const dlqError: OutboxDeadLetterError = {
      _tag: 'DeadLetterMaxRetriesExceeded',
      envelopeId: item.envelope.id,
      attempts: item.envelope.retryCount,
      lastError: errorReason,
    };

    try {
      const rawDlq = await this.storage.getItem(this.dlqKey);
      let dlqItems: QueuedSubmission<T>[] = rawDlq ? JSON.parse(rawDlq) : [];
      dlqItems.push(item);
      await this.storage.setItem(this.dlqKey, JSON.stringify(dlqItems));
    } catch (error) {
      // Keep the item in the active queue unless durable recovery storage succeeds.
      throw new Error(`Could not preserve the rejected response for recovery: ${String(error)}`);
    }

    if (this.onDeadLetter) {
      try {
        this.onDeadLetter(item, dlqError);
      } catch {
        // Prevent caller handler crash
      }
    }
  }

  public async getPendingCount(): Promise<number> {
    const queue = await this.loadQueue();
    return queue.length;
  }

  public async getDeadLetterQueue(): Promise<QueuedSubmission<T>[]> {
    const raw = await this.storage.getItem(this.dlqKey);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public async retryDeadLetter(envelopeId: string): Promise<boolean> {
    const dlq = await this.getDeadLetterQueue();
    const idx = dlq.findIndex((i) => i.envelope.id === envelopeId);
    if (idx === -1) return false;

    const [item] = dlq.splice(idx, 1);
    await this.storage.setItem(this.dlqKey, JSON.stringify(dlq));

    item.envelope.retryCount = 0;
    item.lastError = undefined;
    item.lastErrorCode = undefined;
    item.lastAttemptAt = undefined;
    item.queuedAt = Date.now();

    const queue = await this.loadQueue();
    queue.push(item);
    await this.saveQueue(queue);
    this.notify();
    return true;
  }

  /** Update delivery metadata only after the respondent accepts changed rules. */
  public async rebindDeadLetterContext(
    envelopeId: string,
    contextPatch: Partial<NonNullable<SubmissionEnvelope<T>['context']>>,
  ): Promise<boolean> {
    const dlq = await this.getDeadLetterQueue();
    const item = dlq.find((queued) => queued.envelope.id === envelopeId);
    if (!item?.envelope.context) return false;

    item.envelope.context = {
      ...item.envelope.context,
      ...contextPatch,
      transportMetadata: {
        ...item.envelope.context.transportMetadata,
        ...contextPatch.transportMetadata,
      },
    };
    item.envelope.retryCount = 0;
    item.lastError = undefined;
    item.lastErrorCode = undefined;
    item.lastAttemptAt = undefined;
    await this.storage.setItem(this.dlqKey, JSON.stringify(dlq));
    this.notify();
    return true;
  }

  public async clearDeadLetters(): Promise<void> {
    await this.storage.removeItem(this.dlqKey);
  }

  /**
   * Enqueues a submission envelope for offline delivery or immediate flush.
   */
  public async enqueue(
    envelope: SubmissionEnvelope<T>,
  ): Promise<{ status: 'queued' | 'synced'; receipt?: SubmissionReceipt }> {
    // Commit the intent before any network side effect. A crash after this point
    // is recoverable and submission idempotency makes retries safe.
    let queue = await this.loadQueue();
    const existing = queue.find((item) => item.envelope.id === envelope.id);
    if (!existing) {
      if (queue.length >= this.maxQueueSize) {
        throw new Error('Your saved response queue is full. Sync existing responses before submitting another.');
      }
      queue.push({ envelope, queuedAt: Date.now() });
      await this.saveQueue(queue);
    }

    const isOnline = await this.networkStatus.isOnline();
    const isThrottled = await this.isBatteryThrottled();
    if (isOnline && this.transport && !isThrottled && !this.isFlushing) {
      try {
        this.syncStatus = 'syncing';
        this.notify();
        const receipt = await this.executeSubmit(existing?.envelope ?? envelope);
        await this.onReceipt?.(envelope, receipt);
        queue = await this.loadQueue();
        await this.saveQueue(queue.filter((item) => item.envelope.id !== envelope.id));
        this.syncStatus = 'synced';
        this.lastSyncError = undefined;
        this.notify();
        return { status: 'synced', receipt };
      } catch (err: any) {
        this.lastSyncError = err instanceof Error ? err.message : String(err);
        if (isNonRetryableResponse(err)) {
          queue = await this.loadQueue();
          const item = queue.find((queued) => queued.envelope.id === envelope.id);
          if (item) {
            item.lastAttemptAt = Date.now();
            item.lastError = this.lastSyncError;
            item.lastErrorCode = typeof err?.code === 'string' ? err.code : undefined;
            await this.routeToDeadLetter(item, this.lastSyncError);
            await this.saveQueue(queue.filter((queued) => queued.envelope.id !== envelope.id));
          }
          this.syncStatus = 'error';
          this.notify();
          throw err;
        }
      }
    }

    this.syncStatus = 'offline-queued';
    this.notify();

    return { status: 'queued' };
  }

  private async executeSubmit(envelope: SubmissionEnvelope<T>): Promise<SubmissionReceipt> {
    if (!this.transport) {
      throw new Error('Transport adapter not configured');
    }
    if ('submitSafe' in this.transport) {
      const res = await (this.transport as IResilientTransportPort<T>).submitSafe(envelope);
      if (res.ok) return res.value;
      const message = 'message' in res.error ? res.error.message : `Transport error: ${res.error._tag}`;
      const err = new Error(message || `Transport failure: ${res.error._tag}`);
      Object.assign(err, res.error);
      throw err;
    }
    return this.transport.submit(envelope);
  }

  /**
   * Checks whether background flush should be throttled due to critical battery depletion.
   */
  public async isBatteryThrottled(): Promise<boolean> {
    if (!this.batteryStatus || !this.throttleOnLowPower) return false;
    try {
      const battery = await this.batteryStatus.getBatteryStatus();
      return !battery.charging && (battery.level <= this.criticalBatteryThreshold || !!battery.lowPowerMode);
    } catch {
      return false;
    }
  }

  /**
   * Flushes all queued submissions in FIFO order through the transport adapter.
   * If `force` is false, flush will be throttled if the device battery is critically low.
   */
  public async flush(force = false): Promise<number> {
    if (this.isFlushing || !this.transport) return 0;
    this.isFlushing = true;

    let hasAcquiredLock = false;
    let deliveredCount = 0;
    const now = Date.now();
    try {
      // Battery conservation: throttle background sync if battery is critical and discharging
      if (!force) {
        const throttled = await this.isBatteryThrottled();
        if (throttled) {
          this.syncStatus = 'offline-queued';
          this.notify();
          return 0;
        }
      }

      const isOnline = await this.networkStatus.isOnline();
      if (!isOnline) {
        this.syncStatus = 'offline-queued';
        this.notify();
        return 0;
      }

      // Acquire lease-based storage lock to prevent multi-tab concurrency hazards
      try {
        const activeLock = await this.storage.getItem(this.lockKey);
        if (activeLock) {
          const lockTimestamp = parseInt(activeLock, 10);
          if (!Number.isNaN(lockTimestamp) && now - lockTimestamp < 10000) {
            // Lock actively held by another process or tab
            return 0;
          }
        }
        await this.storage.setItem(this.lockKey, String(now));
        hasAcquiredLock = true;
      } catch {
        // Storage lock failure fallback
      }

      this.syncStatus = 'syncing';
      this.notify();

      let queue = await this.loadQueue();

      while (queue.length > 0) {
        // Heartbeat: renew lease lock during long batches so concurrent tabs do not preempt
        const currentBatchTime = Date.now();
        if (currentBatchTime - now > 5000) {
          try {
            await this.storage.setItem(this.lockKey, String(currentBatchTime));
          } catch {
            // Heartbeat failure fallback
          }
        }

        const item = queue[0];
        try {
          const receipt = await this.executeSubmit(item.envelope);
          await this.onReceipt?.(item.envelope, receipt);
          // Successful delivery: remove head of FIFO
          queue.shift();
          deliveredCount++;
          await this.saveQueue(queue);
        } catch (err: any) {
          // Delivery failed
          item.envelope.retryCount++;
          item.lastAttemptAt = Date.now();
          item.lastError = err instanceof Error ? err.message : String(err);
          item.lastErrorCode = typeof err?.code === 'string' ? err.code : undefined;
          this.lastSyncError = item.lastError;

          const isNonRetryable = isNonRetryableResponse(err);
          const exceededMaxRetries = item.envelope.retryCount >= this.maxRetries;

          if (isNonRetryable || exceededMaxRetries) {
            // Route dead item to DLQ and remove from active FIFO
            queue.shift();
            await this.routeToDeadLetter(item, item.lastError);
          }

          await this.saveQueue(queue);
          this.syncStatus = 'error';
          this.notify();
          break; // Stop flushing this batch
        }
      }

      if (this.syncStatus !== 'error') {
        this.syncStatus = queue.length > 0 ? 'offline-queued' : 'synced';
      }
    } finally {
      this.isFlushing = false;
      if (hasAcquiredLock) {
        try {
          await this.storage.removeItem(this.lockKey);
        } catch {
          // Ignore lock release failure
        }
      }
      this.notify();
    }

    return deliveredCount;
  }

  public async clear(): Promise<void> {
    await this.storage.removeItem(this.storageKey);
    this.syncStatus = 'idle';
    this.lastSyncError = undefined;
    this.notify();
  }

  public destroy(): void {
    if (this.unsubscribeNetwork) {
      this.unsubscribeNetwork();
    }
    this.subscribers.clear();
  }
}
