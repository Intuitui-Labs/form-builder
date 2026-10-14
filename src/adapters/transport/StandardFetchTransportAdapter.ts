import type {
  IResilientTransportPort,
  SubmissionEnvelope,
  SubmissionReceipt,
} from '../../ports/ITransportPort.js';
import { Result } from '../../core/Result.js';
import type { TransportError } from '../../core/DomainErrors.js';

export interface StandardFetchTransportOptions {
  endpoint: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Tier 1 Standard zero-dependency HTTP transport adapter.
 * Intelligently classifies status codes:
 * - 4xx client errors (400, 422, etc.) as non-retryable TransportClientRejected
 * - 5xx server errors as retryable TransportServerError
 * - Network failures as retryable TransportNetworkOffline
 * - Request timeouts as retryable TransportTimeout
 */
export class StandardFetchTransportAdapter<T = Record<string, unknown>>
  implements IResilientTransportPort<T> {
  private endpoint: string;
  private headers: Record<string, string>;
  private timeoutMs: number;
  private fetchFn: typeof fetch;

  constructor(options: StandardFetchTransportOptions) {
    this.endpoint = options.endpoint;
    this.headers = options.headers ?? { 'Content-Type': 'application/json' };
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  public async submitSafe(
    envelope: SubmissionEnvelope<T>,
  ): Promise<Result<SubmissionReceipt, TransportError>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: {
          ...this.headers,
          'X-Idempotency-Key': envelope.id,
        },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        let body: any = {};
        try {
          body = await response.json();
        } catch {
          // Response may have empty body
        }

        return Result.ok({
          receiptId: body?.receiptId || `rcpt_${envelope.id}`,
          status: 'synced',
          timestamp: new Date().toISOString(),
          metadata: body,
        });
      }

      // Handle HTTP error statuses
      const status = response.status;
      let errorDetails: unknown = null;
      try {
        errorDetails = await response.json();
      } catch {
        errorDetails = await response.text();
      }

      if (status >= 400 && status < 500) {
        return Result.err({
          _tag: 'TransportClientRejected',
          status,
          retryable: false,
          details: errorDetails,
        });
      }

      return Result.err({
        _tag: 'TransportServerError',
        status,
        retryable: true,
        message: `Server returned error status ${status}`,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err?.name === 'AbortError') {
        return Result.err({
          _tag: 'TransportTimeout',
          durationMs: this.timeoutMs,
          retryable: true,
        });
      }

      return Result.err({
        _tag: 'TransportNetworkOffline',
        retryable: true,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  public async submit(envelope: SubmissionEnvelope<T>): Promise<SubmissionReceipt> {
    const res = await this.submitSafe(envelope);
    if (res.ok) return res.value;

    const error = new Error(
      `Submission failed: ${res.error._tag} (retryable: ${res.error.retryable})`,
    );
    Object.assign(error, res.error);
    throw error;
  }
}
