import type { FormTelemetryEvent, ITelemetryPort } from '../../ports/ITelemetryPort.js';

export interface CallbackTelemetryHooks {
  onEvent?: (event: FormTelemetryEvent) => void;
  onDispatch?: (event: FormTelemetryEvent) => void;
  onFlush?: () => Promise<void> | void;
}

/**
 * Universal Callback Telemetry Adapter
 * Forwards form telemetry directly to PostHog, Segment, Mixpanel, Datadog, or custom analytics pipelines.
 */
export class CallbackTelemetryAdapter implements ITelemetryPort {
  readonly name: string;
  private hooks: CallbackTelemetryHooks;

  constructor(hooks: CallbackTelemetryHooks, name = 'CallbackTelemetryAdapter') {
    this.name = name;
    this.hooks = hooks;
  }

  dispatch(event: FormTelemetryEvent): void {
    const fn = this.hooks.onDispatch ?? this.hooks.onEvent;
    if (fn) {
      try {
        fn(event);
      } catch (err) {
        console.warn(`[${this.name}] onEvent error:`, err);
      }
    }
  }

  async flush(): Promise<void> {
    if (this.hooks.onFlush) {
      try {
        await this.hooks.onFlush();
      } catch (err) {
        console.warn(`[${this.name}] onFlush error:`, err);
      }
    }
  }
}
