import type { SemanticIntent } from '../schema/FormSchema.js';

export interface ResolvedSemanticMetadata {
  keyboardType: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'decimal-pad' | 'url';
  inputMode: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
  autoCapitalize: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect: boolean;
  autoComplete: string;
  textContentType: string;
  isSensitive: boolean;
  formatMask?: string;
  defaultHelperText?: string;
}

const INTENT_REGISTRY: Record<SemanticIntent, ResolvedSemanticMetadata> = {
  // Authentication & Passkeys
  'username': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'username',
    textContentType: 'username',
    isSensitive: false,
  },
  'current-password': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'current-password',
    textContentType: 'password',
    isSensitive: true,
  },
  'new-password': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'new-password',
    textContentType: 'newPassword',
    isSensitive: true,
  },
  'one-time-code': {
    keyboardType: 'numeric',
    inputMode: 'numeric',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'one-time-code',
    textContentType: 'oneTimeCode',
    isSensitive: true,
    formatMask: '###-###',
  },
  'webauthn-passkey': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'webauthn',
    textContentType: 'username',
    isSensitive: false,
  },

  // Payment & Billing
  'payment-card-number': {
    keyboardType: 'numeric',
    inputMode: 'numeric',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'cc-number',
    textContentType: 'creditCardNumber',
    isSensitive: false,
    formatMask: '#### #### #### ####',
  },
  'payment-card-expiry': {
    keyboardType: 'numeric',
    inputMode: 'numeric',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'cc-exp',
    textContentType: 'none',
    isSensitive: false,
    formatMask: '##/##',
  },
  'payment-card-cvc': {
    keyboardType: 'numeric',
    inputMode: 'numeric',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'cc-csc',
    textContentType: 'none',
    isSensitive: true, // PCI-DSS: CVC must never be stored in persistent drafts
    formatMask: '####',
  },
  'payment-card-holder': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'words',
    autoCorrect: false,
    autoComplete: 'cc-name',
    textContentType: 'name',
    isSensitive: false,
  },

  // Physical Address & Location
  'address-line1': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'words',
    autoCorrect: true,
    autoComplete: 'address-line1',
    textContentType: 'streetAddressLine1',
    isSensitive: false,
  },
  'address-line2': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'words',
    autoCorrect: true,
    autoComplete: 'address-line2',
    textContentType: 'streetAddressLine2',
    isSensitive: false,
  },
  'address-city': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'words',
    autoCorrect: true,
    autoComplete: 'address-level2',
    textContentType: 'addressCity',
    isSensitive: false,
  },
  'address-state': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'characters',
    autoCorrect: false,
    autoComplete: 'address-level1',
    textContentType: 'addressState',
    isSensitive: false,
  },
  'address-postal-code': {
    keyboardType: 'numeric',
    inputMode: 'numeric',
    autoCapitalize: 'characters',
    autoCorrect: false,
    autoComplete: 'postal-code',
    textContentType: 'postalCode',
    isSensitive: false,
  },
  'address-country': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'words',
    autoCorrect: true,
    autoComplete: 'country-name',
    textContentType: 'countryName',
    isSensitive: false,
  },

  // Personal & Identity
  'name-full': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'words',
    autoCorrect: false,
    autoComplete: 'name',
    textContentType: 'name',
    isSensitive: false,
  },
  'name-given': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'words',
    autoCorrect: false,
    autoComplete: 'given-name',
    textContentType: 'givenName',
    isSensitive: false,
  },
  'name-middle': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'words',
    autoCorrect: false,
    autoComplete: 'additional-name',
    textContentType: 'middleName',
    isSensitive: false,
  },
  'name-family': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'words',
    autoCorrect: false,
    autoComplete: 'family-name',
    textContentType: 'familyName',
    isSensitive: false,
  },
  'name-prefix': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'words',
    autoCorrect: false,
    autoComplete: 'honorific-prefix',
    textContentType: 'namePrefix',
    isSensitive: false,
  },
  'name-suffix': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'words',
    autoCorrect: false,
    autoComplete: 'honorific-suffix',
    textContentType: 'nameSuffix',
    isSensitive: false,
  },
  'organization-name': {
    keyboardType: 'default',
    inputMode: 'text',
    autoCapitalize: 'words',
    autoCorrect: false,
    autoComplete: 'organization',
    textContentType: 'organizationName',
    isSensitive: false,
  },
  'contact-email': {
    keyboardType: 'email-address',
    inputMode: 'email',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'email',
    textContentType: 'emailAddress',
    isSensitive: false,
  },
  'contact-phone': {
    keyboardType: 'phone-pad',
    inputMode: 'tel',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'tel',
    textContentType: 'telephoneNumber',
    isSensitive: false,
  },
  'birth-date': {
    keyboardType: 'numeric',
    inputMode: 'numeric',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'bday',
    textContentType: 'none',
    isSensitive: false,
    formatMask: '####-##-##',
  },
  'identity-tax-id': {
    keyboardType: 'numeric',
    inputMode: 'numeric',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'off',
    textContentType: 'none',
    isSensitive: true,
  },
};

/**
 * Pure, deterministic resolver mapping a SemanticIntent to its unified
 * OS autofill, virtual keyboard, security, and capitalization attributes.
 */
export function resolveSemanticIntent(intent?: SemanticIntent): ResolvedSemanticMetadata | undefined {
  if (!intent) return undefined;
  return INTENT_REGISTRY[intent];
}
