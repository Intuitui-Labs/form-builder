import type { FieldType, SemanticIntent } from './FormSchema.js';

export interface FieldGuidanceState {
  fieldId: string;
  name: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  helperText?: string;
  formatExample?: string;
  formatMask?: string;
  autoFocus?: boolean;
  isVisible: boolean;
  isFocused?: boolean;
  hasBeenTouched?: boolean;
  isValid: boolean;
  showError: boolean;
  errorMessage?: string;
  autoComplete?: string;
  textContentType?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'decimal-pad' | 'url';
  inputMode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  semanticIntent?: SemanticIntent;
  isSensitive?: boolean;
  privacyRationale?: string;
  shouldAutoAdvance?: boolean;
  cardBrand?: CardBrand;
  entropyScore?: 0 | 1 | 2 | 3 | 4;
  entropyFeedback?: string[];
}

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown';

export interface StepFocusPlan {
  /** The recommended field ID to receive focus automatically upon step entry */
  initialFocusFieldId?: string;
  /** Sequential keyboard traversal order of visible interactive fields */
  traversalOrder: string[];
  /** Return key type per field name: 'next' for intermediate inputs, 'done' for the last */
  returnKeyTypes: Record<string, 'next' | 'done'>;
}

export interface ViewportErgonomicsState {
  keyboardToolbarPlacement: 'above-keyboard' | 'bottom-fixed';
  safeAreaInsetRequired: boolean;
}
