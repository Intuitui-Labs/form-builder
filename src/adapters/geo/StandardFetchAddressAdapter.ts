import type {
  AddressCandidate,
  AddressSearchOptions,
  IAddressAutofillPort,
  PostalCodeLookupOptions,
  ReverseGeocodeOptions,
} from '../../ports/IAddressAutofillPort.js';

export interface StandardFetchAddressOptions {
  searchUrlTemplate?: string | ((options: AddressSearchOptions) => string);
  reverseUrlTemplate?: string | ((options: ReverseGeocodeOptions) => string);
  postalUrlTemplate?: string | ((options: PostalCodeLookupOptions) => string);
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  headers?: Record<string, string>;
  parseSearchResponse?: (data: unknown) => AddressCandidate[];
  parseReverseResponse?: (data: unknown) => AddressCandidate | null;
  parsePostalResponse?: (data: unknown) => Partial<AddressCandidate> | null;
}

/**
 * Standard fetch-based address autofill adapter.
 * Resilient against network drops, DNS failures, 4xx/5xx HTTP codes, and slow responses.
 * Default parser targets the standard GeoJSON / Photon format.
 */
export class StandardFetchAddressAdapter implements IAddressAutofillPort {
  readonly providerId = 'standard-fetch';
  private searchUrlTemplate: string | ((options: AddressSearchOptions) => string);
  private reverseUrlTemplate: string | ((options: ReverseGeocodeOptions) => string);
  private postalUrlTemplate?: string | ((options: PostalCodeLookupOptions) => string);
  private timeoutMs: number;
  private fetchFn: typeof fetch;
  private headers: Record<string, string>;
  private parseSearchResponse: (data: unknown) => AddressCandidate[];
  private parseReverseResponse: (data: unknown) => AddressCandidate | null;
  private parsePostalResponse: (data: unknown) => Partial<AddressCandidate> | null;

  constructor(options?: StandardFetchAddressOptions) {
    this.searchUrlTemplate =
      options?.searchUrlTemplate ??
      'https://photon.komoot.io/api/?q={query}&limit={limit}';
    this.reverseUrlTemplate =
      options?.reverseUrlTemplate ??
      'https://photon.komoot.io/reverse?lon={longitude}&lat={latitude}';
    this.postalUrlTemplate = options?.postalUrlTemplate;
    this.timeoutMs = options?.timeoutMs ?? 4000;
    this.fetchFn = options?.fetchFn ?? (globalThis.fetch ? globalThis.fetch.bind(globalThis) : async () => { throw new Error('fetch unavailable'); });
    this.headers = options?.headers ?? {
      'Accept': 'application/json',
      'User-Agent': 'IntuituiFormBuilderEngine/1.0',
    };
    this.parseSearchResponse = options?.parseSearchResponse ?? this.defaultGeoJsonSearchParser;
    this.parseReverseResponse = options?.parseReverseResponse ?? this.defaultGeoJsonReverseParser;
    this.parsePostalResponse = options?.parsePostalResponse ?? this.defaultPostalParser;
  }

  async searchAddresses(options: AddressSearchOptions): Promise<AddressCandidate[]> {
    const trimmed = options.query?.trim();
    if (!trimmed || trimmed.length < 2) {
      return [];
    }

    const url =
      typeof this.searchUrlTemplate === 'function'
        ? this.searchUrlTemplate(options)
        : this.searchUrlTemplate
            .replace('{query}', encodeURIComponent(trimmed))
            .replace('{limit}', String(options.limit ?? 5))
            .replace('{countryCode}', encodeURIComponent(options.countryCode ?? ''));

    try {
      const data = await this.executeFetch(url, options.signal);
      return this.parseSearchResponse(data);
    } catch {
      // Fail-safe: Network errors, aborted requests, or malformed JSON return empty array
      return [];
    }
  }

  async lookupByCoordinates(options: ReverseGeocodeOptions): Promise<AddressCandidate | null> {
    const url =
      typeof this.reverseUrlTemplate === 'function'
        ? this.reverseUrlTemplate(options)
        : this.reverseUrlTemplate
            .replace('{latitude}', String(options.latitude))
            .replace('{longitude}', String(options.longitude));

    try {
      const data = await this.executeFetch(url, options.signal);
      return this.parseReverseResponse(data);
    } catch {
      return null;
    }
  }

  async lookupByPostalCode(options: PostalCodeLookupOptions): Promise<Partial<AddressCandidate> | null> {
    if (!options.postalCode?.trim()) return null;

    if (this.postalUrlTemplate) {
      const url =
        typeof this.postalUrlTemplate === 'function'
          ? this.postalUrlTemplate(options)
          : this.postalUrlTemplate
              .replace('{postalCode}', encodeURIComponent(options.postalCode.trim()))
              .replace('{countryCode}', encodeURIComponent(options.countryCode ?? ''));

      try {
        const data = await this.executeFetch(url, options.signal);
        return this.parsePostalResponse(data);
      } catch {
        return null;
      }
    }

    // Fallback: search by postal code query
    const results = await this.searchAddresses({
      query: options.postalCode,
      countryCode: options.countryCode,
      limit: 1,
      signal: options.signal,
    });

    if (results.length > 0) {
      const best = results[0];
      return {
        postalCode: best.postalCode || options.postalCode,
        city: best.city,
        countyOrDistrict: best.countyOrDistrict,
        stateOrProvince: best.stateOrProvince,
        country: best.country,
        countryCode: best.countryCode,
      };
    }

    return null;
  }

  private async executeFetch(url: string, externalSignal?: AbortSignal): Promise<unknown> {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      timeoutController.abort(new Error(`Address request timed out after ${this.timeoutMs}ms`));
    }, this.timeoutMs);

    let combinedSignal = timeoutController.signal;
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timeoutId);
        throw new Error('External request aborted');
      }
      // Chain signals if AbortSignal.any is available, otherwise listen
      if (typeof AbortSignal.any === 'function') {
        combinedSignal = AbortSignal.any([timeoutController.signal, externalSignal]);
      } else {
        externalSignal.addEventListener('abort', () => timeoutController.abort(externalSignal.reason), { once: true });
      }
    }

    try {
      const response = await this.fetchFn(url, {
        method: 'GET',
        headers: this.headers,
        signal: combinedSignal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private defaultGeoJsonSearchParser(data: unknown): AddressCandidate[] {
    const root = data as { features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: [number, number] } }> };
    if (!root || !Array.isArray(root.features)) return [];

    return root.features.map((feature, idx) => {
      const p = feature.properties ?? {};
      const coords = feature.geometry?.coordinates;
      const street = String(p.street ?? p.name ?? '');
      const houseNumber = p.housenumber ? `${p.housenumber} ` : '';
      const addressLine1 = `${houseNumber}${street}`.trim() || String(p.name ?? '');
      const city = String(p.city ?? p.town ?? p.village ?? p.locality ?? '');
      const countyOrDistrict = String(p.district ?? p.county ?? '');
      const stateOrProvince = String(p.state ?? p.province ?? '');
      const postalCode = String(p.postcode ?? '');
      const country = String(p.country ?? '');
      const countryCode = String(p.countrycode ?? '').toUpperCase();

      const parts = [addressLine1, city, countyOrDistrict, stateOrProvince, postalCode, country].filter(Boolean);

      return {
        id: String(p.osm_id ?? `candidate_${idx}`),
        formattedAddress: parts.join(', '),
        addressLine1,
        city,
        countyOrDistrict,
        stateOrProvince,
        postalCode,
        country,
        countryCode,
        coordinates: coords ? { longitude: coords[0], latitude: coords[1] } : undefined,
        rawPayload: p,
      };
    });
  }

  private defaultGeoJsonReverseParser(data: unknown): AddressCandidate | null {
    const list = this.defaultGeoJsonSearchParser(data);
    return list.length > 0 ? list[0] : null;
  }

  private defaultPostalParser(data: unknown): Partial<AddressCandidate> | null {
    const list = this.defaultGeoJsonSearchParser(data);
    if (list.length > 0) {
      return {
        postalCode: list[0].postalCode,
        city: list[0].city,
        countyOrDistrict: list[0].countyOrDistrict,
        stateOrProvince: list[0].stateOrProvince,
        country: list[0].country,
        countryCode: list[0].countryCode,
      };
    }
    return null;
  }
}
