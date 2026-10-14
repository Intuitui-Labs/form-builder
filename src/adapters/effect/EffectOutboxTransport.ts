import { Effect, Schedule } from 'effect';
import type {
  IResilientTransportPort,
  SubmissionEnvelope,
  SubmissionReceipt,
} from '../../ports/ITransportPort.js';
import { Result } from '../../core/Result.js';
import type { TransportError } from '../../core/DomainErrors.js';

export interface EffectOutboxTransportOptions<T = Record<string, unknown>> {
  submitEffect?: (envelope: SubmissionEnvelope<T>) => Effect.Effect<SubmissionReceipt, TransportError>;
  maxRetries?: number;
  initialDelayMs?: number;
  timeoutMs?: number;
}

/**
 * Tier 2 Hexagonal Adapter: Bridges IResilientTransportPort with Effect v4.
 * Uses Schedule.exponential with jitter for retries, while categorizing 4xx client errors
 * to short-circuit retry loops directly into Dead-Letter channels, and enforcing socket timeouts.
 */
export class EffectOutboxTransport<T = Record<string, unknown>>
  implements IResilientTransportPort<T> {
  private submitEffect: (
    envelope: SubmissionEnvelope<T>,
  ) => Effect.Effect<SubmissionReceipt, TransportError>;
  private maxRetries: number;
  private initialDelayMs: number;
  private timeoutMs: number;

  constructor(options?: EffectOutboxTransportOptions<T>) {
    this.submitEffect =
      options?.submitEffect ??
      ((env) =>
        Effect.succeed({
          receiptId: `rcpt_${env.id}`,
          status: 'synced',
          timestamp: new Date().toISOString(),
        }));
    this.maxRetries = options?.maxRetries ?? 3;
    this.initialDelayMs = options?.initialDelayMs ?? 500;
    this.timeoutMs = options?.timeoutMs ?? 10000;
  }

  public async submitSafe(
    envelope: SubmissionEnvelope<T>,
  ): Promise<Result<SubmissionReceipt, TransportError>> {
    // Retry schedule: exponential backoff concatenated with recurs count
    const retrySchedule = Schedule.exponential(`${this.initialDelayMs} millis`).pipe(
      Schedule.jittered,
      Schedule.concat(Schedule.recurs(this.maxRetries)),
    );

    const program = this.submitEffect(envelope).pipe(
      Effect.timeout(`${this.timeoutMs} millis`),
      Effect.retry({
        schedule: retrySchedule,
        while: (err: any) => err?.retryable === true,
      }),
      Effect.map((receipt): Result<SubmissionReceipt, TransportError> => Result.ok(receipt)),
      Effect.catch((err: any): Effect.Effect<Result<SubmissionReceipt, TransportError>> => {
        if (err?._tag === 'TimeoutException' || err?.name === 'TimeoutException') {
          const timeoutErr: TransportError = {
            _tag: 'TransportTimeout',
            durationMs: this.timeoutMs,
            retryable: true,
          };
          return Effect.succeed(Result.err(timeoutErr));
        }
        return Effect.succeed(Result.err(err as TransportError));
      }),
    );

    return Effect.runPromise(program);
  }

  public async submit(envelope: SubmissionEnvelope<T>): Promise<SubmissionReceipt> {
    const res = await this.submitSafe(envelope);
    if (res.ok) return res.value;

    const error = new Error(`Transport failed: ${res.error._tag}`);
    Object.assign(error, res.error);
    throw error;
  }
}
