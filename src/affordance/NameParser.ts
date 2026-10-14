export interface ParsedPersonName {
  raw: string;
  prefix?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
}

/**
 * NameParser: Lightweight, culturally-aware heuristic name decomposition engine.
 * Handles single mononyms, multi-part compound surnames (Germanic, Dutch, Romance, Arabic),
 * honorific prefixes/salutations, post-nominal suffixes, initials, and "Last, First" inverted formats.
 * Zero external dependencies.
 */
export class NameParser {
  private static readonly PREFIXES = new Set([
    'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'miss',
    'dr', 'dr.', 'prof', 'prof.', 'rev', 'rev.',
    'hon', 'hon.', 'sir', 'dame', 'capt', 'capt.',
    'lord', 'lady', 'madam', 'monsieur', 'herr', 'frau',
  ]);

  private static readonly SUFFIXES = new Set([
    'jr', 'jr.', 'sr', 'sr.',
    'ii', 'iii', 'iv', 'v',
    'esq', 'esq.', 'phd', 'md', 'dds', 'cfa', 'cpa',
    'dphil', 'obe', 'mbe', 'kbe', 'ret', 'ret.',
  ]);

  private static readonly COMPOUND_PARTICLES = new Set([
    'van', 'von', 'der', 'den', 'ter',
    'de', 'del', 'della', 'degli', 'da', 'das', 'do', 'dos',
    'di', 'du', 'la', 'le',
    'al', 'el', 'bin', 'ibn', 'ben', 'bar',
    'san', 'santa', 'st', 'st.',
  ]);

  /**
   * Parse a raw name string into structured components.
   */
  public static parse(input: string): ParsedPersonName {
    const raw = (input || '').trim();
    if (!raw) {
      return { raw: '', firstName: '', lastName: '' };
    }

    // 1. Detect inverted comma format: "Lovelace, Ada" or "King, Jr., Martin Luther"
    if (raw.includes(',')) {
      const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const lastName = parts[0];
        let suffix: string | undefined;
        let givenPart = '';

        if (parts.length === 3 && this.SUFFIXES.has(parts[1].toLowerCase())) {
          suffix = parts[1];
          givenPart = parts[2];
        } else if (parts.length >= 3 && this.SUFFIXES.has(parts[parts.length - 1].toLowerCase())) {
          suffix = parts[parts.length - 1];
          givenPart = parts.slice(1, -1).join(' ');
        } else {
          givenPart = parts.slice(1).join(' ');
        }

        let givenTokens = givenPart.split(/\s+/).filter(Boolean);
        let prefix: string | undefined;
        if (givenTokens.length > 1 && this.PREFIXES.has(givenTokens[0].toLowerCase())) {
          prefix = givenTokens[0];
          givenTokens = givenTokens.slice(1);
        }
        if (givenTokens.length > 1 && !suffix && this.SUFFIXES.has(givenTokens[givenTokens.length - 1].toLowerCase())) {
          suffix = givenTokens[givenTokens.length - 1];
          givenTokens = givenTokens.slice(0, -1);
        }

        const firstName = givenTokens[0] || '';
        const middleName = givenTokens.length > 1 ? givenTokens.slice(1).join(' ') : undefined;

        return {
          raw,
          prefix,
          firstName,
          middleName,
          lastName,
          suffix,
        };
      }
    }

    return this.parseLinear(raw);
  }

  private static parseLinear(raw: string): ParsedPersonName {
    let tokens = raw.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return { raw, firstName: '', lastName: '' };
    }

    let prefix: string | undefined;
    let suffix: string | undefined;

    // Check prefix at start
    if (tokens.length > 1 && this.PREFIXES.has(tokens[0].toLowerCase())) {
      prefix = tokens[0];
      tokens = tokens.slice(1);
    }

    // Check suffix at end
    if (tokens.length > 1 && this.SUFFIXES.has(tokens[tokens.length - 1].toLowerCase())) {
      suffix = tokens[tokens.length - 1];
      tokens = tokens.slice(0, -1);
    }

    // Mononym: single name remaining
    if (tokens.length === 1) {
      return {
        raw,
        prefix,
        firstName: tokens[0],
        lastName: '',
        suffix,
      };
    }

    // Two tokens: standard "First Last"
    if (tokens.length === 2) {
      return {
        raw,
        prefix,
        firstName: tokens[0],
        lastName: tokens[1],
        suffix,
      };
    }

    // 3 or more tokens: detect compound surname particles (e.g., 'van der Bellen', 'da Vinci', 'de la Cruz')
    let compoundStartIndex = -1;
    for (let i = 1; i < tokens.length; i++) {
      if (this.COMPOUND_PARTICLES.has(tokens[i].toLowerCase())) {
        compoundStartIndex = i;
        break;
      }
    }

    if (compoundStartIndex !== -1) {
      const firstNameTokens = tokens.slice(0, compoundStartIndex);
      const lastNameTokens = tokens.slice(compoundStartIndex);

      const firstName = firstNameTokens[0];
      const middleName = firstNameTokens.length > 1 ? firstNameTokens.slice(1).join(' ') : undefined;
      const lastName = lastNameTokens.join(' ');

      return {
        raw,
        prefix,
        firstName,
        middleName,
        lastName,
        suffix,
      };
    }

    // Check for initials at beginning (e.g. "K. P. Silva" or "W. M. Mendis")
    if (tokens.length >= 3 && tokens[0].endsWith('.') && tokens[1].endsWith('.')) {
      const firstName = `${tokens[0]} ${tokens[1]}`;
      const middleTokens = tokens.slice(2, -1);
      const middleName = middleTokens.length > 0 ? middleTokens.join(' ') : undefined;
      const lastName = tokens[tokens.length - 1];

      return {
        raw,
        prefix,
        firstName,
        middleName,
        lastName,
        suffix,
      };
    }

    // Standard multi-part: First Middle... Last
    const firstName = tokens[0];
    const middleTokens = tokens.slice(1, -1);
    const middleName = middleTokens.length > 0 ? middleTokens.join(' ') : undefined;
    const lastName = tokens[tokens.length - 1];

    return {
      raw,
      prefix,
      firstName,
      middleName,
      lastName,
      suffix,
    };
  }
}
