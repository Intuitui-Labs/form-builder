import type {
  AddressCandidate,
  AddressSearchOptions,
  IAddressAutofillPort,
  PostalCodeLookupOptions,
  ReverseGeocodeOptions,
} from '../../ports/IAddressAutofillPort.js';

export interface CompositeAddressAutofillOptions {
  providers: IAddressAutofillPort[];
  mergeSearchResults?: boolean;
}

/**
 * Composite adapter chaining multiple address autofill providers with fail-safe fallback.
 * If a high-priority provider throws or fails, it cascades gracefully to the next provider.
 */
export class CompositeAddressAutofillAdapter implements IAddressAutofillPort {
  readonly providerId = 'composite';
  private providers: IAddressAutofillPort[];
  private mergeSearchResults: boolean;

  constructor(options: CompositeAddressAutofillOptions | IAddressAutofillPort[]) {
    if (Array.isArray(options)) {
      this.providers = options;
      this.mergeSearchResults = false;
    } else {
      this.providers = options.providers;
      this.mergeSearchResults = options.mergeSearchResults ?? false;
    }
  }

  async searchAddresses(options: AddressSearchOptions): Promise<AddressCandidate[]> {
    if (this.providers.length === 0) return [];

    if (this.mergeSearchResults) {
      const merged: AddressCandidate[] = [];
      const seenIds = new Set<string>();

      for (const provider of this.providers) {
        try {
          const results = await provider.searchAddresses(options);
          for (const cand of results) {
            if (!seenIds.has(cand.id)) {
              seenIds.add(cand.id);
              merged.push(cand);
            }
          }
          if (options.limit && merged.length >= options.limit) break;
        } catch {
          // Continue to next provider on failure
        }
      }
      return options.limit ? merged.slice(0, options.limit) : merged;
    }

    // Default: sequential fallback
    for (const provider of this.providers) {
      try {
        const results = await provider.searchAddresses(options);
        if (results && results.length > 0) {
          return results;
        }
      } catch {
        // Fallback to next provider
      }
    }

    return [];
  }

  async lookupByCoordinates(options: ReverseGeocodeOptions): Promise<AddressCandidate | null> {
    for (const provider of this.providers) {
      try {
        const result = await provider.lookupByCoordinates(options);
        if (result) return result;
      } catch {
        // Fallback to next provider
      }
    }
    return null;
  }

  async lookupByPostalCode(options: PostalCodeLookupOptions): Promise<Partial<AddressCandidate> | null> {
    for (const provider of this.providers) {
      try {
        const result = await provider.lookupByPostalCode(options);
        if (result && (result.city || result.countyOrDistrict || result.stateOrProvince)) {
          return result;
        }
      } catch {
        // Fallback to next provider
      }
    }
    return null;
  }
}
