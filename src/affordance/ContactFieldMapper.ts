import type { PickedContact, AddressCandidate } from '../ports/IAddressAutofillPort.js';
import type { FormField } from '../schema/FormSchema.js';
import { AddressFieldMapper, type ExplicitAddressFieldMap } from './AddressFieldMapper.js';
import { NameParser, type ParsedPersonName } from './NameParser.js';

export interface ExplicitContactFieldMap extends ExplicitAddressFieldMap {
  fullName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  prefix?: string;
  suffix?: string;
  email?: string;
  phone?: string;
  companyOrOrganization?: string;
}

/**
 * ContactFieldMapper: Maps native contact picker payloads (W3C Contact Picker API,
 * mobile address books, user profile payloads) to arbitrary form field schemas.
 * Leverages semanticIntent and fuzzy name heuristics to decompose names, formats phones,
 * and cascades embedded postal/geographic addresses.
 */
export class ContactFieldMapper {
  /**
   * Automatically infers contact and address field mappings from schema fields.
   */
  public static inferFieldMap(fields: FormField[]): ExplicitContactFieldMap {
    const addressMap = AddressFieldMapper.inferFieldMap(fields);
    const map: ExplicitContactFieldMap = { ...addressMap };

    for (const field of fields) {
      const intent = field.semanticIntent as string | undefined;
      const name = field.name.toLowerCase();

      // Full Name
      if (
        intent === 'name-full' ||
        intent === 'name' ||
        (!map.fullName && (name === 'fullname' || name === 'full_name' || name === 'name' || name === 'contact_name' || name === 'customer_name'))
      ) {
        map.fullName = field.name;
      }

      // First / Given Name
      if (
        intent === 'name-given' ||
        intent === 'name-first' ||
        intent === 'given-name' ||
        (!map.firstName && (name === 'first_name' || name === 'firstname' || name === 'fname' || name === 'given_name'))
      ) {
        map.firstName = field.name;
      }

      // Middle Name
      if (
        intent === 'name-middle' ||
        intent === 'additional-name' ||
        (!map.middleName && (name === 'middle_name' || name === 'middlename' || name === 'mname'))
      ) {
        map.middleName = field.name;
      }

      // Last / Family Name
      if (
        intent === 'name-family' ||
        intent === 'name-last' ||
        intent === 'family-name' ||
        (!map.lastName && (name === 'last_name' || name === 'lastname' || name === 'lname' || name === 'surname' || name === 'family_name'))
      ) {
        map.lastName = field.name;
      }

      // Prefix / Salutation
      if (
        intent === 'name-prefix' ||
        intent === 'name-salutation' ||
        (!map.prefix && (name === 'prefix' || name === 'salutation' || name === 'title'))
      ) {
        map.prefix = field.name;
      }

      // Suffix
      if (intent === 'name-suffix' || (!map.suffix && name === 'suffix')) {
        map.suffix = field.name;
      }

      // Email
      if (
        intent === 'contact-email' ||
        intent === 'email' ||
        intent === 'work-email' ||
        (!map.email && (name === 'email' || name === 'email_address' || name === 'work_email' || name === 'personal_email'))
      ) {
        map.email = field.name;
      }

      // Phone
      if (
        intent === 'contact-phone' ||
        intent === 'tel' ||
        intent === 'tel-national' ||
        intent === 'phone' ||
        (!map.phone && (name === 'phone' || name === 'mobile' || name === 'tel' || name === 'telephone' || name === 'phone_number' || name === 'cell'))
      ) {
        map.phone = field.name;
      }

      // Organization / Company
      if (
        intent === 'organization-name' ||
        intent === 'organization' ||
        intent === 'company' ||
        (!map.companyOrOrganization && (name === 'company' || name === 'organization' || name === 'org' || name === 'employer'))
      ) {
        map.companyOrOrganization = field.name;
      }
    }

    return map;
  }

  /**
   * Maps a PickedContact object to form values according to the field map.
   */
  public static contactToFormValues(
    contact: Partial<PickedContact>,
    fieldMap: ExplicitContactFieldMap,
  ): Record<string, string> {
    const values: Record<string, string> = {};

    // 1. Process Name Decomposition
    if (contact.name) {
      if (fieldMap.fullName) {
        values[fieldMap.fullName] = contact.name;
      }

      const parsed: ParsedPersonName = NameParser.parse(contact.name);

      if (fieldMap.prefix && parsed.prefix) {
        values[fieldMap.prefix] = parsed.prefix;
      }
      if (fieldMap.firstName && parsed.firstName) {
        values[fieldMap.firstName] = parsed.firstName;
      }
      if (fieldMap.middleName && parsed.middleName) {
        values[fieldMap.middleName] = parsed.middleName;
      }
      if (fieldMap.lastName && (parsed.lastName || parsed.firstName)) {
        // If mononym and no firstName field, map to lastName; otherwise map parsed.lastName
        values[fieldMap.lastName] = parsed.lastName || (!fieldMap.firstName ? parsed.firstName : '');
      }
      if (fieldMap.suffix && parsed.suffix) {
        values[fieldMap.suffix] = parsed.suffix;
      }
    }

    // 2. Process Contact Details (Email & Phone)
    if (fieldMap.email && contact.email) {
      values[fieldMap.email] = contact.email;
    }
    if (fieldMap.phone && contact.tel) {
      values[fieldMap.phone] = contact.tel;
    }

    // 3. Process Embedded Address
    if (contact.address) {
      const addressLines = contact.address.addressLine;
      const line1 = Array.isArray(addressLines) ? addressLines[0] : addressLines;
      const line2 = Array.isArray(addressLines) && addressLines.length > 1
        ? addressLines.slice(1).join(', ')
        : undefined;

      const candidate: Partial<AddressCandidate> = {
        addressLine1: line1,
        addressLine2: line2,
        city: contact.address.city,
        stateOrProvince: contact.address.region,
        postalCode: contact.address.postalCode,
        country: contact.address.country,
      };

      const addressValues = AddressFieldMapper.candidateToFormValues(candidate, fieldMap);
      Object.assign(values, addressValues);
    }

    return values;
  }
}
