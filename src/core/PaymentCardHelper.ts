import type { CardBrand } from '../schema/FormGuidance.js';

/**
 * Pure mathematical utilities for payment card validation, brand classification,
 * and expiration date comparison without external dependencies.
 */
export class PaymentCardHelper {
  /**
   * Luhn Modulo-10 checksum validation for payment card numbers.
   */
  public static validateLuhn(cardNumber: unknown): boolean {
    if (typeof cardNumber !== 'string' && typeof cardNumber !== 'number') {
      return false;
    }

    const digits = String(cardNumber).replace(/\D/g, '');
    if (digits.length < 2 || digits.length > 19) {
      return false;
    }

    let sum = 0;
    let shouldDouble = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
  }

  /**
   * Identifies the card network brand from leading IIN/BIN prefixes.
   */
  public static detectCardBrand(cardNumber: unknown): CardBrand {
    if (typeof cardNumber !== 'string' && typeof cardNumber !== 'number') {
      return 'unknown';
    }

    const digits = String(cardNumber).replace(/\D/g, '');
    if (digits.length === 0) return 'unknown';

    // American Express: 34, 37
    if (/^3[47]/.test(digits)) {
      return 'amex';
    }

    // Visa: 4
    if (/^4/.test(digits)) {
      return 'visa';
    }

    // Mastercard: 51-55, 2221-2720
    if (/^(?:5[1-5]|2(?:2[2-9][1-9]|2[3-9]|[3-6]|7[0-1]|720))/.test(digits)) {
      return 'mastercard';
    }

    // Discover: 6011, 622126-622925, 644-649, 65
    if (/^(?:6011|65|64[4-9]|622)/.test(digits)) {
      return 'discover';
    }

    return 'unknown';
  }

  /**
   * Returns appropriate CVC length constraints and format mask based on card brand.
   * Note: American Express uses a 4-digit CID on the front; Visa/Mastercard use 3-digit CVV on back.
   */
  public static getCvcSpecs(brand: CardBrand): { minLength: number; maxLength: number; mask: string } {
    if (brand === 'amex') {
      return { minLength: 4, maxLength: 4, mask: '####' };
    }
    return { minLength: 3, maxLength: 4, mask: '###' };
  }

  /**
   * Validates credit card expiration strings (MM/YY or MM/YYYY).
   * Ensures the date is syntactically valid and represents a month on or after the current wall-clock month.
   */
  public static validateCardExpiry(
    expiry: unknown,
    referenceDate: Date = new Date(),
  ): { isValid: boolean; error?: string } {
    if (typeof expiry !== 'string' && typeof expiry !== 'number') {
      return { isValid: false, error: 'Expiration date is required' };
    }

    const str = String(expiry).trim();
    const match = str.match(/^(\d{1,2})[\/\s\-\.]?(\d{2}|\d{4})$/);
    if (!match) {
      return { isValid: false, error: 'Invalid expiration format. Expected MM/YY' };
    }

    const month = parseInt(match[1]!, 10);
    let year = parseInt(match[2]!, 10);

    if (month < 1 || month > 12) {
      return { isValid: false, error: 'Expiration month must be between 01 and 12' };
    }

    // Expand 2-digit year: 26 -> 2026
    if (match[2]!.length === 2) {
      const currentCentury = Math.floor(referenceDate.getUTCFullYear() / 100) * 100;
      year += currentCentury;
    }

    // Card is valid until the very last millisecond of the expiration month UTC
    // Month in JS Date constructor is 0-indexed; passing month (1-12) with day 0 gives last day of target month!
    const expiryEndOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const now = referenceDate.getTime();

    if (expiryEndOfMonth.getTime() < now) {
      return { isValid: false, error: 'Card has expired' };
    }

    return { isValid: true };
  }
}
