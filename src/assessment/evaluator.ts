import type {
  QuestionRubric,
  SingleChoiceRubric,
  MultipleChoiceRubric,
  NumericRangeRubric,
  TextMatchRubric,
  BooleanRubric,
  SaltedHash,
  QuestionEvaluation,
} from './types.js';

/**
 * 32-bit FNV-1a Hash for zero-dependency client-side deterministic verification
 */
export function fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Pure TypeScript RFC 6234 compliant SHA-256 implementation (0 kB runtime dependency)
 * Provides cryptographically secure salted hashing without requiring browser or node globals.
 */
export function sha256(ascii: string): string {
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i = 0;
  let j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let compositeClear = ascii + '\x80';
  while (compositeClear[lengthProperty] % 64 - 56) compositeClear += '\x00';

  for (i = 0; i < compositeClear[lengthProperty]; i++) {
    j = compositeClear.charCodeAt(i);
    words[i >> 2] = (words[i >> 2] ?? 0) | (j << ((3 - (i % 4)) * 8));
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength | 0;

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;

      const s0 = (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) | 0;
      const s1 = (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10)) | 0;
      w[i] =
        i < 16
          ? (w[i] ?? 0)
          : (((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) | 0);

      const h0 = hash[0] ?? 0;
      const h1 = hash[1] ?? 0;
      const h2 = hash[2] ?? 0;
      const h4 = hash[4] ?? 0;
      const h5 = hash[5] ?? 0;
      const h6 = hash[6] ?? 0;
      const h7 = hash[7] ?? 0;

      const S1 = (rightRotate(h4, 6) ^ rightRotate(h4, 11) ^ rightRotate(h4, 25)) | 0;
      const ch = ((h4 & h5) ^ (~h4 & h6)) | 0;
      const temp1 = (h7 + S1 + ch + (k[i] ?? 0) + (w[i] ?? 0)) | 0;
      const S0 = (rightRotate(h0, 2) ^ rightRotate(h0, 13) ^ rightRotate(h0, 22)) | 0;
      const maj = ((h0 & h1) ^ (h0 & h2) ^ (h1 & h2)) | 0;
      const temp2 = (S0 + maj) | 0;

      hash = [
        (temp1 + temp2) | 0,
        h0,
        h1,
        h2,
        ((hash[3] ?? 0) + temp1) | 0,
        h4,
        h5,
        h6,
      ];
    }

    for (i = 0; i < 8; i++) {
      hash[i] = ((hash[i] ?? 0) + (oldHash[i] ?? 0)) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = ((hash[i] ?? 0) >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

/**
 * Computes deterministic hash for a given value and salt
 */
export function hashSaltedAnswer(
  value: string,
  salt: string,
  algorithm: 'fnv1a32' | 'sha256' = 'sha256'
): string {
  const payload = `${salt}:${value}`;
  return algorithm === 'fnv1a32' ? fnv1a32(payload) : sha256(payload);
}

export interface EvaluationOptions {
  attemptsUsed?: number;
  hintUsed?: boolean;
  latencyMs?: number;
}

export class RubricEvaluator {
  /**
   * Evaluates a user answer against a question rubric.
   */
  public static evaluate(
    fieldId: string,
    rubric: QuestionRubric,
    userAnswer: unknown,
    options: EvaluationOptions = {}
  ): QuestionEvaluation {
    const attempts = Math.max(1, options.attemptsUsed ?? 1);
    const hintUsed = Boolean(options.hintUsed);

    let isCorrect = false;
    let partialCreditRatio = 0;

    switch (rubric.kind) {
      case 'single-choice':
        isCorrect = this.evaluateSingleChoice(rubric, userAnswer);
        partialCreditRatio = isCorrect ? 1 : 0;
        break;

      case 'multiple-choice': {
        const result = this.evaluateMultipleChoice(rubric, userAnswer);
        isCorrect = result.isCorrect;
        partialCreditRatio = result.ratio;
        break;
      }

      case 'numeric-range':
        isCorrect = this.evaluateNumericRange(rubric, userAnswer);
        partialCreditRatio = isCorrect ? 1 : 0;
        break;

      case 'text-match':
        isCorrect = this.evaluateTextMatch(rubric, userAnswer);
        partialCreditRatio = isCorrect ? 1 : 0;
        break;

      case 'boolean':
        isCorrect = this.evaluateBoolean(rubric, userAnswer);
        partialCreditRatio = isCorrect ? 1 : 0;
        break;
    }

    // Apply penalties and scoring calculations
    let score = 0;
    let negativePenalty = 0;

    if (partialCreditRatio > 0) {
      score = rubric.points * partialCreditRatio;

      // Deduct retry penalty if applicable
      if (attempts > 1 && rubric.penaltyPerRetryPercent && rubric.penaltyPerRetryPercent > 0) {
        const retryDeductionFactor = Math.max(
          0,
          1 - (rubric.penaltyPerRetryPercent * (attempts - 1)) / 100
        );
        score *= retryDeductionFactor;
      }

      // Deduct hint penalty if applicable
      if (hintUsed && rubric.hint && rubric.hint.penaltyPercent > 0) {
        const hintDeductionFactor = Math.max(0, 1 - rubric.hint.penaltyPercent / 100);
        score *= hintDeductionFactor;
      }

      score = Math.round(score * 100) / 100;
    } else {
      // Complete mismatch: check negative marking
      if (rubric.negativePoints && rubric.negativePoints > 0) {
        negativePenalty = rubric.negativePoints;
        score = -negativePenalty;
      }
    }

    return {
      fieldId,
      isCorrect,
      score,
      maxPoints: rubric.points,
      negativePenalty,
      partialCreditRatio,
      attemptsUsed: attempts,
      hintUsed,
      explanation: rubric.explanation,
      answeredAt: new Date().toISOString(),
      latencyMs: options.latencyMs,
      userAnswer,
    };
  }

  private static evaluateSingleChoice(rubric: SingleChoiceRubric, answer: unknown): boolean {
    if (answer === undefined || answer === null || answer === '') return false;
    const answerStr = String(answer).trim();

    if (typeof rubric.correctValue === 'string') {
      return answerStr === rubric.correctValue.trim();
    }

    // Salted hash comparison
    const targetHash = rubric.correctValue.hash;
    const computed = hashSaltedAnswer(
      answerStr,
      rubric.correctValue.salt,
      rubric.correctValue.algorithm ?? 'sha256'
    );
    return computed.toLowerCase() === targetHash.toLowerCase();
  }

  private static evaluateMultipleChoice(
    rubric: MultipleChoiceRubric,
    answer: unknown
  ): { isCorrect: boolean; ratio: number } {
    if (!Array.isArray(answer) || answer.length === 0) {
      return { isCorrect: false, ratio: 0 };
    }

    const userSelected = new Set(answer.map((v) => String(v).trim()));
    const correctCount = rubric.correctValues.length;

    // Resolve expected keys (support strings and salted hashes)
    const matchedCount = Array.from(userSelected).filter((sel) => {
      return rubric.correctValues.some((correctVal) => {
        if (typeof correctVal === 'string') {
          return sel === correctVal.trim();
        }
        const computed = hashSaltedAnswer(
          sel,
          correctVal.salt,
          correctVal.algorithm ?? 'sha256'
        );
        return computed.toLowerCase() === correctVal.hash.toLowerCase();
      });
    }).length;

    const wrongCount = userSelected.size - matchedCount;

    switch (rubric.partialCreditStrategy) {
      case 'all-or-nothing': {
        const isExactMatch = matchedCount === correctCount && wrongCount === 0;
        return { isCorrect: isExactMatch, ratio: isExactMatch ? 1 : 0 };
      }

      case 'jaccard': {
        // |Intersection| / |Union|
        const unionSize = correctCount + wrongCount;
        const jaccard = unionSize > 0 ? matchedCount / unionSize : 0;
        const isExact = jaccard === 1;
        return { isCorrect: isExact, ratio: Math.round(jaccard * 100) / 100 };
      }

      case 'proportional-with-penalty': {
        // Proportional reward minus penalty for wrong selections
        const correctFraction = correctCount > 0 ? matchedCount / correctCount : 0;
        const totalOptions = rubric.totalOptionsCount ?? Math.max(correctCount + wrongCount, 4);
        const incorrectOptionsAvailable = Math.max(1, totalOptions - correctCount);
        const penaltyFraction = wrongCount / incorrectOptionsAvailable;

        const ratio = Math.max(0, Math.min(1, correctFraction - penaltyFraction));
        const isExact = ratio === 1 && wrongCount === 0;
        return { isCorrect: isExact, ratio: Math.round(ratio * 100) / 100 };
      }
    }
  }

  private static evaluateNumericRange(rubric: NumericRangeRubric, answer: unknown): boolean {
    if (answer === undefined || answer === null || answer === '') return false;
    const num = typeof answer === 'number' ? answer : Number(answer);
    if (isNaN(num)) return false;

    const diff = Math.abs(num - rubric.targetValue);
    const inclusive = rubric.inclusive !== false;
    return inclusive ? diff <= rubric.tolerance + 1e-9 : diff < rubric.tolerance;
  }

  private static evaluateTextMatch(rubric: TextMatchRubric, answer: unknown): boolean {
    if (answer === undefined || answer === null || answer === '') return false;
    const rawStr = String(answer);
    if (rawStr.length > 2048) {
      return false;
    }
    let answerStr = rawStr;

    if (rubric.trimWhitespace !== false) {
      answerStr = answerStr.trim();
    }
    if (!rubric.caseSensitive) {
      answerStr = answerStr.toLowerCase();
    }
    if (rubric.ignorePunctuation) {
      answerStr = answerStr.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
    }

    // Check canonical list
    const isMatchedInList = rubric.acceptableAnswers.some((accepted) => {
      let target = accepted;
      if (rubric.trimWhitespace !== false) target = target.trim();
      if (!rubric.caseSensitive) target = target.toLowerCase();
      if (rubric.ignorePunctuation) target = target.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
      return answerStr === target;
    });

    if (isMatchedInList) return true;

    // Check optional regex pattern (bounded)
    if (rubric.regexPattern) {
      try {
        const regex = new RegExp(rubric.regexPattern, rubric.caseSensitive ? '' : 'i');
        return regex.test(answerStr);
      } catch {
        return false;
      }
    }

    return false;
  }

  private static evaluateBoolean(rubric: BooleanRubric, answer: unknown): boolean {
    if (answer === undefined || answer === null) return false;
    if (typeof answer === 'boolean') return answer === rubric.correctValue;
    const str = String(answer).trim().toLowerCase();
    const boolVal = str === 'true' || str === '1' || str === 'yes';
    return boolVal === rubric.correctValue;
  }
}
