import type { NormalizerType } from '../schema/FormSchema.js';

/**
 * Postel's Law Normalization Pipeline:
 * "Be conservative in what you send, liberal in what you accept."
 * Sanitizes and canonicalizes user inputs into clean stored representations.
 */
export class ValueNormalizer {
  /**
   * Trims leading and trailing whitespace from string inputs.
   */
  public static trim(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.trim();
    }
    return value;
  }

  /**
   * Converts string input to lowercase (ideal for emails and usernames).
   */
  public static lowercase(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.toLowerCase().trim();
    }
    return value;
  }

  /**
   * Converts string input to uppercase (ideal for promo codes, postal codes, and stock tickers).
   */
  public static uppercase(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.toUpperCase().trim();
    }
    return value;
  }

  /**
   * Strips all non-digit characters (ideal for account numbers and OTPs).
   */
  public static digitsOnly(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.replace(/\D/g, '');
    }
    if (typeof value === 'number') {
      return String(value).replace(/\D/g, '');
    }
    return value;
  }

  /**
   * Strips spaces, dashes, and non-digits from credit card inputs for clean canonical storage.
   */
  public static cardNumber(value: unknown): unknown {
    return ValueNormalizer.digitsOnly(value);
  }

  /**
   * Normalizes phone inputs by stripping whitespace, parentheses, and hyphens while preserving leading '+'.
   */
  public static phoneE164(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const str = value.trim();
    const hasPlus = str.startsWith('+');
    const digits = str.replace(/\D/g, '');
    return hasPlus ? `+${digits}` : digits;
  }

  /**
   * Dispatches a value through either a named NormalizerType or a custom transformation function.
   */
  public static normalize(
    value: unknown,
    normalizer?: NormalizerType | ((val: unknown) => unknown),
  ): unknown {
    if (!normalizer || value === undefined || value === null) {
      return value;
    }

    if (typeof normalizer === 'function') {
      return normalizer(value);
    }

    switch (normalizer) {
      case 'trim':
        return ValueNormalizer.trim(value);
      case 'lowercase':
        return ValueNormalizer.lowercase(value);
      case 'uppercase':
        return ValueNormalizer.uppercase(value);
      case 'digits-only':
        return ValueNormalizer.digitsOnly(value);
      case 'card-number':
        return ValueNormalizer.cardNumber(value);
      case 'phone-e164':
        return ValueNormalizer.phoneE164(value);
      default:
        return value;
    }
  }
}
