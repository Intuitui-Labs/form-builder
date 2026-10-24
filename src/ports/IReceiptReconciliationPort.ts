import type { SubmissionEnvelope, SubmissionReceipt } from './ITransportPort.js';

/**
 * Outbound Port: Contract for reconciling backend submission receipts with local state
 * (updating local submission history, profiles, or credits) BEFORE an outbox intent is dequeued.
 */
export interface IReceiptReconciliationPort<
  TValues = Record<string, unknown>,
  TMeta = Record<string, unknown>,
  TReceiptMeta = Record<string, unknown>,
> {
  onReceipt(
    envelope: SubmissionEnvelope<TValues, TMeta>,
    receipt: SubmissionReceipt<TReceiptMeta>,
  ): Promise<void> | void;
}
