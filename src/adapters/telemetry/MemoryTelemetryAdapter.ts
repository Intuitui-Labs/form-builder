import type { FormTelemetryEvent, ITelemetryPort } from '../../ports/ITelemetryPort.js';

export interface MemoryTelemetryOptions {
  onEvent?: (event: FormTelemetryEvent) => void;
  maxBuffer?: number;
  maxEvents?: number;
}

/**
 * In-Memory Telemetry Adapter
 * Collects telemetry events in memory for unit testing, CI assertions, and inspection.
 */
export class MemoryTelemetryAdapter implements ITelemetryPort {
  readonly name = 'MemoryTelemetryAdapter';

  private events: FormTelemetryEvent[] = [];
  private onEvent?: (event: FormTelemetryEvent) => void;
  private maxBuffer: number;

  constructor(options: MemoryTelemetryOptions = {}) {
    this.onEvent = options.onEvent;
    this.maxBuffer = options.maxEvents ?? options.maxBuffer ?? 5000;
  }

  dispatch(event: FormTelemetryEvent): void {
    if (this.events.length >= this.maxBuffer) {
      this.events.shift(); // Evict oldest
    }
    this.events.push(event);
    if (this.onEvent) {
      this.onEvent(event);
    }
  }

  flush(): void {
    // In-memory buffer is already synchronous, no-op flush
  }

  getEvents(formId?: string): readonly FormTelemetryEvent[] {
    if (formId) {
      return this.events.filter((e) => e.formId === formId);
    }
    return [...this.events];
  }

  getEventsByType<T extends FormTelemetryEvent['type']>(
    type: T,
  ): Extract<FormTelemetryEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<FormTelemetryEvent, { type: T }>[];
  }

  clear(): void {
    this.events = [];
  }
}

