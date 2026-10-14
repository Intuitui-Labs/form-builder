import type { IStoragePort } from '../ports/IStoragePort.js';
import type { INetworkStatusPort } from '../ports/INetworkStatusPort.js';
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
  storageKey?: string;
  maxQueueSize?: number; // Default 50 items
  ttlMs?: number; // Default 14 days
  maxRetries?: number; // Default 5
  baseDelayMs?: number; // Default 1000ms
  autoFlushOnReconnect?: boolean; // Default true
  onDeadLetter?: (item: QueuedSubmission<T>, error: OutboxDeadLetterError) => void;
}

export interface QueuedSubmission<T = Record<string, unknown>> {
  envelope: SubmissionEnvelope<T>;
  queuedAt: number; // epoch ms
  lastAttemptAt?: number;
  lastError?: string;
}

/**
 * Durable FIFO outbox queue for resilient offline form submissions.
 * Handles offline enqueueing, 14-day TTL eviction, max-size bounding,
 * network reconnection auto-flush, Dead-Letter Queue (DLQ) routing,
 * and intelligent non-retryable 4xx rejection detection.
 */
export class OfflineOutboxQueue<T = Record<string, unknown>> {
  private storage: IStoragePort;
  private networkStatus: INetworkStatusPort;
  private transport?: ITransportPort<T>;
  private storageKey: string;
  private dlqKey: string;
  private lockKey: string;
  private maxQueueSize: number;
  private ttlMs: number;
  private maxRetries: number;
  private baseDelayMs: number;
  private onDeadLetter?: (item: QueuedSubmission<T>, error: OutboxDeadLetterError) => void;

  private syncStatus: OutboxSyncStatus = 'idle';
  private lastSyncError?: string;
  private isFlushing = false;
  private subscribers: Set<(queue: OfflineOutboxQueue<T>) => void> = new Set();
  private unsubscribeNetwork?: () => void;

  constructor(options?: OutboxQueueOptions<T>) {
    this.storage = options?.storage ?? new MemoryStorageAdapter();
    this.networkStatus = options?.networkStatus ?? new AlwaysOnlineNetworkAdapter();
    this.transport = options?.transport;
    this.storageKey = options?.storageKey ?? 'intuitui_outbox_queue';
    this.dlqKey = `${this.storageKey}_dlq`;
    this.lockKey = `${this.storageKey}_flush_lock`;
    this.maxQueueSize = options?.maxQueueSize ?? 50;
    this.ttlMs = options?.ttlMs ?? 14 * 24 * 60 * 60 * 1000; // 14 days
    this.maxRetries = options?.maxRetries ?? 5;
    this.baseDelayMs = options?.baseDelayMs ?? 1000;
    this.onDeadLetter = options?.onDeadLetter;

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
      const now = Date.now();
      // Filter out items older than TTL (14 days)
      const validItems = items.filter((item) => now - item.queuedAt < this.ttlMs);
      if (validItems.length !== items.length) {
        await this.saveQueue(validItems);
      }
      return validItems;
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
      if (dlqItems.length > 25) {
        dlqItems = dlqItems.slice(-25);
      }
      await this.storage.setItem(this.dlqKey, JSON.stringify(dlqItems));
    } catch {
      // Ignore DLQ storage failure
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
    item.lastAttemptAt = undefined;
    item.queuedAt = Date.now();

    const queue = await this.loadQueue();
    queue.push(item);
    await this.saveQueue(queue);
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
    const isOnline = await this.networkStatus.isOnline();

    // If online and transport exists, attempt immediate delivery first!
    if (isOnline && this.transport) {
      try {
        this.syncStatus = 'syncing';
        this.notify();
        const receipt = await this.executeSubmit(envelope);
        this.syncStatus = 'synced';
        this.lastSyncError = undefined;
        this.notify();
        return { status: 'synced', receipt };
      } catch (err: any) {
        // Immediate attempt failed (e.g. transient 5xx or dropped connection) -> fall through to queue
        this.lastSyncError = err instanceof Error ? err.message : String(err);
        
        // If it's a non-retryable rejection (e.g. 400/422 validation failure), route immediately to DLQ
        if (err?.retryable === false || err?.status === 400 || err?.status === 422) {
          const item: QueuedSubmission<T> = {
            envelope,
            queuedAt: Date.now(),
            lastAttemptAt: Date.now(),
            lastError: this.lastSyncError,
          };
          await this.routeToDeadLetter(item, this.lastSyncError);
          this.syncStatus = 'error';
          this.notify();
          throw err;
        }
      }
    }

    // Load, bound, and append to persistent FIFO queue
    let queue = await this.loadQueue();

    // Evict oldest if reaching capacity: route evicted item to DLQ to prevent silent data drop!
    if (queue.length >= this.maxQueueSize) {
      const evictedCount = queue.length - this.maxQueueSize + 1;
      const evictedItems = queue.slice(0, evictedCount);
      for (const evicted of evictedItems) {
        await this.routeToDeadLetter(evicted, 'Evicted due to queue capacity overflow');
      }
      queue = queue.slice(evictedCount);
    }

    queue.push({
      envelope,
      queuedAt: Date.now(),
      lastAttemptAt: Date.now(),
      lastError: this.lastSyncError,
    });

    await this.saveQueue(queue);

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
   * Flushes all queued submissions in FIFO order through the transport adapter.
   */
  public async flush(): Promise<number> {
    if (this.isFlushing || !this.transport) return 0;
    this.isFlushing = true;

    let hasAcquiredLock = false;
    let deliveredCount = 0;
    const now = Date.now();
    try {
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
          await this.executeSubmit(item.envelope);
          // Successful delivery: remove head of FIFO
          queue.shift();
          deliveredCount++;
          await this.saveQueue(queue);
        } catch (err: any) {
          // Delivery failed
          item.envelope.retryCount++;
          item.lastAttemptAt = Date.now();
          item.lastError = err instanceof Error ? err.message : String(err);
          this.lastSyncError = item.lastError;

          const isNonRetryable = err?.retryable === false || err?.status === 400 || err?.status === 422;
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
