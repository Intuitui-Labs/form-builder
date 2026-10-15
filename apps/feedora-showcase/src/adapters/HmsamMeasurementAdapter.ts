import {
  CONSTRUCT_ORDER,
  HMSAM_CONSTRUCTS,
  HMSAM_ITEMS,
  HMSAM_SCALE_MAX,
  hmsamItemsFor,
} from '../domain/hmsam';
import type { IMeasurementPort } from '../domain/ports/IMeasurementPort';
import type {
  ConstructReport,
  MeasurementReport,
  OverallInterpretation,
  ReliabilityReport,
} from '../domain/ports/measurementTypes';

/**
 * Outbound adapter -> app's IMeasurementPort.
 *
 * A faithful TypeScript port of her `surveys/analytics.py`:
 *   get_hmsam_scores()          → score()
 *   get_score_interpretation()  → scoreInterpretation()
 *   get_overall_interpretation()→ interpretOverall()
 *   cronbach_alpha()            → computeReliability()
 *
 * Scoring uses the paper formula: score = (Σ likert / (max_scale × n)) × 100
 * with max_scale = 5. Reliability needs variance across respondents, so it is
 * fed the response matrix the session has accumulated (in a deployed build the
 * backend would serve it).
 */
export class HmsamMeasurementAdapter implements IMeasurementPort {
  readonly instrument = 'Hedonic-Motivation System Adoption Model';
  readonly instrumentVersion = 'HMSAM-38';
  readonly constructCount = CONSTRUCT_ORDER.length;
  readonly itemCount = HMSAM_ITEMS.length;

  score(values: Record<string, unknown>): MeasurementReport {
    const constructs: ConstructReport[] = [];
    let answeredItems = 0;

    for (const constructId of CONSTRUCT_ORDER) {
      const items = hmsamItemsFor(constructId);
      const collected: number[] = [];

      for (const item of items) {
        const raw = values[item.field];
        if (raw === undefined || raw === null || raw === '') continue;
        const numeric = Number(raw);
        if (Number.isNaN(numeric)) continue;
        collected.push(numeric);
        answeredItems += 1;
      }

      if (collected.length === 0) continue;

      const n = collected.length;
      const weightedSum = collected.reduce((sum, v) => sum + v, 0);
      const maxPossible = HMSAM_SCALE_MAX * n;
      const score = round((weightedSum / maxPossible) * 100, 1);
      const mean = round(weightedSum / n, 2);

      const distribution = [1, 2, 3, 4, 5].map((value) => collected.filter((v) => v === value).length);

      const construct = HMSAM_CONSTRUCTS[constructId];
      constructs.push({
        constructId,
        label: construct.label,
        color: construct.color,
        score,
        mean,
        count: n,
        itemCount: items.length,
        distribution,
        interpretation: this.scoreInterpretation(score),
      });
    }

    const overall =
      constructs.length > 0
        ? round(constructs.reduce((sum, c) => sum + c.score, 0) / constructs.length, 1)
        : 0;

    return { constructs, overall, answeredItems };
  }

  /** surveys/analytics.py get_score_interpretation() — adapted to the 5-point scale. */
  scoreInterpretation(score: number): string {
    if (score >= 84.1) return 'Strongly Agree';
    if (score >= 70.1) return 'Agree';
    if (score >= 56.1) return 'Somewhat Agree';
    if (score >= 42.1) return 'Neutral';
    if (score >= 28.1) return 'Somewhat Disagree';
    if (score >= 14.1) return 'Disagree';
    return 'Strongly Disagree';
  }

  /** surveys/analytics.py get_overall_interpretation(). */
  interpretOverall(overall: number): OverallInterpretation {
    if (overall >= 84.1) {
      return {
        level: 'Excellent adoption',
        description:
          'Users strongly agree the system is enjoyable, useful, and easy to use. Hedonic adoption is very high.',
        color: '#0F6B4F',
        bg: '#dcfce7',
      };
    }
    if (overall >= 70.1) {
      return {
        level: 'Good adoption',
        description:
          'Users agree the system motivates continued use. Hedonic qualities are well received.',
        color: '#1D9E75',
        bg: '#d1fae5',
      };
    }
    if (overall >= 56.1) {
      return {
        level: 'Moderate adoption',
        description:
          'Users somewhat agree the system is engaging. There is room to improve hedonic motivation.',
        color: '#B87333',
        bg: '#fef3c7',
      };
    }
    if (overall >= 42.1) {
      return {
        level: 'Neutral adoption',
        description:
          'Users are neither motivated nor demotivated. Significant improvements to engagement are needed.',
        color: '#d97706',
        bg: '#fef9c3',
      };
    }
    return {
      level: 'Low adoption',
      description:
        'Users do not find the system enjoyable or motivating. Core hedonic design elements need to be reconsidered.',
      color: '#A04545',
      bg: '#fee2e2',
    };
  }

  /** surveys/analytics.py cronbach_alpha() — np.var(ddof=1), clamped to [-1, 1]. */
  computeReliability(responses: Record<string, number>[]): ReliabilityReport {
    const k = HMSAM_ITEMS.length;

    if (k < 2) {
      return this.tinySample(k, responses.length, 'Need at least 2 questions');
    }
    if (responses.length < 2) {
      return this.tinySample(k, responses.length, 'Need at least 2 responses');
    }

    // Only keep rows where every item is answered (complete cases).
    const matrix = responses
      .map((row) => HMSAM_ITEMS.map((item) => row[item.field]))
      .filter((row): row is number[] => row.every((v) => typeof v === 'number' && !Number.isNaN(v)));

    if (matrix.length < 2) {
      return this.tinySample(k, matrix.length, 'Need 2+ complete responses');
    }

    const itemVariances = Array.from({ length: k }, (_, col) =>
      variance(matrix.map((row) => row[col]!)),
    );
    const rowTotals = matrix.map((row) => row.reduce((sum, v) => sum + v, 0));
    const totalVariance = variance(rowTotals);

    if (totalVariance === 0) {
      return {
        cronbachAlpha: 0,
        itemCount: k,
        sampleSize: matrix.length,
        sampleTooSmall: false,
        interpretation: 'No variance in responses',
      };
    }

    const sumItemVariances = itemVariances.reduce((sum, v) => sum + v, 0);
    let alpha = (k / (k - 1)) * (1 - sumItemVariances / totalVariance);
    alpha = Math.max(-1, Math.min(1, alpha)); // clamp
    const rounded = round(alpha, 2);

    return {
      cronbachAlpha: rounded,
      itemCount: k,
      sampleSize: matrix.length,
      sampleTooSmall: false,
      interpretation: alphaInterpretation(rounded),
    };
  }

  private tinySample(itemCount: number, sampleSize: number, note: string): ReliabilityReport {
    return {
      cronbachAlpha: Number.NaN,
      itemCount,
      sampleSize,
      sampleTooSmall: true,
      interpretation: 'unacceptable reliability',
      note,
    };
  }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Sample variance with ddof=1, matching numpy's default for this use. */
function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squared = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  return squared / (values.length - 1);
}

function alphaInterpretation(alpha: number): string {
  if (alpha >= 0.9) return 'Excellent reliability';
  if (alpha >= 0.8) return 'Good reliability';
  if (alpha >= 0.7) return 'Acceptable reliability';
  if (alpha >= 0.6) return 'Questionable reliability';
  if (alpha >= 0.5) return 'Poor reliability';
  if (alpha >= 0) return 'Unacceptable reliability';
  return 'Negative reliability — check reverse-coded or inconsistent items';
}
