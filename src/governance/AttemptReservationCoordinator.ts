import type { IStoragePort } from '../ports/IStoragePort.js';
import type {
  IAttemptReservationPort,
  AttemptReservationReceipt,
} from '../ports/IAttemptReservationPort.js';

export type AttemptPreparationStatus =
  | 'active'
  | 'offline_resumed'
  | 'policy_confirmation_required';

export interface AttemptPreparationResult<TMeta extends Record<string, unknown> = Record<string, unknown>> {
  readonly status: AttemptPreparationStatus;
  readonly attemptId: string;
  readonly policyVersion?: string;
  readonly resumed: boolean;
  readonly meta: TMeta;
  readonly attemptStorageKey: string;
}

export interface AttemptReservationOptions {
  readonly storage: IStoragePort;
  readonly reservationPort: IAttemptReservationPort;
  readonly timeoutMs?: number; // Default: 3500ms
  readonly createAttemptId?: () => string;
}

export interface PrepareAttemptInput<TMeta extends Record<string, unknown> = Record<string, unknown>> {
  readonly formId: string;
  readonly ownerKey: string;
  readonly scopeId?: string;
  readonly initialMeta: TMeta;
  readonly confirmPolicyChange?: boolean;
}

const DEFAULT_TIMEOUT_MS = 3500;

function defaultGenerateAttemptId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  return `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Sensitive keys stripped from cached metadata to prevent credential leakage in shared offline storage. */
const SENSITIVE_CACHE_KEYS = new Set([
  'csrfToken',
  'accessGrant',
  'bearerToken',
  'authToken',
  'password',
  'secret',
  'sessionToken',
]);

/**
 * Headless Attempt Reservation Coordinator.
 * Manages remote backend attempt reservations, offline fallback resumption,
 * safe metadata caching with credential redaction, and policy change recovery.
 * Zero external runtime dependencies.
 */
export class AttemptReservationCoordinator {
  private readonly storage: IStoragePort;
  private readonly reservationPort: IAttemptReservationPort;
  private readonly timeoutMs: number;
  private readonly createAttemptId: () => string;

  constructor(options: AttemptReservationOptions) {
    this.storage = options.storage;
    this.reservationPort = options.reservationPort;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.createAttemptId = options.createAttemptId ?? defaultGenerateAttemptId;
  }

  public getCacheKey(formId: string): string {
    return `intuitui_form_meta:v1:${encodeURIComponent(formId)}`;
  }

  public getAttemptStorageKey(ownerKey: string, scopeId: string | undefined, formId: string): string {
    const scope = scopeId ? encodeURIComponent(scopeId) : 'global';
    return `intuitui_form_attempt:v1:${encodeURIComponent(ownerKey)}:${scope}:${encodeURIComponent(formId)}`;
  }

  public async prepareAttempt<TMeta extends Record<string, unknown>>(
    input: PrepareAttemptInput<TMeta>,
  ): Promise<AttemptPreparationResult<TMeta>> {
    const { formId, ownerKey, scopeId, initialMeta, confirmPolicyChange } = input;
    let meta: TMeta = { ...initialMeta };

    const cacheKey = this.getCacheKey(formId);
    const attemptStorageKey = this.getAttemptStorageKey(ownerKey, scopeId, formId);
    const storedAttemptId = await this.storage.getItem(attemptStorageKey);

    let offlineResume = false;
    let policyConfirmationRequired = false;
    let reservation: AttemptReservationReceipt | null = null;

    try {
      try {
        reservation = await this.executeWithTimeout(
          this.reservationPort.startAttempt(
            formId,
            storedAttemptId || this.createAttemptId(),
            scopeId,
          ),
          this.timeoutMs,
        );
      } catch (err: any) {
        const code = err?.code;
        if (code === 'policy_changed' && !confirmPolicyChange) {
          policyConfirmationRequired = true;
        } else if (['policy_changed', 'attempt_not_active', 'attempt_completed'].includes(code ?? '')) {
          // Terminal or outdated attempt on server: create a new attempt reservation without losing local answers
          reservation = await this.executeWithTimeout(
            this.reservationPort.startAttempt(formId, this.createAttemptId(), scopeId),
            this.timeoutMs,
          );
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      const status = err?.status;
      const isNetworkFailure =
        status === 0 ||
        err?.message?.includes('network') ||
        err?.message?.includes('timed out') ||
        err?.message?.includes('offline');

      if (!isNetworkFailure || !storedAttemptId) {
        throw err;
      }
      offlineResume = true;
    }

    let finalAttemptId = storedAttemptId || this.createAttemptId();
    let finalPolicyVersion: string | undefined;
    let resumed = false;
    let status: AttemptPreparationStatus = 'active';

    if (offlineResume) {
      const cachedRaw = await this.storage.getItem(cacheKey);
      if (!cachedRaw) {
        throw new Error(`Cannot resume offline: no cached metadata found for form '${formId}'.`);
      }
      try {
        meta = JSON.parse(cachedRaw) as TMeta;
      } catch {
        throw new Error(`Corrupted offline cache for form '${formId}'.`);
      }
      finalAttemptId = storedAttemptId!;
      finalPolicyVersion = (meta as any)?.policyVersion;
      resumed = true;
      status = 'offline_resumed';
    } else if (reservation) {
      finalAttemptId = reservation.attemptId;
      finalPolicyVersion = reservation.policyVersion;
      resumed = Boolean(reservation.resumed);
      await this.storage.setItem(attemptStorageKey, reservation.attemptId);
      status = 'active';
    } else if (policyConfirmationRequired) {
      status = 'policy_confirmation_required';
      finalAttemptId = storedAttemptId || this.createAttemptId();
    }

    // Zero-Knowledge Cache Sanitization: strip credentials, access tokens and CSRF cookies before storage
    const sanitizedCache: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta)) {
      if (!SENSITIVE_CACHE_KEYS.has(k)) {
        sanitizedCache[k] = v;
      }
    }
    await this.storage.setItem(cacheKey, JSON.stringify(sanitizedCache));

    return {
      status,
      attemptId: finalAttemptId,
      policyVersion: finalPolicyVersion,
      resumed,
      meta,
      attemptStorageKey,
    };
  }

  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`Attempt reservation request timed out after ${timeoutMs}ms.`);
        Object.assign(error, { status: 0, code: 'timeout' });
        reject(error);
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
