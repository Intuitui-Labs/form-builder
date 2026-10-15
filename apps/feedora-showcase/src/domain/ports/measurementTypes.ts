/**
 * Report shapes emitted by the measurement port. Field-for-field mirror of the
 * dicts her `surveys/analytics.py` `get_hmsam_scores()` produces, plus the
 * `get_overall_interpretation()` band and the `cronbach_alpha()` result.
 */

export interface ConstructReport {
  constructId: string;
  label: string;
  color: string;
  /** Percentage score: (weighted_sum / (max_scale × n)) × 100, 1 decimal. */
  score: number;
  /** Raw mean of the construct's items, 2 decimals. */
  mean: number;
  /** Number of answers contributing to this construct. */
  count: number;
  /** Total items in this construct. */
  itemCount: number;
  /** Response distribution for values 1..5 (index 0 == value 1). */
  distribution: number[];
  /** get_score_interpretation(score) — "Strongly Agree" … "Strongly Disagree". */
  interpretation: string;
}

export interface MeasurementReport {
  constructs: ConstructReport[];
  /** Mean of the per-construct percentage scores, 1 decimal. */
  overall: number;
  answeredItems: number;
}

export interface OverallInterpretation {
  level: string;
  description: string;
  color: string;
  bg: string;
}

export interface ReliabilityReport {
  cronbachAlpha: number;
  itemCount: number;
  sampleSize: number;
  sampleTooSmall: boolean;
  /** e.g. "Excellent reliability" / "Good reliability" … */
  interpretation: string;
  note?: string;
}
