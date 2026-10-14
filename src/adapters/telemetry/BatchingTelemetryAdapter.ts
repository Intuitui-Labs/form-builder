import type { FormTelemetryEvent, ITelemetryPort } from '../../ports/ITelemetryPort.js';
import type { IStoragePort } from '../../ports/IStoragePort.js';

export interface BatchingTelemetryOptions {
  batchSize?: number;
  flushIntervalMs?: number;
  sampleRate?: number; // 0.0 to 1.0
  onFlush: (batch: FormTelemetryEvent[]) => Promise<void> | void;
  storage?: IStoragePort;
  storageKey?: string;
  maxSpoolSize?: number;
}

/**
 * Batched & Throttled Telemetry Adapter
 * Buffers form interaction events to prevent mobile main-thread jank and network flooding.
 * Supports persistent disk spooling via IStoragePort to prevent event loss on mobile process termination.
 */
export class BatchingTelemetryAdapter implements ITelemetryPort {
  readonly name = 'BatchingTelemetryAdapter';

  private buffer: FormTelemetryEvent[] = [];
  private batchSize: number;
  private flushIntervalMs: number;
  private sampleRate: number;
  private maxSpoolSize: number;
  private onFlush: (batch: FormTelemetryEvent[]) => Promise<void> | void;
  private storage?: IStoragePort;
  private storageKey: string;
  private timer: any = null;
  private isSampledIn: boolean;

  constructor(options: BatchingTelemetryOptions) {
    this.batchSize = options.batchSize ?? 20;
    this.flushIntervalMs = options.flushIntervalMs ?? 3000;
    this.sampleRate = Math.max(0, Math.min(1, options.sampleRate ?? 1));
    this.maxSpoolSize = options.maxSpoolSize ?? 500;
    this.onFlush = options.onFlush;
    this.storage = options.storage;
    this.storageKey = options.storageKey ?? 'intuitui_telemetry_spool';
    this.isSampledIn = Math.random() < this.sampleRate;

    if (this.storage) {
      const handleRaw = (raw: string | null) => {
        if (raw) {
          try {
            const spooled = JSON.parse(raw);
            if (Array.isArray(spooled) && spooled.length > 0) {
              this.buffer.unshift(...spooled);
              if (this.buffer.length > this.maxSpoolSize) {
                this.buffer = this.buffer.slice(-this.maxSpoolSize);
              }
            }
          } catch {
            // Ignore corrupted spool
          }
        }
      };

      const res = this.storage.getItem(this.storageKey);
      if (res instanceof Promise) {
        void res.then(handleRaw);
      } else {
        handleRaw(res);
      }
    }
  }

  dispatch(event: FormTelemetryEvent): void {
    if (!this.isSampledIn) return;

    this.buffer.push(event);
    if (this.buffer.length > this.maxSpoolSize) {
      this.buffer = this.buffer.slice(-this.maxSpoolSize);
    }

    if (this.storage) {
      void this.storage.setItem(this.storageKey, JSON.stringify(this.buffer));
    }

    if (this.buffer.length >= this.batchSize) {
      void this.flush();
    } else if (!this.timer && this.flushIntervalMs > 0) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, this.flushIntervalMs);
    }
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0) return;

    const itemsToSend = [...this.buffer];
    this.buffer = [];

    try {
      await this.onFlush(itemsToSend);
      if (this.storage) {
        void this.storage.removeItem(this.storageKey);
      }
    } catch (err) {
      // Re-queue items defensively so they are not lost on network/server drops
      this.buffer = [...itemsToSend, ...this.buffer];
      if (this.buffer.length > this.maxSpoolSize) {
        this.buffer = this.buffer.slice(-this.maxSpoolSize);
      }
      if (this.storage) {
        void this.storage.setItem(this.storageKey, JSON.stringify(this.buffer));
      }
      console.warn('[BatchingTelemetryAdapter] onFlush error:', err);
    }
  }

  destroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.buffer = [];
  }
}
