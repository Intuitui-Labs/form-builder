import type {
  AddressCandidate,
  AddressSearchOptions,
  IAddressAutofillPort,
  PostalCodeLookupOptions,
  ReverseGeocodeOptions,
} from '../../ports/IAddressAutofillPort.js';

export class NullAddressAutofillAdapter implements IAddressAutofillPort {
  readonly providerId = 'null';

  async searchAddresses(_options: AddressSearchOptions): Promise<AddressCandidate[]> {
    return [];
  }

  async lookupByCoordinates(_options: ReverseGeocodeOptions): Promise<AddressCandidate | null> {
    return null;
  }

  async lookupByPostalCode(_options: PostalCodeLookupOptions): Promise<Partial<AddressCandidate> | null> {
    return null;
  }
}
