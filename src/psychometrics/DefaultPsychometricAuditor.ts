import type {
  IPsychometricAuditorPort,
  PsychometricAuditResult,
  PsychometricAnomalyFlag,
  CronbachAlphaResult,
  QuestionMetadata,
  AuditRecommendation,
} from '../ports/IPsychometricAuditorPort.js';

export class DefaultPsychometricAuditor implements IPsychometricAuditorPort {
  private readonly straightLiningThreshold = 0.80; // >= 80% identical answers
  private readonly speederAverageThresholdMs = 350; // sub-350ms average per item
  private readonly speederItemMinThresholdMs = 200; // items clicked in < 200ms

  public calculateCronbachAlpha(matrix: number[][]): CronbachAlphaResult {
    const sampleCount = matrix.length;
    if (sampleCount < 2) {
      return {
        alpha: 0.0,
        interpretation: 'Need at least 2 responses for reliability analysis',
        itemCount: matrix[0]?.length ?? 0,
        sampleCount,
        itemVariances: [],
        totalVariance: 0.0,
      };
    }

    const itemCount = matrix[0]!.length;
    if (itemCount < 2) {
      return {
        alpha: 0.0,
        interpretation: 'Need at least 2 Likert/rating questions',
        itemCount,
        sampleCount,
        itemVariances: [],
        totalVariance: 0.0,
      };
    }

    // 1. Calculate variance per item (column) with Bessel's correction (N - 1)
    const itemVariances: number[] = [];
    let sumItemVariances = 0;

    for (let col = 0; col < itemCount; col++) {
      let sum = 0;
      for (let row = 0; row < sampleCount; row++) {
        sum += matrix[row]![col]!;
      }
      const mean = sum / sampleCount;

      let sqDiffSum = 0;
      for (let row = 0; row < sampleCount; row++) {
        const diff = matrix[row]![col]! - mean;
        sqDiffSum += diff * diff;
      }
      const variance = sqDiffSum / (sampleCount - 1);
      itemVariances.push(variance);
      sumItemVariances += variance;
    }

    // 2. Calculate variance of total scores per respondent (row sums)
    const rowTotals: number[] = [];
    let totalSum = 0;
    for (let row = 0; row < sampleCount; row++) {
      let rSum = 0;
      for (let col = 0; col < itemCount; col++) {
        rSum += matrix[row]![col]!;
      }
      rowTotals.push(rSum);
      totalSum += rSum;
    }
    const meanTotal = totalSum / sampleCount;

    let totalSqDiffSum = 0;
    for (let row = 0; row < sampleCount; row++) {
      const diff = rowTotals[row]! - meanTotal;
      totalSqDiffSum += diff * diff;
    }
    const totalVariance = totalSqDiffSum / (sampleCount - 1);

    // Singularity protection: Zero total variance means all respondents answered identically
    if (totalVariance === 0 || Number.isNaN(totalVariance)) {
      return {
        alpha: 0.0,
        interpretation: 'No variance in responses',
        itemCount,
        sampleCount,
        itemVariances,
        totalVariance: 0.0,
      };
    }

    // Cronbach's alpha formula: (k / (k - 1)) * (1 - sum(item_var) / total_var)
    const rawAlpha = (itemCount / (itemCount - 1)) * (1 - sumItemVariances / totalVariance);
    const clampedAlpha = Math.max(-1.0, Math.min(1.0, Math.round(rawAlpha * 100) / 100));

    let interpretation = '';
    if (clampedAlpha >= 0.9) {
      interpretation = 'Excellent reliability';
    } else if (clampedAlpha >= 0.8) {
      interpretation = 'Good reliability';
    } else if (clampedAlpha >= 0.7) {
      interpretation = 'Acceptable reliability';
    } else if (clampedAlpha >= 0.6) {
      interpretation = 'Questionable reliability';
    } else if (clampedAlpha >= 0.5) {
      interpretation = 'Poor reliability';
    } else if (clampedAlpha >= 0) {
      interpretation = 'Unacceptable reliability';
    } else {
      interpretation = 'Negative reliability — check reverse-coded or inconsistent items';
    }

    return {
      alpha: clampedAlpha,
      interpretation,
      itemCount,
      sampleCount,
      itemVariances,
      totalVariance: Math.round(totalVariance * 1000) / 1000,
    };
  }

  public auditSubmission(params: {
    answers: Record<string, unknown>;
    dwellTimesMs?: Record<string, number>;
    totalDurationMs?: number;
    questions: QuestionMetadata[];
  }): PsychometricAuditResult {
    const { answers, dwellTimesMs, totalDurationMs, questions } = params;

    // Filter to scale-based items (likert and rating)
    const scaleQuestions = questions.filter(
      (q) => q.type === 'likert' || q.type === 'rating'
    );
    const analyzedCount = scaleQuestions.length;

    const flags: PsychometricAnomalyFlag[] = [];
    const values: number[] = [];
    const valueCounts = new Map<number, number>();

    for (const q of scaleQuestions) {
      const val = answers[q.name] ?? answers[q.id];
      if (typeof val === 'number') {
        values.push(val);
        valueCounts.set(val, (valueCounts.get(val) ?? 0) + 1);
      } else if (typeof val === 'string' && !Number.isNaN(Number(val)) && val.trim() !== '') {
        const numVal = Number(val);
        values.push(numVal);
        valueCounts.set(numVal, (valueCounts.get(numVal) ?? 0) + 1);
      }
    }

    // 1. Straight-lining analysis
    let maxFrequency = 0;
    for (const count of valueCounts.values()) {
      if (count > maxFrequency) {
        maxFrequency = count;
      }
    }

    let maxConsecutive = 0;
    let currentConsecutive = 0;
    let lastVal: number | null = null;
    for (const val of values) {
      if (val === lastVal) {
        currentConsecutive++;
      } else {
        currentConsecutive = 1;
        lastVal = val;
      }
      if (currentConsecutive > maxConsecutive) {
        maxConsecutive = currentConsecutive;
      }
    }

    const longStringRatio = analyzedCount > 0 ? maxFrequency / analyzedCount : 0;
    if (analyzedCount >= 4 && longStringRatio >= this.straightLiningThreshold) {
      flags.push('STRAIGHT_LINING');
    }

    // 2. Speeder timing analysis
    let totalDwellMs = 0;
    let subSpeedCount = 0;
    let itemsWithDwell = 0;

    if (dwellTimesMs) {
      for (const q of scaleQuestions) {
        const dwell = dwellTimesMs[q.name] ?? dwellTimesMs[q.id];
        if (typeof dwell === 'number' && dwell >= 0) {
          totalDwellMs += dwell;
          itemsWithDwell++;
          if (dwell < this.speederItemMinThresholdMs) {
            subSpeedCount++;
          }
        }
      }
    }

    const effectiveTotalDuration = totalDurationMs ?? totalDwellMs;
    const averageDwellMs = itemsWithDwell > 0
      ? totalDwellMs / itemsWithDwell
      : (analyzedCount > 0 ? effectiveTotalDuration / analyzedCount : 0);

    // Flag speeder if average dwell is sub-350ms or >= 70% items are sub-200ms
    const subSpeedRatio = itemsWithDwell > 0 ? subSpeedCount / itemsWithDwell : 0;
    if (
      analyzedCount >= 4 &&
      (averageDwellMs < this.speederAverageThresholdMs || subSpeedRatio >= 0.70)
    ) {
      flags.push('SPEEDER');
    }

    // 3. Compute sample variance of respondent's scale answers
    let sampleVariance = 0;
    if (values.length > 1) {
      const mean = values.reduce((acc, curr) => acc + curr, 0) / values.length;
      const sumSqDiff = values.reduce((acc, curr) => acc + (curr - mean) ** 2, 0);
      sampleVariance = sumSqDiff / (values.length - 1);
      if (sampleVariance === 0 && analyzedCount >= 4) {
        flags.push('LOW_VARIANCE');
      }
    }

    // Confidence scoring and recommendations
    let confidenceScore = 1.0;
    let recommendation: AuditRecommendation = 'ACCEPT';

    if (flags.includes('SPEEDER') && flags.includes('STRAIGHT_LINING')) {
      confidenceScore = 0.05;
      recommendation = 'REJECT';
    } else if (flags.includes('SPEEDER')) {
      confidenceScore = 0.25;
      recommendation = 'REJECT';
    } else if (flags.includes('STRAIGHT_LINING')) {
      confidenceScore = 0.40;
      recommendation = 'FLAG_FOR_REVIEW';
    } else if (flags.length > 0) {
      confidenceScore = 0.60;
      recommendation = 'FLAG_FOR_REVIEW';
    }

    const isValid = recommendation === 'ACCEPT';

    return {
      isValid,
      recommendation,
      flags,
      confidenceScore,
      metrics: {
        totalQuestions: questions.length,
        analyzedLikertItems: analyzedCount,
        averageDwellMs: Math.round(averageDwellMs),
        totalDurationMs: Math.round(effectiveTotalDuration),
        subSpeedThresholdDwellCount: subSpeedCount,
        longStringMaxConsecutive: maxConsecutive,
        longStringRatio: Math.round(longStringRatio * 100) / 100,
        sampleVariance: Math.round(sampleVariance * 100) / 100,
      },
    };
  }
}
