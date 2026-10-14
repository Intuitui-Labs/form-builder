export interface BaseTelemetryEvent {
  formId: string;
  timestamp: number;
  sessionId?: string;
  correlationId?: string;
}

export type FormTelemetryEvent =
  | (BaseTelemetryEvent & {
      type: 'form_mounted';
      schemaVersion: string;
      experimentLineage?: {
        experimentKey: string;
        variantId: string;
      };
      totalSteps?: number;
    })
  | (BaseTelemetryEvent & {
      type: 'step_viewed';
      stepIndex: number;
      stepId: string;
      stepTitle?: string;
    })
  | (BaseTelemetryEvent & {
      type: 'step_completed';
      stepIndex: number;
      stepId: string;
      durationMs: number;
    })
  | (BaseTelemetryEvent & {
      type: 'field_focused';
      stepIndex: number;
      fieldName: string;
    })
  | (BaseTelemetryEvent & {
      type: 'field_blurred';
      stepIndex: number;
      fieldName: string;
      dwellMs: number;
      hasValue: boolean;
      valueLength?: number;
    })
  | (BaseTelemetryEvent & {
      type: 'field_error';
      stepIndex: number;
      fieldName: string;
      errorRule: string;
      errorMessage?: string;
    })
  | (BaseTelemetryEvent & {
      type: 'branch_diverted';
      fromStep: number;
      targetStep: number;
      conditionId?: string;
    })
  | (BaseTelemetryEvent & {
      type: 'form_submitted';
      totalDurationMs: number;
      success: boolean;
      errorCount: number;
      experimentLineage?: {
        experimentKey: string;
        variantId: string;
      };
    })
  | (BaseTelemetryEvent & {
      type: 'form_abandoned';
      lastStepIndex: number;
      completedSteps: number;
      totalDurationMs: number;
      experimentLineage?: {
        experimentKey: string;
        variantId: string;
      };
    })
  | (BaseTelemetryEvent & {
      type: 'transition_rejected';
      stepIndex: number;
      targetIndex?: number;
      phase?: string;
      action: string;
      reason?: string;
    })
  | (BaseTelemetryEvent & {
      type: 'submit_rejected';
      stepIndex?: number;
      phase?: string;
      action?: string;
      reason?: string;
    })
  | (BaseTelemetryEvent & {
      type: 'fields_enriched';
      source: string;
      fieldNames: string[];
      overwritePolicy?: string;
      appliedCount: number;
      skippedCount: number;
    });

/**
 * Outbound Port: Contract for streaming in-flight form telemetry, step transitions,
 * field friction, and funnel drop-off analytics.
 * Pure TypeScript contract with 0 external dependencies.
 */
export interface ITelemetryPort {
  readonly name: string;

  /**
   * Synchronously dispatches a telemetry event to the underlying buffer/sink.
   */
  dispatch(event: FormTelemetryEvent): void;

  /**
   * Optional lifecycle hook to flush pending batched events before unmounting or app backgrounding.
   */
  flush?(): Promise<void> | void;
}
