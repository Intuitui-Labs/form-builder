/**
 * MaskTokenizer: Pure TypeScript, zero-dependency progressive input masking engine.
 * Solves the classic mobile cursor traps and backspace loops by distinguishing
 * raw values, clean digit streams, and presentation delimiters.
 */

export interface MaskResult {
  formatted: string;
  rawValue: string;
  isComplete: boolean;
}

export class MaskTokenizer {
  /**
   * Applies progressive masking to an input string given a mask pattern.
   * Standard tokens:
   *  - 'Y', 'M', 'D', '#' : alphanumeric/digit placeholders
   *  - '-', '/', '(', ')', ' ', '.' : literal separators
   */
  public static maskDate(input: string, format: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' = 'YYYY-MM-DD'): MaskResult {
    // 1. Extract only digits
    const digits = input.replace(/\D/g, '');
    let formatted = '';
    let digitIdx = 0;

    if (format === 'YYYY-MM-DD') {
      const maxDigits = 8;
      const clean = digits.slice(0, maxDigits);

      for (let i = 0; i < clean.length; i++) {
        if (i === 4 || i === 6) {
          formatted += '-';
        }
        formatted += clean[i];
      }

      return {
        formatted,
        rawValue: formatted,
        isComplete: clean.length === 8,
      };
    }

    if (format === 'MM/DD/YYYY' || format === 'DD/MM/YYYY') {
      const maxDigits = 8;
      const clean = digits.slice(0, maxDigits);

      for (let i = 0; i < clean.length; i++) {
        if (i === 2 || i === 4) {
          formatted += '/';
        }
        formatted += clean[i];
      }

      return {
        formatted,
        rawValue: formatted,
        isComplete: clean.length === 8,
      };
    }

    return { formatted: input, rawValue: input, isComplete: false };
  }

  /**
   * Masks US/international phone numbers into standard presentation: (###) ###-####
   */
  public static maskPhone(input: string): MaskResult {
    const digits = input.replace(/\D/g, '').slice(0, 10);
    let formatted = '';

    if (digits.length === 0) {
      return { formatted: '', rawValue: '', isComplete: false };
    }

    if (digits.length <= 3) {
      formatted = `(${digits}`;
    } else if (digits.length <= 6) {
      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }

    return {
      formatted,
      rawValue: digits,
      isComplete: digits.length === 10,
    };
  }

  /**
   * Generic progressive formatter based on custom mask string.
   * e.g., '##-#######' (IRS EIN)
   */
  public static maskPattern(input: string, maskPattern: string): MaskResult {
    const chars = input.replace(/[^a-zA-Z0-9]/g, '');
    let formatted = '';
    let charIdx = 0;

    for (let i = 0; i < maskPattern.length; i++) {
      const patternChar = maskPattern[i]!;
      const isSlot = /[#XYMD]/i.test(patternChar);

      if (isSlot) {
        if (charIdx < chars.length) {
          formatted += chars[charIdx++];
        } else {
          break;
        }
      } else {
        if (charIdx > 0 && charIdx <= chars.length) {
          formatted += patternChar;
        }
      }
    }

    const totalSlots = (maskPattern.match(/[#XYMD]/gi) || []).length;
    return {
      formatted,
      rawValue: chars,
      isComplete: charIdx >= totalSlots,
    };
  }
}
