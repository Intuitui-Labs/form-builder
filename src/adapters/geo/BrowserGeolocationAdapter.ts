import type { AddressCandidate, IAddressAutofillPort } from '../../ports/IAddressAutofillPort.js';

export interface BrowserGeolocationOptions {
  reverseGeocoder: IAddressAutofillPort;
  timeoutMs?: number;
  maximumAgeMs?: number;
  enableHighAccuracy?: boolean;
}

export type GeolocationFailureReason =
  | 'not_supported'
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'reverse_geocode_failed'
  | 'unknown';

export interface GeolocationResolutionResult {
  success: boolean;
  candidate: AddressCandidate | null;
  coordinates?: { latitude: number; longitude: number };
  reason?: GeolocationFailureReason;
  errorMessage?: string;
}

/**
 * Resilient Browser Geolocation Adapter.
 * Encapsulates device GPS location querying with strict timeout budgets,
 * permission guards, and zero unhandled rejections.
 */
export class BrowserGeolocationAdapter {
  private reverseGeocoder: IAddressAutofillPort;
  private timeoutMs: number;
  private maximumAgeMs: number;
  private enableHighAccuracy: boolean;

  constructor(options: BrowserGeolocationOptions) {
    this.reverseGeocoder = options.reverseGeocoder;
    this.timeoutMs = options.timeoutMs ?? 3500;
    this.maximumAgeMs = options.maximumAgeMs ?? 60000;
    this.enableHighAccuracy = options.enableHighAccuracy ?? false;
  }

  public isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.geolocation !== 'undefined' &&
      typeof navigator.geolocation.getCurrentPosition === 'function'
    );
  }

  public async acquireCurrentAddress(signal?: AbortSignal): Promise<GeolocationResolutionResult> {
    if (!this.isSupported()) {
      return {
        success: false,
        candidate: null,
        reason: 'not_supported',
        errorMessage: 'Browser Geolocation API is not supported in this runtime environment.',
      };
    }

    if (signal?.aborted) {
      return {
        success: false,
        candidate: null,
        reason: 'timeout',
        errorMessage: 'Location acquisition was cancelled.',
      };
    }

    try {
      const position = await this.getCurrentCoordinates(signal);
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      const candidate = await this.reverseGeocoder.lookupByCoordinates({
        latitude: coords.latitude,
        longitude: coords.longitude,
        signal,
      });

      if (!candidate) {
        return {
          success: false,
          candidate: null,
          coordinates: coords,
          reason: 'reverse_geocode_failed',
          errorMessage: 'Coordinates acquired, but reverse-geocoding service yielded no candidate.',
        };
      }

      return {
        success: true,
        candidate,
        coordinates: coords,
      };
    } catch (err: unknown) {
      const errorObj = err as { code?: number; message?: string };
      let reason: GeolocationFailureReason = 'unknown';

      if (errorObj.code === 1) {
        reason = 'permission_denied';
      } else if (errorObj.code === 2) {
        reason = 'position_unavailable';
      } else if (errorObj.code === 3 || errorObj.message?.includes('timed out')) {
        reason = 'timeout';
      }

      return {
        success: false,
        candidate: null,
        reason,
        errorMessage: errorObj.message ?? 'Unknown geolocation acquisition error.',
      };
    }
  }

  private getCurrentCoordinates(signal?: AbortSignal): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      let isSettled = false;

      const timeoutId = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          reject({ code: 3, message: `Geolocation timed out after ${this.timeoutMs}ms` });
        }
      }, this.timeoutMs);

      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            if (!isSettled) {
              isSettled = true;
              clearTimeout(timeoutId);
              reject({ code: 3, message: 'Geolocation request aborted by caller' });
            }
          },
          { once: true },
        );
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timeoutId);
            resolve(pos);
          }
        },
        (err) => {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timeoutId);
            reject(err);
          }
        },
        {
          timeout: this.timeoutMs,
          maximumAge: this.maximumAgeMs,
          enableHighAccuracy: this.enableHighAccuracy,
        },
      );
    });
  }
}
