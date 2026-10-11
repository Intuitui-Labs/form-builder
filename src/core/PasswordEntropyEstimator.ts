export interface PasswordEntropyResult {
  score: 0 | 1 | 2 | 3 | 4;
  bits: number;
  feedback: string[];
}

/**
 * Zero-dependency password entropy and pattern strength estimator.
 * Combines Shannon pool entropy with common penalty heuristics to produce
 * actionable human guidance without heavy dictionary dependencies.
 */
export class PasswordEntropyEstimator {
  private static COMMON_SEQUENCES = [
    '123456',
    'password',
    'qwerty',
    'admin',
    'welcome',
    'letmein',
    '111111',
    'abc123',
  ];

  public static estimate(password: unknown): PasswordEntropyResult {
    if (typeof password !== 'string' || password.length === 0) {
      return {
        score: 0,
        bits: 0,
        feedback: ['Enter a password.'],
      };
    }

    const length = password.length;
    let poolSize = 0;
    const feedback: string[] = [];

    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigits = /\d/.test(password);
    const hasSymbols = /[^a-zA-Z0-9]/.test(password);

    if (hasLower) poolSize += 26;
    if (hasUpper) poolSize += 26;
    if (hasDigits) poolSize += 10;
    if (hasSymbols) poolSize += 33;

    if (poolSize === 0) poolSize = 1;

    // Base Shannon entropy: L * log2(poolSize)
    let bits = length * (Math.log(poolSize) / Math.LN2);

    // Heuristic penalties
    const lower = password.toLowerCase();
    for (const seq of this.COMMON_SEQUENCES) {
      if (lower.includes(seq)) {
        bits -= 20;
        feedback.push(`Avoid common words or sequences like "${seq}".`);
        break;
      }
    }

    // Repeated characters penalty (e.g., 'aaa')
    if (/(.)\1{2,}/.test(password)) {
      bits -= 10;
      feedback.push('Avoid repeating identical characters.');
    }

    // Length guidance
    if (length < 8) {
      bits -= 15;
      feedback.push('Make password at least 8 characters long.');
    } else if (length < 12) {
      feedback.push('Passwords with 12 or more characters are significantly more secure.');
    }

    // Diversity guidance
    if (!hasUpper) {
      feedback.push('Add uppercase letters.');
    }
    if (!hasDigits) {
      feedback.push('Add numbers.');
    }
    if (!hasSymbols) {
      feedback.push('Add special symbols.');
    }

    bits = Math.max(0, Math.round(bits));

    let score: 0 | 1 | 2 | 3 | 4;
    if (bits < 25) {
      score = 0;
    } else if (bits < 45) {
      score = 1;
    } else if (bits < 65) {
      score = 2;
    } else if (bits < 85) {
      score = 3;
    } else {
      score = 4;
    }

    return {
      score,
      bits,
      feedback: feedback.length > 0 ? feedback : ['Strong, unique password.'],
    };
  }
}
