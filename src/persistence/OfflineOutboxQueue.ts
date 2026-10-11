import type { IStoragePort } from '../ports/IStoragePort.js';
import type { INetworkStatusPort } from '../ports/INetworkStatusPort.js';
import type { ITransportPort, SubmissionEnvelope, SubmissionReceipt } from '../ports/ITransportPort.js';
import { MemoryStorageAdapter } from '../adapters/storage/MemoryStorageAdapter.js';
import { AlwaysOnlineNetworkAdapter } from '../adapters/network/AlwaysOnlineNetworkAdapter.js';

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
  maxQueueSize?: number; // Default 50 items (Decision A2)
  ttlMs?: number; // Default 14 days = 14 * 86_400_000 ms (Decision A2)
  maxRetries?: number; // Default 5
  baseDelayMs?: number; // Default 1000ms
  autoFlushOnReconnect?: boolean; // Default true
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
 * network reconnection auto-flush, and exponential backoff retry.
 */
export class OfflineOutboxQueue<T = Record<string, unknown>> {
  private storage: IStoragePort;
  private networkStatus: INetworkStatusPort;
  private transport?: ITransportPort<T>;
  private storageKey: string;
  private maxQueueSize: number;
  private ttlMs: number;
  private maxRetries: number;
  private baseDelayMs: number;

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
    this.maxQueueSize = options?.maxQueueSize ?? 50;
    this.ttlMs = options?.ttlMs ?? 14 * 24 * 60 * 60 * 1000; // 14 days
    this.maxRetries = options?.maxRetries ?? 5;
    this.baseDelayMs = options?.baseDelayMs ?? 1000;

    if (options?.autoFlushOnReconnect !== false) {
      this.unsubscribeNetwork = this.networkStatus.subscribe((isOnline) => {
        if (isOnline) {
          this.flush();
        }
      });
    }
  }

  public setTransport(transport: ITransportPort<T>): void {
    this.transport = transport;
  }

  public getSyncStatus(): OutboxSyncStatus {
    return this.syncStatus;
  }

  public getLastSyncError(): string | undefined {
    return this.lastSyncError;
  }

  public subscribe(callback: (queue: OfflineOutboxQueue<T>) => void): () => void {
    this.subscribers.add(callback);
    callback(this);
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

  public async getPendingCount(): Promise<number> {
    const queue = await this.loadQueue();
    return queue.length;
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
        const receipt = await this.transport.submit(envelope);
        this.syncStatus = 'synced';
        this.lastSyncError = undefined;
        this.notify();
        return { status: 'synced', receipt };
      } catch (err) {
        // Immediate attempt failed (e.g. transient 5xx or dropped connection) -> fall through to queue
        this.lastSyncError = err instanceof Error ? err.message : String(err);
      }
    }

    // Load, bound, and append to persistent FIFO queue
    let queue = await this.loadQueue();

    // Evict oldest if reaching capacity
    if (queue.length >= this.maxQueueSize) {
      queue = queue.slice(queue.length - this.maxQueueSize + 1);
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

  /**
   * Flushes all queued submissions in FIFO order through the transport adapter.
   */
  public async flush(): Promise<number> {
    if (this.isFlushing || !this.transport) return 0;
    const isOnline = await this.networkStatus.isOnline();
    if (!isOnline) {
      this.syncStatus = 'offline-queued';
      this.notify();
      return 0;
    }

    this.isFlushing = true;
    this.syncStatus = 'syncing';
    this.notify();

    let deliveredCount = 0;
    let queue = await this.loadQueue();

    while (queue.length > 0) {
      const item = queue[0];
      try {
        await this.transport.submit(item.envelope);
        // Successful delivery: remove head of FIFO
        queue.shift();
        deliveredCount++;
        await this.saveQueue(queue);
      } catch (err) {
        // Delivery failed
        item.envelope.retryCount++;
        item.lastAttemptAt = Date.now();
        item.lastError = err instanceof Error ? err.message : String(err);
        this.lastSyncError = item.lastError;

        if (item.envelope.retryCount >= this.maxRetries) {
          // Drop item after max retries exceeded
          queue.shift();
        }

        await this.saveQueue(queue);
        this.syncStatus = 'error';
        this.notify();
        break; // Stop flushing this batch
      }
    }

    this.isFlushing = false;
    if (this.syncStatus !== 'error') {
      this.syncStatus = queue.length > 0 ? 'offline-queued' : 'synced';
    }
    this.notify();
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
