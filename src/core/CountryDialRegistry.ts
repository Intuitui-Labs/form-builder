/**
 * CountryDialRegistry: Lightweight, zero-dependency international dial code registry and fuzzy search.
 * Bundle size < 6 kB, pure TypeScript, uses native Unicode emoji flags to avoid asset bloat.
 */

export interface CountryDialItem {
  iso: string; // ISO 3166-1 alpha-2
  name: string;
  dialCode: string; // e.g. "+1"
  flag: string; // Unicode flag emoji
  format?: string; // Standard format placeholder
}

export const POPULAR_COUNTRIES: CountryDialItem[] = [
  { iso: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', format: '(###) ###-####' },
  { iso: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', format: '#### ######' },
  { iso: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦', format: '(###) ###-####' },
  { iso: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺', format: '#### ### ###' },
  { iso: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪', format: '#### #######' },
  { iso: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷', format: '## ## ## ## ##' },
  { iso: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', format: '##### #####' },
  { iso: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵', format: '###-####-####' },
  { iso: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬', format: '#### ####' },
  { iso: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷', format: '(##) #####-####' },
  { iso: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸', format: '### ## ## ##' },
  { iso: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹', format: '### #######' },
  { iso: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱', format: '## ########' },
  { iso: 'SE', name: 'Sweden', dialCode: '+46', flag: '🇸🇪', format: '###-### ## ##' },
  { iso: 'CH', name: 'Switzerland', dialCode: '+41', flag: '🇨🇭', format: '## ### ## ##' },
  { iso: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽', format: '## #### ####' },
  { iso: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪', format: '## ### ####' },
  { iso: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦', format: '## ### ####' },
  { iso: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿', format: '### ### ####' },
  { iso: 'IE', name: 'Ireland', dialCode: '+353', flag: '🇮🇪', format: '## ### ####' },
  { iso: 'KR', name: 'South Korea', dialCode: '+82', flag: '🇰🇷', format: '##-####-####' },
  { iso: 'IL', name: 'Israel', dialCode: '+972', flag: '🇮🇱', format: '##-###-####' },
  { iso: 'NO', name: 'Norway', dialCode: '+47', flag: '🇳🇴', format: '### ## ###' },
  { iso: 'DK', name: 'Denmark', dialCode: '+45', flag: '🇩🇰', format: '## ## ## ##' },
  { iso: 'FI', name: 'Finland', dialCode: '+358', flag: '🇫🇮', format: '## ### ####' },
];

export class CountryDialRegistry {
  private static list: CountryDialItem[] = POPULAR_COUNTRIES;

  public static getAll(): CountryDialItem[] {
    return this.list;
  }

  public static findByIso(iso: string): CountryDialItem | undefined {
    return this.list.find((c) => c.iso.toUpperCase() === iso.toUpperCase());
  }

  public static findByDialCode(dialCode: string): CountryDialItem | undefined {
    const clean = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;
    return this.list.find((c) => c.dialCode === clean);
  }

  /**
   * Search by country name prefix, ISO code, or dial code digits.
   * e.g., 'fra' -> France (+33), '44' -> UK (+44), 'US' -> United States (+1)
   */
  public static search(query: string): CountryDialItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.list;

    const digitsOnly = q.replace(/\D/g, '');

    return this.list.filter((c) => {
      // 1. Direct dial code match
      if (digitsOnly && c.dialCode.replace('+', '').startsWith(digitsOnly)) {
        return true;
      }
      // 2. ISO match
      if (c.iso.toLowerCase() === q) {
        return true;
      }
      // 3. Name substring or prefix match
      return c.name.toLowerCase().includes(q);
    });
  }

  /**
   * Formats into a clean E.164 phone string.
   */
  public static toE164(dialCode: string, nationalDigits: string): string {
    const cleanDial = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;
    const cleanDigits = nationalDigits.replace(/\D/g, '');
    return `${cleanDial}${cleanDigits}`;
  }
}
