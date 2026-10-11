import type {
  ITransportPort,
  SubmissionEnvelope,
  SubmissionReceipt,
} from '../../ports/ITransportPort.js';

export type SubmitCallback<T = Record<string, unknown>> = (
  values: T,
  envelope: SubmissionEnvelope<T>,
) => Promise<void> | void;

/**
 * Adapter that converts a standard onSubmit callback function into an ITransportPort.
 */
export class CallbackTransportAdapter<T = Record<string, unknown>>
  implements ITransportPort<T> {
  private onSubmit: SubmitCallback<T>;

  constructor(onSubmit: SubmitCallback<T>) {
    this.onSubmit = onSubmit;
  }

  public async submit(envelope: SubmissionEnvelope<T>): Promise<SubmissionReceipt> {
    await this.onSubmit(envelope.values, envelope);

    return {
      receiptId: envelope.id || `receipt_${Date.now()}`,
      status: 'synced',
      timestamp: new Date().toISOString(),
    };
  }
}
