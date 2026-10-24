import type { IStoragePort } from '../ports/IStoragePort.js';
import type { INetworkStatusPort } from '../ports/INetworkStatusPort.js';
import type { ITransportPort, SubmissionEnvelope, SubmissionReceipt } from '../ports/ITransportPort.js';
import type { IBatteryStatusPort } from '../ports/IBatteryStatusPort.js';
import type { OutboxDeadLetterError } from '../core/DomainErrors.js';
import {
  OfflineOutboxQueue,
  type QueuedSubmission,
} from './OfflineOutboxQueue.js';

export interface ScopeTransferResult {
  readonly success: boolean;
  readonly transferredActive: number;
  readonly transferredDeadLetters: number;
  readonly deduplicatedCount: number;
}

export interface PartitionedOutboxOptions<T = Record<string, unknown>, TMeta = Record<string, unknown>> {
  storage: IStoragePort;
  networkStatus?: INetworkStatusPort;
  transport?: ITransportPort<T>;
  batteryStatus?: IBatteryStatusPort;
  storageKeyPrefix?: string; // Default: 'intuitui_outbox'
  maxQueueSizePerPartition?: number; // Default: 50
  maxRetries?: number; // Default: 5
  baseDelayMs?: number; // Default: 1000
  autoFlushOnReconnect?: boolean; // Default: true
  criticalBatteryThreshold?: number;
  throttleOnLowPower?: boolean;
  onDeadLetter?: (item: QueuedSubmission<T>, error: OutboxDeadLetterError) => void;
  onReceipt?: (envelope: SubmissionEnvelope<T, TMeta>, receipt: SubmissionReceipt) => Promise<void> | void;
}

const ACTIVE_LOCK_TIMEOUT_MS = 10_000;

/**
 * Enterprise partitioned outbox manager.
 * Isolates background submission FIFO queues and DLQs by partition/identity,
 * preventing cross-user data crossover on shared devices and providing atomic,
 * deadlock-free scope handoffs when anonymous respondents authenticate.
 */
export class PartitionedOutboxManager<T = Record<string, unknown>, TMeta = Record<string, unknown>> {
  private readonly storage: IStoragePort;
  private readonly storageKeyPrefix: string;
  private readonly options: PartitionedOutboxOptions<T, TMeta>;
  private readonly queues = new Map<string, OfflineOutboxQueue<T>>();

  constructor(options: PartitionedOutboxOptions<T, TMeta>) {
    this.storage = options.storage;
    this.storageKeyPrefix = options.storageKeyPrefix ?? 'intuitui_outbox';
    this.options = options;
  }

  public getStorageKeyForPartition(partitionKey: string): string {
    return `${this.storageKeyPrefix}:${encodeURIComponent(partitionKey)}`;
  }

  public getDlqKeyForPartition(partitionKey: string): string {
    return `${this.getStorageKeyForPartition(partitionKey)}_dlq`;
  }

  public getLockKeyForPartition(partitionKey: string): string {
    return `${this.getStorageKeyForPartition(partitionKey)}_flush_lock`;
  }

  /**
   * Returns or instantiates the memoized OfflineOutboxQueue for a specific partition.
   * Prevents listener leaks by reusing active queue instances per partition key.
   */
  public getQueue(partitionKey: string): OfflineOutboxQueue<T> {
    const existing = this.queues.get(partitionKey);
    if (existing) {
      return existing;
    }

    const partitionStorageKey = this.getStorageKeyForPartition(partitionKey);
    const queue = new OfflineOutboxQueue<T>({
      storage: this.storage,
      storageKey: partitionStorageKey,
      networkStatus: this.options.networkStatus,
      transport: this.options.transport,
      batteryStatus: this.options.batteryStatus,
      maxQueueSize: this.options.maxQueueSizePerPartition,
      maxRetries: this.options.maxRetries,
      baseDelayMs: this.options.baseDelayMs,
      autoFlushOnReconnect: this.options.autoFlushOnReconnect,
      criticalBatteryThreshold: this.options.criticalBatteryThreshold,
      throttleOnLowPower: this.options.throttleOnLowPower,
      onDeadLetter: this.options.onDeadLetter,
      onReceipt: this.options.onReceipt as any,
    });

    this.queues.set(partitionKey, queue);
    return queue;
  }

  /**
   * Atomically transfers all pending and dead-lettered envelopes from a source partition
   * (e.g. anonymous guest) into a destination partition (e.g. authenticated account).
   *
   * Adversarial Defenses:
   * 1. Inspects active flush locks to prevent race conditions during live synchronization.
   * 2. Acquires both locks in lexicographical order to eliminate multi-tab deadlocks.
   * 3. Deduplicates submissions by envelope.id to prevent duplicate submissions on retry.
   */
  public async transferScope(
    fromPartitionKey: string,
    toPartitionKey: string,
  ): Promise<ScopeTransferResult> {
    if (fromPartitionKey === toPartitionKey) {
      return { success: true, transferredActive: 0, transferredDeadLetters: 0, deduplicatedCount: 0 };
    }

    const fromLockKey = this.getLockKeyForPartition(fromPartitionKey);
    const toLockKey = this.getLockKeyForPartition(toPartitionKey);

    const now = Date.now();

    // SRE Guard 1: Verify neither partition is actively flushing
    for (const lockKey of [fromLockKey, toLockKey]) {
      const rawLock = await this.storage.getItem(lockKey);
      if (rawLock) {
        const lockTime = Number(rawLock);
        if (Number.isFinite(lockTime) && lockTime > 0 && now - lockTime < ACTIVE_LOCK_TIMEOUT_MS) {
          throw new Error('Wait for the current response sync to finish before changing its account scope.');
        }
      }
    }

    // SRE Guard 2: Lexicographical lock acquisition to prevent circular lock deadlocks
    const orderedLocks = [fromLockKey, toLockKey].sort();
    for (const lockKey of orderedLocks) {
      await this.storage.setItem(lockKey, String(now));
    }

    try {
      const fromActiveKey = this.getStorageKeyForPartition(fromPartitionKey);
      const toActiveKey = this.getStorageKeyForPartition(toPartitionKey);
      const fromDlqKey = this.getDlqKeyForPartition(fromPartitionKey);
      const toDlqKey = this.getDlqKeyForPartition(toPartitionKey);

      const [fromActive, toActive, fromDlq, toDlq] = await Promise.all([
        this.loadList(fromActiveKey),
        this.loadList(toActiveKey),
        this.loadList(fromDlqKey),
        this.loadList(toDlqKey),
      ]);

      const activeMerge = this.mergeAndDedupe(toActive, fromActive);
      const dlqMerge = this.mergeAndDedupe(toDlq, fromDlq);

      // Commit destination changes
      await Promise.all([
        this.storage.setItem(toActiveKey, JSON.stringify(activeMerge.merged)),
        this.storage.setItem(toDlqKey, JSON.stringify(dlqMerge.merged)),
        this.storage.removeItem(fromActiveKey),
        this.storage.removeItem(fromDlqKey),
      ]);

      // If in-memory instances exist, notify them
      const fromQueue = this.queues.get(fromPartitionKey);
      if (fromQueue) {
        await fromQueue.clear();
      }

      return {
        success: true,
        transferredActive: activeMerge.transferred,
        transferredDeadLetters: dlqMerge.transferred,
        deduplicatedCount: activeMerge.deduped + dlqMerge.deduped,
      };
    } finally {
      // Always release both acquired lease locks
      for (const lockKey of orderedLocks) {
        try {
          await this.storage.removeItem(lockKey);
        } catch {
          // Ignore lock removal failure on teardown
        }
      }
    }
  }

  private async loadList(key: string): Promise<QueuedSubmission<T>[]> {
    const raw = await this.storage.getItem(key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private mergeAndDedupe(
    destination: QueuedSubmission<T>[],
    source: QueuedSubmission<T>[],
  ): {
    merged: QueuedSubmission<T>[];
    transferred: number;
    deduped: number;
  } {
    const seen = new Set<string>();
    const merged: QueuedSubmission<T>[] = [];

    for (const item of destination) {
      const id = item?.envelope?.id;
      if (id) seen.add(id);
      merged.push(item);
    }

    let transferred = 0;
    let deduped = 0;

    for (const item of source) {
      const id = item?.envelope?.id;
      if (id && seen.has(id)) {
        deduped++;
        continue;
      }
      if (id) seen.add(id);
      merged.push(item);
      transferred++;
    }

    return { merged, transferred, deduped };
  }

  /**
   * Cleans up all cached outbox instances and severs network listeners.
   */
  public destroy(): void {
    for (const queue of this.queues.values()) {
      queue.destroy();
    }
    this.queues.clear();
  }
}
