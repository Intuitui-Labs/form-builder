export interface AddressCandidate {
  id: string;
  formattedAddress: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  countyOrDistrict?: string;
  stateOrProvince?: string;
  postalCode: string;
  country: string;
  countryCode: string; // ISO 3166-1 alpha-2 (e.g. 'LK', 'US', 'GB')
  confidenceScore?: number; // 0.0 to 1.0
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  rawPayload?: unknown;
}

export interface AddressSearchOptions {
  query: string;
  countryCode?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface ReverseGeocodeOptions {
  latitude: number;
  longitude: number;
  signal?: AbortSignal;
}

export interface PostalCodeLookupOptions {
  postalCode: string;
  countryCode?: string;
  signal?: AbortSignal;
}

/**
 * Outbound Port: Contract for address autocomplete, reverse geocoding,
 * and postal code administrative resolution.
 * Pure TypeScript contract with 0 external dependencies.
 */
export interface IAddressAutofillPort {
  readonly providerId: string;

  /**
   * Search addresses by partial query string (e.g. single-line omni-search).
   * Implementations MUST be fail-safe and respect AbortSignal.
   */
  searchAddresses(options: AddressSearchOptions): Promise<AddressCandidate[]>;

  /**
   * Reverse-geocodes GPS coordinates into a structured address candidate.
   * Returns null if coordinates cannot be resolved.
   */
  lookupByCoordinates(options: ReverseGeocodeOptions): Promise<AddressCandidate | null>;

  /**
   * Resolves a postal code to its administrative hierarchy (City, County/District, Province/State, Country).
   * Returns null if postal code is unknown.
   */
  lookupByPostalCode(options: PostalCodeLookupOptions): Promise<Partial<AddressCandidate> | null>;
}

export interface ContactPickerAddress {
  addressLine?: string[];
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

export interface PickedContact {
  name?: string;
  email?: string;
  tel?: string;
  address?: ContactPickerAddress;
}

/**
 * Outbound Port: Contract for native device contact picking (e.g. W3C Contact Picker API).
 */
export interface IContactPickerPort {
  readonly providerId: string;
  isSupported(): boolean;
  pickContact(options?: { multiple?: boolean; signal?: AbortSignal }): Promise<PickedContact[]>;
}
