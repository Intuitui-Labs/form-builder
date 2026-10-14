import type { AddressCandidate } from '../ports/IAddressAutofillPort.js';
import type { FormField } from '../schema/FormSchema.js';

export interface ExplicitAddressFieldMap {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  countyOrDistrict?: string;
  stateOrProvince?: string;
  postalCode?: string;
  country?: string;
}

export class AddressFieldMapper {
  /**
   * Infers field mappings from an array of FormFields using their semanticIntent
   * or common name conventions.
   */
  public static inferFieldMap(fields: FormField[]): ExplicitAddressFieldMap {
    const map: ExplicitAddressFieldMap = {};

    for (const field of fields) {
      const intent = field.semanticIntent;
      const name = field.name.toLowerCase();

      if (intent === 'address-line1' || (!map.addressLine1 && (name === 'address' || name === 'address1' || name === 'street' || name === 'address_line1' || name === 'line1'))) {
        map.addressLine1 = field.name;
      } else if (intent === 'address-line2' || (!map.addressLine2 && (name === 'address2' || name === 'unit' || name === 'apartment' || name === 'suite' || name === 'address_line2' || name === 'line2'))) {
        map.addressLine2 = field.name;
      } else if (intent === 'address-city' || (!map.city && (name === 'city' || name === 'town'))) {
        map.city = field.name;
      } else if (intent === 'address-state' || (!map.stateOrProvince && (name === 'state' || name === 'province' || name === 'region'))) {
        map.stateOrProvince = field.name;
      } else if (!map.countyOrDistrict && (name === 'county' || name === 'district')) {
        map.countyOrDistrict = field.name;
      } else if (intent === 'address-postal-code' || (!map.postalCode && (name === 'postalcode' || name === 'postal_code' || name === 'zip' || name === 'zipcode' || name === 'pincode'))) {
        map.postalCode = field.name;
      } else if (intent === 'address-country' || (!map.country && (name === 'country' || name === 'country_code'))) {
        map.country = field.name;
      }
    }

    return map;
  }

  /**
   * Maps an AddressCandidate to the corresponding form field names based on an explicit
   * or inferred field mapping.
   */
  public static candidateToFormValues(
    candidate: Partial<AddressCandidate>,
    fieldMap: ExplicitAddressFieldMap,
  ): Record<string, string> {
    const values: Record<string, string> = {};

    if (fieldMap.addressLine1 && candidate.addressLine1 !== undefined) {
      values[fieldMap.addressLine1] = candidate.addressLine1;
    }
    if (fieldMap.addressLine2 && candidate.addressLine2 !== undefined) {
      values[fieldMap.addressLine2] = candidate.addressLine2;
    }
    if (fieldMap.city && candidate.city !== undefined) {
      values[fieldMap.city] = candidate.city;
    }
    if (fieldMap.countyOrDistrict && candidate.countyOrDistrict !== undefined) {
      values[fieldMap.countyOrDistrict] = candidate.countyOrDistrict;
    } else if (fieldMap.stateOrProvince && !fieldMap.countyOrDistrict && candidate.countyOrDistrict !== undefined && !candidate.stateOrProvince) {
      // Fallback district to state if no county field is defined
      values[fieldMap.stateOrProvince] = candidate.countyOrDistrict;
    }
    if (fieldMap.stateOrProvince && candidate.stateOrProvince !== undefined) {
      values[fieldMap.stateOrProvince] = candidate.stateOrProvince;
    }
    if (fieldMap.postalCode && candidate.postalCode !== undefined) {
      values[fieldMap.postalCode] = candidate.postalCode;
    }
    if (fieldMap.country && (candidate.country !== undefined || candidate.countryCode !== undefined)) {
      values[fieldMap.country] = candidate.country ?? candidate.countryCode ?? '';
    }

    return values;
  }
}
